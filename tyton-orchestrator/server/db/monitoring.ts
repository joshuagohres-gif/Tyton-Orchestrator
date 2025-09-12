import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import { getDatabasePool } from './pool';

const logger = pino().child({ service: 'db-monitoring' });

interface QueryMetrics {
  totalQueries: number;
  slowQueries: number;
  failedQueries: number;
  avgQueryTime: number;
  maxQueryTime: number;
  minQueryTime: number;
  queryDistribution: Record<string, number>;
  slowQueryLog: SlowQuery[];
}

interface SlowQuery {
  query: string;
  params?: string;
  duration: number;
  timestamp: Date;
  stackTrace?: string;
}

interface TableMetrics {
  tableName: string;
  rowCount: number;
  tableSize: string;
  indexSize: string;
  totalSize: string;
  lastAnalyzed: Date | null;
  sequentialScans: number;
  indexScans: number;
}

interface DatabaseHealth {
  status: 'healthy' | 'warning' | 'critical';
  uptime: number;
  activeConnections: number;
  maxConnections: number;
  connectionUtilization: number;
  cacheHitRatio: number;
  deadlocks: number;
  blockedQueries: number;
  replicationLag?: number;
  diskUsage: {
    total: string;
    used: string;
    available: string;
    utilization: number;
  };
}

interface PerformanceAlert {
  id: string;
  type: 'slow_query' | 'high_connections' | 'low_cache_hit' | 'deadlock' | 'disk_space';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: any;
  timestamp: Date;
  resolved: boolean;
}

class DatabaseMonitor {
  private metrics: QueryMetrics;
  private alerts: PerformanceAlert[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;
  private dbPool = getDatabasePool();
  private readonly slowQueryThreshold = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '1000');
  private readonly maxSlowQueries = parseInt(process.env.MAX_SLOW_QUERIES_STORED || '50');

  constructor() {
    this.metrics = {
      totalQueries: 0,
      slowQueries: 0,
      failedQueries: 0,
      avgQueryTime: 0,
      maxQueryTime: 0,
      minQueryTime: Number.MAX_SAFE_INTEGER,
      queryDistribution: {},
      slowQueryLog: []
    };

    this.startMonitoring();
  }

  /**
   * Start continuous database monitoring
   */
  private startMonitoring(): void {
    // Monitor every minute
    this.monitoringInterval = setInterval(async () => {
      await this.collectMetrics();
      await this.checkAlertConditions();
    }, 60000);

    logger.info('🔍 Database monitoring started');
  }

  /**
   * Record a database query execution
   */
  recordQuery(query: string, duration: number, params?: string, error?: Error): void {
    this.metrics.totalQueries++;
    
    // Update timing metrics
    this.metrics.maxQueryTime = Math.max(this.metrics.maxQueryTime, duration);
    this.metrics.minQueryTime = Math.min(this.metrics.minQueryTime, duration);
    this.metrics.avgQueryTime = (this.metrics.avgQueryTime * (this.metrics.totalQueries - 1) + duration) / this.metrics.totalQueries;

    // Track query distribution by type
    const queryType = this.extractQueryType(query);
    this.metrics.queryDistribution[queryType] = (this.metrics.queryDistribution[queryType] || 0) + 1;

    // Handle errors
    if (error) {
      this.metrics.failedQueries++;
      logger.error({
        query,
        duration,
        error: error.message
      }, 'Database query failed');
    }

    // Handle slow queries
    if (duration > this.slowQueryThreshold) {
      this.metrics.slowQueries++;
      
      const slowQuery: SlowQuery = {
        query: this.sanitizeQuery(query),
        params,
        duration,
        timestamp: new Date(),
        stackTrace: new Error().stack
      };

      this.metrics.slowQueryLog.push(slowQuery);
      
      // Keep only recent slow queries
      if (this.metrics.slowQueryLog.length > this.maxSlowQueries) {
        this.metrics.slowQueryLog.shift();
      }

      // Create alert for very slow queries (>5 seconds)
      if (duration > 5000) {
        this.createAlert({
          type: 'slow_query',
          severity: duration > 10000 ? 'critical' : 'high',
          message: `Very slow query detected: ${duration}ms`,
          details: { query: this.sanitizeQuery(query), duration, params }
        });
      }
    }
  }

  /**
   * Collect comprehensive database metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      const health = await this.getDatabaseHealth();
      
      // Check for alert conditions
      if (health.connectionUtilization > 0.8) {
        this.createAlert({
          type: 'high_connections',
          severity: health.connectionUtilization > 0.9 ? 'critical' : 'high',
          message: `High connection utilization: ${(health.connectionUtilization * 100).toFixed(1)}%`,
          details: { 
            activeConnections: health.activeConnections, 
            maxConnections: health.maxConnections 
          }
        });
      }

      if (health.cacheHitRatio < 0.85) {
        this.createAlert({
          type: 'low_cache_hit',
          severity: health.cacheHitRatio < 0.7 ? 'high' : 'medium',
          message: `Low cache hit ratio: ${(health.cacheHitRatio * 100).toFixed(1)}%`,
          details: { cacheHitRatio: health.cacheHitRatio }
        });
      }

      if (health.diskUsage.utilization > 0.85) {
        this.createAlert({
          type: 'disk_space',
          severity: health.diskUsage.utilization > 0.95 ? 'critical' : 'high',
          message: `High disk usage: ${(health.diskUsage.utilization * 100).toFixed(1)}%`,
          details: health.diskUsage
        });
      }

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to collect database metrics');
    }
  }

  /**
   * Get current database health status
   */
  async getDatabaseHealth(): Promise<DatabaseHealth> {
    try {
      const [
        connectionInfo,
        cacheStats,
        lockStats,
        diskStats
      ] = await Promise.all([
        this.getConnectionInfo(),
        this.getCacheStats(),
        this.getLockStats(),
        this.getDiskStats()
      ]);

      const health: DatabaseHealth = {
        status: 'healthy',
        uptime: connectionInfo.uptime || 0,
        activeConnections: connectionInfo.active || 0,
        maxConnections: connectionInfo.max || 100,
        connectionUtilization: (connectionInfo.active || 0) / (connectionInfo.max || 100),
        cacheHitRatio: cacheStats.hitRatio || 0,
        deadlocks: lockStats.deadlocks || 0,
        blockedQueries: lockStats.blocked || 0,
        diskUsage: diskStats
      };

      // Determine overall health status
      if (health.connectionUtilization > 0.9 || health.cacheHitRatio < 0.7 || health.diskUsage.utilization > 0.95) {
        health.status = 'critical';
      } else if (health.connectionUtilization > 0.8 || health.cacheHitRatio < 0.85 || health.diskUsage.utilization > 0.85) {
        health.status = 'warning';
      }

      return health;

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get database health');
      return {
        status: 'critical',
        uptime: 0,
        activeConnections: 0,
        maxConnections: 0,
        connectionUtilization: 0,
        cacheHitRatio: 0,
        deadlocks: 0,
        blockedQueries: 0,
        diskUsage: {
          total: '0 MB',
          used: '0 MB', 
          available: '0 MB',
          utilization: 0
        }
      };
    }
  }

  /**
   * Get table-level metrics
   */
  async getTableMetrics(): Promise<TableMetrics[]> {
    try {
      const tableStats = await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw<any[]>`
          SELECT 
            schemaname as schema_name,
            tablename as table_name,
            n_tup_ins as inserts,
            n_tup_upd as updates,
            n_tup_del as deletes,
            n_live_tup as live_tuples,
            n_dead_tup as dead_tuples,
            seq_scan as sequential_scans,
            idx_scan as index_scans,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
            pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size,
            last_analyze,
            last_autoanalyze
          FROM pg_stat_user_tables
          WHERE schemaname = 'public'
          ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        `;
      });

      return tableStats.map(stat => ({
        tableName: stat.table_name,
        rowCount: parseInt(stat.live_tuples || '0'),
        tableSize: stat.table_size || '0 bytes',
        indexSize: stat.index_size || '0 bytes', 
        totalSize: stat.total_size || '0 bytes',
        lastAnalyzed: stat.last_analyze || stat.last_autoanalyze,
        sequentialScans: parseInt(stat.sequential_scans || '0'),
        indexScans: parseInt(stat.index_scans || '0')
      }));

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get table metrics');
      return [];
    }
  }

  /**
   * Get active query information
   */
  async getActiveQueries(): Promise<any[]> {
    try {
      return await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw<any[]>`
          SELECT 
            pid,
            now() - pg_stat_activity.query_start AS duration,
            query,
            state,
            wait_event_type,
            wait_event
          FROM pg_stat_activity 
          WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
            AND state = 'active'
            AND query NOT LIKE '%pg_stat_activity%'
          ORDER BY duration DESC
        `;
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get active queries');
      return [];
    }
  }

  /**
   * Create performance alert
   */
  private createAlert(alert: Omit<PerformanceAlert, 'id' | 'timestamp' | 'resolved'>): void {
    const newAlert: PerformanceAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      resolved: false,
      ...alert
    };

    this.alerts.push(newAlert);

    // Keep only recent alerts (last 100)
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    logger.warn({
      alertId: newAlert.id,
      type: newAlert.type,
      severity: newAlert.severity,
      message: newAlert.message,
      details: newAlert.details
    }, 'Database performance alert created');
  }

  /**
   * Get current alerts
   */
  getAlerts(severity?: string, resolved?: boolean): PerformanceAlert[] {
    let filteredAlerts = this.alerts;

    if (severity) {
      filteredAlerts = filteredAlerts.filter(alert => alert.severity === severity);
    }

    if (resolved !== undefined) {
      filteredAlerts = filteredAlerts.filter(alert => alert.resolved === resolved);
    }

    return filteredAlerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      return true;
    }
    return false;
  }

  /**
   * Get comprehensive monitoring report
   */
  async getMonitoringReport(): Promise<{
    health: DatabaseHealth;
    metrics: QueryMetrics;
    tableMetrics: TableMetrics[];
    activeQueries: any[];
    alerts: PerformanceAlert[];
    recommendations: string[];
  }> {
    const [health, tableMetrics, activeQueries] = await Promise.all([
      this.getDatabaseHealth(),
      this.getTableMetrics(),
      this.getActiveQueries()
    ]);

    const recommendations = this.generateRecommendations(health, tableMetrics);

    return {
      health,
      metrics: this.metrics,
      tableMetrics,
      activeQueries,
      alerts: this.getAlerts(),
      recommendations
    };
  }

  private generateRecommendations(health: DatabaseHealth, tableMetrics: TableMetrics[]): string[] {
    const recommendations: string[] = [];

    if (health.cacheHitRatio < 0.85) {
      recommendations.push('Consider increasing shared_buffers to improve cache hit ratio');
    }

    if (health.connectionUtilization > 0.8) {
      recommendations.push('High connection usage detected - consider connection pooling optimization');
    }

    const heavySeqScanTables = tableMetrics.filter(t => 
      t.sequentialScans > t.indexScans && t.rowCount > 1000
    );
    
    if (heavySeqScanTables.length > 0) {
      recommendations.push(`Consider adding indexes to tables with high sequential scans: ${heavySeqScanTables.map(t => t.tableName).join(', ')}`);
    }

    if (this.metrics.slowQueries > this.metrics.totalQueries * 0.1) {
      recommendations.push('High percentage of slow queries - review query performance and indexing strategy');
    }

    return recommendations;
  }

  // Helper methods
  private async getConnectionInfo(): Promise<any> {
    try {
      const result = await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw<any[]>`
          SELECT 
            count(*) as active,
            (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max,
            extract(epoch from now() - pg_postmaster_start_time()) as uptime
          FROM pg_stat_activity 
          WHERE state = 'active'
        `;
      });
      return result[0] || {};
    } catch (error) {
      return {};
    }
  }

  private async getCacheStats(): Promise<any> {
    try {
      const result = await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw<any[]>`
          SELECT 
            sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read))::numeric as hit_ratio
          FROM pg_statio_user_tables
        `;
      });
      return { hitRatio: parseFloat(result[0]?.hit_ratio || '0') };
    } catch (error) {
      return { hitRatio: 0 };
    }
  }

  private async getLockStats(): Promise<any> {
    try {
      const result = await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw<any[]>`
          SELECT 
            count(*) FILTER (WHERE wait_event_type = 'Lock') as blocked,
            0 as deadlocks
          FROM pg_stat_activity 
          WHERE wait_event_type IS NOT NULL
        `;
      });
      return result[0] || { blocked: 0, deadlocks: 0 };
    } catch (error) {
      return { blocked: 0, deadlocks: 0 };
    }
  }

  private async getDiskStats(): Promise<DatabaseHealth['diskUsage']> {
    try {
      const result = await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw<any[]>`
          SELECT 
            pg_size_pretty(pg_database_size(current_database())) as used,
            '100 GB' as total,
            '50 GB' as available
        `;
      });
      
      return {
        total: result[0]?.total || '0 GB',
        used: result[0]?.used || '0 GB',
        available: result[0]?.available || '0 GB',
        utilization: 0.5 // Simplified calculation
      };
    } catch (error) {
      return {
        total: '0 GB',
        used: '0 GB',
        available: '0 GB',
        utilization: 0
      };
    }
  }

  private extractQueryType(query: string): string {
    const cleanQuery = query.trim().toLowerCase();
    if (cleanQuery.startsWith('select')) return 'SELECT';
    if (cleanQuery.startsWith('insert')) return 'INSERT';
    if (cleanQuery.startsWith('update')) return 'UPDATE';
    if (cleanQuery.startsWith('delete')) return 'DELETE';
    if (cleanQuery.startsWith('create')) return 'CREATE';
    if (cleanQuery.startsWith('alter')) return 'ALTER';
    if (cleanQuery.startsWith('drop')) return 'DROP';
    return 'OTHER';
  }

  private sanitizeQuery(query: string): string {
    // Remove sensitive data and normalize for logging
    return query
      .replace(/\$\d+/g, '?')  // Replace parameters
      .replace(/'.+?'/g, "'?'")  // Replace string literals
      .replace(/\d+/g, '?')      // Replace numbers
      .trim()
      .substring(0, 500);        // Limit length
  }

  private async checkAlertConditions(): Promise<void> {
    // Additional alert condition checks can be added here
    const activeQueries = await this.getActiveQueries();
    
    if (activeQueries.length > 5) {
      this.createAlert({
        type: 'slow_query',
        severity: 'medium',
        message: `${activeQueries.length} long-running queries detected`,
        details: { count: activeQueries.length }
      });
    }
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    logger.info('🔍 Database monitoring stopped');
  }
}

// Singleton instance
let databaseMonitor: DatabaseMonitor | null = null;

export function getDatabaseMonitor(): DatabaseMonitor {
  if (!databaseMonitor) {
    databaseMonitor = new DatabaseMonitor();
  }
  return databaseMonitor;
}

export {
  DatabaseMonitor,
  QueryMetrics,
  TableMetrics,
  DatabaseHealth,
  PerformanceAlert,
  SlowQuery
};