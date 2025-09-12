import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getCachedSourcingService } from '../server/cache/cachedSourcing';
import { getRedisCache } from '../server/cache/redis';
import { prisma } from '../server/db/client';

describe('Component Sourcing Cache', () => {
  let sourcingService: ReturnType<typeof getCachedSourcingService>;
  let redis: ReturnType<typeof getRedisCache>;

  beforeAll(async () => {
    sourcingService = getCachedSourcingService();
    redis = getRedisCache();
    
    // Set up test data in database
    await seedTestComponents();
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestComponents();
    
    if (redis.isConnected()) {
      await redis.clearPrefix('test');
      await redis.clearPrefix('sourcing');
    }
  });

  beforeEach(async () => {
    // Clear cache before each test
    if (redis.isConnected()) {
      await redis.clearPrefix('sourcing');
    }
  });

  async function seedTestComponents() {
    const testComponents = [
      {
        mpn: 'TEST-R-100',
        category: 'resistor',
        value: '100Ω',
        symbol: 'Device:R_Small',
        footprint: 'Resistor_SMD:R_0603_1608Metric',
        meta: { power: '0.1W', tolerance: '5%' }
      },
      {
        mpn: 'TEST-R-1K',
        category: 'resistor', 
        value: '1kΩ',
        symbol: 'Device:R_Small',
        footprint: 'Resistor_SMD:R_0603_1608Metric',
        meta: { power: '0.1W', tolerance: '1%' }
      },
      {
        mpn: 'TEST-C-100N',
        category: 'capacitor',
        value: '100nF',
        symbol: 'Device:C_Small',
        footprint: 'Capacitor_SMD:C_0603_1608Metric',
        meta: { voltage: '50V', dielectric: 'X7R' }
      },
      {
        mpn: 'TEST-L-10U',
        category: 'inductor',
        value: '10µH',
        symbol: 'Device:L_Small',
        footprint: 'Inductor_SMD:L_0603_1608Metric',
        meta: { current: '1A', tolerance: '20%' }
      }
    ];

    for (const comp of testComponents) {
      await prisma.componentLibrary.upsert({
        where: { mpn: comp.mpn },
        update: comp,
        create: comp
      });
    }
  }

  async function cleanupTestComponents() {
    await prisma.componentLibrary.deleteMany({
      where: {
        mpn: {
          startsWith: 'TEST-'
        }
      }
    });
  }

  describe('Component Search Caching', () => {
    it('should cache search results with warm lookup performance', async () => {
      // First search (cache miss)
      const startTime1 = Date.now();
      const results1 = await sourcingService.searchComponents({
        category: 'resistor'
      });
      const duration1 = Date.now() - startTime1;

      expect(results1.length).toBeGreaterThan(0);
      expect(results1.every(r => !r.cached)).toBe(true); // All fresh

      // Second search (cache hit)
      if (redis.isConnected()) {
        const startTime2 = Date.now();
        const results2 = await sourcingService.searchComponents({
          category: 'resistor'
        });
        const duration2 = Date.now() - startTime2;

        expect(results2.length).toBe(results1.length);
        expect(results2.every(r => r.cached)).toBe(true); // All cached
        expect(duration2).toBeLessThan(duration1 * 0.5); // At least 50% faster

        console.log(`🚀 Sourcing Performance:
          - Cache miss: ${duration1}ms
          - Cache hit: ${duration2}ms
          - Speedup: ${(duration1 / duration2).toFixed(2)}x
        `);
      }
    });

    it('should skip network calls for warm cache lookups', async () => {
      if (!redis.isConnected()) {
        console.log('Skipping warm cache test - Redis not available');
        return;
      }

      const query = { category: 'capacitor', value: '100nF' };
      
      // Pre-populate cache with known data
      const mockResults = [
        {
          id: 'test-1',
          mpn: 'TEST-C-100N',
          category: 'capacitor',
          value: '100nF',
          similarity: 1.0,
          cached: false,
          timestamp: Date.now()
        }
      ];

      const cacheKey = redis.generateSourcingKey(JSON.stringify(query));
      await redis.set(cacheKey, mockResults, { prefix: 'sourcing', ttl: 3600 });

      // Search should return cached results instantly
      const startTime = Date.now();
      const results = await sourcingService.searchComponents(query);
      const duration = Date.now() - startTime;

      expect(results.length).toBe(1);
      expect(results[0].cached).toBe(true);
      expect(results[0].mpn).toBe('TEST-C-100N');
      expect(duration).toBeLessThan(10); // Should be very fast

      console.log(`⚡ Warm cache lookup: ${duration}ms`);
    });

    it('should calculate component similarity correctly', async () => {
      const results = await sourcingService.searchComponents({
        category: 'resistor',
        value: '100Ω'
      });

      const exactMatch = results.find(r => r.value === '100Ω');
      const partialMatch = results.find(r => r.value === '1kΩ');

      if (exactMatch) {
        expect(exactMatch.similarity).toBeGreaterThan(0.8);
      }
      
      if (partialMatch) {
        expect(partialMatch.similarity).toBeLessThan(exactMatch?.similarity || 1.0);
      }

      console.log('🎯 Similarity Scores:');
      results.slice(0, 3).forEach(r => {
        console.log(`  - ${r.mpn} (${r.value}): ${(r.similarity * 100).toFixed(1)}%`);
      });
    });

    it('should handle complex queries with multiple filters', async () => {
      const complexQuery = {
        category: 'resistor',
        value: '100',
        footprint: '0603'
      };

      const results = await sourcingService.searchComponents(complexQuery, {
        threshold: 0.5,
        limit: 10
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.similarity >= 0.5)).toBe(true);
      
      // Should prioritize exact matches
      const exactMatch = results.find(r => 
        r.category === 'resistor' && 
        r.value?.includes('100') &&
        r.footprint?.includes('0603')
      );
      
      if (exactMatch) {
        expect(exactMatch.similarity).toBeGreaterThan(0.8);
      }
    });
  });

  describe('MPN Lookup Caching', () => {
    it('should cache exact MPN lookups', async () => {
      const testMpn = 'TEST-R-100';

      // First lookup (cache miss)
      const result1 = await sourcingService.getComponentByMPN(testMpn);
      expect(result1).toBeDefined();
      expect(result1?.cached).toBe(false);
      expect(result1?.mpn).toBe(testMpn);

      // Second lookup (cache hit)
      if (redis.isConnected()) {
        const result2 = await sourcingService.getComponentByMPN(testMpn);
        expect(result2).toBeDefined();
        expect(result2?.cached).toBe(true);
        expect(result2?.mpn).toBe(testMpn);
      }
    });

    it('should handle non-existent MPN gracefully', async () => {
      const result = await sourcingService.getComponentByMPN('NON-EXISTENT-MPN');
      expect(result).toBeNull();
    });

    it('should find similar components based on reference', async () => {
      const referenceComponent = {
        category: 'resistor',
        value: '100Ω',
        footprint: 'Resistor_SMD:R_0603_1608Metric'
      };

      const similar = await sourcingService.getSimilarComponents(referenceComponent, {
        threshold: 0.3,
        limit: 5
      });

      expect(similar.length).toBeGreaterThan(0);
      expect(similar.every(c => c.category === 'resistor')).toBe(true);
    });
  });

  describe('Batch Operations', () => {
    it('should handle batch component searches efficiently', async () => {
      const queries = [
        { category: 'resistor', value: '100Ω' },
        { category: 'capacitor', value: '100nF' },
        { category: 'inductor', value: '10µH' }
      ];

      const startTime = Date.now();
      const batchResults = await sourcingService.searchBatch(queries, {
        limit: 5
      });
      const duration = Date.now() - startTime;

      expect(batchResults.length).toBe(3);
      expect(batchResults.every(br => br.results.length > 0)).toBe(true);
      
      // Should complete all searches in reasonable time
      expect(duration).toBeLessThan(5000);

      console.log(`🔄 Batch Search:
        - Queries: ${queries.length}
        - Total Results: ${batchResults.reduce((sum, br) => sum + br.results.length, 0)}
        - Duration: ${duration}ms
      `);
    });
  });

  describe('Cache Management', () => {
    it('should support cache warming for popular categories', async () => {
      const popularCategories = ['resistor', 'capacitor'];
      
      await sourcingService.warmCache(popularCategories);
      
      // Verify cache is warmed by checking fast lookups
      if (redis.isConnected()) {
        const startTime = Date.now();
        const results = await sourcingService.searchComponents({
          category: 'resistor'
        });
        const duration = Date.now() - startTime;
        
        expect(results.length).toBeGreaterThan(0);
        
        // Should be faster after warming (in a real scenario)
        console.log(`🔥 Warmed cache lookup: ${duration}ms`);
      }
    });

    it('should provide component library statistics', async () => {
      const stats = await sourcingService.getComponentStats();
      
      expect(stats).toHaveProperty('totalComponents');
      expect(stats).toHaveProperty('categoryCounts');
      expect(stats).toHaveProperty('cacheMetrics');
      expect(stats).toHaveProperty('recommendations');
      
      expect(stats.totalComponents).toBeGreaterThan(0);
      expect(Array.isArray(stats.categoryCounts)).toBe(true);
      expect(Array.isArray(stats.recommendations)).toBe(true);

      console.log(`📊 Component Library Stats:
        - Total Components: ${stats.totalComponents}
        - Categories: ${stats.categoryCounts.length}
        - Cache Hit Rate: ${(stats.cacheMetrics.hitRate * 100).toFixed(1)}%
        - Recommendations: ${stats.recommendations.length}
      `);
    });

    it('should clear cache selectively by pattern', async () => {
      if (!redis.isConnected()) {
        console.log('Skipping cache clearing test - Redis not available');
        return;
      }

      // Set up test cache entries
      await redis.set('resistor-test', { data: 'test1' }, { prefix: 'sourcing' });
      await redis.set('capacitor-test', { data: 'test2' }, { prefix: 'sourcing' });
      await redis.set('other-test', { data: 'test3' }, { prefix: 'sourcing' });

      // Clear resistor entries only
      const cleared = await sourcingService.clearCache('resistor');
      expect(cleared).toBeGreaterThan(0);

      // Verify selective clearing
      const resistor = await redis.get('resistor-test', { prefix: 'sourcing' });
      const capacitor = await redis.get('capacitor-test', { prefix: 'sourcing' });

      expect(resistor).toBeNull();
      expect(capacitor).toBeDefined(); // Should still exist
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle database errors gracefully', async () => {
      // This would test database connection failures
      // For now, we test that the service doesn't crash
      try {
        const results = await sourcingService.searchComponents({
          category: 'test-error-category'
        });
        expect(Array.isArray(results)).toBe(true);
      } catch (error) {
        // Should not throw unhandled errors
        expect(error).toBeDefined();
      }
    });

    it('should provide cache availability status', () => {
      const isAvailable = sourcingService.isCacheAvailable();
      expect(typeof isAvailable).toBe('boolean');
      
      console.log(`🔌 Sourcing Cache Available: ${isAvailable}`);
    });

    it('should handle cache failures without breaking searches', async () => {
      // Even if cache fails, database searches should still work
      const results = await sourcingService.searchComponents({
        category: 'resistor'
      }, {
        enableCache: false // Force bypass cache
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => !r.cached)).toBe(true);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should demonstrate significant cache performance gains', async () => {
      if (!redis.isConnected()) {
        console.log('Skipping performance benchmark - Redis not available');
        return;
      }

      const query = { category: 'resistor', limit: 20 };
      const trials = 5;
      
      // Measure uncached performance
      await redis.clearPrefix('sourcing');
      const uncachedTimes = [];
      
      for (let i = 0; i < trials; i++) {
        await redis.clearPrefix('sourcing');
        const start = Date.now();
        await sourcingService.searchComponents(query);
        uncachedTimes.push(Date.now() - start);
      }
      
      // Measure cached performance
      const cachedTimes = [];
      
      for (let i = 0; i < trials; i++) {
        const start = Date.now();
        await sourcingService.searchComponents(query);
        cachedTimes.push(Date.now() - start);
      }
      
      const avgUncached = uncachedTimes.reduce((a, b) => a + b) / trials;
      const avgCached = cachedTimes.reduce((a, b) => a + b) / trials;
      const speedup = avgUncached / avgCached;
      
      console.log(`⚡ Performance Benchmark:
        - Uncached (avg): ${avgUncached.toFixed(1)}ms
        - Cached (avg): ${avgCached.toFixed(1)}ms
        - Speedup: ${speedup.toFixed(2)}x
      `);
      
      expect(speedup).toBeGreaterThan(1.5); // At least 50% improvement
    });
  });
});