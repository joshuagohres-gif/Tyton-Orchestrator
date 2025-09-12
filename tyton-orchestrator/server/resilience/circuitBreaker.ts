import { EventEmitter } from 'events';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold: number;        // Number of failures to open circuit
  successThreshold: number;        // Successes needed to close from half-open
  timeout: number;                 // Time to wait before trying half-open (ms)
  resetTimeout: number;            // Time to reset failure count on success (ms)
  monitoringPeriod: number;        // Window for counting failures (ms)
  volumeThreshold: number;         // Minimum calls needed before circuit can open
  errorFilter?: (error: any) => boolean; // Filter which errors should count as failures
}

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalCalls: number;
  totalFailures: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  stateChangedAt: number;
  nextRetryAt?: number;
  uptime: number;
  successRate: number;
  errorRate: number;
}

interface CallRecord {
  timestamp: number;
  success: boolean;
  duration: number;
  error?: any;
}

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public circuitName: string,
    public state: CircuitState
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private stateChangedAt = Date.now();
  private nextRetryAt?: number;
  private callHistory: CallRecord[] = [];
  private totalCalls = 0;
  private totalFailures = 0;

  constructor(private options: CircuitBreakerOptions) {
    super();
    this.validateOptions();
  }

  private validateOptions() {
    const { failureThreshold, successThreshold, timeout, volumeThreshold } = this.options;
    
    if (failureThreshold <= 0) {
      throw new Error('failureThreshold must be greater than 0');
    }
    if (successThreshold <= 0) {
      throw new Error('successThreshold must be greater than 0');
    }
    if (timeout <= 0) {
      throw new Error('timeout must be greater than 0');
    }
    if (volumeThreshold <= 0) {
      throw new Error('volumeThreshold must be greater than 0');
    }
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>(async (resolve, reject) => {
      const startTime = Date.now();
      
      // Check if circuit allows execution
      if (!this.canExecute()) {
        const error = new CircuitBreakerError(
          `Circuit breaker '${this.options.name}' is ${this.state}`,
          this.options.name,
          this.state
        );
        this.recordCall(startTime, false, 0, error);
        reject(error);
        return;
      }

      try {
        const result = await operation();
        const duration = Date.now() - startTime;
        
        this.onSuccess(duration);
        resolve(result);
      } catch (error) {
        const duration = Date.now() - startTime;
        this.onFailure(duration, error);
        reject(error);
      }
    });
  }

  private canExecute(): boolean {
    const now = Date.now();

    switch (this.state) {
      case 'closed':
        return true;
        
      case 'open':
        if (this.nextRetryAt && now >= this.nextRetryAt) {
          this.setState('half-open');
          return true;
        }
        return false;
        
      case 'half-open':
        return true;
        
      default:
        return false;
    }
  }

  private onSuccess(duration: number) {
    this.recordCall(Date.now(), true, duration);
    this.lastSuccessTime = Date.now();
    
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.setState('closed');
        this.reset();
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success in closed state
      if (this.failureCount > 0) {
        const timeSinceLastFailure = Date.now() - (this.lastFailureTime || 0);
        if (timeSinceLastFailure >= this.options.resetTimeout) {
          this.failureCount = 0;
        }
      }
    }

    this.emit('success', {
      circuitName: this.options.name,
      state: this.state,
      duration,
      successCount: this.successCount
    });
  }

  private onFailure(duration: number, error: any) {
    // Check if this error should be counted
    if (this.options.errorFilter && !this.options.errorFilter(error)) {
      return;
    }

    this.recordCall(Date.now(), false, duration, error);
    this.lastFailureTime = Date.now();
    this.failureCount++;

    if (this.state === 'half-open') {
      // Any failure in half-open immediately opens circuit
      this.setState('open');
      this.setNextRetryTime();
    } else if (this.state === 'closed') {
      // Check if we should open the circuit
      if (this.shouldOpenCircuit()) {
        this.setState('open');
        this.setNextRetryTime();
      }
    }

    this.emit('failure', {
      circuitName: this.options.name,
      state: this.state,
      duration,
      error,
      failureCount: this.failureCount
    });
  }

  private shouldOpenCircuit(): boolean {
    // Need minimum volume of calls
    if (this.getRecentCallCount() < this.options.volumeThreshold) {
      return false;
    }

    // Check failure threshold
    return this.failureCount >= this.options.failureThreshold;
  }

  private getRecentCallCount(): number {
    const cutoff = Date.now() - this.options.monitoringPeriod;
    return this.callHistory.filter(call => call.timestamp >= cutoff).length;
  }

  private setState(newState: CircuitState) {
    const oldState = this.state;
    this.state = newState;
    this.stateChangedAt = Date.now();

    if (newState === 'closed') {
      this.nextRetryAt = undefined;
    }

    if (newState === 'half-open') {
      this.successCount = 0;
    }

    this.emit('stateChange', {
      circuitName: this.options.name,
      oldState,
      newState,
      timestamp: this.stateChangedAt
    });

    console.log(`🔄 Circuit '${this.options.name}': ${oldState} → ${newState}`);
  }

  private setNextRetryTime() {
    this.nextRetryAt = Date.now() + this.options.timeout;
  }

  private reset() {
    this.failureCount = 0;
    this.successCount = 0;
  }

  private recordCall(timestamp: number, success: boolean, duration: number, error?: any) {
    this.totalCalls++;
    if (!success) {
      this.totalFailures++;
    }

    this.callHistory.push({
      timestamp,
      success,
      duration,
      error
    });

    // Clean old records outside monitoring period
    const cutoff = timestamp - this.options.monitoringPeriod;
    this.callHistory = this.callHistory.filter(call => call.timestamp >= cutoff);
  }

  public getStats(): CircuitBreakerStats {
    const now = Date.now();
    const recentCalls = this.callHistory.filter(
      call => call.timestamp >= now - this.options.monitoringPeriod
    );
    const successfulCalls = recentCalls.filter(call => call.success).length;
    
    return {
      name: this.options.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      stateChangedAt: this.stateChangedAt,
      nextRetryAt: this.nextRetryAt,
      uptime: now - this.stateChangedAt,
      successRate: recentCalls.length > 0 ? successfulCalls / recentCalls.length : 0,
      errorRate: recentCalls.length > 0 ? (recentCalls.length - successfulCalls) / recentCalls.length : 0
    };
  }

  public getOptions(): CircuitBreakerOptions {
    return { ...this.options };
  }

  public forceOpen(): void {
    this.setState('open');
    this.setNextRetryTime();
    
    this.emit('forceOpen', {
      circuitName: this.options.name,
      timestamp: Date.now()
    });
  }

  public forceClose(): void {
    this.setState('closed');
    this.reset();
    
    this.emit('forceClose', {
      circuitName: this.options.name,
      timestamp: Date.now()
    });
  }

  public forceClear(): void {
    this.reset();
    this.callHistory = [];
    this.totalCalls = 0;
    this.totalFailures = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    
    this.emit('forceClear', {
      circuitName: this.options.name,
      timestamp: Date.now()
    });
  }
}

// Circuit breaker registry for managing multiple instances
export class CircuitBreakerRegistry extends EventEmitter {
  private breakers = new Map<string, CircuitBreaker>();

  register(options: CircuitBreakerOptions): CircuitBreaker {
    if (this.breakers.has(options.name)) {
      throw new Error(`Circuit breaker '${options.name}' already registered`);
    }

    const breaker = new CircuitBreaker(options);
    
    // Forward events with breaker name
    ['success', 'failure', 'stateChange', 'forceOpen', 'forceClose', 'forceClear'].forEach(event => {
      breaker.on(event, (data) => {
        this.emit(event, data);
      });
    });

    this.breakers.set(options.name, breaker);
    
    this.emit('registered', {
      circuitName: options.name,
      timestamp: Date.now()
    });

    return breaker;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getAll(): CircuitBreaker[] {
    return Array.from(this.breakers.values());
  }

  getAllStats(): CircuitBreakerStats[] {
    return Array.from(this.breakers.values()).map(breaker => breaker.getStats());
  }

  remove(name: string): boolean {
    const removed = this.breakers.delete(name);
    if (removed) {
      this.emit('removed', {
        circuitName: name,
        timestamp: Date.now()
      });
    }
    return removed;
  }

  clear(): void {
    const names = Array.from(this.breakers.keys());
    this.breakers.clear();
    
    this.emit('cleared', {
      removedCircuits: names,
      timestamp: Date.now()
    });
  }

  executeWithCircuit<T>(circuitName: string, operation: () => Promise<T>): Promise<T> {
    const breaker = this.breakers.get(circuitName);
    if (!breaker) {
      throw new Error(`Circuit breaker '${circuitName}' not found`);
    }
    return breaker.execute(operation);
  }
}

// Global registry instance
const globalRegistry = new CircuitBreakerRegistry();

export function getCircuitBreakerRegistry(): CircuitBreakerRegistry {
  return globalRegistry;
}

export default CircuitBreaker;