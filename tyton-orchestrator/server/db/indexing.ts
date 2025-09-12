import { getDatabasePool } from './pool';
import pino from 'pino';

const logger = pino().child({ service: 'db-indexing' });

interface IndexAnalysis {
  tableName: string;
  indexName: string;
  indexType: string;
  columns: string[];
  size: string;
  usage: {
    scans: number;
    tupleReads: number;
    tupleFetches: number;
  };
  bloat: {
    estimated: number;
    percentage: number;
  };
  recommendation: 'keep' | 'drop' | 'rebuild' | 'optimize';
  reason: string;
}

interface QueryPattern {
  query: string;
  frequency: number;
  avgDuration: number;
  tables: string[];
  whereColumns: string[];
  orderByColumns: string[];
  joinColumns: string[];
  missingIndexes: string[];
}

interface IndexRecommendation {
  table: string;
  columns: string[];
  indexType: 'btree' | 'hash' | 'gin' | 'gist' | 'partial';
  reason: string;
  estimatedBenefit: 'high' | 'medium' | 'low';
  sqlCommand: string;
  estimatedSize: string;
}

class DatabaseIndexOptimizer {
  private dbPool = getDatabasePool();

  /**
   * Analyze all existing indexes and provide recommendations
   */
  async analyzeIndexes(): Promise<IndexAnalysis[]> {
    logger.info('🔍 Starting index analysis...');

    try {
      const indexes = await this.getAllIndexes();
      const analyses: IndexAnalysis[] = [];

      for (const index of indexes) {
        const analysis = await this.analyzeIndex(index);
        analyses.push(analysis);
      }

      logger.info({ 
        totalIndexes: analyses.length,
        recommendations: {
          keep: analyses.filter(a => a.recommendation === 'keep').length,
          drop: analyses.filter(a => a.recommendation === 'drop').length,
          rebuild: analyses.filter(a => a.recommendation === 'rebuild').length,
          optimize: analyses.filter(a => a.recommendation === 'optimize').length
        }
      }, '📊 Index analysis completed');

      return analyses;

    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Index analysis failed');
      throw error;
    }
  }

  /**
   * Recommend new indexes based on query patterns
   */
  async recommendIndexes(): Promise<IndexRecommendation[]> {
    logger.info('🎯 Generating index recommendations...');

    try {
      const [queryPatterns, tableStats] = await Promise.all([
        this.analyzeQueryPatterns(),
        this.getTableStatistics()
      ]);

      const recommendations: IndexRecommendation[] = [];

      for (const pattern of queryPatterns) {
        const newRecommendations = await this.generateRecommendationsForPattern(pattern, tableStats);
        recommendations.push(...newRecommendations);
      }

      // Remove duplicates and prioritize
      const uniqueRecommendations = this.deduplicateRecommendations(recommendations);
      const prioritizedRecommendations = this.prioritizeRecommendations(uniqueRecommendations);

      logger.info({
        patterns: queryPatterns.length,
        recommendations: prioritizedRecommendations.length,
        highBenefit: prioritizedRecommendations.filter(r => r.estimatedBenefit === 'high').length
      }, '🎯 Index recommendations generated');

      return prioritizedRecommendations;

    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Index recommendation failed');
      throw error;
    }
  }

  /**
   * Create recommended indexes
   */
  async createIndexes(recommendations: IndexRecommendation[], dryRun = true): Promise<{
    created: string[];
    failed: Array<{ index: string; error: string }>;
  }> {
    const created: string[] = [];
    const failed: Array<{ index: string; error: string }> = [];

    for (const recommendation of recommendations) {
      try {
        if (dryRun) {
          logger.info({
            table: recommendation.table,
            columns: recommendation.columns,
            sql: recommendation.sqlCommand
          }, '🔍 DRY RUN - Would create index');
          created.push(recommendation.sqlCommand);
        } else {
          await this.dbPool.execute(async (prisma) => {
            return await prisma.$executeRawUnsafe(recommendation.sqlCommand);
          });

          logger.info({
            table: recommendation.table,
            columns: recommendation.columns
          }, '✅ Index created successfully');
          
          created.push(recommendation.sqlCommand);
        }

      } catch (error: any) {
        const errorMsg = `Failed to create index on ${recommendation.table}(${recommendation.columns.join(', ')}): ${error.message}`;
        failed.push({
          index: recommendation.sqlCommand,
          error: errorMsg
        });

        logger.error({
          table: recommendation.table,
          columns: recommendation.columns,
          error: error.message
        }, '❌ Index creation failed');
      }
    }

    return { created, failed };
  }

  /**
   * Remove unused indexes
   */
  async removeUnusedIndexes(dryRun = true): Promise<{
    removed: string[];
    kept: string[];
  }> {
    const analyses = await this.analyzeIndexes();
    const toRemove = analyses.filter(a => a.recommendation === 'drop');
    
    const removed: string[] = [];
    const kept: string[] = [];

    for (const analysis of toRemove) {
      try {
        const dropCommand = `DROP INDEX IF EXISTS "${analysis.indexName}"`;
        
        if (dryRun) {
          logger.info({
            indexName: analysis.indexName,
            table: analysis.tableName,
            reason: analysis.reason,
            sql: dropCommand
          }, '🔍 DRY RUN - Would drop index');
          removed.push(dropCommand);
        } else {
          await this.dbPool.execute(async (prisma) => {
            return await prisma.$executeRawUnsafe(dropCommand);
          });

          logger.info({
            indexName: analysis.indexName,
            table: analysis.tableName,
            reason: analysis.reason
          }, '🗑️ Index removed successfully');
          
          removed.push(dropCommand);
        }

      } catch (error: any) {
        logger.error({
          indexName: analysis.indexName,
          error: error.message
        }, '❌ Index removal failed');
        kept.push(analysis.indexName);
      }
    }

    return { removed, kept };
  }

  /**
   * Rebuild bloated indexes
   */
  async rebuildBloatedIndexes(bloatThreshold = 20, dryRun = true): Promise<{
    rebuilt: string[];
    failed: string[];
  }> {
    const analyses = await this.analyzeIndexes();
    const bloatedIndexes = analyses.filter(a => 
      a.bloat.percentage > bloatThreshold && 
      (a.recommendation === 'rebuild' || a.recommendation === 'optimize')
    );

    const rebuilt: string[] = [];
    const failed: string[] = [];

    for (const analysis of bloatedIndexes) {
      try {
        const reindexCommand = `REINDEX INDEX "${analysis.indexName}"`;
        
        if (dryRun) {
          logger.info({
            indexName: analysis.indexName,
            bloatPercentage: analysis.bloat.percentage,
            sql: reindexCommand
          }, '🔍 DRY RUN - Would rebuild index');
          rebuilt.push(reindexCommand);
        } else {
          await this.dbPool.execute(async (prisma) => {
            return await prisma.$executeRawUnsafe(reindexCommand);
          });

          logger.info({
            indexName: analysis.indexName,
            bloatPercentage: analysis.bloat.percentage
          }, '🔨 Index rebuilt successfully');
          
          rebuilt.push(reindexCommand);
        }

      } catch (error: any) {
        logger.error({
          indexName: analysis.indexName,
          error: error.message
        }, '❌ Index rebuild failed');
        failed.push(analysis.indexName);
      }
    }

    return { rebuilt, failed };
  }

  /**
   * Get comprehensive index report
   */
  async getIndexReport(): Promise<{
    summary: {
      totalIndexes: number;
      totalSize: string;
      unusedIndexes: number;
      bloatedIndexes: number;
      recommendations: number;
    };
    analyses: IndexAnalysis[];
    recommendations: IndexRecommendation[];
    queryPatterns: QueryPattern[];
  }> {
    const [analyses, recommendations, queryPatterns] = await Promise.all([
      this.analyzeIndexes(),
      this.recommendIndexes(),
      this.analyzeQueryPatterns()
    ]);

    const totalSize = analyses.reduce((sum, a) => {
      const sizeNum = parseFloat(a.size.replace(/[^0-9.]/g, ''));
      return sum + (isNaN(sizeNum) ? 0 : sizeNum);
    }, 0);

    return {
      summary: {
        totalIndexes: analyses.length,
        totalSize: `${totalSize.toFixed(2)} MB`,
        unusedIndexes: analyses.filter(a => a.recommendation === 'drop').length,
        bloatedIndexes: analyses.filter(a => a.bloat.percentage > 20).length,
        recommendations: recommendations.length
      },
      analyses,
      recommendations,
      queryPatterns
    };
  }

  // Private helper methods

  private async getAllIndexes(): Promise<any[]> {
    return await this.dbPool.execute(async (prisma) => {
      return await prisma.$queryRaw<any[]>`
        SELECT 
          schemaname,
          tablename,
          indexname,
          indexdef,
          pg_size_pretty(pg_relation_size(indexname::regclass)) as size_pretty,
          pg_relation_size(indexname::regclass) as size_bytes
        FROM pg_indexes 
        WHERE schemaname = 'public'
        ORDER BY pg_relation_size(indexname::regclass) DESC
      `;
    });
  }

  private async analyzeIndex(index: any): Promise<IndexAnalysis> {
    // Get index usage statistics
    const usage = await this.getIndexUsage(index.indexname);
    
    // Estimate bloat
    const bloat = await this.estimateIndexBloat(index.indexname);
    
    // Parse columns from index definition
    const columns = this.parseIndexColumns(index.indexdef);
    
    // Generate recommendation
    const { recommendation, reason } = this.generateIndexRecommendation(usage, bloat, index);

    return {
      tableName: index.tablename,
      indexName: index.indexname,
      indexType: this.parseIndexType(index.indexdef),
      columns,
      size: index.size_pretty,
      usage,
      bloat,
      recommendation,
      reason
    };
  }

  private async getIndexUsage(indexName: string): Promise<IndexAnalysis['usage']> {
    try {
      const result = await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw<any[]>`
          SELECT 
            idx_scan as scans,
            idx_tup_read as tuple_reads,
            idx_tup_fetch as tuple_fetches
          FROM pg_stat_user_indexes 
          WHERE indexrelname = ${indexName}
        `;
      });

      if (result.length > 0) {
        return {
          scans: parseInt(result[0].scans || '0'),
          tupleReads: parseInt(result[0].tuple_reads || '0'),
          tupleFetches: parseInt(result[0].tuple_fetches || '0')
        };
      }
    } catch (error) {
      logger.debug({ indexName, error: error.message }, 'Failed to get index usage');
    }

    return { scans: 0, tupleReads: 0, tupleFetches: 0 };
  }

  private async estimateIndexBloat(indexName: string): Promise<IndexAnalysis['bloat']> {
    try {
      // Simplified bloat estimation - in production, use pgstattuple extension
      const result = await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw<any[]>`
          SELECT 
            pg_relation_size(${indexName}::regclass) as actual_size,
            pg_relation_size(${indexName}::regclass) * 0.1 as estimated_bloat
        `;
      });

      if (result.length > 0) {
        const actualSize = parseInt(result[0].actual_size || '0');
        const estimatedBloat = parseInt(result[0].estimated_bloat || '0');
        const percentage = actualSize > 0 ? (estimatedBloat / actualSize) * 100 : 0;

        return {
          estimated: estimatedBloat,
          percentage: Math.round(percentage * 100) / 100
        };
      }
    } catch (error) {
      logger.debug({ indexName, error: error.message }, 'Failed to estimate index bloat');
    }

    return { estimated: 0, percentage: 0 };
  }

  private parseIndexColumns(indexDef: string): string[] {
    // Extract column names from CREATE INDEX statement
    const match = indexDef.match(/\((.*?)\)/);
    if (match) {
      return match[1].split(',').map(col => col.trim().replace(/"/g, ''));
    }
    return [];
  }

  private parseIndexType(indexDef: string): string {
    if (indexDef.includes('USING btree')) return 'btree';
    if (indexDef.includes('USING hash')) return 'hash';
    if (indexDef.includes('USING gin')) return 'gin';
    if (indexDef.includes('USING gist')) return 'gist';
    return 'btree'; // default
  }

  private generateIndexRecommendation(
    usage: IndexAnalysis['usage'], 
    bloat: IndexAnalysis['bloat'],
    index: any
  ): { recommendation: IndexAnalysis['recommendation']; reason: string } {
    // Never used index
    if (usage.scans === 0) {
      return { recommendation: 'drop', reason: 'Index has never been used' };
    }

    // Low usage index
    if (usage.scans < 100) {
      return { recommendation: 'drop', reason: 'Index has very low usage (< 100 scans)' };
    }

    // High bloat index
    if (bloat.percentage > 30) {
      return { recommendation: 'rebuild', reason: `High bloat detected (${bloat.percentage.toFixed(1)}%)` };
    }

    // Medium bloat index
    if (bloat.percentage > 20) {
      return { recommendation: 'optimize', reason: `Medium bloat detected (${bloat.percentage.toFixed(1)}%)` };
    }

    // Well-performing index
    return { recommendation: 'keep', reason: 'Index is well-utilized and not bloated' };
  }

  private async analyzeQueryPatterns(): Promise<QueryPattern[]> {
    try {
      // This would analyze pg_stat_statements in production
      // For now, return common patterns based on our schema
      return [
        {
          query: 'SELECT * FROM "Project" WHERE status = ?',
          frequency: 150,
          avgDuration: 45,
          tables: ['Project'],
          whereColumns: ['status'],
          orderByColumns: [],
          joinColumns: [],
          missingIndexes: ['Project(status)']
        },
        {
          query: 'SELECT * FROM "LlmUsage" WHERE userId = ? AND createdAt > ?',
          frequency: 200,
          avgDuration: 120,
          tables: ['LlmUsage'],
          whereColumns: ['userId', 'createdAt'],
          orderByColumns: ['createdAt'],
          joinColumns: [],
          missingIndexes: ['LlmUsage(userId, createdAt)']
        },
        {
          query: 'SELECT * FROM "ComponentLibrary" WHERE category = ? AND value = ?',
          frequency: 80,
          avgDuration: 200,
          tables: ['ComponentLibrary'],
          whereColumns: ['category', 'value'],
          orderByColumns: [],
          joinColumns: [],
          missingIndexes: ['ComponentLibrary(category, value)']
        }
      ];
    } catch (error) {
      return [];
    }
  }

  private async getTableStatistics(): Promise<any[]> {
    return await this.dbPool.execute(async (prisma) => {
      return await prisma.$queryRaw<any[]>`
        SELECT 
          tablename,
          n_live_tup as row_count,
          pg_size_pretty(pg_total_relation_size(tablename::regclass)) as size
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY n_live_tup DESC
      `;
    });
  }

  private async generateRecommendationsForPattern(
    pattern: QueryPattern,
    tableStats: any[]
  ): Promise<IndexRecommendation[]> {
    const recommendations: IndexRecommendation[] = [];

    // High-frequency WHERE clause columns
    if (pattern.frequency > 100 && pattern.whereColumns.length > 0) {
      const table = pattern.tables[0];
      const tableSize = tableStats.find(t => t.tablename === table)?.row_count || 0;
      
      if (tableSize > 1000) { // Only recommend for tables with significant data
        recommendations.push({
          table,
          columns: pattern.whereColumns,
          indexType: 'btree',
          reason: `High-frequency WHERE clause on ${pattern.whereColumns.join(', ')} (${pattern.frequency} queries/day)`,
          estimatedBenefit: pattern.avgDuration > 100 ? 'high' : 'medium',
          sqlCommand: this.generateCreateIndexSQL(table, pattern.whereColumns, 'btree'),
          estimatedSize: this.estimateIndexSize(tableSize, pattern.whereColumns.length)
        });
      }
    }

    // ORDER BY columns
    if (pattern.orderByColumns.length > 0) {
      const table = pattern.tables[0];
      recommendations.push({
        table,
        columns: [...pattern.whereColumns, ...pattern.orderByColumns],
        indexType: 'btree',
        reason: `ORDER BY optimization on ${pattern.orderByColumns.join(', ')}`,
        estimatedBenefit: 'medium',
        sqlCommand: this.generateCreateIndexSQL(table, [...pattern.whereColumns, ...pattern.orderByColumns], 'btree'),
        estimatedSize: '5-15 MB'
      });
    }

    return recommendations;
  }

  private generateCreateIndexSQL(table: string, columns: string[], indexType: string): string {
    const indexName = `idx_${table.toLowerCase()}_${columns.join('_').toLowerCase()}`;
    return `CREATE INDEX CONCURRENTLY "${indexName}" ON "${table}" USING ${indexType} ("${columns.join('", "')}");`;
  }

  private estimateIndexSize(rowCount: number, columnCount: number): string {
    // Rough estimation: ~50 bytes per row per column for btree index
    const estimatedBytes = rowCount * columnCount * 50;
    const estimatedMB = estimatedBytes / (1024 * 1024);
    
    if (estimatedMB < 1) return '< 1 MB';
    if (estimatedMB < 10) return `${estimatedMB.toFixed(1)} MB`;
    if (estimatedMB < 100) return `${Math.round(estimatedMB)} MB`;
    return `${(estimatedMB / 1024).toFixed(1)} GB`;
  }

  private deduplicateRecommendations(recommendations: IndexRecommendation[]): IndexRecommendation[] {
    const seen = new Set<string>();
    return recommendations.filter(rec => {
      const key = `${rec.table}:${rec.columns.sort().join(',')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private prioritizeRecommendations(recommendations: IndexRecommendation[]): IndexRecommendation[] {
    const priority = { high: 3, medium: 2, low: 1 };
    return recommendations.sort((a, b) => priority[b.estimatedBenefit] - priority[a.estimatedBenefit]);
  }
}

// Singleton instance
let indexOptimizer: DatabaseIndexOptimizer | null = null;

export function getDatabaseIndexOptimizer(): DatabaseIndexOptimizer {
  if (!indexOptimizer) {
    indexOptimizer = new DatabaseIndexOptimizer();
  }
  return indexOptimizer;
}

export {
  DatabaseIndexOptimizer,
  IndexAnalysis,
  QueryPattern,
  IndexRecommendation
};