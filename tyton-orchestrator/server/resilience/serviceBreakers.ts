import { getCircuitBreakerRegistry, CircuitBreakerOptions } from './circuitBreaker';
import pino from 'pino';

const logger = pino().child({ service: 'service-breakers' });

// Default configurations for different service types
const DEFAULT_CONFIGS = {
  llm: {
    failureThreshold: 5,        // 5 failures to open
    successThreshold: 3,        // 3 successes to close from half-open
    timeout: 30000,             // 30 seconds before retry
    resetTimeout: 60000,        // 1 minute to reset failure count
    monitoringPeriod: 60000,    // 1 minute window
    volumeThreshold: 3,         // Minimum 3 calls before opening
    errorFilter: (error: any) => {
      // Only count certain errors as circuit breaker failures
      if (error.status === 429) return true;  // Rate limiting
      if (error.status === 500) return true;  // Server errors
      if (error.status === 502) return true;  // Bad gateway
      if (error.status === 503) return true;  // Service unavailable
      if (error.status === 504) return true;  // Gateway timeout
      if (error.code === 'ECONNREFUSED') return true;  // Connection refused
      if (error.code === 'ENOTFOUND') return true;     // DNS resolution failed
      if (error.code === 'ETIMEDOUT') return true;     // Request timeout
      return false; // Don't trip circuit for 4xx client errors (except 429)
    }
  },
  database: {
    failureThreshold: 3,        // 3 failures to open (databases should be more sensitive)
    successThreshold: 2,        // 2 successes to close
    timeout: 10000,             // 10 seconds before retry
    resetTimeout: 30000,        // 30 seconds to reset failure count
    monitoringPeriod: 30000,    // 30 second window
    volumeThreshold: 2,         // Minimum 2 calls
    errorFilter: (error: any) => {
      // Database connection issues
      if (error.code === 'ECONNREFUSED') return true;
      if (error.code === 'ECONNRESET') return true;
      if (error.code === 'ETIMEDOUT') return true;
      if (error.message?.includes('connect ECONNREFUSED')) return true;
      if (error.message?.includes('Connection terminated')) return true;
      return false;
    }
  },
  redis: {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 5000,              // 5 seconds (cache should recover quickly)
    resetTimeout: 15000,        // 15 seconds
    monitoringPeriod: 30000,
    volumeThreshold: 2,
    errorFilter: (error: any) => {
      if (error.code === 'ECONNREFUSED') return true;
      if (error.code === 'ECONNRESET') return true;
      if (error.code === 'ETIMEDOUT') return true;
      return false;
    }
  },
  external_api: {
    failureThreshold: 4,
    successThreshold: 2,
    timeout: 20000,             // 20 seconds
    resetTimeout: 45000,        // 45 seconds
    monitoringPeriod: 45000,
    volumeThreshold: 3,
    errorFilter: (error: any) => {
      if (error.status >= 500) return true;  // Server errors
      if (error.status === 429) return true; // Rate limiting
      if (error.code === 'ECONNREFUSED') return true;
      if (error.code === 'ENOTFOUND') return true;
      if (error.code === 'ETIMEDOUT') return true;
      return false;
    }
  }
};

class ServiceCircuitBreakers {
  private registry = getCircuitBreakerRegistry();
  private initialized = false;

  initialize() {
    if (this.initialized) {
      logger.warn('Circuit breakers already initialized');
      return;
    }

    this.setupLLMBreakers();
    this.setupDatabaseBreakers();
    this.setupCacheBreakers();
    this.setupExternalAPIBreakers();
    this.setupEventLogging();

    this.initialized = true;
    logger.info('🛡️ Circuit breakers initialized for all services');
  }

  private setupLLMBreakers() {
    // OpenAI circuit breaker
    this.registry.register({
      name: 'openai-completions',
      ...DEFAULT_CONFIGS.llm,
      timeout: 45000, // OpenAI can be slower
    });

    // Anthropic circuit breaker
    this.registry.register({
      name: 'anthropic-completions',
      ...DEFAULT_CONFIGS.llm,
      timeout: 60000, // Anthropic can be slower for large requests
    });

    // Generic LLM router circuit breaker
    this.registry.register({
      name: 'llm-router',
      ...DEFAULT_CONFIGS.llm,
      failureThreshold: 3, // More sensitive since it's the main interface
    });

    logger.info('🤖 LLM circuit breakers configured');
  }

  private setupDatabaseBreakers() {
    // Main database (PostgreSQL via Prisma)
    this.registry.register({
      name: 'database-main',
      ...DEFAULT_CONFIGS.database,
    });

    // Database bulk operations
    this.registry.register({
      name: 'database-bulk',
      ...DEFAULT_CONFIGS.database,
      timeout: 15000, // Bulk operations may take longer
      failureThreshold: 2, // More sensitive for bulk operations
    });

    logger.info('🗄️ Database circuit breakers configured');
  }

  private setupCacheBreakers() {
    // Redis cache
    this.registry.register({
      name: 'redis-cache',
      ...DEFAULT_CONFIGS.redis,
    });

    // LLM response cache
    this.registry.register({
      name: 'cache-llm',
      ...DEFAULT_CONFIGS.redis,
      timeout: 3000, // Cache should be very fast
    });

    // Component sourcing cache
    this.registry.register({
      name: 'cache-sourcing',
      ...DEFAULT_CONFIGS.redis,
      timeout: 3000,
    });

    logger.info('💾 Cache circuit breakers configured');
  }

  private setupExternalAPIBreakers() {
    // Component supplier APIs (if any)
    this.registry.register({
      name: 'component-suppliers',
      ...DEFAULT_CONFIGS.external_api,
    });

    // EDA tool integrations
    this.registry.register({
      name: 'eda-tools',
      ...DEFAULT_CONFIGS.external_api,
      timeout: 30000, // EDA tools can be slow
    });

    logger.info('🔌 External API circuit breakers configured');
  }

  private setupEventLogging() {
    // Log circuit breaker events
    this.registry.on('stateChange', (event) => {
      logger.info({
        circuitName: event.circuitName,
        oldState: event.oldState,
        newState: event.newState
      }, `Circuit breaker state changed: ${event.oldState} → ${event.newState}`);

      // Emit critical alerts for circuit opening
      if (event.newState === 'open') {
        logger.error({
          circuitName: event.circuitName,
          timestamp: event.timestamp
        }, `🚨 CRITICAL: Circuit breaker '${event.circuitName}' is now OPEN`);
      }
    });

    this.registry.on('failure', (event) => {
      logger.warn({
        circuitName: event.circuitName,
        state: event.state,
        failureCount: event.failureCount,
        error: event.error?.message || 'Unknown error'
      }, `Circuit breaker failure recorded`);
    });

    this.registry.on('success', (event) => {
      logger.debug({
        circuitName: event.circuitName,
        state: event.state,
        duration: event.duration
      }, `Circuit breaker success recorded`);
    });

    logger.info('📊 Circuit breaker event logging configured');
  }

  // Convenience methods for common operations
  async executeLLMOperation<T>(provider: 'openai' | 'anthropic' | 'router', operation: () => Promise<T>): Promise<T> {
    const circuitName = provider === 'router' ? 'llm-router' : `${provider}-completions`;
    return this.registry.executeWithCircuit(circuitName, operation);
  }

  async executeDatabaseOperation<T>(operation: () => Promise<T>, bulk = false): Promise<T> {
    const circuitName = bulk ? 'database-bulk' : 'database-main';
    return this.registry.executeWithCircuit(circuitName, operation);
  }

  async executeCacheOperation<T>(type: 'redis' | 'llm' | 'sourcing', operation: () => Promise<T>): Promise<T> {
    const circuitName = type === 'redis' ? 'redis-cache' : `cache-${type}`;
    return this.registry.executeWithCircuit(circuitName, operation);
  }

  async executeExternalAPI<T>(service: 'suppliers' | 'eda-tools', operation: () => Promise<T>): Promise<T> {
    const circuitName = service === 'suppliers' ? 'component-suppliers' : 'eda-tools';
    return this.registry.executeWithCircuit(circuitName, operation);
  }

  // Health check and monitoring
  getHealthStatus() {
    const stats = this.registry.getAllStats();
    const openCircuits = stats.filter(s => s.state === 'open');
    const halfOpenCircuits = stats.filter(s => s.state === 'half-open');
    
    return {
      timestamp: Date.now(),
      overallStatus: openCircuits.length === 0 ? 'healthy' : 'degraded',
      totalCircuits: stats.length,
      openCircuits: openCircuits.length,
      halfOpenCircuits: halfOpenCircuits.length,
      closedCircuits: stats.filter(s => s.state === 'closed').length,
      criticalServices: openCircuits.filter(c => 
        c.name.includes('database') || c.name.includes('llm-router')
      ).map(c => c.name),
      circuits: stats.map(s => ({
        name: s.name,
        state: s.state,
        successRate: Math.round(s.successRate * 100),
        errorRate: Math.round(s.errorRate * 100),
        totalCalls: s.totalCalls,
        totalFailures: s.totalFailures,
        lastFailure: s.lastFailureTime ? new Date(s.lastFailureTime).toISOString() : null,
        nextRetry: s.nextRetryAt ? new Date(s.nextRetryAt).toISOString() : null
      }))
    };
  }

  // Manual circuit control (for admin/debugging)
  forceOpenCircuit(circuitName: string) {
    const breaker = this.registry.get(circuitName);
    if (!breaker) {
      throw new Error(`Circuit breaker '${circuitName}' not found`);
    }
    breaker.forceOpen();
    logger.warn({ circuitName }, 'Circuit breaker manually opened');
  }

  forceCloseCircuit(circuitName: string) {
    const breaker = this.registry.get(circuitName);
    if (!breaker) {
      throw new Error(`Circuit breaker '${circuitName}' not found`);
    }
    breaker.forceClose();
    logger.info({ circuitName }, 'Circuit breaker manually closed');
  }

  resetCircuitStats(circuitName: string) {
    const breaker = this.registry.get(circuitName);
    if (!breaker) {
      throw new Error(`Circuit breaker '${circuitName}' not found`);
    }
    breaker.forceClear();
    logger.info({ circuitName }, 'Circuit breaker stats manually reset');
  }
}

// Singleton instance
let serviceBreakers: ServiceCircuitBreakers | null = null;

export function getServiceCircuitBreakers(): ServiceCircuitBreakers {
  if (!serviceBreakers) {
    serviceBreakers = new ServiceCircuitBreakers();
    serviceBreakers.initialize();
  }
  return serviceBreakers;
}

export default ServiceCircuitBreakers;