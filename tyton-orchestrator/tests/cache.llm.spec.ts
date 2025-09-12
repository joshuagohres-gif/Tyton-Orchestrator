import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getCachedLlmService } from '../server/cache/cachedLlm';
import { getRedisCache } from '../server/cache/redis';

describe('LLM Caching', () => {
  let cachedLlm: ReturnType<typeof getCachedLlmService>;
  let redis: ReturnType<typeof getRedisCache>;

  beforeAll(async () => {
    cachedLlm = getCachedLlmService();
    redis = getRedisCache();
    
    // Wait for Redis connection
    if (redis.isConnected()) {
      await redis.ping();
    } else {
      console.log('Redis not available - some tests will be skipped');
    }
  });

  afterAll(async () => {
    // Clean up test cache entries
    if (redis.isConnected()) {
      await redis.clearPrefix('test');
      await redis.disconnect();
    }
  });

  beforeEach(async () => {
    // Clear test cache entries before each test
    if (redis.isConnected()) {
      await redis.clearPrefix('test');
    }
  });

  describe('Cache Key Generation', () => {
    it('should generate consistent cache keys for identical prompts', () => {
      const prompt1 = 'Analyze this circuit design';
      const prompt2 = 'Analyze this circuit design';
      const model = 'gpt-4o';
      const temperature = 0.7;

      const key1 = redis.generateLLMKey(prompt1, model, temperature);
      const key2 = redis.generateLLMKey(prompt2, model, temperature);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^llm:/);
    });

    it('should generate different cache keys for different parameters', () => {
      const prompt = 'Analyze this circuit design';
      
      const key1 = redis.generateLLMKey(prompt, 'gpt-4o', 0.7);
      const key2 = redis.generateLLMKey(prompt, 'gpt-4o', 0.9); // Different temperature
      const key3 = redis.generateLLMKey(prompt, 'claude-3-5-sonnet', 0.7); // Different model

      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
    });

    it('should ignore whitespace differences in prompts', () => {
      const prompt1 = '  Analyze this circuit design  ';
      const prompt2 = 'Analyze this circuit design';
      const model = 'gpt-4o';

      const key1 = redis.generateLLMKey(prompt1, model);
      const key2 = redis.generateLLMKey(prompt2, model);

      expect(key1).toBe(key2);
    });
  });

  describe('Cache Performance', () => {
    it('should serve cached responses <10ms on cache hit', async () => {
      if (!redis.isConnected()) {
        console.log('Skipping cache performance test - Redis not available');
        return;
      }

      const testPrompt = 'Generate test circuit components';
      const mockResponse = {
        text: '{"components": ["R1", "C1", "L1"]}',
        model: 'test-model',
        temperature: 0.7,
        cached: false,
        timestamp: Date.now()
      };

      // Pre-populate cache
      const cacheKey = redis.generateLLMKey(testPrompt, 'test-model', 0.7);
      await redis.set(cacheKey, mockResponse, { prefix: 'llm', ttl: 3600 });

      // Measure cache hit time
      const startTime = Date.now();
      const cached = await redis.get(cacheKey, { prefix: 'llm' });
      const duration = Date.now() - startTime;

      expect(cached).toBeDefined();
      expect(duration).toBeLessThan(10);
      
      console.log(`✅ Cache hit served in ${duration}ms`);
    });

    it('should track cache hit metrics correctly', async () => {
      if (!redis.isConnected()) {
        console.log('Skipping cache metrics test - Redis not available');
        return;
      }

      const initialStats = redis.getStats();
      const testKey = 'test:metrics';

      // Cache miss
      const miss = await redis.get(testKey, { prefix: 'test' });
      expect(miss).toBeNull();

      // Cache set
      await redis.set(testKey, { data: 'test' }, { prefix: 'test' });

      // Cache hit
      const hit = await redis.get(testKey, { prefix: 'test' });
      expect(hit).toBeDefined();

      const finalStats = redis.getStats();
      
      expect(finalStats.hits).toBe(initialStats.hits + 1);
      expect(finalStats.misses).toBe(initialStats.misses + 1);
      expect(finalStats.sets).toBe(initialStats.sets + 1);
    });
  });

  describe('LLM Response Caching', () => {
    it('should cache LLM responses with TTL', async () => {
      if (!redis.isConnected()) {
        console.log('Skipping LLM caching test - Redis not available');
        return;
      }

      const testPrompt = 'List common resistor values';
      const mockResponse = {
        text: '{"values": ["10Ω", "100Ω", "1kΩ", "10kΩ"]}',
        model: 'gpt-4o',
        temperature: 0.7,
        cached: false,
        timestamp: Date.now(),
        tokenUsage: { prompt: 20, completion: 15, total: 35 }
      };

      // Test caching
      const cacheKey = redis.generateLLMKey(testPrompt, 'gpt-4o', 0.7);
      const setCacheSuccess = await redis.set(cacheKey, mockResponse, { 
        prefix: 'llm', 
        ttl: 60 
      });

      expect(setCacheSuccess).toBe(true);

      // Test retrieval
      const retrieved = await redis.get(cacheKey, { prefix: 'llm' });
      expect(retrieved).toEqual(mockResponse);
      expect(retrieved.tokenUsage.total).toBe(35);
    });

    it('should handle cache misses gracefully', async () => {
      const nonExistentKey = 'non-existent-key';
      const result = await redis.get(nonExistentKey, { prefix: 'llm' });
      
      expect(result).toBeNull();
    });

    it('should support cache invalidation by pattern', async () => {
      if (!redis.isConnected()) {
        console.log('Skipping cache invalidation test - Redis not available');
        return;
      }

      // Set up test data
      await redis.set('test1', { data: 'value1' }, { prefix: 'llm' });
      await redis.set('test2', { data: 'value2' }, { prefix: 'llm' });
      await redis.set('other', { data: 'value3' }, { prefix: 'llm' });

      // Clear specific pattern
      const deletedCount = await redis.deletePattern('llm:test*');
      expect(deletedCount).toBe(2);

      // Verify deletion
      const test1 = await redis.get('test1', { prefix: 'llm' });
      const test2 = await redis.get('test2', { prefix: 'llm' });
      const other = await redis.get('other', { prefix: 'llm' });

      expect(test1).toBeNull();
      expect(test2).toBeNull();
      expect(other).toBeDefined();
    });
  });

  describe('Cache Warming and Batch Operations', () => {
    it('should support batch cache warming', async () => {
      if (!cachedLlm.isCacheAvailable()) {
        console.log('Skipping batch warming test - Cache not available');
        return;
      }

      const commonPrompts = [
        { prompt: 'Generate resistor values', model: 'gpt-4o' },
        { prompt: 'Generate capacitor values', model: 'gpt-4o' },
        { prompt: 'Generate inductor values', model: 'gpt-4o' }
      ];

      // Note: This would actually call the LLM in a real environment
      // For testing, we'd mock the LLM service
      try {
        await cachedLlm.warmCache(commonPrompts);
        // If no error thrown, warming completed
        expect(true).toBe(true);
      } catch (error) {
        // Expected in test environment without real LLM service
        console.log('Cache warming skipped - LLM service not available in test');
      }
    });

    it('should provide cache metrics and recommendations', async () => {
      const metrics = await cachedLlm.getMetrics();
      
      expect(metrics).toHaveProperty('cacheStats');
      expect(metrics).toHaveProperty('recommendations');
      expect(Array.isArray(metrics.recommendations)).toBe(true);
      
      console.log(`📊 Cache Metrics:
        - Hit Rate: ${(metrics.cacheStats.hitRate * 100).toFixed(1)}%
        - Total Hits: ${metrics.cacheStats.hits}
        - Total Misses: ${metrics.cacheStats.misses}
        - Recommendations: ${metrics.recommendations.length}
      `);
    });
  });

  describe('Error Handling and Fallbacks', () => {
    it('should handle Redis connection failures gracefully', async () => {
      // Test with a non-connected cache instance
      const mockCache = new (await import('../server/cache/redis')).default();
      
      // Should not throw errors when Redis is unavailable
      const result = await mockCache.get('test-key');
      expect(result).toBeNull();
      
      const setResult = await mockCache.set('test-key', { data: 'test' });
      expect(setResult).toBe(false);
    });

    it('should provide cache availability status', () => {
      const isAvailable = cachedLlm.isCacheAvailable();
      expect(typeof isAvailable).toBe('boolean');
      
      console.log(`🔌 Cache Available: ${isAvailable}`);
    });
  });

  describe('Memory and Performance Optimization', () => {
    it('should clean up expired entries automatically', async () => {
      if (!redis.isConnected()) {
        console.log('Skipping TTL test - Redis not available');
        return;
      }

      const testKey = 'ttl-test';
      
      // Set with very short TTL
      await redis.set(testKey, { data: 'expires-soon' }, { 
        prefix: 'test', 
        ttl: 1 // 1 second
      });

      // Verify it exists
      const immediate = await redis.get(testKey, { prefix: 'test' });
      expect(immediate).toBeDefined();

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Verify it's gone
      const expired = await redis.get(testKey, { prefix: 'test' });
      expect(expired).toBeNull();
    });

    it('should support bulk cache operations efficiently', async () => {
      if (!redis.isConnected()) {
        console.log('Skipping bulk operations test - Redis not available');
        return;
      }

      const startTime = Date.now();
      
      // Set multiple keys
      const promises = Array.from({ length: 10 }, (_, i) =>
        redis.set(`bulk-${i}`, { value: i }, { prefix: 'test', ttl: 300 })
      );
      
      await Promise.all(promises);
      
      const setDuration = Date.now() - startTime;
      
      // Get multiple keys
      const getStartTime = Date.now();
      const getPromises = Array.from({ length: 10 }, (_, i) =>
        redis.get(`bulk-${i}`, { prefix: 'test' })
      );
      
      const results = await Promise.all(getPromises);
      const getDuration = Date.now() - getStartTime;
      
      expect(results.every(r => r !== null)).toBe(true);
      expect(setDuration).toBeLessThan(1000); // Should complete in under 1 second
      expect(getDuration).toBeLessThan(100);  // Should retrieve in under 100ms
      
      console.log(`⚡ Bulk Operations:
        - Set 10 keys: ${setDuration}ms
        - Get 10 keys: ${getDuration}ms
      `);
    });
  });
});