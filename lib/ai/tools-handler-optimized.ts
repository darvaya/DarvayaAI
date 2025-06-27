/**
 * Optimized tools handler with performance monitoring and caching
 */

import type OpenAI from 'openai';
import { openRouterClient } from './openrouter-client';
import {
  PerformanceTimer,
  openRouterCache,
  recordRequest,
  logPerformanceEvent,
  CircuitBreaker,
  deduplicateRequest,
} from './performance';
import type { CustomDataStreamWriter } from './streaming';

// Enhanced tool interfaces
export interface OptimizedToolExecutionContext {
  session: any;
  dataStream?: CustomDataStreamWriter;
  requestId?: string;
  cacheEnabled?: boolean;
}

export interface ToolExecutionMetrics {
  executionTime: number;
  cacheHit: boolean;
  retryCount: number;
  success: boolean;
}

export interface OptimizedToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  metrics: ToolExecutionMetrics;
}

// Enhanced tool executor with metrics
export type OptimizedToolExecutor = (
  args: any,
  context: OptimizedToolExecutionContext,
) => Promise<OptimizedToolExecutionResult>;

// Optimized tool registry with caching
export class OptimizedToolRegistry {
  private tools = new Map<
    string,
    {
      definition: OpenAI.Chat.ChatCompletionTool;
      executor: OptimizedToolExecutor;
      cacheEnabled: boolean;
      cacheTTL: number;
    }
  >();

  register(
    name: string,
    definition: OpenAI.Chat.ChatCompletionTool,
    executor: OptimizedToolExecutor,
    options: { cacheEnabled?: boolean; cacheTTL?: number } = {},
  ): void {
    this.tools.set(name, {
      definition,
      executor,
      cacheEnabled: options.cacheEnabled ?? false,
      cacheTTL: options.cacheTTL ?? 300000, // 5 minutes default
    });
  }

  getDefinition(name: string): OpenAI.Chat.ChatCompletionTool | undefined {
    return this.tools.get(name)?.definition;
  }

  getExecutor(name: string): OptimizedToolExecutor | undefined {
    return this.tools.get(name)?.executor;
  }

  getToolConfig(name: string) {
    return this.tools.get(name);
  }

  getAllDefinitions(): OpenAI.Chat.ChatCompletionTool[] {
    return Array.from(this.tools.values()).map((tool) => tool.definition);
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }
}

// Global optimized registry
export const optimizedToolRegistry = new OptimizedToolRegistry();

// Circuit breakers for different types of operations
const toolExecutionCircuitBreaker = new CircuitBreaker(3, 30000);
const apiCallCircuitBreaker = new CircuitBreaker(5, 60000);

// Enhanced tool execution with caching and monitoring
export async function executeOptimizedToolCall(
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
  context: OptimizedToolExecutionContext,
): Promise<OptimizedToolExecutionResult> {
  const { name } = toolCall.function;
  const timer = new PerformanceTimer();
  const retryCount = 0;
  let cacheHit = false;

  const toolConfig = optimizedToolRegistry.getToolConfig(name);
  if (!toolConfig) {
    return {
      success: false,
      error: `Tool '${name}' not found`,
      metrics: {
        executionTime: timer.end(),
        cacheHit: false,
        retryCount: 0,
        success: false,
      },
    };
  }

  const { executor, cacheEnabled, cacheTTL } = toolConfig;

  try {
    const args = JSON.parse(toolCall.function.arguments);

    // Generate cache key
    const cacheKey = cacheEnabled
      ? `tool:${name}:${JSON.stringify(args)}`
      : null;

    // Check cache first
    if (cacheKey && context.cacheEnabled !== false) {
      const cached = openRouterCache.get(cacheKey);
      if (cached) {
        cacheHit = true;
        logPerformanceEvent('tool_cache_hit', {
          toolName: name,
          cacheKey,
          requestId: context.requestId,
        });

        return {
          success: true,
          result: cached,
          metrics: {
            executionTime: timer.end(),
            cacheHit: true,
            retryCount: 0,
            success: true,
          },
        };
      }
    }

    // Execute with circuit breaker and retry logic
    const result = await toolExecutionCircuitBreaker.execute(async () => {
      const executionResult = await executor(args, context);

      // Cache successful results
      if (executionResult.success && cacheKey && executionResult.result) {
        openRouterCache.set(cacheKey, executionResult.result, cacheTTL);
      }

      return executionResult;
    });

    const executionTime = timer.end();

    logPerformanceEvent('tool_execution_completed', {
      toolName: name,
      executionTime,
      cacheHit,
      success: result.success,
      requestId: context.requestId,
    });

    return {
      ...result,
      metrics: {
        executionTime,
        cacheHit,
        retryCount,
        success: result.success,
      },
    };
  } catch (error) {
    const executionTime = timer.end();

    logPerformanceEvent(
      'tool_execution_error',
      {
        toolName: name,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime,
        retryCount,
        requestId: context.requestId,
      },
      'error',
    );

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metrics: {
        executionTime,
        cacheHit,
        retryCount,
        success: false,
      },
    };
  }
}

// Optimized batch tool execution
export async function processOptimizedToolCalls(
  toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
  context: OptimizedToolExecutionContext,
): Promise<{
  results: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[];
  metrics: { totalTime: number; toolMetrics: ToolExecutionMetrics[] };
}> {
  const timer = new PerformanceTimer();
  const results: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = [];
  const toolMetrics: ToolExecutionMetrics[] = [];

  // Execute tools in parallel for better performance
  const executionPromises = toolCalls.map(async (toolCall) => {
    const result = await executeOptimizedToolCall(toolCall, context);

    return {
      toolMessage: {
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        content: result.success
          ? JSON.stringify(result.result)
          : `Error: ${result.error}`,
      },
      metrics: result.metrics,
    };
  });

  const executionResults = await Promise.all(executionPromises);

  for (const { toolMessage, metrics } of executionResults) {
    results.push(toolMessage);
    toolMetrics.push(metrics);
  }

  const totalTime = timer.end();

  logPerformanceEvent('batch_tool_execution', {
    toolCount: toolCalls.length,
    totalTime,
    averageTime: totalTime / toolCalls.length,
    cacheHits: toolMetrics.filter((m) => m.cacheHit).length,
    successCount: toolMetrics.filter((m) => m.success).length,
    requestId: context.requestId,
  });

  return {
    results,
    metrics: { totalTime, toolMetrics },
  };
}

// Enhanced streaming with performance optimization
export async function* streamChatWithToolsOptimized(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  model: string,
  context: OptimizedToolExecutionContext,
  options: {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    tools?: string[];
    maxSteps?: number;
  } = {},
): AsyncGenerator<{
  type: 'content' | 'tool_call' | 'tool_result' | 'finish' | 'performance';
  data: any;
}> {
  const { tools: enabledTools = [], maxSteps = 5 } = options;
  const requestId = context.requestId || `req_${Date.now()}`;
  const enhancedContext = { ...context, requestId };

  const overallTimer = new PerformanceTimer();
  // biome-ignore lint/style/useConst: currentMessages is modified via push() in the loop below
  let currentMessages = [...messages];
  let stepCount = 0;
  let totalTokens = 0;

  // Generate cache key for the entire conversation
  const conversationCacheKey = `conversation:${model}:${JSON.stringify(messages.slice(-3))}:${enabledTools.join(',')}`;

  // Check for cached conversation
  if (context.cacheEnabled !== false) {
    const cached = openRouterCache.get(conversationCacheKey);
    if (cached) {
      logPerformanceEvent('conversation_cache_hit', {
        requestId,
        cacheKey: conversationCacheKey,
      });

      // Stream cached response
      const words = cached.content.split(' ');
      for (const word of words) {
        yield {
          type: 'content',
          data: `${word} `,
        };
        await new Promise((resolve) => setTimeout(resolve, 5)); // Fast playback
      }

      yield {
        type: 'finish',
        data: { cached: true, fromCache: true },
      };
      return;
    }
  }

  while (stepCount < maxSteps) {
    stepCount++;
    const stepTimer = new PerformanceTimer();

    try {
      // Get tool definitions for enabled tools
      const toolDefinitions = enabledTools
        .map((name) => optimizedToolRegistry.getDefinition(name))
        .filter(
          (tool): tool is OpenAI.Chat.ChatCompletionTool => tool !== undefined,
        );

      // Create request with deduplication
      const requestKey = `api_call:${model}:${JSON.stringify(currentMessages.slice(-2))}`;

      const stream = await deduplicateRequest(requestKey, async () => {
        return await apiCallCircuitBreaker.execute(async () => {
          const client = openRouterClient();
          return await client.chat.completions.create({
            model,
            messages: currentMessages,
            stream: true,
            tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
            temperature: options.temperature,
            max_tokens: options.max_tokens,
            top_p: options.top_p,
          });
        });
      });

      let assistantMessage = '';
      const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] =
        [];
      let isToolCall = false;

      // Process the streaming response
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          assistantMessage += delta.content;
          totalTokens += delta.content.length;

          yield {
            type: 'content',
            data: delta.content,
          };
        }

        if (delta?.tool_calls) {
          isToolCall = true;
          // Handle tool calls (simplified for this implementation)
          for (const toolCall of delta.tool_calls) {
            if (toolCall.function && toolCall.id) {
              toolCalls.push({
                id: toolCall.id,
                type: 'function',
                function: {
                  name: toolCall.function.name || '',
                  arguments: toolCall.function.arguments || '',
                },
              });

              yield {
                type: 'tool_call',
                data: {
                  id: toolCall.id,
                  name: toolCall.function.name,
                  arguments: toolCall.function.arguments,
                },
              };
            }
          }
        }
      }

      const stepTime = stepTimer.end();

      // Emit step performance data
      yield {
        type: 'performance',
        data: {
          step: stepCount,
          stepTime,
          tokensInStep: assistantMessage.length,
          isToolCall,
        },
      };

      // If no tool calls, we're done
      if (toolCalls.length === 0) {
        // Cache successful conversation
        if (context.cacheEnabled !== false && assistantMessage.length > 0) {
          openRouterCache.set(
            conversationCacheKey,
            {
              content: assistantMessage,
              totalTime: overallTimer.elapsed(),
              tokens: totalTokens,
            },
            300000,
          ); // 5 minute cache
        }

        yield {
          type: 'finish',
          data: {
            content: assistantMessage,
            totalSteps: stepCount,
            totalTime: overallTimer.end(),
            totalTokens,
          },
        };
        break;
      }

      // Execute tool calls with optimization
      const { results: toolResults, metrics: toolMetrics } =
        await processOptimizedToolCalls(toolCalls, enhancedContext);

      // Add messages to conversation
      currentMessages.push({
        role: 'assistant',
        content: assistantMessage || null,
        tool_calls: toolCalls,
      });

      currentMessages.push(...toolResults);

      // Yield tool results
      for (const [index, result] of toolResults.entries()) {
        yield {
          type: 'tool_result',
          data: {
            tool_call_id: result.tool_call_id,
            content: result.content,
            metrics: toolMetrics.toolMetrics[index],
          },
        };
      }

      logPerformanceEvent('conversation_step_completed', {
        step: stepCount,
        stepTime,
        toolCount: toolCalls.length,
        toolExecutionTime: toolMetrics.totalTime,
        requestId,
      });
    } catch (error) {
      logPerformanceEvent(
        'conversation_step_error',
        {
          step: stepCount,
          error: error instanceof Error ? error.message : 'Unknown error',
          requestId,
        },
        'error',
      );

      yield {
        type: 'finish',
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
          totalSteps: stepCount,
          totalTime: overallTimer.end(),
        },
      };
      break;
    }
  }

  const totalTime = overallTimer.end();
  recordRequest(totalTime, totalTokens);

  logPerformanceEvent('conversation_completed', {
    totalSteps: stepCount,
    totalTime,
    totalTokens,
    tokensPerSecond: totalTokens / (totalTime / 1000),
    requestId,
  });
}
