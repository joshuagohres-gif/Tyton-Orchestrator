import { NextRequest, NextResponse } from 'next/server';
import { getAPIMonitor, getMetrics, SystemMetrics } from '@/server/monitoring/metrics';
import { getDatabaseMonitor } from '@/server/db/monitoring';
import { getCachedLlmService } from '@/server/llm/cachedService';
import { authMiddleware } from '@/server/http/middleware';
import { hasSystemRole } from '@/server/auth/rbac';

export const dynamic = 'force-dynamic';

async function GET(request: NextRequest) {
  try {
    // Apply authentication and authorization
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user } = authResult;
    
    // Verify admin permissions
    if (!await hasSystemRole(user.id, 'admin')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Gather comprehensive system metrics
    const apiMonitor = getAPIMonitor();
    const metricsCollector = getMetrics();
    const dbMonitor = getDatabaseMonitor();
    const llmService = getCachedLlmService();

    // API Health Status
    const apiHealth = apiMonitor.getHealthStatus();
    const apiMetrics = apiMonitor.getMetrics(300000); // Last 5 minutes
    const activeAlerts = apiMonitor.getAlerts();

    // Database Health
    const dbHealth = await dbMonitor.getDatabaseHealth();
    const dbStats = dbMonitor.getStatistics();

    // System Metrics
    const systemMetrics = {
      uptime: process.uptime() * 1000,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      eventLoopDelay: process.hrtime.bigint() // Simplified event loop monitoring
    };

    // LLM Service Health
    const llmHealth = {
      providers: await llmService.getProviderStatus(),
      cacheStats: await llmService.getCacheStats(),
      requestStats: llmService.getRequestStats()
    };

    // Application Status Summary
    const overallStatus = determineOverallStatus({
      api: apiHealth.status,
      database: dbHealth.status,
      alerts: activeAlerts.length
    });

    // Recent Performance Trends (last hour)
    const performanceTrends = {
      responseTime: {
        current: apiMetrics.avgResponseTime,
        trend: calculateTrend(apiMonitor, 'avgResponseTime', 3600000)
      },
      errorRate: {
        current: apiMetrics.errorRate,
        trend: calculateTrend(apiMonitor, 'errorRate', 3600000)
      },
      requestVolume: {
        current: apiMetrics.totalRequests,
        trend: calculateTrend(apiMonitor, 'totalRequests', 3600000)
      }
    };

    // Top Routes by Volume and Error Rate
    const routeAnalytics = Object.entries(apiMetrics.routes)
      .map(([route, stats]) => ({
        route,
        ...stats,
        errorPercentage: (stats.errorRate * 100).toFixed(1)
      }))
      .sort((a, b) => b.totalRequests - a.totalRequests)
      .slice(0, 10);

    const dashboardData = {
      timestamp: new Date().toISOString(),
      status: overallStatus,
      
      // System Overview
      system: {
        ...systemMetrics,
        uptime: formatUptime(systemMetrics.uptime),
        memoryUsageFormatted: formatBytes(systemMetrics.memoryUsage.heapUsed),
        memoryTotal: formatBytes(systemMetrics.memoryUsage.heapTotal),
        memoryUtilization: ((systemMetrics.memoryUsage.heapUsed / systemMetrics.memoryUsage.heapTotal) * 100).toFixed(1)
      },
      
      // API Health
      api: {
        status: apiHealth.status,
        details: apiHealth.details,
        metrics: {
          totalRequests: apiMetrics.totalRequests,
          errorRate: (apiMetrics.errorRate * 100).toFixed(2),
          avgResponseTime: Math.round(apiMetrics.avgResponseTime),
          activeConnections: apiMetrics.activeConnections,
          p95ResponseTime: Math.round(calculateP95(apiMetrics.routes))
        },
        alerts: {
          total: activeAlerts.length,
          critical: activeAlerts.filter(a => a.severity === 'critical').length,
          high: activeAlerts.filter(a => a.severity === 'high').length,
          medium: activeAlerts.filter(a => a.severity === 'medium').length,
          recent: activeAlerts.slice(0, 5).map(alert => ({
            id: alert.id,
            type: alert.type,
            severity: alert.severity,
            message: alert.message,
            timestamp: alert.timestamp,
            age: formatAge(Date.now() - alert.timestamp)
          }))
        }
      },
      
      // Database Health
      database: {
        status: dbHealth.status,
        connectionCount: dbHealth.connections?.active || 0,
        idleConnections: dbHealth.connections?.idle || 0,
        slowQueries: dbStats.slowQueries?.length || 0,
        avgQueryTime: dbStats.averageQueryTime || 0,
        totalQueries: dbStats.totalQueries || 0,
        recentErrors: dbStats.recentErrors?.slice(0, 5) || []
      },
      
      // LLM Service Health
      llm: {
        providers: llmHealth.providers,
        cache: {
          hitRate: ((llmHealth.cacheStats.hits / (llmHealth.cacheStats.hits + llmHealth.cacheStats.misses)) * 100).toFixed(1),
          totalEntries: llmHealth.cacheStats.totalEntries,
          size: formatBytes(llmHealth.cacheStats.memoryUsage)
        },
        requests: {
          total: llmHealth.requestStats.total,
          successful: llmHealth.requestStats.successful,
          failed: llmHealth.requestStats.failed,
          avgResponseTime: llmHealth.requestStats.avgResponseTime
        }
      },
      
      // Performance Trends
      trends: performanceTrends,
      
      // Route Analytics
      routes: routeAnalytics,
      
      // Resource Usage
      resources: {
        memory: {
          heapUsed: formatBytes(systemMetrics.memoryUsage.heapUsed),
          heapTotal: formatBytes(systemMetrics.memoryUsage.heapTotal),
          external: formatBytes(systemMetrics.memoryUsage.external),
          buffers: formatBytes(systemMetrics.memoryUsage.arrayBuffers)
        },
        cpu: {
          user: (systemMetrics.cpuUsage.user / 1000).toFixed(2),
          system: (systemMetrics.cpuUsage.system / 1000).toFixed(2)
        }
      }
    };

    return NextResponse.json(dashboardData);

  } catch (error) {
    console.error('Health dashboard error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate health dashboard', 
        timestamp: new Date().toISOString(),
        status: 'error'
      },
      { status: 500 }
    );
  }
}

// Helper Functions
function determineOverallStatus(healthChecks: {
  api: string;
  database: string;
  alerts: number;
}): 'healthy' | 'degraded' | 'unhealthy' {
  if (healthChecks.api === 'unhealthy' || healthChecks.database === 'unhealthy') {
    return 'unhealthy';
  }
  
  if (healthChecks.api === 'degraded' || healthChecks.database === 'degraded' || healthChecks.alerts > 5) {
    return 'degraded';
  }
  
  return 'healthy';
}

function calculateTrend(monitor: any, metric: string, timeWindow: number): 'up' | 'down' | 'stable' {
  // Simplified trend calculation - in production you'd want more sophisticated analysis
  const current = monitor.getMetrics(300000); // Last 5 minutes
  const previous = monitor.getMetrics(600000); // Last 10 minutes
  
  const currentValue = current[metric] || 0;
  const previousValue = previous[metric] || 0;
  
  const change = ((currentValue - previousValue) / Math.max(previousValue, 1)) * 100;
  
  if (Math.abs(change) < 5) return 'stable';
  return change > 0 ? 'up' : 'down';
}

function calculateP95(routes: Record<string, any>): number {
  const allP95s = Object.values(routes).map((route: any) => route.p95ResponseTime || 0);
  if (allP95s.length === 0) return 0;
  
  return allP95s.reduce((sum, p95) => sum + p95, 0) / allP95s.length;
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatBytes(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0B';
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)}${sizes[i]}`;
}

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export { GET };