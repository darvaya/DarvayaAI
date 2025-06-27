/**
 * Enhanced streaming module with performance monitoring and optimization
 */

import type OpenAI from 'openai';
import {
  StreamingPerformanceTracker,
  PerformanceTimer,
  openRouterCache,
  recordRequest,
  logPerformanceEvent,
  CircuitBreaker,
} from './performance';
import { CustomDataStreamWriter } from './streaming';

// Enhanced streaming response with performance tracking
export interface EnhancedStreamChunk {
  type:
    | 'token'
    | 'tool_call'
    | 'tool_result'
    | 'error'
    | 'data'
    | 'finish'
    | 'performance';
  content?: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: string;
  };
  toolResult?: {
    id: string;
    result: any;
  };
  data?: any;
  error?: string;
  performance?: {
    timeToFirstToken?: number;
    tokensPerSecond?: number;
    totalDuration?: number;
  };
}

// Enhanced data stream writer with performance tracking
export class EnhancedDataStreamWriter extends CustomDataStreamWriter {
  private performanceTracker: StreamingPerformanceTracker;
  private timer: PerformanceTimer;

  constructor(controller: ReadableStreamDefaultController<Uint8Array>) {
    super(controller);
    this.performanceTracker = new StreamingPerformanceTracker();
    this.timer = new PerformanceTimer();
  }

  writeText(text: string): void {
    // Record first token timing
    this.performanceTracker.recordFirstToken();
    this.performanceTracker.recordToken(text);

    super.writeText(text);

    // Periodically emit performance data
    const metrics = this.performanceTracker.getMetrics();
    if (metrics.chunkCount % 10 === 0) {
      this.writePerformanceData(metrics);
    }
  }

  writeData(data: any): void {
    super.writeData(data);
  }

  private writePerformanceData(metrics: any): void {
    this.writeData({
      type: 'performance',
      metrics,
    });
  }

  close(): void {
    // Record final metrics
    const metrics = this.performanceTracker.getMetrics();
    const totalLatency = this.timer.end();

    recordRequest(totalLatency, metrics.tokenCount);

    logPerformanceEvent('stream_completed', {
      ...metrics,
      totalLatency,
    });

    this.writePerformanceData(metrics);
    super.close();
  }
}

// Circuit breaker for OpenRouter API
const openRouterCircuitBreaker = new CircuitBreaker(5, 60000);

// Enhanced OpenAI stream parser with caching and optimization
export async function* parseOpenAIStreamEnhanced(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  cacheKey?: string,
): AsyncGenerator<EnhancedStreamChunk> {
  const performanceTracker = new StreamingPerformanceTracker();
  const timer = new PerformanceTimer();
  let fullContent = '';

  try {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (!delta) continue;

      // Handle regular content tokens
      if (delta.content) {
        performanceTracker.recordFirstToken();
        performanceTracker.recordToken(delta.content);
        fullContent += delta.content;

        yield {
          type: 'token',
          content: delta.content,
        };
      }

      // Handle tool calls
      if (delta.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          if (toolCall.function) {
            yield {
              type: 'tool_call',
              toolCall: {
                id: toolCall.id || '',
                name: toolCall.function.name || '',
                arguments: toolCall.function.arguments || '',
              },
            };
          }
        }
      }

      // Handle finish reason
      if (chunk.choices[0]?.finish_reason) {
        const metrics = performanceTracker.getMetrics();
        const totalLatency = timer.end();

        // Cache successful responses
        if (cacheKey && fullContent.length > 0) {
          openRouterCache.set(cacheKey, {
            content: fullContent,
            metrics,
            timestamp: Date.now(),
          });
        }

        recordRequest(totalLatency, metrics.tokenCount);

        yield {
          type: 'performance',
          performance: {
            timeToFirstToken: metrics.timeToFirstToken ?? undefined,
            tokensPerSecond: metrics.tokensPerSecond,
            totalDuration: metrics.totalDuration,
          },
        };

        yield {
          type: 'finish',
        };

        logPerformanceEvent('stream_finished', {
          ...metrics,
          totalLatency,
          cacheKey,
        });
      }
    }
  } catch (error) {
    const errorLatency = timer.end();
    recordRequest(errorLatency, 0);

    logPerformanceEvent(
      'stream_error',
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        latency: errorLatency,
        cacheKey,
      },
      'error',
    );

    yield {
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown streaming error',
    };
  }
}

// Enhanced streaming with retry logic and circuit breaker
export async function createEnhancedStream(
  requestFn: () => Promise<
    AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
  >,
  options: {
    cacheKey?: string;
    retryAttempts?: number;
    retryDelay?: number;
  } = {},
): Promise<AsyncGenerator<EnhancedStreamChunk>> {
  const { cacheKey, retryAttempts = 3, retryDelay = 1000 } = options;

  // Check cache first
  if (cacheKey) {
    const cached = openRouterCache.get(cacheKey);
    if (cached) {
      logPerformanceEvent('cache_hit', { cacheKey });
      return (async function* () {
        // Simulate streaming from cache
        const words = cached.content.split(' ');
        for (const word of words) {
          yield {
            type: 'token' as const,
            content: `${word} `,
          };
          // Small delay to simulate streaming
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        yield {
          type: 'finish' as const,
        };
      })();
    }
  }

  // Execute with circuit breaker and retry logic
  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    try {
      return await openRouterCircuitBreaker.execute(async () => {
        const stream = await requestFn();
        return parseOpenAIStreamEnhanced(stream, cacheKey);
      });
    } catch (error) {
      if (attempt === retryAttempts) {
        logPerformanceEvent(
          'max_retries_exceeded',
          {
            error: error instanceof Error ? error.message : 'Unknown error',
            attempts: attempt,
            cacheKey,
          },
          'error',
        );
        throw error;
      }

      logPerformanceEvent(
        'retry_attempt',
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          attempt,
          nextRetryIn: retryDelay * attempt,
          cacheKey,
        },
        'warn',
      );

      // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
    }
  }

  throw new Error('Max retry attempts exceeded');
}

// Optimized word-based chunking with performance consideration
export function createOptimizedWordChunker(
  text: string,
  options: {
    maxChunkSize?: number;
    minChunkSize?: number;
    delayBetweenChunks?: number;
  } = {},
): string[] {
  const {
    maxChunkSize = 15,
    minChunkSize = 3,
    delayBetweenChunks = 0,
  } = options;

  const words = text.split(/(\s+)/);
  const chunks: string[] = [];
  let currentChunk = '';
  let wordCount = 0;

  for (const word of words) {
    currentChunk += word;

    if (!word.trim()) continue; // Skip whitespace

    wordCount++;

    // Chunk by word count or punctuation
    const shouldChunk =
      wordCount >= maxChunkSize ||
      (wordCount >= minChunkSize && /[.!?]/.test(word));

    if (shouldChunk) {
      chunks.push(currentChunk);
      currentChunk = '';
      wordCount = 0;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// Performance-optimized streaming response creator
export function createOptimizedStreamingResponse(
  streamGenerator: AsyncGenerator<EnhancedStreamChunk>,
  headers: Record<string, string> = {},
): Response {
  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      const timer = new PerformanceTimer();
      let chunkCount = 0;

      try {
        for await (const chunk of streamGenerator) {
          chunkCount++;

          // Format as Server-Sent Events
          const sseData = `data: ${JSON.stringify(chunk)}\n\n`;
          controller.enqueue(encoder.encode(sseData));

          // Yield control periodically for better performance
          if (chunkCount % 50 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
      } catch (error) {
        const errorChunk: EnhancedStreamChunk = {
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        };

        const errorData = `data: ${JSON.stringify(errorChunk)}\n\n`;
        controller.enqueue(encoder.encode(errorData));

        logPerformanceEvent(
          'streaming_response_error',
          {
            error: error instanceof Error ? error.message : 'Unknown error',
            chunkCount,
            elapsed: timer.elapsed(),
          },
          'error',
        );
      } finally {
        const totalTime = timer.end();

        logPerformanceEvent('streaming_response_completed', {
          chunkCount,
          totalTime,
          chunksPerSecond: chunkCount / (totalTime / 1000),
        });

        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      ...headers,
    },
  });
}
