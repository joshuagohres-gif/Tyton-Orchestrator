import { NextRequest, NextResponse } from 'next/server';
import { getAPIMonitor } from '@/server/monitoring/metrics';
import { getDatabaseMonitor } from '@/server/db/monitoring';
import { getCachedLlmService } from '@/server/llm/cachedService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const healthChecks = {
      api: 'unknown',
      database: 'unknown',
      llm: 'unknown',
      cache: 'unknown',
      overall: 'unknown' as 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
    };

    const details: Record<string, any> = {};
    
    // API Health Check
    try {
      const apiMonitor = getAPIMonitor();
      const apiHealth = apiMonitor.getHealthStatus();
      healthChecks.api = apiHealth.status;
      details.api = {
        status: apiHealth.status,
        uptime: apiHealth.details.uptime,
        totalRequests: apiHealth.details.totalRequests,
        errorRate: `${(apiHealth.details.errorRate * 100).toFixed(2)}%`,
        avgResponseTime: `${apiHealth.details.avgResponseTime}ms`,
        activeAlerts: apiHealth.details.activeAlerts
      };
    } catch (error) {
      healthChecks.api = 'unhealthy';
      details.api = { error: 'API monitoring unavailable' };
    }

    // Database Health Check
    try {
      const dbMonitor = getDatabaseMonitor();
      const dbHealth = await Promise.race([
        dbMonitor.getDatabaseHealth(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database health check timeout')), 5000)
        )
      ]);
      
      healthChecks.database = (dbHealth as any).status;
      details.database = {
        status: (dbHealth as any).status,
        latency: (dbHealth as any).latency,
        connections: (dbHealth as any).connections,
        lastCheck: new Date((dbHealth as any).lastCheck).toISOString()
      };
    } catch (error) {
      healthChecks.database = 'unhealthy';
      details.database = { 
        error: 'Database health check failed',
        message: (error as Error).message 
      };
    }

    // LLM Service Health Check
    try {
      const llmService = getCachedLlmService();
      const llmHealth = await Promise.race([
        llmService.healthCheck(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('LLM health check timeout')), 3000)
        )
      ]);
      
      healthChecks.llm = (llmHealth as any).status || 'healthy';
      details.llm = {
        status: (llmHealth as any).status || 'healthy',
        providers: (llmHealth as any).providers || {},
        cacheHitRate: (llmHealth as any).cacheHitRate || 'N/A'
      };
    } catch (error) {
      healthChecks.llm = 'degraded';
      details.llm = { 
        error: 'LLM service check failed',
        message: (error as Error).message 
      };
    }

    // Cache Health Check (Redis/Memory)
    try {
      // Simple cache connectivity test
      const cacheTest = await Promise.race([
        testCacheConnection(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Cache check timeout')), 2000)
        )
      ]);
      
      healthChecks.cache = (cacheTest as any) ? 'healthy' : 'degraded';
      details.cache = {
        status: (cacheTest as any) ? 'healthy' : 'degraded',
        type: 'redis'
      };
    } catch (error) {
      healthChecks.cache = 'degraded';
      details.cache = { 
        error: 'Cache connectivity failed',
        fallback: 'memory'
      };
    }

    // Determine Overall Health
    const criticalServices = ['api', 'database'];
    const hasCriticalFailures = criticalServices.some(service => 
      healthChecks[service as keyof typeof healthChecks] === 'unhealthy'
    );
    
    const hasDegradedServices = Object.values(healthChecks).some(status => 
      status === 'degraded'
    );

    if (hasCriticalFailures) {
      healthChecks.overall = 'unhealthy';
    } else if (hasDegradedServices) {
      healthChecks.overall = 'degraded';
    } else {
      healthChecks.overall = 'healthy';
    }

    const responseTime = Date.now() - startTime;
    const httpStatus = healthChecks.overall === 'unhealthy' ? 503 : 200;

    const response = {
      status: healthChecks.overall,
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: healthChecks,
      details,
      system: {
        uptime: `${Math.floor(process.uptime())}s`,
        memory: {
          used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
          total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
        },
        node: process.version,
        platform: process.platform
      }
    };

    return NextResponse.json(response, { status: httpStatus });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      error: 'Health check system failure',
      message: (error as Error).message,
      system: {
        uptime: `${Math.floor(process.uptime())}s`,
        memory: {
          used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
        }
      }
    }, { status: 503 });
  }
}

// Helper function to test cache connection
async function testCacheConnection(): Promise<boolean> {
  try {
    // This would test your actual cache implementation
    // For now, return true as a placeholder
    return true;
  } catch {
    return false;
  }
}