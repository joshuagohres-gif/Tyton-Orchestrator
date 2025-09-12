import { PrismaClient } from '@prisma/client';
import pino from 'pino';

const logger = pino().child({ service: 'database-pool' });

interface PoolConfig {
  connectionLimit: number;
  timeout: number;
  maxIdleTime: number;
  retryAttempts: number;
  retryDelay: number;
}

interface PoolMetrics {
  activeConnections: number;
  idleConnections: number;
  totalConnections: number;
  queuedRequests: number;
  connectionErrors: number;
  avgResponseTime: number;
  lastHealthCheck: Date;
}

class DatabasePool {
  private prisma: PrismaClient;
  private config: PoolConfig;
  private metrics: PoolMetrics = {
    activeConnections: 0,
    idleConnections: 0,
    totalConnections: 0,
    queuedRequests: 0,
    connectionErrors: 0,
    avgResponseTime: 0,
    lastHealthCheck: new Date()
  };
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private responseTimes: number[] = [];

  constructor(config: Partial<PoolConfig> = {}) {
    this.config = {
      connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '20'),
      timeout: parseInt(process.env.DB_POOL_TIMEOUT || '20000'),
      maxIdleTime: parseInt(process.env.DB_MAX_IDLE_TIME || '300000'), // 5 minutes
      retryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS || '3'),
      retryDelay: parseInt(process.env.DB_RETRY_DELAY || '1000'),
      ...config
    };

    this.initializePrisma();
    this.startHealthChecking();
    this.setupEventHandlers();

    logger.info({
      connectionLimit: this.config.connectionLimit,
      timeout: this.config.timeout,
      maxIdleTime: this.config.maxIdleTime
    }, '🏊 Database connection pool initialized');
  }

  private initializePrisma(): void {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Parse connection string to add pool parameters
    const url = new URL(databaseUrl);
    
    // Add PostgreSQL connection pool parameters
    url.searchParams.set('connection_limit', this.config.connectionLimit.toString());
    url.searchParams.set('pool_timeout', (this.config.timeout / 1000).toString());
    url.searchParams.set('pgbouncer', 'true'); // Enable connection pooling optimizations
    
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: url.toString()
        }
      },
      log: [
        {
          emit: 'event',
          level: 'query'
        },
        {
          emit: 'event', 
          level: 'error'
        },
        {
          emit: 'event',
          level: 'warn'
        }
      ],
    });

    // Log slow queries
    this.prisma.$on('query', (e) => {
      const duration = Date.now() - new Date(e.timestamp).getTime();
      this.recordResponseTime(duration);

      if (duration > 1000) { // Log queries slower than 1 second
        logger.warn({
          query: e.query,
          duration,
          params: e.params
        }, 'Slow database query detected');
      }
    });

    // Log database errors
    this.prisma.$on('error', (e) => {
      this.metrics.connectionErrors++;
      logger.error({ error: e }, 'Database error occurred');
    });
  }

  private setupEventHandlers(): void {
    // Graceful shutdown
    const shutdown = async () => {
      logger.info('🔌 Shutting down database pool...');
      await this.disconnect();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    process.on('beforeExit', shutdown);
  }

  private startHealthChecking(): void {
    // Health check every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 30000);

    // Initial health check
    setTimeout(() => this.performHealthCheck(), 1000);
  }

  private async performHealthCheck(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Simple health check query
      await this.prisma.$queryRaw`SELECT 1 as health_check`;
      
      const duration = Date.now() - startTime;
      this.recordResponseTime(duration);
      this.metrics.lastHealthCheck = new Date();

      logger.debug({ duration }, '💓 Database health check passed');
      
    } catch (error: any) {
      this.metrics.connectionErrors++;
      logger.error({ error: error.message }, '❤️‍🩹 Database health check failed');
    }
  }

  private recordResponseTime(duration: number): void {
    this.responseTimes.push(duration);
    
    // Keep only last 100 response times for moving average
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }
    
    this.metrics.avgResponseTime = this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
  }

  /**
   * Execute a database operation with connection pool management
   */
  async execute<T>(operation: (prisma: PrismaClient) => Promise<T>): Promise<T> {
    const startTime = Date.now();
    
    try {
      this.metrics.queuedRequests++;
      this.metrics.activeConnections++;
      
      const result = await operation(this.prisma);
      
      return result;
      
    } catch (error: any) {
      this.metrics.connectionErrors++;
      
      // Log specific database errors
      if (error.code === 'P2002') {
        logger.warn({ error: error.meta }, 'Database constraint violation');
      } else if (error.code === 'P2025') {
        logger.warn({ error: error.meta }, 'Record not found');
      } else {
        logger.error({ 
          error: error.message,
          code: error.code,
          meta: error.meta 
        }, 'Database operation failed');
      }
      
      throw error;
      
    } finally {
      this.metrics.queuedRequests--;
      this.metrics.activeConnections--;
      
      const duration = Date.now() - startTime;
      this.recordResponseTime(duration);
    }
  }

  /**
   * Execute a transaction with proper pool management
   */
  async transaction<T>(
    operations: (prisma: PrismaClient) => Promise<T>
  ): Promise<T> {
    return this.execute(async (prisma) => {
      return await prisma.$transaction(async (tx) => {
        return await operations(tx);
      }, {
        maxWait: this.config.timeout,
        timeout: this.config.timeout * 2, // Transactions get more time
      });
    });
  }

  /**
   * Get the underlying Prisma client (use with caution)
   */
  getClient(): PrismaClient {
    return this.prisma;
  }

  /**
   * Get current pool metrics
   */
  getMetrics(): PoolMetrics {
    return { ...this.metrics };
  }

  /**
   * Get detailed pool statistics
   */
  async getDetailedStats(): Promise<{
    metrics: PoolMetrics;
    config: PoolConfig;
    databaseInfo: any;
  }> {
    try {
      // Get database-specific metrics
      const dbStats = await this.prisma.$queryRaw<any[]>`
        SELECT 
          schemaname,
          tablename,
          attname,
          n_distinct,
          avg_width
        FROM pg_stats 
        WHERE schemaname = 'public' 
        LIMIT 10
      `;

      // Get connection info
      const connectionInfo = await this.prisma.$queryRaw<any[]>`
        SELECT 
          count(*) as total_connections,
          count(*) FILTER (WHERE state = 'active') as active_connections,
          count(*) FILTER (WHERE state = 'idle') as idle_connections
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `;

      return {
        metrics: this.getMetrics(),
        config: this.config,
        databaseInfo: {
          tableStats: dbStats,
          connectionInfo: connectionInfo[0] || {}
        }
      };

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get detailed database stats');
      return {
        metrics: this.getMetrics(),
        config: this.config,
        databaseInfo: {}
      };
    }
  }

  /**
   * Test database connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.prisma.$connect();
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Database connection test failed');
      return false;
    }
  }

  /**
   * Gracefully disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    try {
      await this.prisma.$disconnect();
      logger.info('🔌 Database pool disconnected');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error during database disconnect');
    }
  }

  /**
   * Reset pool metrics (useful for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      activeConnections: 0,
      idleConnections: 0,
      totalConnections: 0,
      queuedRequests: 0,
      connectionErrors: 0,
      avgResponseTime: 0,
      lastHealthCheck: new Date()
    };
    this.responseTimes = [];
  }
}

// Singleton instance
let databasePool: DatabasePool | null = null;

export function getDatabasePool(): DatabasePool {
  if (!databasePool) {
    databasePool = new DatabasePool();
  }
  return databasePool;
}

// For testing
export function createDatabasePool(config?: Partial<PoolConfig>): DatabasePool {
  return new DatabasePool(config);
}

export { DatabasePool, PoolConfig, PoolMetrics };