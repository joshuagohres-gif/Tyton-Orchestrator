import { EventEmitter } from 'events';
import pino from 'pino';

const logger = pino().child({ service: 'metrics' });

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
}

export interface MetricSummary {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

class MetricsCollector extends EventEmitter {
  private metrics: Map<string, MetricPoint[]> = new Map();
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private retentionMs: number = 5 * 60 * 1000; // 5 minutes default
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    super();
    // Cleanup old metrics every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Increment a counter metric
   */
  increment(name: string, value: number = 1, tags?: Record<string, string>): void {
    const key = this.getKey(name, tags);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
    
    this.recordMetric({
      name,
      value: current + value,
      timestamp: Date.now(),
      tags,
      type: 'counter'
    });
  }

  /**
   * Set a gauge metric (current value)
   */
  gauge(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.getKey(name, tags);
    this.gauges.set(key, value);
    
    this.recordMetric({
      name,
      value,
      timestamp: Date.now(),
      tags,
      type: 'gauge'
    });
  }

  /**
   * Record a histogram value (for distributions)
   */
  histogram(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.getKey(name, tags);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key)!.push(value);
    
    this.recordMetric({
      name,
      value,
      timestamp: Date.now(),
      tags,
      type: 'histogram'
    });
  }

  /**
   * Record a timing metric (convenience method)
   */
  timing(name: string, durationMs: number, tags?: Record<string, string>): void {
    this.histogram(name, durationMs, tags);
  }

  /**
   * Start a timer and return a function to stop it
   */
  startTimer(name: string, tags?: Record<string, string>): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.timing(name, duration, tags);
    };
  }

  /**
   * Get current value of a counter
   */
  getCounter(name: string, tags?: Record<string, string>): number {
    const key = this.getKey(name, tags);
    return this.counters.get(key) || 0;
  }

  /**
   * Get current value of a gauge
   */
  getGauge(name: string, tags?: Record<string, string>): number | undefined {
    const key = this.getKey(name, tags);
    return this.gauges.get(key);
  }

  /**
   * Get histogram summary statistics
   */
  getHistogramSummary(name: string, tags?: Record<string, string>): MetricSummary | null {
    const key = this.getKey(name, tags);
    const values = this.histograms.get(key);
    
    if (!values || values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);
    
    return {
      count: values.length,
      sum,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / values.length,
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99)
    };
  }

  /**
   * Get all metrics for export (e.g., to Prometheus)
   */
  getAllMetrics(): Map<string, MetricPoint[]> {
    const now = Date.now();
    const cutoff = now - this.retentionMs;
    
    // Filter out old metrics
    const filtered = new Map<string, MetricPoint[]>();
    for (const [key, points] of this.metrics.entries()) {
      const recent = points.filter(p => p.timestamp > cutoff);
      if (recent.length > 0) {
        filtered.set(key, recent);
      }
    }
    
    return filtered;
  }

  /**
   * Export metrics in Prometheus format
   */
  toPrometheus(): string {
    const lines: string[] = [];
    
    // Export counters
    for (const [key, value] of this.counters.entries()) {
      const { name, tags } = this.parseKey(key);
      const labels = this.formatLabels(tags);
      lines.push(`${name}_total${labels} ${value}`);
    }
    
    // Export gauges
    for (const [key, value] of this.gauges.entries()) {
      const { name, tags } = this.parseKey(key);
      const labels = this.formatLabels(tags);
      lines.push(`${name}${labels} ${value}`);
    }
    
    // Export histogram summaries
    for (const [key, values] of this.histograms.entries()) {
      const { name, tags } = this.parseKey(key);
      const summary = this.getHistogramSummary(name, tags);
      if (summary) {
        const labels = this.formatLabels(tags);
        lines.push(`${name}_count${labels} ${summary.count}`);
        lines.push(`${name}_sum${labels} ${summary.sum}`);
        lines.push(`${name}_min${labels} ${summary.min}`);
        lines.push(`${name}_max${labels} ${summary.max}`);
        lines.push(`${name}_p50${labels} ${summary.p50}`);
        lines.push(`${name}_p95${labels} ${summary.p95}`);
        lines.push(`${name}_p99${labels} ${summary.p99}`);
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  /**
   * Clean up old metrics
   */
  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.retentionMs;
    
    // Clean up metric points
    for (const [key, points] of this.metrics.entries()) {
      const filtered = points.filter(p => p.timestamp > cutoff);
      if (filtered.length === 0) {
        this.metrics.delete(key);
      } else {
        this.metrics.set(key, filtered);
      }
    }
    
    // Clean up old histogram values (keep last 1000)
    for (const [key, values] of this.histograms.entries()) {
      if (values.length > 1000) {
        this.histograms.set(key, values.slice(-1000));
      }
    }
  }

  /**
   * Record a metric point
   */
  private recordMetric(point: MetricPoint): void {
    const key = this.getKey(point.name, point.tags);
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    this.metrics.get(key)!.push(point);
    this.emit('metric', point);
  }

  /**
   * Generate a unique key for a metric with tags
   */
  private getKey(name: string, tags?: Record<string, string>): string {
    if (!tags || Object.keys(tags).length === 0) {
      return name;
    }
    
    const sortedTags = Object.keys(tags)
      .sort()
      .map(k => `${k}:${tags[k]}`)
      .join(',');
    
    return `${name}{${sortedTags}}`;
  }

  /**
   * Parse a metric key back into name and tags
   */
  private parseKey(key: string): { name: string; tags?: Record<string, string> } {
    const match = key.match(/^([^{]+)(?:\{(.+)\})?$/);
    if (!match) {
      return { name: key };
    }
    
    const name = match[1];
    const tagString = match[2];
    
    if (!tagString) {
      return { name };
    }
    
    const tags: Record<string, string> = {};
    tagString.split(',').forEach(pair => {
      const [k, v] = pair.split(':');
      tags[k] = v;
    });
    
    return { name, tags };
  }

  /**
   * Format tags for Prometheus labels
   */
  private formatLabels(tags?: Record<string, string>): string {
    if (!tags || Object.keys(tags).length === 0) {
      return '';
    }
    
    const pairs = Object.entries(tags)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    
    return `{${pairs}}`;
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * Destroy the collector and clean up resources
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.removeAllListeners();
    this.reset();
  }
}

// Singleton instance
let metricsInstance: MetricsCollector | null = null;

/**
 * Get or create the metrics collector instance
 */
export function getMetrics(): MetricsCollector {
  if (!metricsInstance) {
    metricsInstance = new MetricsCollector();
    logger.info('Metrics collector initialized');
  }
  return metricsInstance;
}

/**
 * Common metric names used throughout the application
 */
export const MetricNames = {
  // HTTP metrics
  HTTP_REQUEST_TOTAL: 'http_request_total',
  HTTP_REQUEST_DURATION: 'http_request_duration_ms',
  HTTP_REQUEST_SIZE: 'http_request_size_bytes',
  HTTP_RESPONSE_SIZE: 'http_response_size_bytes',
  
  // WebSocket metrics
  WS_CONNECTION_TOTAL: 'ws_connection_total',
  WS_CONNECTION_ACTIVE: 'ws_connection_active',
  WS_MESSAGE_SENT: 'ws_message_sent_total',
  WS_MESSAGE_RECEIVED: 'ws_message_received_total',
  
  // Orchestrator metrics
  ORCHESTRATOR_RUN_TOTAL: 'orchestrator_run_total',
  ORCHESTRATOR_RUN_DURATION: 'orchestrator_run_duration_ms',
  ORCHESTRATOR_STAGE_DURATION: 'orchestrator_stage_duration_ms',
  ORCHESTRATOR_STAGE_ERRORS: 'orchestrator_stage_errors_total',
  
  // LLM metrics
  LLM_REQUEST_TOTAL: 'llm_request_total',
  LLM_REQUEST_DURATION: 'llm_request_duration_ms',
  LLM_TOKEN_USAGE: 'llm_token_usage_total',
  LLM_ERROR_TOTAL: 'llm_error_total',
  
  // Circuit breaker metrics
  CIRCUIT_BREAKER_STATE: 'circuit_breaker_state',
  CIRCUIT_BREAKER_FAILURES: 'circuit_breaker_failures_total',
  CIRCUIT_BREAKER_SUCCESSES: 'circuit_breaker_successes_total',
  CIRCUIT_BREAKER_REJECTIONS: 'circuit_breaker_rejections_total',
  
  // Cache metrics
  CACHE_HIT_TOTAL: 'cache_hit_total',
  CACHE_MISS_TOTAL: 'cache_miss_total',
  CACHE_SET_TOTAL: 'cache_set_total',
  CACHE_DELETE_TOTAL: 'cache_delete_total',
  CACHE_SIZE: 'cache_size_bytes',
  
  // Database metrics
  DB_QUERY_TOTAL: 'db_query_total',
  DB_QUERY_DURATION: 'db_query_duration_ms',
  DB_CONNECTION_ACTIVE: 'db_connection_active',
  DB_CONNECTION_IDLE: 'db_connection_idle',
  
  // System metrics
  SYSTEM_CPU_USAGE: 'system_cpu_usage_percent',
  SYSTEM_MEMORY_USAGE: 'system_memory_usage_bytes',
  SYSTEM_HEAP_USAGE: 'system_heap_usage_bytes',
  SYSTEM_EVENT_LOOP_LAG: 'system_event_loop_lag_ms'
};

// API Monitoring Extension
export interface RequestMetrics {
  timestamp: number;
  method: string;
  route: string;
  statusCode: number;
  responseTime: number;
  userAgent?: string;
  userId?: string;
  error?: string;
}

export interface RouteStats {
  totalRequests: number;
  avgResponseTime: number;
  errorRate: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerMinute: number;
  errors: { [statusCode: number]: number };
}

export interface SystemMetrics {
  uptime: number;
  totalRequests: number;
  errorRate: number;
  avgResponseTime: number;
  activeConnections: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: number;
  routes: { [route: string]: RouteStats };
}

export interface Alert {
  id: string;
  type: 'error_rate' | 'response_time' | 'memory' | 'cpu';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  resolved: boolean;
  metadata?: Record<string, any>;
}

class APIMonitor extends EventEmitter {
  private requests: RequestMetrics[] = [];
  private alerts: Alert[] = [];
  private startTime: number = Date.now();
  private activeConnections: number = 0;
  private readonly maxStoredRequests = 10000;
  
  // Alert thresholds
  private readonly thresholds = {
    errorRate: 0.05, // 5%
    avgResponseTime: 2000, // 2 seconds
    p95ResponseTime: 5000, // 5 seconds
    memoryUsage: 0.9, // 90% of available memory
    cpuUsage: 0.8 // 80%
  };

  constructor() {
    super();
    this.startPeriodicTasks();
  }

  trackRequest(req: any): (statusCode: number, error?: Error) => void {
    const startTime = Date.now();
    const route = this.normalizeRoute(req.url || req.originalUrl || '');
    
    this.activeConnections++;
    
    return (statusCode: number, error?: Error) => {
      const responseTime = Date.now() - startTime;
      this.activeConnections = Math.max(0, this.activeConnections - 1);
      
      const metrics: RequestMetrics = {
        timestamp: Date.now(),
        method: req.method || 'UNKNOWN',
        route,
        statusCode,
        responseTime,
        userAgent: req.headers?.['user-agent'],
        userId: req.user?.id,
        error: error?.message
      };
      
      this.recordRequest(metrics);
    };
  }

  recordRequest(metrics: RequestMetrics): void {
    this.requests.push(metrics);
    
    // Keep only recent requests
    if (this.requests.length > this.maxStoredRequests) {
      this.requests = this.requests.slice(-this.maxStoredRequests);
    }
    
    // Check for alerts
    this.checkAlerts(metrics);
    
    // Emit event for real-time monitoring
    this.emit('request', metrics);
  }

  getMetrics(timeWindow: number = 300000): SystemMetrics {
    const cutoff = Date.now() - timeWindow;
    const recentRequests = this.requests.filter(r => r.timestamp >= cutoff);
    
    const totalRequests = recentRequests.length;
    const errorRequests = recentRequests.filter(r => r.statusCode >= 400).length;
    const errorRate = totalRequests > 0 ? errorRequests / totalRequests : 0;
    
    const responseTimes = recentRequests.map(r => r.responseTime);
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;
    
    // Calculate route statistics
    const routeGroups = this.groupByRoute(recentRequests);
    const routes: { [route: string]: RouteStats } = {};
    
    for (const [route, requests] of routeGroups.entries()) {
      routes[route] = this.calculateRouteStats(requests, timeWindow);
    }
    
    return {
      uptime: Date.now() - this.startTime,
      totalRequests,
      errorRate,
      avgResponseTime,
      activeConnections: this.activeConnections,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage().user / 1000000, // Convert to seconds
      routes
    };
  }

  getHealthStatus(): { status: 'healthy' | 'degraded' | 'unhealthy'; details: any } {
    const metrics = this.getMetrics();
    const activeAlerts = this.alerts.filter(a => !a.resolved);
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (activeAlerts.some(a => a.severity === 'critical')) {
      status = 'unhealthy';
    } else if (activeAlerts.some(a => ['high', 'medium'].includes(a.severity))) {
      status = 'degraded';
    }
    
    return {
      status,
      details: {
        uptime: metrics.uptime,
        totalRequests: metrics.totalRequests,
        errorRate: metrics.errorRate,
        avgResponseTime: metrics.avgResponseTime,
        activeConnections: metrics.activeConnections,
        activeAlerts: activeAlerts.length,
        memoryUsage: `${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB`,
        criticalAlerts: activeAlerts.filter(a => a.severity === 'critical').length
      }
    };
  }

  getAlerts(includeResolved: boolean = false): Alert[] {
    return includeResolved 
      ? this.alerts 
      : this.alerts.filter(a => !a.resolved);
  }

  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      this.emit('alertResolved', alert);
      return true;
    }
    return false;
  }

  private normalizeRoute(url: string): string {
    // Remove query parameters
    const path = url.split('?')[0];
    
    // Replace dynamic segments with placeholders
    return path
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-f0-9-]{36}/g, '/:uuid')
      .replace(/\/[a-f0-9-]{8,}/g, '/:hash');
  }

  private groupByRoute(requests: RequestMetrics[]): Map<string, RequestMetrics[]> {
    const groups = new Map<string, RequestMetrics[]>();
    
    for (const request of requests) {
      const key = `${request.method} ${request.route}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(request);
    }
    
    return groups;
  }

  private calculateRouteStats(requests: RequestMetrics[], timeWindow: number): RouteStats {
    const responseTimes = requests.map(r => r.responseTime).sort((a, b) => a - b);
    const errors: { [statusCode: number]: number } = {};
    
    let errorCount = 0;
    for (const request of requests) {
      if (request.statusCode >= 400) {
        errorCount++;
        errors[request.statusCode] = (errors[request.statusCode] || 0) + 1;
      }
    }
    
    return {
      totalRequests: requests.length,
      avgResponseTime: responseTimes.length > 0 
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
        : 0,
      errorRate: requests.length > 0 ? errorCount / requests.length : 0,
      p95ResponseTime: this.percentileHelper(responseTimes, 95),
      p99ResponseTime: this.percentileHelper(responseTimes, 99),
      requestsPerMinute: (requests.length / (timeWindow / 60000)),
      errors
    };
  }

  private percentileHelper(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * values.length) - 1;
    return values[Math.max(0, index)];
  }

  private checkAlerts(metrics: RequestMetrics): void {
    const recentMetrics = this.getMetrics(60000); // Last minute
    
    // Error rate alert
    if (recentMetrics.errorRate > this.thresholds.errorRate && recentMetrics.totalRequests > 10) {
      this.createAlert('error_rate', 'high', 
        `Error rate is ${(recentMetrics.errorRate * 100).toFixed(1)}% (threshold: ${this.thresholds.errorRate * 100}%)`,
        { errorRate: recentMetrics.errorRate, totalRequests: recentMetrics.totalRequests }
      );
    }
    
    // Response time alert
    if (recentMetrics.avgResponseTime > this.thresholds.avgResponseTime) {
      this.createAlert('response_time', 'medium',
        `Average response time is ${recentMetrics.avgResponseTime}ms (threshold: ${this.thresholds.avgResponseTime}ms)`,
        { avgResponseTime: recentMetrics.avgResponseTime }
      );
    }
    
    // Memory usage alert
    const memoryUsage = recentMetrics.memoryUsage.heapUsed / recentMetrics.memoryUsage.heapTotal;
    if (memoryUsage > this.thresholds.memoryUsage) {
      this.createAlert('memory', 'critical',
        `Memory usage is ${(memoryUsage * 100).toFixed(1)}% (threshold: ${this.thresholds.memoryUsage * 100}%)`,
        { memoryUsage, heapUsed: recentMetrics.memoryUsage.heapUsed, heapTotal: recentMetrics.memoryUsage.heapTotal }
      );
    }
  }

  private createAlert(type: Alert['type'], severity: Alert['severity'], message: string, metadata?: Record<string, any>): void {
    // Check if similar alert already exists and is not resolved
    const existingAlert = this.alerts.find(a => 
      !a.resolved && 
      a.type === type && 
      Date.now() - a.timestamp < 300000 // Within last 5 minutes
    );
    
    if (existingAlert) {
      return; // Don't create duplicate alerts
    }
    
    const alert: Alert = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      message,
      timestamp: Date.now(),
      resolved: false,
      metadata
    };
    
    this.alerts.push(alert);
    this.emit('alert', alert);
    
    // Auto-resolve low severity alerts after 10 minutes
    if (severity === 'low') {
      setTimeout(() => {
        this.resolveAlert(alert.id);
      }, 600000);
    }
  }

  private startPeriodicTasks(): void {
    // Clean up old requests every 5 minutes
    setInterval(() => {
      const cutoff = Date.now() - 3600000; // Keep last hour
      this.requests = this.requests.filter(r => r.timestamp >= cutoff);
    }, 300000);
    
    // Clean up old resolved alerts every hour
    setInterval(() => {
      const cutoff = Date.now() - 86400000; // Keep last 24 hours
      this.alerts = this.alerts.filter(a => !a.resolved || a.timestamp >= cutoff);
    }, 3600000);
    
    // Emit periodic metrics every minute
    setInterval(() => {
      this.emit('metrics', this.getMetrics());
    }, 60000);
  }
}

// API Monitor singleton
let apiMonitorInstance: APIMonitor | null = null;

export function getAPIMonitor(): APIMonitor {
  if (!apiMonitorInstance) {
    apiMonitorInstance = new APIMonitor();
    logger.info('API Monitor initialized');
  }
  return apiMonitorInstance;
}

export const apiMonitor = getAPIMonitor();

export default getMetrics;