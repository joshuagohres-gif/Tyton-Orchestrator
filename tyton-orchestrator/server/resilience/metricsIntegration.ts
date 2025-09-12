import { getCircuitBreakerRegistry } from './circuitBreaker';
import { getMetrics, MetricNames } from '../monitoring/metrics';
import pino from 'pino';

const logger = pino().child({ service: 'circuit-metrics' });

/**
 * Integrate circuit breakers with metrics collection
 */
export function integrateCircuitBreakerMetrics() {
  const registry = getCircuitBreakerRegistry();
  const metrics = getMetrics();
  
  // Listen to all circuit breaker events
  registry.on('breaker:created', (name: string) => {
    logger.info({ breakerName: name }, 'Circuit breaker created');
    
    const breaker = registry.getBreaker(name);
    if (!breaker) return;
    
    // Track state changes
    breaker.on('stateChange', (oldState: string, newState: string) => {
      logger.info({ 
        breakerName: name, 
        oldState, 
        newState 
      }, 'Circuit breaker state changed');
      
      // Update state gauge (0 = closed, 0.5 = half-open, 1 = open)
      let stateValue = 0;
      if (newState === 'half-open') stateValue = 0.5;
      else if (newState === 'open') stateValue = 1;
      
      metrics.gauge(MetricNames.CIRCUIT_BREAKER_STATE, stateValue, {
        breaker: name,
        state: newState
      });
      
      // Track state change events
      metrics.increment('circuit_breaker_state_changes_total', 1, {
        breaker: name,
        from: oldState,
        to: newState
      });
    });
    
    // Track failures
    breaker.on('failure', (error: any) => {
      metrics.increment(MetricNames.CIRCUIT_BREAKER_FAILURES, 1, {
        breaker: name,
        errorType: error?.name || 'unknown'
      });
    });
    
    // Track successes
    breaker.on('success', () => {
      metrics.increment(MetricNames.CIRCUIT_BREAKER_SUCCESSES, 1, {
        breaker: name
      });
    });
    
    // Track rejections (when circuit is open)
    breaker.on('rejected', () => {
      metrics.increment(MetricNames.CIRCUIT_BREAKER_REJECTIONS, 1, {
        breaker: name
      });
    });
    
    // Track half-open test results
    breaker.on('halfOpenTest', (success: boolean) => {
      metrics.increment('circuit_breaker_half_open_tests_total', 1, {
        breaker: name,
        result: success ? 'success' : 'failure'
      });
    });
  });
  
  // Periodically collect stats from all breakers
  const collectBreakerStats = () => {
    const breakers = registry.getAllBreakers();
    
    for (const [name, breaker] of breakers) {
      const stats = breaker.getStats();
      
      // Update gauges with current stats
      metrics.gauge('circuit_breaker_failure_count', stats.failureCount, {
        breaker: name
      });
      
      metrics.gauge('circuit_breaker_success_count', stats.successCount, {
        breaker: name
      });
      
      metrics.gauge('circuit_breaker_success_rate', stats.successRate, {
        breaker: name
      });
      
      metrics.gauge('circuit_breaker_error_rate', stats.errorRate, {
        breaker: name
      });
      
      // Track call volume
      metrics.gauge('circuit_breaker_calls_total', stats.totalCalls, {
        breaker: name
      });
    }
  };
  
  // Collect stats every 10 seconds
  const interval = setInterval(collectBreakerStats, 10000);
  
  // Initial collection
  collectBreakerStats();
  
  logger.info('Circuit breaker metrics integration initialized');
  
  // Return cleanup function
  return () => {
    clearInterval(interval);
  };
}

/**
 * Track circuit breaker operation with timing
 */
export async function trackCircuitBreakerOperation<T>(
  breakerName: string,
  operation: () => Promise<T>
): Promise<T> {
  const metrics = getMetrics();
  const stopTimer = metrics.startTimer('circuit_breaker_operation_duration', {
    breaker: breakerName
  });
  
  try {
    const result = await operation();
    stopTimer();
    return result;
  } catch (error) {
    stopTimer();
    throw error;
  }
}

/**
 * Get circuit breaker health metrics
 */
export function getCircuitBreakerHealthMetrics() {
  const registry = getCircuitBreakerRegistry();
  const breakers = registry.getAllBreakers();
  const healthMetrics: Record<string, any> = {};
  
  for (const [name, breaker] of breakers) {
    const stats = breaker.getStats();
    const state = breaker.getState();
    
    healthMetrics[name] = {
      state,
      healthy: state !== 'open',
      successRate: stats.successRate,
      errorRate: stats.errorRate,
      totalCalls: stats.totalCalls,
      failureCount: stats.failureCount,
      lastFailure: stats.lastFailureTime,
      uptime: stats.uptime
    };
  }
  
  return healthMetrics;
}

export default {
  integrateCircuitBreakerMetrics,
  trackCircuitBreakerOperation,
  getCircuitBreakerHealthMetrics
};