import { createClient, RedisClientType } from 'redis';
import crypto from 'crypto';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string; // Key prefix for namespacing
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  hitRate: number;
}

class RedisCache {
  private client: RedisClientType | null = null;
  private connected = false;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
    hitRate: 0
  };

  constructor() {
    this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      this.client = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 5000,
          lazyConnect: true
        },
        // Retry strategy with exponential backoff
        retryDelayOnFailover: 100,
        retryDelayOnClusterDown: 300
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.stats.errors++;
        this.connected = false;
      });

      this.client.on('connect', () => {
        console.log('Redis connected');
        this.connected = true;
      });

      this.client.on('disconnect', () => {
        console.log('Redis disconnected');
        this.connected = false;
      });

      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      this.connected = false;
    }
  }

  /**
   * Generate a stable cache key from object contents
   */
  private generateKey(data: any, prefix = 'tyton'): string {
    // Create deterministic hash of the data
    const serialized = JSON.stringify(data, Object.keys(data).sort());
    const hash = crypto.createHash('sha256').update(serialized).digest('hex').substring(0, 16);
    return `${prefix}:${hash}`;
  }

  /**
   * Set a value in cache with TTL
   */
  async set(key: string, value: any, options: CacheOptions = {}): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const { ttl = 3600, prefix = 'tyton' } = options;
      const fullKey = prefix ? `${prefix}:${key}` : key;
      const serializedValue = JSON.stringify(value);

      await this.client.setEx(fullKey, ttl, serializedValue);
      this.stats.sets++;
      return true;
    } catch (error) {
      console.error('Redis SET error:', error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Get a value from cache
   */
  async get<T = any>(key: string, options: CacheOptions = {}): Promise<T | null> {
    if (!this.connected || !this.client) {
      this.stats.misses++;
      return null;
    }

    try {
      const { prefix = 'tyton' } = options;
      const fullKey = prefix ? `${prefix}:${key}` : key;
      
      const value = await this.client.get(fullKey);
      
      if (value === null) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      this.updateHitRate();
      return JSON.parse(value) as T;
    } catch (error) {
      console.error('Redis GET error:', error);
      this.stats.errors++;
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Delete a key from cache
   */
  async delete(key: string, options: CacheOptions = {}): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const { prefix = 'tyton' } = options;
      const fullKey = prefix ? `${prefix}:${key}` : key;
      
      const result = await this.client.del(fullKey);
      this.stats.deletes++;
      return result > 0;
    } catch (error) {
      console.error('Redis DELETE error:', error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Get or set pattern - try cache first, then compute and cache
   */
  async getOrSet<T>(
    key: string,
    computeFn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    // Compute the value
    const computed = await computeFn();
    
    // Cache the result (fire and forget)
    this.set(key, computed, options).catch(err => {
      console.error('Failed to cache computed value:', err);
    });

    return computed;
  }

  /**
   * Generate cache key for LLM prompts
   */
  generateLLMKey(prompt: string, model: string, temperature?: number): string {
    const keyData = {
      prompt: prompt.trim(),
      model,
      temperature: temperature || 0.7,
      version: '1.0' // Cache version for invalidation
    };
    
    return this.generateKey(keyData, 'llm');
  }

  /**
   * Generate cache key for component sourcing
   */
  generateSourcingKey(query: string, filters?: any): string {
    const keyData = {
      query: query.trim().toLowerCase(),
      filters: filters || {},
      version: '1.0'
    };
    
    return this.generateKey(keyData, 'sourcing');
  }

  /**
   * Bulk delete keys by pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.connected || !this.client) {
      return 0;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.client.del(keys);
      this.stats.deletes += result;
      return result;
    } catch (error) {
      console.error('Redis DELETE PATTERN error:', error);
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * Clear all cache entries with a prefix
   */
  async clearPrefix(prefix: string): Promise<number> {
    return this.deletePattern(`${prefix}:*`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Check if Redis is connected and operational
   */
  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  /**
   * Ping Redis to check connectivity
   */
  async ping(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get cache info and memory usage
   */
  async getInfo(): Promise<any> {
    if (!this.connected || !this.client) {
      return null;
    }

    try {
      const info = await this.client.info('memory');
      const keyCount = await this.client.dbSize();
      
      return {
        connected: this.connected,
        keyCount,
        memoryInfo: info,
        stats: this.getStats()
      };
    } catch (error) {
      console.error('Redis INFO error:', error);
      return null;
    }
  }

  /**
   * Graceful shutdown
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
        this.connected = false;
      } catch (error) {
        console.error('Error disconnecting from Redis:', error);
      }
    }
  }
}

// Singleton instance
let redisCache: RedisCache | null = null;

export function getRedisCache(): RedisCache {
  if (!redisCache) {
    redisCache = new RedisCache();
  }
  return redisCache;
}

// Graceful shutdown handler
if (typeof window === 'undefined') {
  process.on('beforeExit', async () => {
    if (redisCache) {
      await redisCache.disconnect();
    }
  });
}

export default RedisCache;