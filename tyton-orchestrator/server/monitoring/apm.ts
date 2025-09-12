import { EventEmitter } from 'events';
import pino from 'pino';
import { getMetrics } from './metrics';
import { getErrorTracker } from './errorTracker';

const logger = pino().child({ service: 'apm' });

export interface Span {
  id: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Record<string, string>;
  logs: SpanLog[];
  status: 'ok' | 'error' | 'timeout';
  error?: Error;
}

export interface SpanLog {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  fields?: Record<string, any>;
}

export interface Trace {
  id: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  spans: Span[];
  rootSpan?: Span;
  tags: Record<string, string>;
  status: 'ok' | 'error' | 'timeout';
}

export interface PerformanceProfile {
  name: string;
  totalTime: number;
  selfTime: number;
  callCount: number;
  avgTime: number;
  maxTime: number;
  minTime: number;
  children: PerformanceProfile[];
}

export interface APMTransaction {
  id: string;
  traceId: string;
  name: string;
  type: 'http' | 'database' | 'llm' | 'orchestrator' | 'custom';
  startTime: number;
  endTime?: number;
  duration?: number;
  result: 'success' | 'error' | 'timeout';
  context: Record<string, any>;
  spans: Span[];
  errorCount: number;
}

class APMTracer extends EventEmitter {
  private traces: Map<string, Trace> = new Map();
  private spans: Map<string, Span> = new Map();
  private transactions: Map<string, APMTransaction> = new Map();
  private activeSpans: Map<string, Span> = new Map(); // Per async context
  private metrics = getMetrics();
  private errorTracker = getErrorTracker();
  private readonly maxTraces = 1000;
  private readonly maxSpansPerTrace = 100;
  
  constructor() {
    super();
    this.startPeriodicTasks();
  }

  /**
   * Start a new trace
   */
  startTrace(name: string, tags: Record<string, string> = {}): string {
    const traceId = this.generateId();
    const trace: Trace = {
      id: traceId,
      startTime: Date.now(),
      spans: [],
      tags: { ...tags, operation: name },
      status: 'ok'
    };
    
    this.traces.set(traceId, trace);
    this.emit('traceStarted', trace);
    
    return traceId;
  }

  /**
   * Finish a trace
   */
  finishTrace(traceId: string): void {
    const trace = this.traces.get(traceId);
    if (!trace) return;
    
    trace.endTime = Date.now();
    trace.duration = trace.endTime - trace.startTime;
    
    // Determine trace status from spans
    const hasErrors = trace.spans.some(span => span.status === 'error');
    const hasTimeouts = trace.spans.some(span => span.status === 'timeout');
    
    if (hasErrors) {
      trace.status = 'error';
    } else if (hasTimeouts) {
      trace.status = 'timeout';
    }
    
    // Find root span
    trace.rootSpan = trace.spans.find(span => !span.parentSpanId);
    
    this.emit('traceFinished', trace);
    
    // Record metrics
    this.metrics.timing('apm_trace_duration', trace.duration, {
      operation: trace.tags.operation,
      status: trace.status
    });
  }

  /**
   * Start a new span within a trace
   */
  startSpan(traceId: string, name: string, tags: Record<string, string> = {}, parentSpanId?: string): string {
    const trace = this.traces.get(traceId);
    if (!trace) {
      throw new Error(`Trace ${traceId} not found`);
    }
    
    const spanId = this.generateId();
    const span: Span = {
      id: spanId,
      traceId,
      parentSpanId,
      name,
      startTime: Date.now(),
      tags,
      logs: [],
      status: 'ok'
    };
    
    trace.spans.push(span);
    this.spans.set(spanId, span);
    this.activeSpans.set(this.getAsyncId(), span);
    
    this.emit('spanStarted', span);
    
    return spanId;
  }

  /**
   * Finish a span
   */
  finishSpan(spanId: string, error?: Error): void {
    const span = this.spans.get(spanId);
    if (!span) return;
    
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    
    if (error) {
      span.status = 'error';
      span.error = error;
      
      // Log to error tracker
      this.errorTracker.trackError(error, {
        service: 'apm',
        requestId: span.traceId
      }, {
        spanId: span.id,
        spanName: span.name,
        traceId: span.traceId
      });
    }
    
    this.emit('spanFinished', span);
    
    // Record metrics
    this.metrics.timing('apm_span_duration', span.duration, {
      operation: span.name,
      status: span.status
    });
    
    // Clean up active span
    this.activeSpans.delete(this.getAsyncId());
  }

  /**
   * Add a log entry to the current span
   */
  logToSpan(spanId: string, level: SpanLog['level'], message: string, fields?: Record<string, any>): void {
    const span = this.spans.get(spanId);
    if (!span) return;
    
    span.logs.push({
      timestamp: Date.now(),
      level,
      message,
      fields
    });
  }

  /**
   * Set a tag on a span
   */
  setSpanTag(spanId: string, key: string, value: string): void {
    const span = this.spans.get(spanId);
    if (span) {
      span.tags[key] = value;
    }
  }

  /**
   * Start a new transaction (high-level operation)
   */
  startTransaction(name: string, type: APMTransaction['type'], context: Record<string, any> = {}): string {
    const transactionId = this.generateId();
    const traceId = this.startTrace(name, { type });
    
    const transaction: APMTransaction = {
      id: transactionId,
      traceId,
      name,
      type,
      startTime: Date.now(),
      result: 'success',
      context,
      spans: [],
      errorCount: 0
    };
    
    this.transactions.set(transactionId, transaction);
    this.emit('transactionStarted', transaction);
    
    return transactionId;
  }

  /**
   * Finish a transaction
   */
  finishTransaction(transactionId: string, result: APMTransaction['result'] = 'success'): void {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) return;
    
    transaction.endTime = Date.now();
    transaction.duration = transaction.endTime - transaction.startTime;
    transaction.result = result;
    
    // Get associated spans
    const trace = this.traces.get(transaction.traceId);
    if (trace) {
      transaction.spans = trace.spans;
      transaction.errorCount = trace.spans.filter(s => s.status === 'error').length;
    }
    
    this.finishTrace(transaction.traceId);
    this.emit('transactionFinished', transaction);
    
    // Record metrics
    this.metrics.timing('apm_transaction_duration', transaction.duration, {
      name: transaction.name,
      type: transaction.type,
      result: transaction.result
    });
    
    this.metrics.increment('apm_transaction_total', 1, {
      name: transaction.name,
      type: transaction.type,
      result: transaction.result
    });
  }

  /**
   * Get current active span for the async context
   */
  getCurrentSpan(): Span | undefined {
    return this.activeSpans.get(this.getAsyncId());
  }

  /**
   * Wrap a function with automatic span tracking
   */
  wrapFunction<T extends (...args: any[]) => any>(
    name: string, 
    fn: T,
    tags: Record<string, string> = {}
  ): T {
    const tracer = this;
    
    return ((...args: any[]) => {
      const currentSpan = tracer.getCurrentSpan();
      const traceId = currentSpan?.traceId || tracer.startTrace(name);
      
      const spanId = tracer.startSpan(traceId, name, tags, currentSpan?.id);
      
      try {
        const result = fn(...args);
        
        // Handle promises
        if (result && typeof result.then === 'function') {
          return result
            .then((value: any) => {
              tracer.finishSpan(spanId);
              return value;
            })
            .catch((error: Error) => {
              tracer.finishSpan(spanId, error);
              throw error;
            });
        }
        
        tracer.finishSpan(spanId);
        return result;
      } catch (error) {
        tracer.finishSpan(spanId, error as Error);
        throw error;
      }
    }) as T;
  }

  /**
   * Create a performance profile from trace data
   */
  createPerformanceProfile(traceId: string): PerformanceProfile | null {
    const trace = this.traces.get(traceId);
    if (!trace || !trace.rootSpan) return null;
    
    return this.buildProfileTree(trace.rootSpan, trace.spans);
  }

  /**
   * Get transaction statistics
   */
  getTransactionStats(timeWindow: number = 3600000): {
    totalTransactions: number;
    avgDuration: number;
    errorRate: number;
    byType: Record<string, { count: number; avgDuration: number; errorRate: number }>;
    slowest: APMTransaction[];
  } {
    const cutoff = Date.now() - timeWindow;
    const recentTransactions = Array.from(this.transactions.values())
      .filter(t => t.startTime >= cutoff && t.endTime);
    
    const totalTransactions = recentTransactions.length;
    const totalDuration = recentTransactions.reduce((sum, t) => sum + (t.duration || 0), 0);
    const avgDuration = totalTransactions > 0 ? totalDuration / totalTransactions : 0;
    
    const errors = recentTransactions.filter(t => t.result === 'error').length;
    const errorRate = totalTransactions > 0 ? errors / totalTransactions : 0;
    
    // Group by type
    const byType: Record<string, { count: number; avgDuration: number; errorRate: number }> = {};
    
    recentTransactions.forEach(transaction => {
      const type = transaction.type;
      if (!byType[type]) {
        byType[type] = { count: 0, avgDuration: 0, errorRate: 0 };
      }
      
      byType[type].count++;
    });
    
    // Calculate averages for each type
    Object.keys(byType).forEach(type => {
      const typeTransactions = recentTransactions.filter(t => t.type === type);
      const typeTotalDuration = typeTransactions.reduce((sum, t) => sum + (t.duration || 0), 0);
      const typeErrors = typeTransactions.filter(t => t.result === 'error').length;
      
      byType[type].avgDuration = typeTotalDuration / typeTransactions.length;
      byType[type].errorRate = typeErrors / typeTransactions.length;
    });
    
    // Get slowest transactions
    const slowest = recentTransactions
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10);
    
    return {
      totalTransactions,
      avgDuration,
      errorRate,
      byType,
      slowest
    };
  }

  /**
   * Get trace by ID
   */
  getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId);
  }

  /**
   * Get transaction by ID
   */
  getTransaction(transactionId: string): APMTransaction | undefined {
    return this.transactions.get(transactionId);
  }

  /**
   * Search traces by criteria
   */
  searchTraces(criteria: {
    operation?: string;
    status?: string;
    minDuration?: number;
    maxDuration?: number;
    since?: number;
  }): Trace[] {
    let traces = Array.from(this.traces.values());
    
    if (criteria.operation) {
      traces = traces.filter(t => t.tags.operation?.includes(criteria.operation!));
    }
    
    if (criteria.status) {
      traces = traces.filter(t => t.status === criteria.status);
    }
    
    if (criteria.minDuration) {
      traces = traces.filter(t => (t.duration || 0) >= criteria.minDuration!);
    }
    
    if (criteria.maxDuration) {
      traces = traces.filter(t => (t.duration || 0) <= criteria.maxDuration!);
    }
    
    if (criteria.since) {
      traces = traces.filter(t => t.startTime >= criteria.since!);
    }
    
    return traces.sort((a, b) => b.startTime - a.startTime);
  }

  private buildProfileTree(rootSpan: Span, allSpans: Span[]): PerformanceProfile {
    const children = allSpans.filter(s => s.parentSpanId === rootSpan.id);
    const childProfiles = children.map(child => this.buildProfileTree(child, allSpans));
    
    const childTime = childProfiles.reduce((sum, child) => sum + child.totalTime, 0);
    const selfTime = (rootSpan.duration || 0) - childTime;
    
    return {
      name: rootSpan.name,
      totalTime: rootSpan.duration || 0,
      selfTime: Math.max(0, selfTime),
      callCount: 1,
      avgTime: rootSpan.duration || 0,
      maxTime: rootSpan.duration || 0,
      minTime: rootSpan.duration || 0,
      children: childProfiles
    };
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private getAsyncId(): string {
    // Simplified async context tracking
    // In production, you'd use async_hooks for proper context tracking
    return 'default';
  }

  private cleanup(): void {
    const cutoff = Date.now() - 3600000; // Keep last hour
    
    // Clean up old traces
    for (const [id, trace] of this.traces.entries()) {
      if (trace.startTime < cutoff) {
        this.traces.delete(id);
        
        // Clean up associated spans
        trace.spans.forEach(span => {
          this.spans.delete(span.id);
        });
      }
    }
    
    // Clean up old transactions
    for (const [id, transaction] of this.transactions.entries()) {
      if (transaction.startTime < cutoff) {
        this.transactions.delete(id);
      }
    }
    
    // Limit total traces
    if (this.traces.size > this.maxTraces) {
      const sorted = Array.from(this.traces.entries())
        .sort(([, a], [, b]) => b.startTime - a.startTime);
      
      const toDelete = sorted.slice(this.maxTraces);
      toDelete.forEach(([id]) => {
        this.traces.delete(id);
      });
    }
  }

  private startPeriodicTasks(): void {
    // Clean up old traces every 10 minutes
    setInterval(() => {
      this.cleanup();
    }, 600000);
    
    // Emit APM summary every 5 minutes
    setInterval(() => {
      const stats = this.getTransactionStats();
      this.emit('apmSummary', stats);
    }, 300000);
  }
}

// Singleton instance
let apmInstance: APMTracer | null = null;

export function getAPMTracer(): APMTracer {
  if (!apmInstance) {
    apmInstance = new APMTracer();
    logger.info('APM tracer initialized');
  }
  return apmInstance;
}

// Convenience function for HTTP request tracing
export function traceHTTPRequest(req: any, res: any): string {
  const apm = getAPMTracer();
  const transactionId = apm.startTransaction(
    `${req.method} ${req.url}`,
    'http',
    {
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
      userId: req.user?.id
    }
  );
  
  // Hook into response to finish transaction
  const originalSend = res.send;
  res.send = function(data: any) {
    const result = res.statusCode >= 400 ? 'error' : 'success';
    apm.finishTransaction(transactionId, result);
    return originalSend.call(this, data);
  };
  
  return transactionId;
}

export { APMTracer };
export const apm = getAPMTracer();