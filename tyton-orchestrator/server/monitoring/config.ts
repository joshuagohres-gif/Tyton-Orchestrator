import pino from 'pino';
import { getAPIMonitor } from './metrics';
import { getErrorTracker, setupGlobalErrorHandlers } from './errorTracker';
import { getAPMTracer } from './apm';
import { getDatabaseMonitor } from '@/server/db/monitoring';

const logger = pino().child({ service: 'monitoring-config' });

export interface MonitoringConfig {
  enabled: boolean;
  metrics: {
    enabled: boolean;
    retentionMinutes: number;
    exportPrometheus: boolean;
    exportInterval: number;
  };
  errors: {
    enabled: boolean;
    errorRateThreshold: number;
    criticalErrorThreshold: number;
    spike: {
      enabled: boolean;
      threshold: number;
      timeWindow: number;
    };
    webhooks: {
      slack?: string;
      email?: string[];
    };
  };
  apm: {
    enabled: boolean;
    sampleRate: number;
    maxTraces: number;
    slowRequestThreshold: number;
  };
  alerts: {
    enabled: boolean;
    channels: {
      console: boolean;
      webhook: boolean;
      email: boolean;
    };
    thresholds: {
      errorRate: number;
      responseTime: number;
      memoryUsage: number;
      cpuUsage: number;
      diskUsage: number;
    };
  };
  database: {
    enabled: boolean;
    slowQueryThreshold: number;
    connectionPoolMonitoring: boolean;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    destinations: ('console' | 'file' | 'elasticsearch')[];
  };
  export: {
    prometheus: {
      enabled: boolean;
      endpoint: string;
      interval: number;
    };
    metrics: {
      enabled: boolean;
      destination: 'file' | 'http' | 'elasticsearch';
      interval: number;
    };
  };
}

export const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  enabled: true,
  metrics: {
    enabled: true,
    retentionMinutes: 60,
    exportPrometheus: true,
    exportInterval: 30000 // 30 seconds
  },
  errors: {
    enabled: true,
    errorRateThreshold: 10, // errors per minute
    criticalErrorThreshold: 1,
    spike: {
      enabled: true,
      threshold: 50, // 50% increase
      timeWindow: 10 // minutes
    },
    webhooks: {}
  },
  apm: {
    enabled: true,
    sampleRate: 1.0, // 100% sampling in development
    maxTraces: 1000,
    slowRequestThreshold: 2000 // 2 seconds
  },
  alerts: {
    enabled: true,
    channels: {
      console: true,
      webhook: false,
      email: false
    },
    thresholds: {
      errorRate: 0.05, // 5%
      responseTime: 2000, // 2 seconds
      memoryUsage: 0.85, // 85%
      cpuUsage: 0.80, // 80%
      diskUsage: 0.90 // 90%
    }
  },
  database: {
    enabled: true,
    slowQueryThreshold: 1000, // 1 second
    connectionPoolMonitoring: true
  },
  logging: {
    level: 'info',
    destinations: ['console']
  },
  export: {
    prometheus: {
      enabled: false,
      endpoint: '/metrics',
      interval: 15000
    },
    metrics: {
      enabled: false,
      destination: 'file',
      interval: 60000
    }
  }
};

class MonitoringManager {
  private config: MonitoringConfig;
  private initialized = false;
  private exportIntervals: NodeJS.Timeout[] = [];

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = this.mergeConfig(DEFAULT_MONITORING_CONFIG, config);
  }

  /**
   * Initialize all monitoring systems
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Monitoring already initialized');
      return;
    }

    if (!this.config.enabled) {
      logger.info('Monitoring disabled by configuration');
      return;
    }

    logger.info('Initializing monitoring systems...');

    try {
      // Initialize error tracking
      if (this.config.errors.enabled) {
        const errorTracker = getErrorTracker({
          errorRateThreshold: this.config.errors.errorRateThreshold,
          criticalErrorThreshold: this.config.errors.criticalErrorThreshold,
          errorSpike: this.config.errors.spike,
          webhooks: this.config.errors.webhooks
        });

        // Set up global error handlers
        setupGlobalErrorHandlers();

        logger.info('Error tracking initialized');
      }

      // Initialize API monitoring
      if (this.config.metrics.enabled) {
        const apiMonitor = getAPIMonitor();
        
        // Configure alert thresholds
        (apiMonitor as any).thresholds = {
          errorRate: this.config.alerts.thresholds.errorRate,
          avgResponseTime: this.config.alerts.thresholds.responseTime,
          memoryUsage: this.config.alerts.thresholds.memoryUsage,
          cpuUsage: this.config.alerts.thresholds.cpuUsage
        };

        logger.info('API monitoring initialized');
      }

      // Initialize APM
      if (this.config.apm.enabled) {
        const apm = getAPMTracer();
        logger.info('APM tracing initialized');
      }

      // Initialize database monitoring
      if (this.config.database.enabled) {
        const dbMonitor = getDatabaseMonitor();
        logger.info('Database monitoring initialized');
      }

      // Set up export intervals
      this.setupExports();

      // Set up alert handlers
      this.setupAlertHandlers();

      this.initialized = true;
      logger.info('Monitoring systems initialized successfully');

    } catch (error) {
      logger.error({ error }, 'Failed to initialize monitoring systems');
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): MonitoringConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<MonitoringConfig>): void {
    this.config = this.mergeConfig(this.config, updates);
    logger.info({ updates }, 'Monitoring configuration updated');

    // Reinitialize if needed
    if (this.initialized) {
      this.cleanup();
      this.initialize().catch(error => {
        logger.error({ error }, 'Failed to reinitialize monitoring');
      });
    }
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    enabled: boolean;
    initialized: boolean;
    systems: Record<string, { enabled: boolean; healthy: boolean; errors?: string }>;
  } {
    const systems: Record<string, { enabled: boolean; healthy: boolean; errors?: string }> = {};

    // Check API monitoring
    try {
      const apiMonitor = getAPIMonitor();
      const health = apiMonitor.getHealthStatus();
      systems.api = {
        enabled: this.config.metrics.enabled,
        healthy: health.status === 'healthy'
      };
    } catch (error) {
      systems.api = {
        enabled: this.config.metrics.enabled,
        healthy: false,
        errors: (error as Error).message
      };
    }

    // Check error tracking
    try {
      const errorTracker = getErrorTracker();
      const summary = errorTracker.getErrorSummary();
      systems.errors = {
        enabled: this.config.errors.enabled,
        healthy: summary.errorRate < this.config.errors.errorRateThreshold
      };
    } catch (error) {
      systems.errors = {
        enabled: this.config.errors.enabled,
        healthy: false,
        errors: (error as Error).message
      };
    }

    // Check APM
    try {
      const apm = getAPMTracer();
      const stats = apm.getTransactionStats();
      systems.apm = {
        enabled: this.config.apm.enabled,
        healthy: stats.errorRate < 0.1 // 10% error threshold
      };
    } catch (error) {
      systems.apm = {
        enabled: this.config.apm.enabled,
        healthy: false,
        errors: (error as Error).message
      };
    }

    // Check database monitoring
    try {
      const dbMonitor = getDatabaseMonitor();
      systems.database = {
        enabled: this.config.database.enabled,
        healthy: true // Simplified check
      };
    } catch (error) {
      systems.database = {
        enabled: this.config.database.enabled,
        healthy: false,
        errors: (error as Error).message
      };
    }

    return {
      enabled: this.config.enabled,
      initialized: this.initialized,
      systems
    };
  }

  /**
   * Export metrics in various formats
   */
  async exportMetrics(format: 'json' | 'prometheus' = 'json'): Promise<string> {
    if (format === 'prometheus') {
      return this.exportPrometheusMetrics();
    }
    
    return this.exportJSONMetrics();
  }

  /**
   * Cleanup monitoring resources
   */
  cleanup(): void {
    // Clear export intervals
    this.exportIntervals.forEach(interval => clearInterval(interval));
    this.exportIntervals = [];

    logger.info('Monitoring resources cleaned up');
  }

  private mergeConfig(base: MonitoringConfig, updates: Partial<MonitoringConfig>): MonitoringConfig {
    return {
      enabled: updates.enabled ?? base.enabled,
      metrics: { ...base.metrics, ...updates.metrics },
      errors: { 
        ...base.errors, 
        ...updates.errors,
        spike: { ...base.errors.spike, ...updates.errors?.spike },
        webhooks: { ...base.errors.webhooks, ...updates.errors?.webhooks }
      },
      apm: { ...base.apm, ...updates.apm },
      alerts: {
        ...base.alerts,
        ...updates.alerts,
        channels: { ...base.alerts.channels, ...updates.alerts?.channels },
        thresholds: { ...base.alerts.thresholds, ...updates.alerts?.thresholds }
      },
      database: { ...base.database, ...updates.database },
      logging: { ...base.logging, ...updates.logging },
      export: {
        prometheus: { ...base.export.prometheus, ...updates.export?.prometheus },
        metrics: { ...base.export.metrics, ...updates.export?.metrics }
      }
    };
  }

  private setupExports(): void {
    // Prometheus export
    if (this.config.export.prometheus.enabled) {
      const interval = setInterval(() => {
        this.exportPrometheusMetrics().catch(error => {
          logger.error({ error }, 'Failed to export Prometheus metrics');
        });
      }, this.config.export.prometheus.interval);
      
      this.exportIntervals.push(interval);
    }

    // JSON metrics export
    if (this.config.export.metrics.enabled) {
      const interval = setInterval(() => {
        this.exportJSONMetrics().catch(error => {
          logger.error({ error }, 'Failed to export JSON metrics');
        });
      }, this.config.export.metrics.interval);
      
      this.exportIntervals.push(interval);
    }
  }

  private setupAlertHandlers(): void {
    if (!this.config.alerts.enabled) return;

    // Handle API monitoring alerts
    if (this.config.metrics.enabled) {
      const apiMonitor = getAPIMonitor();
      apiMonitor.on('alert', (alert) => {
        this.handleAlert('api', alert);
      });
    }

    // Handle error tracking alerts
    if (this.config.errors.enabled) {
      const errorTracker = getErrorTracker();
      errorTracker.on('alert', (alert) => {
        this.handleAlert('errors', alert);
      });
    }
  }

  private handleAlert(source: string, alert: any): void {
    const message = `[${source.toUpperCase()}] ${alert.severity.toUpperCase()}: ${alert.message}`;
    
    // Console alerts
    if (this.config.alerts.channels.console) {
      if (alert.severity === 'critical') {
        logger.fatal({ alert, source }, message);
      } else if (alert.severity === 'high') {
        logger.error({ alert, source }, message);
      } else {
        logger.warn({ alert, source }, message);
      }
    }

    // TODO: Implement webhook and email alerts
    // if (this.config.alerts.channels.webhook) {
    //   this.sendWebhookAlert(alert, source);
    // }
    
    // if (this.config.alerts.channels.email) {
    //   this.sendEmailAlert(alert, source);
    // }
  }

  private async exportPrometheusMetrics(): Promise<string> {
    try {
      const apiMonitor = getAPIMonitor();
      const metrics = apiMonitor.getMetrics();
      
      // Convert to Prometheus format
      const lines: string[] = [];
      
      // System metrics
      lines.push(`# HELP http_requests_total Total HTTP requests`);
      lines.push(`# TYPE http_requests_total counter`);
      lines.push(`http_requests_total ${metrics.totalRequests}`);
      
      lines.push(`# HELP http_request_duration_seconds HTTP request duration`);
      lines.push(`# TYPE http_request_duration_seconds histogram`);
      lines.push(`http_request_duration_seconds_sum ${metrics.avgResponseTime * metrics.totalRequests / 1000}`);
      lines.push(`http_request_duration_seconds_count ${metrics.totalRequests}`);
      
      // Route-specific metrics
      Object.entries(metrics.routes).forEach(([route, stats]) => {
        const sanitizedRoute = route.replace(/[^a-zA-Z0-9_]/g, '_');
        lines.push(`http_request_duration_seconds{route="${sanitizedRoute}"} ${stats.avgResponseTime / 1000}`);
        lines.push(`http_requests_total{route="${sanitizedRoute}"} ${stats.totalRequests}`);
      });
      
      return lines.join('\n');
    } catch (error) {
      logger.error({ error }, 'Failed to generate Prometheus metrics');
      return '';
    }
  }

  private async exportJSONMetrics(): Promise<string> {
    try {
      const apiMonitor = getAPIMonitor();
      const errorTracker = getErrorTracker();
      const apm = getAPMTracer();
      
      const data = {
        timestamp: new Date().toISOString(),
        api: apiMonitor.getMetrics(),
        errors: errorTracker.getErrorSummary(),
        apm: apm.getTransactionStats(),
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        }
      };
      
      return JSON.stringify(data, null, 2);
    } catch (error) {
      logger.error({ error }, 'Failed to generate JSON metrics');
      return '{}';
    }
  }
}

// Singleton instance
let monitoringInstance: MonitoringManager | null = null;

export function getMonitoringManager(config?: Partial<MonitoringConfig>): MonitoringManager {
  if (!monitoringInstance) {
    monitoringInstance = new MonitoringManager(config);
    logger.info('Monitoring manager created');
  }
  return monitoringInstance;
}

// Auto-initialize with environment configuration
export function initializeMonitoring(): Promise<void> {
  const config: Partial<MonitoringConfig> = {
    enabled: process.env.MONITORING_ENABLED !== 'false',
    metrics: {
      enabled: process.env.METRICS_ENABLED !== 'false',
      retentionMinutes: parseInt(process.env.METRICS_RETENTION_MINUTES || '60'),
      exportPrometheus: process.env.PROMETHEUS_ENABLED === 'true'
    },
    errors: {
      enabled: process.env.ERROR_TRACKING_ENABLED !== 'false',
      errorRateThreshold: parseInt(process.env.ERROR_RATE_THRESHOLD || '10'),
      webhooks: {
        slack: process.env.SLACK_WEBHOOK_URL,
        email: process.env.ALERT_EMAIL_ADDRESSES?.split(',')
      }
    },
    apm: {
      enabled: process.env.APM_ENABLED !== 'false',
      sampleRate: parseFloat(process.env.APM_SAMPLE_RATE || '1.0'),
      slowRequestThreshold: parseInt(process.env.SLOW_REQUEST_THRESHOLD || '2000')
    },
    logging: {
      level: (process.env.LOG_LEVEL as any) || 'info'
    }
  };

  const manager = getMonitoringManager(config);
  return manager.initialize();
}

export { MonitoringManager };
export const monitoring = getMonitoringManager();