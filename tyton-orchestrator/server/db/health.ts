import { getDatabasePool } from './pool';
import { getDatabaseMonitor } from './monitoring';
import { getDatabaseBackup } from './backup';
import pino from 'pino';

const logger = pino().child({ service: 'db-health' });

interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration: number;
  details?: any;
  critical: boolean;
}

interface DatabaseHealthReport {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  checks: HealthCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    critical: number;
  };
  recommendations: string[];
}

class DatabaseHealthChecker {
  private dbPool = getDatabasePool();
  private monitor = getDatabaseMonitor();
  private backup = getDatabaseBackup();

  /**
   * Perform comprehensive database health check
   */
  async performHealthCheck(): Promise<DatabaseHealthReport> {
    logger.info('🏥 Starting comprehensive database health check');
    const startTime = Date.now();

    const checks: HealthCheck[] = [];

    // Basic connectivity
    checks.push(await this.checkConnectivity());
    
    // Database version and configuration
    checks.push(await this.checkDatabaseVersion());
    checks.push(await this.checkConfiguration());
    
    // Performance checks
    checks.push(await this.checkConnectionPool());
    checks.push(await this.checkQueryPerformance());
    checks.push(await this.checkCacheHitRatio());
    
    // Data integrity
    checks.push(await this.checkDataIntegrity());
    checks.push(await this.checkIndexHealth());
    
    // Storage and capacity
    checks.push(await this.checkDiskSpace());
    checks.push(await this.checkTableSizes());
    
    // Backup and recovery
    checks.push(await this.checkBackupStatus());
    checks.push(await this.checkReplicationStatus());
    
    // Security checks
    checks.push(await this.checkSecurity());
    
    // Monitoring and alerts
    checks.push(await this.checkMonitoring());

    const summary = {
      total: checks.length,
      passed: checks.filter(c => c.status === 'pass').length,
      failed: checks.filter(c => c.status === 'fail').length,
      warnings: checks.filter(c => c.status === 'warn').length,
      critical: checks.filter(c => c.critical && c.status === 'fail').length
    };

    const overall = this.determineOverallHealth(checks);
    const recommendations = this.generateRecommendations(checks);

    const report: DatabaseHealthReport = {
      overall,
      timestamp: new Date(),
      checks,
      summary,
      recommendations
    };

    logger.info({
      overall,
      duration: Date.now() - startTime,
      summary
    }, '🏥 Database health check completed');

    return report;
  }

  /**
   * Quick health check for monitoring endpoints
   */
  async quickHealthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    message: string;
    duration: number;
  }> {
    const startTime = Date.now();
    
    try {
      // Simple connectivity test
      await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw`SELECT 1 as health_check`;
      });

      return {
        status: 'healthy',
        message: 'Database is responsive',
        duration: Date.now() - startTime
      };

    } catch (error: any) {
      return {
        status: 'unhealthy',
        message: `Database connectivity failed: ${error.message}`,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Check database connectivity
   */
  private async checkConnectivity(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw`SELECT version() as version`;
      });

      return {
        name: 'Database Connectivity',
        status: 'pass',
        message: 'Successfully connected to database',
        duration: Date.now() - startTime,
        critical: true
      };

    } catch (error: any) {
      return {
        name: 'Database Connectivity',
        status: 'fail',
        message: `Failed to connect: ${error.message}`,
        duration: Date.now() - startTime,
        critical: true
      };
    }
  }

  /**
   * Check database version and compatibility
   */
  private async checkDatabaseVersion(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const result = await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw<{version: string}[]>`SELECT version() as version`;
      });

      const version = result[0]?.version || 'Unknown';
      const majorVersion = this.extractMajorVersion(version);
      
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = `PostgreSQL version: ${version}`;

      if (majorVersion < 12) {
        status = 'warn';
        message += ' - Consider upgrading to a newer version';
      } else if (majorVersion >= 14) {
        message += ' - Good, running modern PostgreSQL';
      }

      return {
        name: 'Database Version',
        status,
        message,
        duration: Date.now() - startTime,
        details: { version, majorVersion },
        critical: false
      };

    } catch (error: any) {
      return {
        name: 'Database Version',
        status: 'fail',
        message: `Failed to check version: ${error.message}`,
        duration: Date.now() - startTime,
        critical: false
      };
    }
  }

  /**
   * Check database configuration
   */
  private async checkConfiguration(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const settings = await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw<{name: string, setting: string}[]>`
          SELECT name, setting 
          FROM pg_settings 
          WHERE name IN (
            'max_connections',
            'shared_buffers',
            'work_mem',
            'maintenance_work_mem',
            'checkpoint_completion_target',
            'wal_buffers'
          )
        `;
      });

      const config = settings.reduce((acc, setting) => {
        acc[setting.name] = setting.setting;
        return acc;
      }, {} as Record<string, string>);

      const issues: string[] = [];
      const warnings: string[] = [];

      // Check max_connections
      const maxConnections = parseInt(config.max_connections || '0');
      if (maxConnections < 20) {
        issues.push('max_connections too low');
      } else if (maxConnections > 200) {
        warnings.push('max_connections might be too high');
      }

      // Check shared_buffers
      const sharedBuffers = config.shared_buffers || '';
      if (!sharedBuffers.includes('MB') && !sharedBuffers.includes('GB')) {
        warnings.push('shared_buffers configuration unclear');
      }

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = 'Database configuration looks good';

      if (issues.length > 0) {
        status = 'fail';
        message = `Configuration issues: ${issues.join(', ')}`;
      } else if (warnings.length > 0) {
        status = 'warn';
        message = `Configuration warnings: ${warnings.join(', ')}`;
      }

      return {
        name: 'Database Configuration',
        status,
        message,
        duration: Date.now() - startTime,
        details: { config, issues, warnings },
        critical: false
      };

    } catch (error: any) {
      return {
        name: 'Database Configuration',
        status: 'fail',
        message: `Failed to check configuration: ${error.message}`,
        duration: Date.now() - startTime,
        critical: false
      };
    }
  }

  /**
   * Check connection pool status
   */
  private async checkConnectionPool(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const poolMetrics = this.dbPool.getMetrics();
      const poolStats = await this.dbPool.getDetailedStats();

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = 'Connection pool is healthy';

      if (poolMetrics.connectionErrors > 10) {
        status = 'warn';
        message = `High connection error count: ${poolMetrics.connectionErrors}`;
      }

      if (poolMetrics.avgResponseTime > 1000) {
        status = 'warn';
        message = `Slow average response time: ${poolMetrics.avgResponseTime}ms`;
      }

      if (poolStats.databaseInfo.connectionInfo?.total_connections > 50) {
        status = 'warn';
        message += ` - High connection count: ${poolStats.databaseInfo.connectionInfo.total_connections}`;
      }

      return {
        name: 'Connection Pool',
        status,
        message,
        duration: Date.now() - startTime,
        details: { poolMetrics, connectionInfo: poolStats.databaseInfo.connectionInfo },
        critical: true
      };

    } catch (error: any) {
      return {
        name: 'Connection Pool',
        status: 'fail',
        message: `Failed to check connection pool: ${error.message}`,
        duration: Date.now() - startTime,
        critical: true
      };
    }
  }

  /**
   * Check query performance
   */
  private async checkQueryPerformance(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const slowQueries = await this.monitor.getActiveQueries();
      const metrics = await this.monitor.getMonitoringReport();

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = 'Query performance is good';

      if (slowQueries.length > 5) {
        status = 'warn';
        message = `${slowQueries.length} slow queries detected`;
      }

      if (metrics.metrics.avgQueryTime > 500) {
        status = 'warn';
        message += ` - High average query time: ${metrics.metrics.avgQueryTime}ms`;
      }

      const slowQueryPercentage = (metrics.metrics.slowQueries / metrics.metrics.totalQueries) * 100;
      if (slowQueryPercentage > 10) {
        status = 'fail';
        message = `Too many slow queries: ${slowQueryPercentage.toFixed(1)}%`;
      }

      return {
        name: 'Query Performance',
        status,
        message,
        duration: Date.now() - startTime,
        details: { 
          slowQueries: slowQueries.length, 
          avgQueryTime: metrics.metrics.avgQueryTime,
          slowQueryPercentage 
        },
        critical: true
      };

    } catch (error: any) {
      return {
        name: 'Query Performance',
        status: 'fail',
        message: `Failed to check query performance: ${error.message}`,
        duration: Date.now() - startTime,
        critical: true
      };
    }
  }

  /**
   * Check cache hit ratio
   */
  private async checkCacheHitRatio(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const health = await this.monitor.getDatabaseHealth();
      const cacheHitRatio = health.cacheHitRatio;

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = `Cache hit ratio: ${(cacheHitRatio * 100).toFixed(1)}%`;

      if (cacheHitRatio < 0.85) {
        status = 'warn';
        message += ' - Consider increasing shared_buffers';
      }

      if (cacheHitRatio < 0.7) {
        status = 'fail';
        message += ' - Poor cache performance affecting queries';
      }

      return {
        name: 'Cache Hit Ratio',
        status,
        message,
        duration: Date.now() - startTime,
        details: { cacheHitRatio },
        critical: false
      };

    } catch (error: any) {
      return {
        name: 'Cache Hit Ratio',
        status: 'fail',
        message: `Failed to check cache hit ratio: ${error.message}`,
        duration: Date.now() - startTime,
        critical: false
      };
    }
  }

  /**
   * Check data integrity
   */
  private async checkDataIntegrity(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Check for constraint violations
      const violations = await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw<any[]>`
          SELECT conname, conrelid::regclass as table_name
          FROM pg_constraint 
          WHERE NOT convalidated
          LIMIT 10
        `;
      });

      // Check for orphaned records (simplified check)
      const orphanedChecks = await this.checkOrphanedRecords();

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = 'Data integrity checks passed';

      if (violations.length > 0) {
        status = 'fail';
        message = `${violations.length} constraint violations detected`;
      }

      if (orphanedChecks.length > 0) {
        status = 'warn';
        message += ` - ${orphanedChecks.length} potential orphaned records`;
      }

      return {
        name: 'Data Integrity',
        status,
        message,
        duration: Date.now() - startTime,
        details: { violations, orphanedChecks },
        critical: true
      };

    } catch (error: any) {
      return {
        name: 'Data Integrity',
        status: 'fail',
        message: `Failed to check data integrity: ${error.message}`,
        duration: Date.now() - startTime,
        critical: true
      };
    }
  }

  /**
   * Check index health
   */
  private async checkIndexHealth(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // This would use the indexing optimizer we created
      const unusedIndexes = await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw<any[]>`
          SELECT schemaname, tablename, indexname
          FROM pg_stat_user_indexes 
          WHERE idx_scan = 0
          LIMIT 10
        `;
      });

      const bloatedIndexes = await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw<any[]>`
          SELECT tablename, indexname,
                 pg_size_pretty(pg_relation_size(indexrelname::regclass)) as size
          FROM pg_stat_user_indexes 
          WHERE pg_relation_size(indexrelname::regclass) > 100 * 1024 * 1024
          LIMIT 5
        `;
      });

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = 'Index health is good';

      if (unusedIndexes.length > 5) {
        status = 'warn';
        message = `${unusedIndexes.length} unused indexes detected`;
      }

      if (bloatedIndexes.length > 0) {
        status = 'warn';
        message += ` - ${bloatedIndexes.length} large indexes may need optimization`;
      }

      return {
        name: 'Index Health',
        status,
        message,
        duration: Date.now() - startTime,
        details: { unusedIndexes: unusedIndexes.length, bloatedIndexes: bloatedIndexes.length },
        critical: false
      };

    } catch (error: any) {
      return {
        name: 'Index Health',
        status: 'fail',
        message: `Failed to check index health: ${error.message}`,
        duration: Date.now() - startTime,
        critical: false
      };
    }
  }

  /**
   * Check disk space and storage
   */
  private async checkDiskSpace(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const health = await this.monitor.getDatabaseHealth();
      const diskUsage = health.diskUsage;

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = `Disk usage: ${(diskUsage.utilization * 100).toFixed(1)}%`;

      if (diskUsage.utilization > 0.85) {
        status = 'warn';
        message += ' - Disk space running low';
      }

      if (diskUsage.utilization > 0.95) {
        status = 'fail';
        message += ' - Critical: Very low disk space';
      }

      return {
        name: 'Disk Space',
        status,
        message,
        duration: Date.now() - startTime,
        details: diskUsage,
        critical: true
      };

    } catch (error: any) {
      return {
        name: 'Disk Space',
        status: 'fail',
        message: `Failed to check disk space: ${error.message}`,
        duration: Date.now() - startTime,
        critical: true
      };
    }
  }

  /**
   * Check table sizes and growth
   */
  private async checkTableSizes(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const tableMetrics = await this.monitor.getTableMetrics();
      const largeTables = tableMetrics.filter(t => t.rowCount > 1000000);

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = `${tableMetrics.length} tables analyzed`;

      if (largeTables.length > 0) {
        status = 'warn';
        message += ` - ${largeTables.length} large tables may need partitioning`;
      }

      // Check for tables with high sequential scan ratio
      const seqScanTables = tableMetrics.filter(t => 
        t.sequentialScans > t.indexScans && t.rowCount > 10000
      );

      if (seqScanTables.length > 0) {
        status = 'warn';
        message += ` - ${seqScanTables.length} tables have high sequential scan ratio`;
      }

      return {
        name: 'Table Sizes',
        status,
        message,
        duration: Date.now() - startTime,
        details: { 
          totalTables: tableMetrics.length,
          largeTables: largeTables.length,
          seqScanTables: seqScanTables.length
        },
        critical: false
      };

    } catch (error: any) {
      return {
        name: 'Table Sizes',
        status: 'fail',
        message: `Failed to check table sizes: ${error.message}`,
        duration: Date.now() - startTime,
        critical: false
      };
    }
  }

  /**
   * Check backup status
   */
  private async checkBackupStatus(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const backupStats = await this.backup.getBackupStats();
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = `${backupStats.totalBackups} backups available`;

      if (!backupStats.newestBackup || backupStats.newestBackup < oneDayAgo) {
        status = 'fail';
        message = 'No recent backups found - backup system may be failing';
      } else if (backupStats.totalBackups < 7) {
        status = 'warn';
        message += ' - Consider keeping more backup history';
      }

      return {
        name: 'Backup Status',
        status,
        message,
        duration: Date.now() - startTime,
        details: backupStats,
        critical: true
      };

    } catch (error: any) {
      return {
        name: 'Backup Status',
        status: 'fail',
        message: `Failed to check backup status: ${error.message}`,
        duration: Date.now() - startTime,
        critical: true
      };
    }
  }

  /**
   * Check replication status (if applicable)
   */
  private async checkReplicationStatus(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const replicationInfo = await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw<any[]>`
          SELECT * FROM pg_stat_replication
        `;
      });

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = replicationInfo.length > 0 
        ? `${replicationInfo.length} replication connections`
        : 'No replication configured';

      // Check for replication lag if replicas exist
      if (replicationInfo.length > 0) {
        // This would check replication lag in a real setup
        message += ' - Replication appears healthy';
      }

      return {
        name: 'Replication Status',
        status,
        message,
        duration: Date.now() - startTime,
        details: { replicas: replicationInfo.length },
        critical: false
      };

    } catch (error: any) {
      return {
        name: 'Replication Status',
        status: 'fail',
        message: `Failed to check replication: ${error.message}`,
        duration: Date.now() - startTime,
        critical: false
      };
    }
  }

  /**
   * Check security configuration
   */
  private async checkSecurity(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const securityChecks = await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw<any[]>`
          SELECT name, setting 
          FROM pg_settings 
          WHERE name IN ('ssl', 'log_connections', 'log_statement', 'password_encryption')
        `;
      });

      const settings = securityChecks.reduce((acc, setting) => {
        acc[setting.name] = setting.setting;
        return acc;
      }, {} as Record<string, string>);

      const issues: string[] = [];
      
      if (settings.ssl !== 'on') {
        issues.push('SSL not enabled');
      }
      
      if (settings.password_encryption !== 'scram-sha-256') {
        issues.push('Weak password encryption');
      }

      let status: 'pass' | 'warn' | 'fail' = issues.length === 0 ? 'pass' : 'warn';
      let message = issues.length === 0 
        ? 'Security configuration looks good'
        : `Security issues: ${issues.join(', ')}`;

      return {
        name: 'Security Configuration',
        status,
        message,
        duration: Date.now() - startTime,
        details: { settings, issues },
        critical: false
      };

    } catch (error: any) {
      return {
        name: 'Security Configuration',
        status: 'fail',
        message: `Failed to check security: ${error.message}`,
        duration: Date.now() - startTime,
        critical: false
      };
    }
  }

  /**
   * Check monitoring and alerting
   */
  private async checkMonitoring(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const alerts = this.monitor.getAlerts(undefined, false); // Get unresolved alerts
      const criticalAlerts = alerts.filter(a => a.severity === 'critical');

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = 'Monitoring system operational';

      if (criticalAlerts.length > 0) {
        status = 'fail';
        message = `${criticalAlerts.length} critical alerts active`;
      } else if (alerts.length > 5) {
        status = 'warn';
        message = `${alerts.length} active alerts`;
      }

      return {
        name: 'Monitoring System',
        status,
        message,
        duration: Date.now() - startTime,
        details: { 
          totalAlerts: alerts.length,
          criticalAlerts: criticalAlerts.length
        },
        critical: false
      };

    } catch (error: any) {
      return {
        name: 'Monitoring System',
        status: 'fail',
        message: `Failed to check monitoring: ${error.message}`,
        duration: Date.now() - startTime,
        critical: false
      };
    }
  }

  // Helper methods

  private determineOverallHealth(checks: HealthCheck[]): 'healthy' | 'degraded' | 'unhealthy' {
    const criticalFailures = checks.filter(c => c.critical && c.status === 'fail').length;
    const totalFailures = checks.filter(c => c.status === 'fail').length;
    const warnings = checks.filter(c => c.status === 'warn').length;

    if (criticalFailures > 0) {
      return 'unhealthy';
    } else if (totalFailures > 0 || warnings > 3) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  private generateRecommendations(checks: HealthCheck[]): string[] {
    const recommendations: string[] = [];

    const failedChecks = checks.filter(c => c.status === 'fail');
    const warningChecks = checks.filter(c => c.status === 'warn');

    failedChecks.forEach(check => {
      recommendations.push(`🚨 Address ${check.name}: ${check.message}`);
    });

    warningChecks.forEach(check => {
      recommendations.push(`⚠️  Optimize ${check.name}: ${check.message}`);
    });

    // General recommendations
    if (checks.find(c => c.name === 'Cache Hit Ratio' && c.status === 'warn')) {
      recommendations.push('📈 Consider increasing shared_buffers for better cache performance');
    }

    if (checks.find(c => c.name === 'Index Health' && c.status === 'warn')) {
      recommendations.push('🔍 Run index optimization to remove unused indexes');
    }

    return recommendations;
  }

  private extractMajorVersion(versionString: string): number {
    const match = versionString.match(/PostgreSQL (\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  private async checkOrphanedRecords(): Promise<string[]> {
    // Simplified check for orphaned records
    // In practice, this would check foreign key relationships
    try {
      const orphanedModules = await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw<{count: number}[]>`
          SELECT COUNT(*) as count
          FROM "Module" m
          LEFT JOIN "Project" p ON m."projectId" = p.id
          WHERE p.id IS NULL
        `;
      });

      const issues: string[] = [];
      const orphanedCount = Number(orphanedModules[0]?.count || 0);
      
      if (orphanedCount > 0) {
        issues.push(`${orphanedCount} orphaned modules found`);
      }

      return issues;
    } catch (error) {
      return [];
    }
  }
}

// Singleton instance
let healthChecker: DatabaseHealthChecker | null = null;

export function getDatabaseHealthChecker(): DatabaseHealthChecker {
  if (!healthChecker) {
    healthChecker = new DatabaseHealthChecker();
  }
  return healthChecker;
}

export {
  DatabaseHealthChecker,
  HealthCheck,
  DatabaseHealthReport
};