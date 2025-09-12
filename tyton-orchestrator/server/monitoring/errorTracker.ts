import { EventEmitter } from 'events';
import pino from 'pino';
import { getMetrics, MetricNames } from './metrics';
import { apiMonitor } from './metrics';

const logger = pino().child({ service: 'error-tracker' });

export interface ErrorReport {
  id: string;
  timestamp: number;
  level: 'error' | 'warning' | 'critical';
  message: string;
  stack?: string;
  context: {
    service: string;
    userId?: string;
    requestId?: string;
    route?: string;
    method?: string;
    userAgent?: string;
    ip?: string;
  };
  metadata?: Record<string, any>;
  fingerprint: string; // For grouping similar errors
  count: number; // Number of occurrences
  firstSeen: number;
  lastSeen: number;
  resolved: boolean;
}

export interface ErrorSummary {
  totalErrors: number;
  errorsByLevel: Record<string, number>;
  errorsByService: Record<string, number>;
  topErrors: ErrorReport[];
  errorRate: number;
  resolved: number;
  unresolved: number;
}

export interface AlertConfig {
  errorRateThreshold: number; // errors per minute
  criticalErrorThreshold: number; // immediate alert
  errorSpike: {
    enabled: boolean;
    threshold: number; // % increase over baseline
    timeWindow: number; // minutes
  };
  webhooks: {
    slack?: string;
    email?: string[];
  };
}

class ErrorTracker extends EventEmitter {
  private errors: Map<string, ErrorReport> = new Map();
  private metrics = getMetrics();
  private alertConfig: AlertConfig;
  private readonly maxStoredErrors = 10000;
  
  constructor(config?: Partial<AlertConfig>) {
    super();
    
    this.alertConfig = {
      errorRateThreshold: 10, // 10 errors per minute
      criticalErrorThreshold: 1, // 1 critical error triggers alert
      errorSpike: {
        enabled: true,
        threshold: 50, // 50% increase
        timeWindow: 10 // 10 minutes
      },
      webhooks: {},
      ...config
    };
    
    this.startPeriodicTasks();
  }

  /**
   * Track an error with full context
   */
  trackError(error: Error | string, context: ErrorReport['context'], metadata?: Record<string, any>, level: ErrorReport['level'] = 'error'): string {
    const message = typeof error === 'string' ? error : error.message;
    const stack = typeof error === 'string' ? undefined : error.stack;
    
    const fingerprint = this.generateFingerprint(message, stack, context);
    const timestamp = Date.now();
    const errorId = `${fingerprint}-${timestamp}`;
    
    // Check if this is a recurring error
    const existingError = this.errors.get(fingerprint);
    
    if (existingError) {
      // Update existing error
      existingError.count++;
      existingError.lastSeen = timestamp;
      existingError.metadata = { ...existingError.metadata, ...metadata };
      
      this.emit('errorUpdated', existingError);
    } else {
      // Create new error report
      const errorReport: ErrorReport = {
        id: errorId,
        timestamp,
        level,
        message,
        stack,
        context,
        metadata,
        fingerprint,
        count: 1,
        firstSeen: timestamp,
        lastSeen: timestamp,
        resolved: false
      };
      
      this.errors.set(fingerprint, errorReport);
      this.emit('errorTracked', errorReport);
    }
    
    // Record metrics
    this.recordErrorMetrics(level, context);
    
    // Check for alerts
    this.checkAlerts(level, context);
    
    // Log the error
    logger.error({
      errorId,
      fingerprint,
      level,
      message,
      context,
      metadata
    }, 'Error tracked');
    
    return errorId;
  }

  /**
   * Track HTTP request errors
   */
  trackRequestError(req: any, error: Error, statusCode: number = 500): string {
    const context: ErrorReport['context'] = {
      service: 'http',
      route: req.url || req.originalUrl,
      method: req.method,
      userId: req.user?.id,
      requestId: req.id || req.headers?.['x-request-id'],
      userAgent: req.headers?.['user-agent'],
      ip: req.ip || req.connection?.remoteAddress
    };
    
    const level: ErrorReport['level'] = statusCode >= 500 ? 'error' : 'warning';
    
    return this.trackError(error, context, { statusCode }, level);
  }

  /**
   * Track database errors
   */
  trackDatabaseError(error: Error, query?: string, params?: any): string {
    const context: ErrorReport['context'] = {
      service: 'database'
    };
    
    const metadata = {
      query: query ? this.sanitizeQuery(query) : undefined,
      hasParams: !!params
    };
    
    return this.trackError(error, context, metadata, 'error');
  }

  /**
   * Track LLM service errors
   */
  trackLLMError(error: Error, provider: string, model?: string, userId?: string): string {
    const context: ErrorReport['context'] = {
      service: 'llm',
      userId
    };
    
    const metadata = {
      provider,
      model
    };
    
    return this.trackError(error, context, metadata, 'warning');
  }

  /**
   * Get error summary
   */
  getErrorSummary(timeWindow: number = 3600000): ErrorSummary {
    const cutoff = Date.now() - timeWindow;
    const recentErrors = Array.from(this.errors.values())
      .filter(e => e.lastSeen >= cutoff);
    
    const totalErrors = recentErrors.reduce((sum, e) => sum + e.count, 0);
    
    const errorsByLevel: Record<string, number> = {};
    const errorsByService: Record<string, number> = {};
    
    let resolved = 0;
    let unresolved = 0;
    
    recentErrors.forEach(error => {
      // Group by level
      errorsByLevel[error.level] = (errorsByLevel[error.level] || 0) + error.count;
      
      // Group by service
      const service = error.context.service;
      errorsByService[service] = (errorsByService[service] || 0) + error.count;
      
      // Count resolution status
      if (error.resolved) {
        resolved++;
      } else {
        unresolved++;
      }
    });
    
    // Top errors by frequency
    const topErrors = recentErrors
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Calculate error rate (errors per minute)
    const timeWindowMinutes = timeWindow / 60000;
    const errorRate = totalErrors / timeWindowMinutes;
    
    return {
      totalErrors,
      errorsByLevel,
      errorsByService,
      topErrors,
      errorRate,
      resolved,
      unresolved
    };
  }

  /**
   * Get specific error by fingerprint
   */
  getError(fingerprint: string): ErrorReport | undefined {
    return this.errors.get(fingerprint);
  }

  /**
   * Get all errors with optional filtering
   */
  getErrors(filters?: {
    level?: ErrorReport['level'];
    service?: string;
    resolved?: boolean;
    since?: number;
  }): ErrorReport[] {
    let errors = Array.from(this.errors.values());
    
    if (filters) {
      if (filters.level) {
        errors = errors.filter(e => e.level === filters.level);
      }
      if (filters.service) {
        errors = errors.filter(e => e.context.service === filters.service);
      }
      if (filters.resolved !== undefined) {
        errors = errors.filter(e => e.resolved === filters.resolved);
      }
      if (filters.since) {
        errors = errors.filter(e => e.lastSeen >= filters.since);
      }
    }
    
    return errors.sort((a, b) => b.lastSeen - a.lastSeen);
  }

  /**
   * Mark error as resolved
   */
  resolveError(fingerprint: string): boolean {
    const error = this.errors.get(fingerprint);
    if (error) {
      error.resolved = true;
      this.emit('errorResolved', error);
      logger.info({ fingerprint, errorId: error.id }, 'Error resolved');
      return true;
    }
    return false;
  }

  /**
   * Clear old errors
   */
  cleanup(maxAge: number = 86400000): number {
    const cutoff = Date.now() - maxAge;
    let removed = 0;
    
    for (const [fingerprint, error] of this.errors.entries()) {
      if (error.resolved && error.lastSeen < cutoff) {
        this.errors.delete(fingerprint);
        removed++;
      }
    }
    
    // Also limit total stored errors
    if (this.errors.size > this.maxStoredErrors) {
      const sorted = Array.from(this.errors.entries())
        .sort(([, a], [, b]) => b.lastSeen - a.lastSeen);
      
      // Keep most recent errors
      const toKeep = sorted.slice(0, this.maxStoredErrors);
      this.errors.clear();
      
      toKeep.forEach(([fingerprint, error]) => {
        this.errors.set(fingerprint, error);
      });
      
      removed += sorted.length - toKeep.length;
    }
    
    return removed;
  }

  private generateFingerprint(message: string, stack?: string, context?: ErrorReport['context']): string {
    // Create a unique fingerprint for grouping similar errors
    const key = `${message}:${context?.service}:${context?.route}`;
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  private recordErrorMetrics(level: ErrorReport['level'], context: ErrorReport['context']): void {
    // Record general error metrics
    this.metrics.increment('errors_total', 1, {
      level,
      service: context.service
    });
    
    // Record service-specific metrics
    if (context.service === 'http') {
      apiMonitor.recordRequest({
        timestamp: Date.now(),
        method: context.method || 'UNKNOWN',
        route: context.route || 'unknown',
        statusCode: 500,
        responseTime: 0,
        error: 'Server Error'
      });
    }
  }

  private checkAlerts(level: ErrorReport['level'], context: ErrorReport['context']): void {
    // Critical error alert
    if (level === 'critical' && this.alertConfig.criticalErrorThreshold > 0) {
      this.sendAlert('critical', `Critical error in ${context.service}`, {
        level,
        service: context.service,
        route: context.route
      });
    }
    
    // Error rate alert
    const summary = this.getErrorSummary(60000); // Last minute
    if (summary.errorRate > this.alertConfig.errorRateThreshold) {
      this.sendAlert('high', `High error rate: ${summary.errorRate.toFixed(1)} errors/min`, {
        errorRate: summary.errorRate,
        threshold: this.alertConfig.errorRateThreshold
      });
    }
    
    // Error spike detection
    if (this.alertConfig.errorSpike.enabled) {
      this.checkErrorSpike();
    }
  }

  private checkErrorSpike(): void {
    const windowMs = this.alertConfig.errorSpike.timeWindow * 60000;
    const current = this.getErrorSummary(windowMs / 2); // Current half
    const previous = this.getErrorSummary(windowMs); // Full window
    
    const currentRate = current.errorRate;
    const previousRate = (previous.errorRate * 2) - currentRate; // Estimate previous half
    
    if (previousRate > 0) {
      const increase = ((currentRate - previousRate) / previousRate) * 100;
      
      if (increase > this.alertConfig.errorSpike.threshold) {
        this.sendAlert('medium', `Error spike detected: ${increase.toFixed(1)}% increase`, {
          currentRate,
          previousRate,
          increase,
          threshold: this.alertConfig.errorSpike.threshold
        });
      }
    }
  }

  private sendAlert(severity: 'low' | 'medium' | 'high' | 'critical', message: string, metadata?: Record<string, any>): void {
    const alert = {
      id: `error-alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      severity,
      message,
      timestamp: Date.now(),
      metadata,
      type: 'error_tracking'
    };
    
    this.emit('alert', alert);
    
    // Log alert
    logger.warn({
      alert: alert.id,
      severity,
      message,
      metadata
    }, 'Error alert generated');
    
    // TODO: Implement webhook notifications
    // this.sendWebhookAlert(alert);
  }

  private sanitizeQuery(query: string): string {
    // Remove sensitive data from SQL queries for logging
    return query
      .replace(/password\s*=\s*'[^']*'/gi, "password='***'")
      .replace(/password\s*=\s*"[^"]*"/gi, 'password="***"')
      .replace(/token\s*=\s*'[^']*'/gi, "token='***'")
      .replace(/token\s*=\s*"[^"]*"/gi, 'token="***"');
  }

  private startPeriodicTasks(): void {
    // Cleanup old errors every hour
    setInterval(() => {
      const removed = this.cleanup();
      if (removed > 0) {
        logger.info({ removed }, 'Cleaned up old errors');
      }
    }, 3600000);
    
    // Emit error summary every 5 minutes
    setInterval(() => {
      const summary = this.getErrorSummary();
      this.emit('errorSummary', summary);
    }, 300000);
  }
}

// Singleton instance
let errorTrackerInstance: ErrorTracker | null = null;

export function getErrorTracker(config?: Partial<AlertConfig>): ErrorTracker {
  if (!errorTrackerInstance) {
    errorTrackerInstance = new ErrorTracker(config);
    logger.info('Error tracker initialized');
  }
  return errorTrackerInstance;
}

// Global error handlers
export function setupGlobalErrorHandlers(): void {
  const tracker = getErrorTracker();
  
  // Unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    tracker.trackError(error, {
      service: 'global',
    }, {
      type: 'unhandledRejection',
      promise: promise.toString()
    }, 'critical');
  });
  
  // Uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    tracker.trackError(error, {
      service: 'global',
    }, {
      type: 'uncaughtException'
    }, 'critical');
    
    // Log and exit gracefully
    logger.fatal({ error }, 'Uncaught exception');
    process.exit(1);
  });
}

export { ErrorTracker };
export const errorTracker = getErrorTracker();