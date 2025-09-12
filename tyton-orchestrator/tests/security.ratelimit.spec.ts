import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { RateLimiter, createRateLimit } from '../server/security/rateLimit';

// Mock Redis
vi.mock('redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    pipeline: vi.fn().mockReturnValue({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[null, 0], [null, 1], [null, 'OK'], [null, 1]])
    }),
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe('Rate Limiting', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      windowMs: 60000, // 1 minute
      maxRequests: 5,
      message: 'Rate limit exceeded'
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('RateLimiter', () => {
    it('should allow requests under the limit', async () => {
      const mockRequest = createMockRequest('192.168.1.1');
      
      const result = await rateLimiter.checkLimit(mockRequest);
      
      expect(result.success).toBe(true);
      expect(result.totalHits).toBe(1);
      expect(result.totalHits_remaining).toBe(4);
      expect(result.resetTime).toBeInstanceOf(Date);
    });

    it('should block requests over the limit', async () => {
      const mockRequest = createMockRequest('192.168.1.2');
      
      // Make requests up to the limit
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.checkLimit(mockRequest);
        expect(result.success).toBe(true);
      }
      
      // This request should be blocked
      const blockedResult = await rateLimiter.checkLimit(mockRequest);
      expect(blockedResult.success).toBe(false);
      expect(blockedResult.totalHits).toBe(6);
      expect(blockedResult.totalHits_remaining).toBe(0);
    });

    it('should use custom key generator', async () => {
      const customLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 3,
        keyGenerator: (req) => `custom_${req.headers.get('user-id') || 'anonymous'}`
      });

      const mockRequest = createMockRequest('192.168.1.3');
      mockRequest.headers.set('user-id', 'user123');
      
      const result = await customLimiter.checkLimit(mockRequest);
      expect(result.success).toBe(true);
    });

    it('should create middleware that returns rate limit response', async () => {
      const middleware = rateLimiter.middleware();
      const mockRequest = createMockRequest('192.168.1.4');
      
      // First few requests should pass
      for (let i = 0; i < 5; i++) {
        const response = await middleware(mockRequest);
        expect(response).toBeNull(); // Should pass through
      }
      
      // This request should be blocked
      const blockedResponse = await middleware(mockRequest);
      expect(blockedResponse).not.toBeNull();
      expect(blockedResponse!.status).toBe(429);
      
      const responseBody = await blockedResponse!.json();
      expect(responseBody.error).toBe('Rate limit exceeded');
    });

    it('should include rate limit headers', async () => {
      const middleware = rateLimiter.middleware();
      const mockRequest = createMockRequest('192.168.1.5');
      
      // Make a request that should be blocked
      for (let i = 0; i < 6; i++) {
        const response = await middleware(mockRequest);
        if (response) {
          // Check headers on blocked response
          expect(response.headers.get('X-RateLimit-Limit')).toBe('5');
          expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
          expect(response.headers.get('X-RateLimit-Reset')).toMatch(/^\d+$/);
          expect(response.headers.get('X-RateLimit-Window')).toBe('60000');
          break;
        }
      }
    });
  });

  describe('Configuration', () => {
    it('should use default values', () => {
      const defaultLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 10
      });
      
      const middleware = defaultLimiter.middleware();
      expect(middleware).toBeDefined();
    });

    it('should use custom message and status code', async () => {
      const customLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 1,
        message: 'Custom rate limit message',
        statusCode: 503
      });

      const middleware = customLimiter.middleware();
      const mockRequest = createMockRequest('192.168.1.6');
      
      // Exhaust the limit
      await middleware(mockRequest);
      
      // This should be blocked with custom message
      const blockedResponse = await middleware(mockRequest);
      expect(blockedResponse!.status).toBe(503);
      
      const responseBody = await blockedResponse!.json();
      expect(responseBody.error).toBe('Custom rate limit message');
    });
  });

  describe('Memory Store Fallback', () => {
    it('should work without Redis', async () => {
      // This test relies on the fallback being used when Redis is unavailable
      const memoryLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 2
      });

      const mockRequest = createMockRequest('192.168.1.7');
      
      // First request should succeed
      const result1 = await memoryLimiter.checkLimit(mockRequest);
      expect(result1.success).toBe(true);
      expect(result1.totalHits).toBe(1);
      
      // Second request should succeed
      const result2 = await memoryLimiter.checkLimit(mockRequest);
      expect(result2.success).toBe(true);
      expect(result2.totalHits).toBe(2);
      
      // Third request should fail
      const result3 = await memoryLimiter.checkLimit(mockRequest);
      expect(result3.success).toBe(false);
    });
  });

  describe('createRateLimit helper', () => {
    it('should create rate limiter middleware', async () => {
      const middleware = createRateLimit({
        windowMs: 5000,
        maxRequests: 2,
        message: 'Too many requests'
      });

      expect(middleware).toBeTypeOf('function');
      
      const mockRequest = createMockRequest('192.168.1.8');
      const result = await middleware(mockRequest);
      expect(result).toBeNull(); // First request should pass
    });
  });
});

// Helper function to create mock NextRequest
function createMockRequest(ip: string): NextRequest {
  const request = new NextRequest('http://localhost:3000/api/test');
  
  // Mock the ip property
  Object.defineProperty(request, 'ip', {
    value: ip,
    writable: true
  });
  
  return request;
}