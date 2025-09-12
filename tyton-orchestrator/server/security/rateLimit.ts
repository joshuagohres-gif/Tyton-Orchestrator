import { NextRequest, NextResponse } from 'next/server';
import { Redis } from 'redis';

// Redis client setup
let redisClient: Redis | null = null;
let redisConnectionFailed = false;

async function getRedisClient(): Promise<Redis | null> {
  if (!process.env.REDIS_URL || redisConnectionFailed) {
    if (!redisConnectionFailed) {
      console.warn('REDIS_URL not configured - rate limiting will use in-memory fallback');
    }
    return null;
  }

  if (!redisClient) {
    try {
      redisClient = new Redis({
        url: process.env.REDIS_URL,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true
      });

      redisClient.on('error', (err) => {
        if (!redisConnectionFailed) {
          console.warn('Redis unavailable - falling back to in-memory rate limiting');
          redisConnectionFailed = true;
        }
        redisClient = null;
      });

      redisClient.on('connect', () => {
        console.log('Redis client connected for rate limiting');
        redisConnectionFailed = false;
      });

      await redisClient.connect();
    } catch (error) {
      if (!redisConnectionFailed) {
        console.warn('Redis unavailable - using in-memory rate limiting fallback');
        redisConnectionFailed = true;
      }
      redisClient = null;
    }
  }

  return redisClient;
}

// In-memory fallback for development
const memoryStore = new Map<string, { count: number; resetTime: number }>();

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
  statusCode?: number;
  keyGenerator?: (request: NextRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitResult {
  success: boolean;
  totalHits: number;
  totalHits_remaining: number;
  resetTime: Date;
  response?: NextResponse;
}

/**
 * Sliding window rate limiter using Redis or in-memory fallback
 */
export class RateLimiter {
  private config: Required<RateLimitConfig>;

  constructor(config: RateLimitConfig) {
    this.config = {
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
      message: config.message || 'Too many requests, please try again later',
      statusCode: config.statusCode || 429,
      keyGenerator: config.keyGenerator || this.defaultKeyGenerator,
      skipSuccessfulRequests: config.skipSuccessfulRequests ?? false,
      skipFailedRequests: config.skipFailedRequests ?? false
    };
  }

  private defaultKeyGenerator(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : request.ip || 'unknown';
    return `rate_limit:${ip}`;
  }

  /**
   * Check rate limit using Redis sliding window
   */
  private async checkRedisLimit(key: string): Promise<RateLimitResult> {
    const redis = await getRedisClient();
    if (!redis) {
      return this.checkMemoryLimit(key);
    }

    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    try {
      // Use Redis pipeline for atomic operations
      const pipeline = redis.pipeline();
      
      // Remove expired entries
      pipeline.zremrangebyscore(key, '-inf', windowStart);
      
      // Count current requests in window
      pipeline.zcard(key);
      
      // Add current request
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      
      // Set expiration on the key
      pipeline.expire(key, Math.ceil(this.config.windowMs / 1000));
      
      const results = await pipeline.exec();
      
      if (!results) {
        throw new Error('Redis pipeline failed');
      }

      const totalHits = (results[1][1] as number) + 1; // +1 for current request
      const resetTime = new Date(now + this.config.windowMs);

      return {
        success: totalHits <= this.config.maxRequests,
        totalHits,
        totalHits_remaining: Math.max(0, this.config.maxRequests - totalHits),
        resetTime
      };
    } catch (error) {
      console.error('Redis rate limit check failed:', error);
      // Fallback to memory store
      return this.checkMemoryLimit(key);
    }
  }

  /**
   * Check rate limit using in-memory store (fallback)
   */
  private checkMemoryLimit(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    const existing = memoryStore.get(key);
    
    if (!existing || existing.resetTime < now) {
      // Reset window
      memoryStore.set(key, { count: 1, resetTime: now + this.config.windowMs });
      return {
        success: true,
        totalHits: 1,
        totalHits_remaining: this.config.maxRequests - 1,
        resetTime: new Date(now + this.config.windowMs)
      };
    }

    existing.count += 1;
    memoryStore.set(key, existing);

    return {
      success: existing.count <= this.config.maxRequests,
      totalHits: existing.count,
      totalHits_remaining: Math.max(0, this.config.maxRequests - existing.count),
      resetTime: new Date(existing.resetTime)
    };
  }

  /**
   * Apply rate limit check
   */
  async checkLimit(request: NextRequest): Promise<RateLimitResult> {
    const key = this.config.keyGenerator(request);
    return await this.checkRedisLimit(key);
  }

  /**
   * Create middleware function
   */
  middleware() {
    return async (request: NextRequest): Promise<NextResponse | null> => {
      const result = await this.checkLimit(request);

      // Add rate limit headers to response
      const headers = {
        'X-RateLimit-Limit': this.config.maxRequests.toString(),
        'X-RateLimit-Remaining': result.totalHits_remaining.toString(),
        'X-RateLimit-Reset': Math.ceil(result.resetTime.getTime() / 1000).toString(),
        'X-RateLimit-Window': this.config.windowMs.toString()
      };

      if (!result.success) {
        return NextResponse.json(
          { 
            error: this.config.message,
            limit: this.config.maxRequests,
            remaining: result.totalHits_remaining,
            reset: result.resetTime.toISOString()
          },
          { 
            status: this.config.statusCode,
            headers
          }
        );
      }

      // Add headers to successful requests too (for client awareness)
      const response = NextResponse.next();
      Object.entries(headers).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return null; // Allow request to continue
    };
  }
}

/**
 * Token bucket rate limiter for burst traffic
 */
export class TokenBucketLimiter {
  private buckets = new Map<string, { tokens: number; lastRefill: number }>();
  
  constructor(
    private capacity: number,
    private refillRate: number, // tokens per second
    private keyGenerator: (request: NextRequest) => string = (req) => req.ip || 'unknown'
  ) {}

  async checkLimit(request: NextRequest): Promise<RateLimitResult> {
    const key = this.keyGenerator(request);
    const now = Date.now();
    
    let bucket = this.buckets.get(key);
    
    if (!bucket) {
      bucket = { tokens: this.capacity - 1, lastRefill: now };
      this.buckets.set(key, bucket);
      return {
        success: true,
        totalHits: 1,
        totalHits_remaining: this.capacity - 1,
        resetTime: new Date(now + 1000) // Next second
      };
    }

    // Refill tokens based on time elapsed
    const timePassed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.refillRate;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        success: true,
        totalHits: this.capacity - Math.floor(bucket.tokens),
        totalHits_remaining: Math.floor(bucket.tokens),
        resetTime: new Date(now + (1000 / this.refillRate))
      };
    }

    return {
      success: false,
      totalHits: this.capacity,
      totalHits_remaining: 0,
      resetTime: new Date(now + (1000 / this.refillRate))
    };
  }
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const rateLimiters = {
  // General API: 60 requests per minute per IP
  general: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60,
    message: 'Too many API requests, please try again later'
  }),

  // Strict API: 20 requests per minute per IP
  strict: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
    message: 'Rate limit exceeded for this endpoint'
  }),

  // Auth endpoints: 5 requests per minute per IP
  auth: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5,
    message: 'Too many authentication attempts, please try again later'
  }),

  // LLM endpoints: Based on user, not IP
  llm: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    keyGenerator: (request: NextRequest) => {
      const userContext = (request as any).__userContext;
      return userContext ? `llm_rate_limit:${userContext.userId}` : `llm_rate_limit:${request.ip || 'unknown'}`;
    },
    message: 'LLM request quota exceeded, please try again later'
  }),

  // Orchestration runs: 10 per minute per user
  orchestration: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    keyGenerator: (request: NextRequest) => {
      const userContext = (request as any).__userContext;
      return userContext ? `orchestration_rate_limit:${userContext.userId}` : `orchestration_rate_limit:${request.ip || 'unknown'}`;
    },
    message: 'Orchestration request limit exceeded'
  })
};

/**
 * Create rate limiter middleware for specific limits
 */
export function createRateLimit(config: RateLimitConfig) {
  return new RateLimiter(config).middleware();
}

/**
 * Cleanup function for graceful shutdown
 */
export async function cleanup() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
  
  memoryStore.clear();
}