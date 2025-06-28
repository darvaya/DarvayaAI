import type OpenAI from 'openai';
import { openRouterClient } from './openrouter-client';
import type { CustomDataStreamWriter } from './streaming';
import type { CoordinatedDataStreamWriter } from './coordinated-streaming';

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
  dataStream?: CustomDataStreamWriter | CoordinatedDataStreamWriter;
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

  console.log(`🔧 Registering tool: ${name}`);
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
    console.error(`❌ Tool '${name}' not found in registry`);
    // Signal tool error if we have a coordinated writer
    if (context.dataStream && 'writeToolError' in context.dataStream) {
      context.dataStream.writeToolError(
        toolCall.id,
        `Tool '${name}' not found`,
      );
    }
    return {
      success: false,
      error: `Tool '${name}' not found`,
    };
  }

  try {
    console.log(`🔧 Executing tool: ${name}`);

    // Signal tool start if we have a coordinated writer
    if (context.dataStream && 'writeToolStart' in context.dataStream) {
      context.dataStream.writeToolStart(toolCall.id, name);
    }

    const args = JSON.parse(toolCall.function.arguments);

    // CRITICAL FIX: Pass the main dataStream directly to tool executor
    const result = await executor(args, {
      session: context.session,
      dataStream: context.dataStream, // Direct reference, not isolated
    });

    if (result.success) {
      console.log(`✅ Tool '${name}' executed successfully`);
      // Signal tool completion if we have a coordinated writer
      if (context.dataStream && 'writeToolComplete' in context.dataStream) {
        context.dataStream.writeToolComplete(toolCall.id, result.result);
      }
    } else {
      console.log(`❌ Tool '${name}' failed: ${result.error}`);
      // Signal tool error if we have a coordinated writer
      if (context.dataStream && 'writeToolError' in context.dataStream) {
        context.dataStream.writeToolError(
          toolCall.id,
          result.error || 'Unknown tool error',
        );
      }
    }

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Tool '${name}' execution error: ${errorMessage}`);

    // Signal tool error if we have a coordinated writer
    if (context.dataStream && 'writeToolError' in context.dataStream) {
      context.dataStream.writeToolError(toolCall.id, errorMessage);
    }

    return {
      success: false,
      error: errorMessage,
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
      .map((name) => {
        const tool = toolRegistry.getDefinition(name);
        console.log(`🔧 Tool lookup: ${name} ->`, tool ? 'FOUND' : 'NOT FOUND');
        return tool;
      })
      .filter((tool): tool is OpenAITool => tool !== undefined);

    console.log(`🔧 Step ${stepCount}: Sending ${tools.length} tools to API`);

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

      // Handle content streaming
      if (delta?.content) {
        assistantMessage += delta.content;
        yield {
          type: 'content',
          data: delta.content,
        };
      }

      // Handle tool call streaming
      if (delta?.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          if (toolCallDelta.index !== undefined) {
            // Start a new tool call or continue existing one
            if (!toolCalls[toolCallDelta.index]) {
              toolCalls[toolCallDelta.index] = {
                id: toolCallDelta.id || '',
                type: 'function',
                function: {
                  name: toolCallDelta.function?.name || '',
                  arguments: toolCallDelta.function?.arguments || '',
                },
              };
            } else {
              // Accumulate arguments
              if (toolCallDelta.function?.arguments) {
                toolCalls[toolCallDelta.index].function.arguments +=
                  toolCallDelta.function.arguments;
              }
            }

            // Yield the tool call data
            yield {
              type: 'tool_call',
              data: {
                id: toolCalls[toolCallDelta.index].id,
                name: toolCalls[toolCallDelta.index].function.name,
                arguments: toolCalls[toolCallDelta.index].function.arguments,
              },
            };
          }
        }
      }

      // Check if stream is finished
      if (chunk.choices[0]?.finish_reason) {
        break;
      }
    }

    // If no tool calls were made, we're done
    if (toolCalls.length === 0) {
      yield {
        type: 'finish',
        data: {
          content: assistantMessage,
          usage: null, // Will be populated by the caller if available
        },
      };
      break;
    }

    // Execute tool calls and continue conversation
    console.log(
      `🔧 Executing ${toolCalls.length} tool calls:`,
      toolCalls.map((tc) => tc.function.name),
    );
    const toolResults = await processToolCalls(toolCalls, context);
    console.log(
      `🔧 Tool execution completed, got ${toolResults.length} results`,
    );

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

    // Continue with the next iteration to get the model's response to the tool results
    // Don't break here - let the model respond to the tool execution
  }

  // If we exit the loop without finishing naturally, ensure we send a finish event
  yield {
    type: 'finish',
    data: {
      content: '',
      usage: null,
    },
  };
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
