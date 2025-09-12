import { getRedisCache } from './redis';
import { prisma } from '../db/client';

export interface ComponentQuery {
  category?: string;
  value?: string;
  footprint?: string;
  symbol?: string;
  searchTerm?: string;
}

export interface CachedComponent {
  id: string;
  mpn: string;
  category: string;
  value?: string;
  symbol?: string;
  footprint?: string;
  meta?: any;
  similarity?: number;
  cached: boolean;
  timestamp: number;
}

export interface SourcingOptions {
  enableCache?: boolean;
  ttl?: number;
  limit?: number;
  threshold?: number; // Similarity threshold
}

class CachedSourcingService {
  private cache = getRedisCache();

  /**
   * Search components with caching
   */
  async searchComponents(
    query: ComponentQuery,
    options: SourcingOptions = {}
  ): Promise<CachedComponent[]> {
    const {
      enableCache = true,
      ttl = 24 * 60 * 60, // 24 hours default for component data
      limit = 50,
      threshold = 0.7
    } = options;

    // Generate cache key
    const cacheKey = this.cache.generateSourcingKey(
      JSON.stringify(query),
      { limit, threshold }
    );

    // Try cache first
    if (enableCache) {
      const cached = await this.cache.get<CachedComponent[]>(cacheKey);
      if (cached && cached.length > 0) {
        console.log(`[CACHE] Sourcing cache hit for query: ${JSON.stringify(query)}`);
        return cached.map(c => ({ ...c, cached: true, timestamp: Date.now() }));
      }
    }

    console.log(`[CACHE] Sourcing cache miss, querying database...`);

    // Query database
    const startTime = Date.now();
    const components = await this.queryDatabase(query, limit);
    const duration = Date.now() - startTime;

    console.log(`[CACHE] Database query completed in ${duration}ms, found ${components.length} components`);

    // Format results
    const results: CachedComponent[] = components.map(comp => ({
      id: comp.id,
      mpn: comp.mpn,
      category: comp.category || 'unknown',
      value: comp.value || undefined,
      symbol: comp.symbol || undefined,
      footprint: comp.footprint || undefined,
      meta: comp.meta,
      similarity: this.calculateSimilarity(query, comp),
      cached: false,
      timestamp: Date.now()
    }));

    // Filter by similarity threshold
    const filteredResults = results.filter(r => r.similarity >= threshold);

    // Cache the results (fire and forget)
    if (enableCache && filteredResults.length > 0) {
      this.cache.set(cacheKey, filteredResults, { ttl, prefix: 'sourcing' })
        .catch(err => console.error('[CACHE] Failed to cache sourcing results:', err));
    }

    return filteredResults;
  }

  /**
   * Get component by MPN with caching
   */
  async getComponentByMPN(
    mpn: string,
    options: SourcingOptions = {}
  ): Promise<CachedComponent | null> {
    const {
      enableCache = true,
      ttl = 24 * 60 * 60
    } = options;

    const cacheKey = `mpn:${mpn.toLowerCase()}`;

    // Try cache first
    if (enableCache) {
      const cached = await this.cache.get<CachedComponent>(cacheKey, { prefix: 'sourcing' });
      if (cached) {
        console.log(`[CACHE] MPN cache hit for: ${mpn}`);
        return { ...cached, cached: true, timestamp: Date.now() };
      }
    }

    // Query database
    const component = await prisma.componentLibrary.findUnique({
      where: { mpn }
    });

    if (!component) {
      return null;
    }

    const result: CachedComponent = {
      id: component.id,
      mpn: component.mpn,
      category: component.category || 'unknown',
      value: component.value || undefined,
      symbol: component.symbol || undefined,
      footprint: component.footprint || undefined,
      meta: component.meta,
      similarity: 1.0, // Exact match
      cached: false,
      timestamp: Date.now()
    };

    // Cache the result
    if (enableCache) {
      this.cache.set(cacheKey, result, { ttl, prefix: 'sourcing' })
        .catch(err => console.error('[CACHE] Failed to cache MPN result:', err));
    }

    return result;
  }

  /**
   * Get similar components with caching
   */
  async getSimilarComponents(
    referenceComponent: Partial<CachedComponent>,
    options: SourcingOptions = {}
  ): Promise<CachedComponent[]> {
    const query: ComponentQuery = {
      category: referenceComponent.category,
      value: referenceComponent.value,
      footprint: referenceComponent.footprint
    };

    return this.searchComponents(query, options);
  }

  /**
   * Bulk search for multiple component queries
   */
  async searchBatch(
    queries: ComponentQuery[],
    options: SourcingOptions = {}
  ): Promise<Array<{ query: ComponentQuery; results: CachedComponent[] }>> {
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(5); // Max 5 concurrent searches

    const promises = queries.map(query =>
      limit(async () => ({
        query,
        results: await this.searchComponents(query, options)
      }))
    );

    return Promise.all(promises);
  }

  /**
   * Pre-populate cache with popular components
   */
  async warmCache(popularCategories: string[] = ['resistor', 'capacitor', 'inductor']): Promise<void> {
    console.log(`[CACHE] Warming sourcing cache for categories: ${popularCategories.join(', ')}`);

    const promises = popularCategories.map(category =>
      this.searchComponents({ category }, { enableCache: true, limit: 100 })
        .catch(err => console.error(`[CACHE] Failed to warm cache for category ${category}:`, err))
    );

    await Promise.allSettled(promises);
    console.log('[CACHE] Sourcing cache warming completed');
  }

  /**
   * Clear sourcing cache
   */
  async clearCache(pattern?: string): Promise<number> {
    if (pattern) {
      return this.cache.deletePattern(`sourcing:*${pattern}*`);
    }
    return this.cache.clearPrefix('sourcing');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  private async queryDatabase(query: ComponentQuery, limit: number) {
    const where: any = {};

    // Build where clause
    if (query.category) {
      where.category = {
        contains: query.category,
        mode: 'insensitive'
      };
    }

    if (query.value) {
      where.value = {
        contains: query.value,
        mode: 'insensitive'
      };
    }

    if (query.footprint) {
      where.footprint = {
        contains: query.footprint,
        mode: 'insensitive'
      };
    }

    if (query.symbol) {
      where.symbol = {
        contains: query.symbol,
        mode: 'insensitive'
      };
    }

    if (query.searchTerm) {
      where.OR = [
        { mpn: { contains: query.searchTerm, mode: 'insensitive' } },
        { category: { contains: query.searchTerm, mode: 'insensitive' } },
        { value: { contains: query.searchTerm, mode: 'insensitive' } }
      ];
    }

    return prisma.componentLibrary.findMany({
      where,
      take: limit,
      orderBy: [
        { category: 'asc' },
        { mpn: 'asc' }
      ]
    });
  }

  private calculateSimilarity(query: ComponentQuery, component: any): number {
    let score = 0;
    let factors = 0;

    // Category match (highest weight)
    if (query.category && component.category) {
      factors++;
      if (component.category.toLowerCase().includes(query.category.toLowerCase())) {
        score += 0.4;
      }
    }

    // Value match
    if (query.value && component.value) {
      factors++;
      if (component.value.toLowerCase().includes(query.value.toLowerCase())) {
        score += 0.3;
      }
    }

    // Footprint match
    if (query.footprint && component.footprint) {
      factors++;
      if (component.footprint.toLowerCase().includes(query.footprint.toLowerCase())) {
        score += 0.2;
      }
    }

    // Symbol match
    if (query.symbol && component.symbol) {
      factors++;
      if (component.symbol.toLowerCase().includes(query.symbol.toLowerCase())) {
        score += 0.1;
      }
    }

    // Normalize score by number of factors considered
    return factors > 0 ? Math.min(score / factors, 1.0) : 0.5;
  }

  /**
   * Check if cache is available
   */
  isCacheAvailable(): boolean {
    return this.cache.isConnected();
  }

  /**
   * Get component statistics and recommendations
   */
  async getComponentStats(): Promise<{
    totalComponents: number;
    categoryCounts: Array<{ category: string; count: number }>;
    cacheMetrics: any;
    recommendations: string[];
  }> {
    // Get total component count
    const totalComponents = await prisma.componentLibrary.count();

    // Get category distribution
    const categoryCounts = await prisma.componentLibrary.groupBy({
      by: ['category'],
      _count: {
        category: true
      },
      orderBy: {
        _count: {
          category: 'desc'
        }
      },
      take: 10
    });

    const formattedCategoryCounts = categoryCounts.map(item => ({
      category: item.category || 'unknown',
      count: item._count.category
    }));

    const cacheMetrics = this.getCacheStats();

    const recommendations = [];

    // Analyze cache performance
    if (cacheMetrics.hitRate < 0.5) {
      recommendations.push('Consider warming cache with popular component categories');
    }

    // Analyze component library
    if (totalComponents < 1000) {
      recommendations.push('Component library is small - consider importing more components');
    }

    // Check for missing data
    const missingFootprints = await prisma.componentLibrary.count({
      where: { footprint: null }
    });

    if (missingFootprints > totalComponents * 0.1) {
      recommendations.push('Many components missing footprint data - consider data enrichment');
    }

    return {
      totalComponents,
      categoryCounts: formattedCategoryCounts,
      cacheMetrics,
      recommendations
    };
  }
}

// Singleton instance
let cachedSourcingService: CachedSourcingService | null = null;

export function getCachedSourcingService(): CachedSourcingService {
  if (!cachedSourcingService) {
    cachedSourcingService = new CachedSourcingService();
  }
  return cachedSourcingService;
}

export default CachedSourcingService;