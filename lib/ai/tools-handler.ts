import type OpenAI from 'openai';
import { openRouterClient } from './openrouter-client';
import type { CustomDataStreamWriter } from './streaming';

// Base tool interface
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

// Tool execution context
export interface ToolExecutionContext {
  session: any;
  dataStream?: CustomDataStreamWriter;
}

// Tool execution result
export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
}

// Tool executor function type
export type ToolExecutor = (
  args: any,
  context: ToolExecutionContext,
) => Promise<ToolExecutionResult>;

// Tool registry
export class ToolRegistry {
  private tools: Map<
    string,
    { definition: OpenAITool; executor: ToolExecutor }
  > = new Map();

  register(name: string, definition: OpenAITool, executor: ToolExecutor) {
    this.tools.set(name, { definition, executor });
  }

  getDefinition(name: string): OpenAITool | undefined {
    return this.tools.get(name)?.definition;
  }

  getExecutor(name: string): ToolExecutor | undefined {
    return this.tools.get(name)?.executor;
  }

  getAllDefinitions(): OpenAITool[] {
    return Array.from(this.tools.values()).map((tool) => tool.definition);
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }
}

// Global tool registry instance
export const toolRegistry = new ToolRegistry();

// Helper function to convert AI SDK tool to OpenAI format
export function convertToOpenAITool(
  name: string,
  description: string,
  parameters: any,
  executor: ToolExecutor,
): void {
  const openAITool: OpenAITool = {
    type: 'function',
    function: {
      name,
      description,
      parameters,
    },
  };

  toolRegistry.register(name, openAITool, executor);
}

// Execute a tool call
export async function executeToolCall(
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const { name } = toolCall.function;
  const executor = toolRegistry.getExecutor(name);

  if (!executor) {
    return {
      success: false,
      error: `Tool '${name}' not found`,
    };
  }

  try {
    const args = JSON.parse(toolCall.function.arguments);
    const result = await executor(args, context);
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Process multiple tool calls in sequence
export async function processToolCalls(
  toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
  context: ToolExecutionContext,
): Promise<OpenAI.Chat.Completions.ChatCompletionToolMessageParam[]> {
  const results: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = [];

  for (const toolCall of toolCalls) {
    const result = await executeToolCall(toolCall, context);

    results.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: result.success
        ? JSON.stringify(result.result)
        : `Error: ${result.error}`,
    });
  }

  return results;
}

// Stream a chat completion with tool support
export async function* streamChatWithTools(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  model: string,
  context: ToolExecutionContext,
  options: {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    tools?: string[];
    maxSteps?: number;
  } = {},
): AsyncGenerator<{
  type: 'content' | 'tool_call' | 'tool_result' | 'finish';
  data: any;
}> {
  const client = openRouterClient();
  if (!client) {
    throw new Error('OpenRouter client not initialized');
  }

  const { tools: enabledTools = [], maxSteps = 5 } = options;
  // biome-ignore lint/style/useConst: currentMessages is modified with push operations later
  let currentMessages = [...messages];
  let stepCount = 0;

  while (stepCount < maxSteps) {
    stepCount++;

    // Get tool definitions for enabled tools
    const tools = enabledTools
      .map((name) => toolRegistry.getDefinition(name))
      .filter((tool): tool is OpenAITool => tool !== undefined);

    // Make the API call with OpenRouter required headers
    const stream = await client.chat.completions.create(
      {
        model,
        messages: currentMessages,
        stream: true,
        tools: tools.length > 0 ? tools : undefined,
        temperature: options.temperature,
        max_tokens: options.max_tokens,
        top_p: options.top_p,
      },
      {
        headers: {
          'HTTP-Referer':
            process.env.OPENROUTER_SITE_URL ||
            'https://darvayaai-production.up.railway.app',
          'X-Title': process.env.OPENROUTER_APP_NAME || 'DarvayaAI',
        },
      },
    );

    let assistantMessage = '';
    const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] =
      [];

    // Process the streaming response
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        assistantMessage += delta.content;
        yield {
          type: 'content',
          data: delta.content,
        };
      }

      if (delta?.tool_calls) {
        // Handle tool calls (simplified for now)
        for (const toolCall of delta.tool_calls) {
          if (toolCall.function) {
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

    // If no tool calls, we're done
    if (toolCalls.length === 0) {
      yield {
        type: 'finish',
        data: { content: assistantMessage },
      };
      break;
    }

    // Execute tool calls and continue conversation
    const toolResults = await processToolCalls(toolCalls, context);

    // Add assistant message and tool results to conversation
    currentMessages.push({
      role: 'assistant',
      content: assistantMessage || null,
      tool_calls: toolCalls,
    });

    currentMessages.push(...toolResults);

    // Yield tool results
    for (const result of toolResults) {
      yield {
        type: 'tool_result',
        data: {
          tool_call_id: result.tool_call_id,
          content: result.content,
        },
      };
    }
  }
}

// Helper to create a basic OpenAI function schema
export function createFunctionSchema(
  name: string,
  description: string,
  properties: Record<string, any>,
  required: string[] = [],
): OpenAITool {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    },
  };
}
