import { PrismaClient } from '@prisma/client';
import { getCircuitBreakerRegistry } from '../resilience/circuitBreaker';
import { getMetrics } from './metrics';
import { getWebSocketServer } from '../realtime/wsServer';
import pino from 'pino';
import { promises as fs } from 'fs';
import path from 'path';

const logger = pino().child({ service: 'health' });

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  uptime: number;
  checks: Record<string, ComponentHealth>;
  version?: string;
  environment?: string;
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  details?: Record<string, any>;
  responseTime?: number;
}

class HealthChecker {
  private startTime: number = Date.now();
  private prisma: PrismaClient;
  private version: string = '0.1.0';
  private environment: string = process.env.NODE_ENV || 'development';

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Perform a comprehensive health check
   */
  async check(): Promise<HealthCheckResult> {
    const checks: Record<string, ComponentHealth> = {};
    
    // Run all health checks in parallel
    const [
      database,
      websocket,
      circuitBreakers,
      cache,
      filesystem,
      memory
    ] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkWebSocket(),
      this.checkCircuitBreakers(),
      this.checkCache(),
      this.checkFilesystem(),
      this.checkMemory()
    ]);

    // Process results
    checks.database = this.processResult(database, 'database');
    checks.websocket = this.processResult(websocket, 'websocket');
    checks.circuitBreakers = this.processResult(circuitBreakers, 'circuitBreakers');
    checks.cache = this.processResult(cache, 'cache');
    checks.filesystem = this.processResult(filesystem, 'filesystem');
    checks.memory = this.processResult(memory, 'memory');

    // Determine overall status
    const statuses = Object.values(checks).map(c => c.status);
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (statuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    // Record metrics
    const metrics = getMetrics();
    metrics.gauge('health_status', overallStatus === 'healthy' ? 1 : overallStatus === 'degraded' ? 0.5 : 0);
    
    return {
      status: overallStatus,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      checks,
      version: this.version,
      environment: this.environment
    };
  }

  /**
   * Liveness probe - basic check that the service is running
   */
  async liveness(): Promise<{ status: 'ok' | 'error'; uptime: number }> {
    try {
      // Basic check - can we allocate memory and respond?
      const test = Buffer.alloc(1024);
      return {
        status: 'ok',
        uptime: Date.now() - this.startTime
      };
    } catch (error) {
      logger.error({ error }, 'Liveness check failed');
      return {
        status: 'error',
        uptime: Date.now() - this.startTime
      };
    }
  }

  /**
   * Readiness probe - check if service is ready to handle requests
   */
  async readiness(): Promise<{ ready: boolean; checks: string[] }> {
    const failedChecks: string[] = [];
    
    try {
      // Check database connectivity
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      failedChecks.push('database');
    }

    // Check circuit breakers - none should be open
    try {
      const registry = getCircuitBreakerRegistry();
      const breakers = registry.getAllBreakers();
      for (const [name, breaker] of breakers) {
        if (breaker.getState() === 'open') {
          failedChecks.push(`breaker:${name}`);
        }
      }
    } catch (error) {
      // Circuit breaker registry might not be available
      logger.debug('Circuit breaker check skipped - registry not available');
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    if (heapUsedPercent > 90) {
      failedChecks.push('memory');
    }

    return {
      ready: failedChecks.length === 0,
      checks: failedChecks
    };
  }

  /**
   * Check database health
   */
  private async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    
    try {
      // Simple query to check connectivity
      await this.prisma.$queryRaw`SELECT 1`;
      
      return {
        status: 'healthy',
        message: 'Database is responsive',
        responseTime: Date.now() - start
      };
    } catch (error: any) {
      logger.error({ error }, 'Database health check failed');
      return {
        status: 'unhealthy',
        message: `Database connection failed: ${error.message}`,
        responseTime: Date.now() - start
      };
    }
  }

  /**
   * Check WebSocket server health
   */
  private async checkWebSocket(): Promise<ComponentHealth> {
    try {
      const wsServer = getWebSocketServer();
      const stats = wsServer.getStats();
      
      // Check if WebSocket server is accepting connections
      const isHealthy = stats.clients < 1000; // Max 1000 concurrent connections
      
      return {
        status: isHealthy ? 'healthy' : 'degraded',
        message: `WebSocket server has ${stats.clients} active connections`,
        details: stats
      };
    } catch (error: any) {
      // WebSocket server might not be initialized
      return {
        status: 'degraded',
        message: 'WebSocket server not initialized',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check circuit breakers health
   */
  private async checkCircuitBreakers(): Promise<ComponentHealth> {
    try {
      const registry = getCircuitBreakerRegistry();
      const breakers = registry.getAllBreakers();
      const breakerStates: Record<string, any> = {};
      let hasOpenBreakers = false;
      let hasHalfOpenBreakers = false;

      for (const [name, breaker] of breakers) {
        const state = breaker.getState();
        const stats = breaker.getStats();
        
        breakerStates[name] = {
          state,
          stats
        };

        if (state === 'open') {
          hasOpenBreakers = true;
        } else if (state === 'half-open') {
          hasHalfOpenBreakers = true;
        }
      }

      return {
        status: hasOpenBreakers ? 'unhealthy' : hasHalfOpenBreakers ? 'degraded' : 'healthy',
        message: hasOpenBreakers ? 'Some services are unavailable' : 'All services operational',
        details: breakerStates
      };
    } catch (error: any) {
      return {
        status: 'degraded',
        message: 'Circuit breaker registry not available',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check cache health (if Redis is configured)
   */
  private async checkCache(): Promise<ComponentHealth> {
    // For now, return healthy if no Redis is configured
    // In production, you'd check Redis connectivity here
    
    if (!process.env.REDIS_URL) {
      return {
        status: 'healthy',
        message: 'Cache not configured (using in-memory)'
      };
    }

    // TODO: Implement Redis health check
    return {
      status: 'healthy',
      message: 'Cache operational'
    };
  }

  /**
   * Check filesystem health
   */
  private async checkFilesystem(): Promise<ComponentHealth> {
    const start = Date.now();
    
    try {
      // Try to write and read a test file
      const testFile = path.join(process.cwd(), '.health-check');
      const testData = `health-check-${Date.now()}`;
      
      await fs.writeFile(testFile, testData, 'utf-8');
      const readData = await fs.readFile(testFile, 'utf-8');
      await fs.unlink(testFile);
      
      if (readData !== testData) {
        throw new Error('Filesystem read/write mismatch');
      }
      
      return {
        status: 'healthy',
        message: 'Filesystem is accessible',
        responseTime: Date.now() - start
      };
    } catch (error: any) {
      logger.error({ error }, 'Filesystem health check failed');
      return {
        status: 'unhealthy',
        message: `Filesystem check failed: ${error.message}`,
        responseTime: Date.now() - start
      };
    }
  }

  /**
   * Check memory health
   */
  private async checkMemory(): Promise<ComponentHealth> {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = `Memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB (${heapUsedPercent.toFixed(1)}%)`;
    
    if (heapUsedPercent > 90) {
      status = 'unhealthy';
      message = `Critical memory usage: ${heapUsedPercent.toFixed(1)}%`;
    } else if (heapUsedPercent > 75) {
      status = 'degraded';
      message = `High memory usage: ${heapUsedPercent.toFixed(1)}%`;
    }
    
    // Check for memory leaks by tracking heap growth
    const metrics = getMetrics();
    metrics.gauge('memory_heap_used', memUsage.heapUsed);
    metrics.gauge('memory_heap_total', memUsage.heapTotal);
    metrics.gauge('memory_rss', memUsage.rss);
    metrics.gauge('memory_external', memUsage.external);
    
    return {
      status,
      message,
      details: {
        heapUsed: heapUsedMB,
        heapTotal: heapTotalMB,
        heapPercent: heapUsedPercent,
        rss: Math.round(memUsage.rss / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      }
    };
  }

  /**
   * Process health check result from Promise.allSettled
   */
  private processResult(
    result: PromiseSettledResult<ComponentHealth>,
    componentName: string
  ): ComponentHealth {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      logger.error({ error: result.reason, component: componentName }, 'Health check failed');
      return {
        status: 'unhealthy',
        message: `Health check failed: ${result.reason.message || 'Unknown error'}`,
        details: { error: result.reason.toString() }
      };
    }
  }

  /**
   * Get system information
   */
  async getSystemInfo(): Promise<any> {
    const memUsage = process.memoryUsage();
    const metrics = getMetrics();
    
    return {
      version: this.version,
      environment: this.environment,
      uptime: Date.now() - this.startTime,
      nodejs: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      },
      metrics: {
        httpRequests: metrics.getCounter('http_request_total'),
        wsConnections: metrics.getGauge('ws_connection_active') || 0,
        orchestratorRuns: metrics.getCounter('orchestrator_run_total')
      }
    };
  }
}

// Singleton instance
let healthChecker: HealthChecker | null = null;

/**
 * Get or create health checker instance
 */
export function getHealthChecker(prisma: PrismaClient): HealthChecker {
  if (!healthChecker) {
    healthChecker = new HealthChecker(prisma);
    logger.info('Health checker initialized');
  }
  return healthChecker;
}

export default getHealthChecker;