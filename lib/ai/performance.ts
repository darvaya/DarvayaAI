/**
 * Performance monitoring and optimization for OpenRouter integration
 */

interface PerformanceMetrics {
  requestCount: number;
  totalLatency: number;
  errors: number;
  tokensGenerated: number;
  cacheHits: number;
  cacheMisses: number;
  lastReset: Date;
}

interface StreamingMetrics {
  streamStartTime: number;
  firstTokenTime?: number;
  lastTokenTime?: number;
  tokenCount: number;
  chunkCount: number;
}

// Global performance tracking
const performanceMetrics: PerformanceMetrics = {
  requestCount: 0,
  totalLatency: 0,
  errors: 0,
  tokensGenerated: 0,
  cacheHits: 0,
  cacheMisses: 0,
  lastReset: new Date(),
};

// Simple in-memory cache for model configurations and frequent responses
class OpenRouterCache {
  private cache = new Map<
    string,
    { data: any; timestamp: number; ttl: number }
  >();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

  set(key: string, data: any, ttl = this.DEFAULT_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item) {
      performanceMetrics.cacheMisses++;
      return null;
    }

    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      performanceMetrics.cacheMisses++;
      return null;
    }

    performanceMetrics.cacheHits++;
    return item.data;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  // Clean expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

export const openRouterCache = new OpenRouterCache();

// Performance timer for measuring request latency
export class PerformanceTimer {
  private startTime: number;
  private endTime?: number;

  constructor() {
    this.startTime = performance.now();
  }

  end(): number {
    this.endTime = performance.now();
    return this.endTime - this.startTime;
  }

  elapsed(): number {
    return (this.endTime || performance.now()) - this.startTime;
  }
}

// Streaming performance tracker
export class StreamingPerformanceTracker {
  private metrics: StreamingMetrics;

  constructor() {
    this.metrics = {
      streamStartTime: performance.now(),
      tokenCount: 0,
      chunkCount: 0,
    };
  }

  recordFirstToken(): void {
    if (!this.metrics.firstTokenTime) {
      this.metrics.firstTokenTime = performance.now();
    }
  }

  recordToken(content: string): void {
    this.metrics.tokenCount += content.length;
    this.metrics.chunkCount++;
    this.metrics.lastTokenTime = performance.now();
  }

  getMetrics() {
    const now = performance.now();
    return {
      totalDuration: now - this.metrics.streamStartTime,
      timeToFirstToken: this.metrics.firstTokenTime
        ? this.metrics.firstTokenTime - this.metrics.streamStartTime
        : null,
      averageChunkInterval:
        this.metrics.chunkCount > 1
          ? (now - this.metrics.streamStartTime) / this.metrics.chunkCount
          : null,
      tokenCount: this.metrics.tokenCount,
      chunkCount: this.metrics.chunkCount,
      tokensPerSecond:
        this.metrics.tokenCount / ((now - this.metrics.streamStartTime) / 1000),
    };
  }
}

// Request optimization helpers
const activeRequests = new Map<string, Promise<any>>();
const batchedRequests = new Map<
  string,
  {
    requests: Array<{ resolve: Function; reject: Function; data: any }>;
    timer: NodeJS.Timeout;
  }
>();

// Deduplicate identical requests
export async function deduplicateRequest<T>(
  key: string,
  requestFn: () => Promise<T>,
): Promise<T> {
  if (activeRequests.has(key)) {
    return activeRequests.get(key) as Promise<T>;
  }

  const promise = requestFn().finally(() => {
    activeRequests.delete(key);
  });

  activeRequests.set(key, promise);
  return promise;
}

// Batch multiple requests with debouncing
export async function batchRequest<T>(
  batchKey: string,
  data: any,
  batchFn: (requests: any[]) => Promise<T[]>,
  delay = 50,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!batchedRequests.has(batchKey)) {
      batchedRequests.set(batchKey, {
        requests: [],
        timer: setTimeout(async () => {
          const batch = batchedRequests.get(batchKey);
          if (batch) {
            batchedRequests.delete(batchKey);
            try {
              const results = await batchFn(batch.requests.map((r) => r.data));
              batch.requests.forEach((req, index) => {
                req.resolve(results[index]);
              });
            } catch (error) {
              batch.requests.forEach((req) => req.reject(error));
            }
          }
        }, delay),
      });
    }

    const batch = batchedRequests.get(batchKey);
    if (batch) {
      batch.requests.push({ resolve, reject, data });
    }
  });
}

// Circuit breaker for handling API failures
export class CircuitBreaker {
  private failures = 0;
  private readonly maxFailures: number;
  private readonly resetTimeout: number;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(maxFailures = 5, resetTimeout = 60000) {
    this.maxFailures = maxFailures;
    this.resetTimeout = resetTimeout;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.maxFailures) {
      this.state = 'open';
    }
    performanceMetrics.errors++;
  }

  getState(): string {
    return this.state;
  }
}

// Performance monitoring functions
export function recordRequest(latency: number, tokens = 0): void {
  performanceMetrics.requestCount++;
  performanceMetrics.totalLatency += latency;
  performanceMetrics.tokensGenerated += tokens;
}

export function getPerformanceMetrics(): PerformanceMetrics & {
  averageLatency: number;
  requestsPerMinute: number;
  errorRate: number;
  cacheHitRate: number;
} {
  const timeSinceReset = Date.now() - performanceMetrics.lastReset.getTime();
  const minutesSinceReset = timeSinceReset / (1000 * 60);

  return {
    ...performanceMetrics,
    averageLatency:
      performanceMetrics.requestCount > 0
        ? performanceMetrics.totalLatency / performanceMetrics.requestCount
        : 0,
    requestsPerMinute:
      minutesSinceReset > 0
        ? performanceMetrics.requestCount / minutesSinceReset
        : 0,
    errorRate:
      performanceMetrics.requestCount > 0
        ? performanceMetrics.errors / performanceMetrics.requestCount
        : 0,
    cacheHitRate:
      performanceMetrics.cacheHits + performanceMetrics.cacheMisses > 0
        ? performanceMetrics.cacheHits /
          (performanceMetrics.cacheHits + performanceMetrics.cacheMisses)
        : 0,
  };
}

export function resetPerformanceMetrics(): void {
  performanceMetrics.requestCount = 0;
  performanceMetrics.totalLatency = 0;
  performanceMetrics.errors = 0;
  performanceMetrics.tokensGenerated = 0;
  performanceMetrics.cacheHits = 0;
  performanceMetrics.cacheMisses = 0;
  performanceMetrics.lastReset = new Date();
}

// Logging helper with structured data
export function logPerformanceEvent(
  event: string,
  data: Record<string, any>,
  level: 'info' | 'warn' | 'error' = 'info',
): void {
  const logData = {
    timestamp: new Date().toISOString(),
    event,
    ...data,
    metrics: getPerformanceMetrics(),
  };

  if (level === 'error') {
    console.error('[OpenRouter Performance]', JSON.stringify(logData, null, 2));
  } else if (level === 'warn') {
    console.warn('[OpenRouter Performance]', JSON.stringify(logData, null, 2));
  } else {
    console.log('[OpenRouter Performance]', JSON.stringify(logData, null, 2));
  }
}

// Cleanup interval for cache and metrics
setInterval(
  () => {
    openRouterCache.cleanup();
  },
  5 * 60 * 1000,
); // Clean up every 5 minutes
