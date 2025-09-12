import { getMetrics, MetricNames } from './metrics';
import { OrchestratorRun, OrchestratorStage } from '@prisma/client';
import pino from 'pino';

const logger = pino().child({ service: 'orchestrator-metrics' });

/**
 * Track orchestrator run metrics
 */
export function trackOrchestratorRun(run: OrchestratorRun, duration: number) {
  const metrics = getMetrics();
  
  // Increment run counter
  metrics.increment(MetricNames.ORCHESTRATOR_RUN_TOTAL, 1, {
    status: run.status,
    projectId: run.projectId
  });
  
  // Track duration
  metrics.histogram(MetricNames.ORCHESTRATOR_RUN_DURATION, duration, {
    status: run.status,
    projectId: run.projectId
  });
  
  // Track active runs gauge
  if (run.status === 'running') {
    const current = metrics.getGauge('orchestrator_runs_active') || 0;
    metrics.gauge('orchestrator_runs_active', current + 1);
  } else if (run.status === 'completed' || run.status === 'failed') {
    const current = metrics.getGauge('orchestrator_runs_active') || 0;
    metrics.gauge('orchestrator_runs_active', Math.max(0, current - 1));
  }
  
  logger.debug({
    runId: run.id,
    status: run.status,
    duration
  }, 'Orchestrator run metrics tracked');
}

/**
 * Track orchestrator stage metrics
 */
export function trackOrchestratorStage(
  stage: OrchestratorStage, 
  duration: number,
  error?: Error
) {
  const metrics = getMetrics();
  
  // Track stage duration
  metrics.histogram(MetricNames.ORCHESTRATOR_STAGE_DURATION, duration, {
    stageId: stage.stageId,
    status: stage.status,
    attempts: stage.attempts.toString()
  });
  
  // Track errors
  if (error || stage.status === 'failed') {
    metrics.increment(MetricNames.ORCHESTRATOR_STAGE_ERRORS, 1, {
      stageId: stage.stageId,
      errorType: error?.name || 'unknown'
    });
  }
  
  // Track retries
  if (stage.attempts > 1) {
    metrics.increment('orchestrator_stage_retries_total', 1, {
      stageId: stage.stageId,
      attempt: stage.attempts.toString()
    });
  }
  
  logger.debug({
    stageId: stage.stageId,
    status: stage.status,
    duration,
    attempts: stage.attempts
  }, 'Orchestrator stage metrics tracked');
}

/**
 * Track LLM request metrics
 */
export function trackLLMRequest(
  provider: string,
  model: string,
  duration: number,
  tokens?: { input: number; output: number },
  error?: Error
) {
  const metrics = getMetrics();
  
  // Track request count
  metrics.increment(MetricNames.LLM_REQUEST_TOTAL, 1, {
    provider,
    model,
    status: error ? 'error' : 'success'
  });
  
  // Track duration
  metrics.histogram(MetricNames.LLM_REQUEST_DURATION, duration, {
    provider,
    model
  });
  
  // Track token usage
  if (tokens) {
    metrics.increment(MetricNames.LLM_TOKEN_USAGE, tokens.input, {
      provider,
      model,
      type: 'input'
    });
    
    metrics.increment(MetricNames.LLM_TOKEN_USAGE, tokens.output, {
      provider,
      model,
      type: 'output'
    });
  }
  
  // Track errors
  if (error) {
    metrics.increment(MetricNames.LLM_ERROR_TOTAL, 1, {
      provider,
      model,
      errorType: error.name || 'unknown'
    });
  }
  
  logger.debug({
    provider,
    model,
    duration,
    tokens,
    error: error?.message
  }, 'LLM request metrics tracked');
}

/**
 * Track cache operations
 */
export function trackCacheOperation(
  operation: 'hit' | 'miss' | 'set' | 'delete',
  cacheType: string,
  key?: string
) {
  const metrics = getMetrics();
  
  switch (operation) {
    case 'hit':
      metrics.increment(MetricNames.CACHE_HIT_TOTAL, 1, { type: cacheType });
      break;
    case 'miss':
      metrics.increment(MetricNames.CACHE_MISS_TOTAL, 1, { type: cacheType });
      break;
    case 'set':
      metrics.increment(MetricNames.CACHE_SET_TOTAL, 1, { type: cacheType });
      break;
    case 'delete':
      metrics.increment(MetricNames.CACHE_DELETE_TOTAL, 1, { type: cacheType });
      break;
  }
}

/**
 * Track database query metrics
 */
export function trackDatabaseQuery(
  operation: string,
  table: string,
  duration: number,
  error?: Error
) {
  const metrics = getMetrics();
  
  // Track query count
  metrics.increment(MetricNames.DB_QUERY_TOTAL, 1, {
    operation,
    table,
    status: error ? 'error' : 'success'
  });
  
  // Track duration
  metrics.histogram(MetricNames.DB_QUERY_DURATION, duration, {
    operation,
    table
  });
  
  if (error) {
    logger.warn({
      operation,
      table,
      duration,
      error: error.message
    }, 'Database query failed');
  }
}

/**
 * Start tracking system metrics (CPU, memory, etc.)
 */
export function startSystemMetricsCollection(intervalMs: number = 10000) {
  const metrics = getMetrics();
  
  const collectSystemMetrics = () => {
    const memUsage = process.memoryUsage();
    
    // Memory metrics
    metrics.gauge(MetricNames.SYSTEM_MEMORY_USAGE, memUsage.rss);
    metrics.gauge(MetricNames.SYSTEM_HEAP_USAGE, memUsage.heapUsed);
    
    // CPU metrics (if available)
    if (process.cpuUsage) {
      const cpuUsage = process.cpuUsage();
      const totalCpu = cpuUsage.user + cpuUsage.system;
      metrics.gauge(MetricNames.SYSTEM_CPU_USAGE, totalCpu / 1000); // Convert to milliseconds
    }
    
    // Event loop lag (simple measurement)
    const start = Date.now();
    setImmediate(() => {
      const lag = Date.now() - start;
      metrics.gauge(MetricNames.SYSTEM_EVENT_LOOP_LAG, lag);
    });
  };
  
  // Collect immediately
  collectSystemMetrics();
  
  // Then collect at intervals
  const interval = setInterval(collectSystemMetrics, intervalMs);
  
  // Return cleanup function
  return () => clearInterval(interval);
}

/**
 * Create a middleware for tracking HTTP metrics
 */
export function createHttpMetricsMiddleware() {
  const metrics = getMetrics();
  
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    const method = req.method;
    const path = req.path || req.url;
    
    // Track request
    metrics.increment(MetricNames.HTTP_REQUEST_TOTAL, 1, {
      method,
      path
    });
    
    // Track request size
    if (req.headers['content-length']) {
      metrics.histogram(MetricNames.HTTP_REQUEST_SIZE, parseInt(req.headers['content-length']), {
        method,
        path
      });
    }
    
    // Hook into response finish
    const originalEnd = res.end;
    res.end = function(...args: any[]) {
      const duration = Date.now() - start;
      const status = res.statusCode.toString();
      
      // Track duration
      metrics.histogram(MetricNames.HTTP_REQUEST_DURATION, duration, {
        method,
        path,
        status
      });
      
      // Track response size
      if (res.getHeader('content-length')) {
        metrics.histogram(MetricNames.HTTP_RESPONSE_SIZE, parseInt(res.getHeader('content-length')), {
          method,
          path,
          status
        });
      }
      
      // Call original end
      originalEnd.apply(res, args);
    };
    
    next();
  };
}

export default {
  trackOrchestratorRun,
  trackOrchestratorStage,
  trackLLMRequest,
  trackCacheOperation,
  trackDatabaseQuery,
  startSystemMetricsCollection,
  createHttpMetricsMiddleware
};