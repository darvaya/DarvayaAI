import type { NextRequest } from 'next/server';
import {
  openRouterClient,
  getModelName,
  getModelConfig,
} from '@/lib/ai/openrouter-client';
import { streamChatWithTools, toolRegistry } from '@/lib/ai/tools-handler';
import '@/lib/ai/tools/get-weather-openai'; // Import to register the tool

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    if (!openRouterClient) {
      return new Response(
        JSON.stringify({
          error:
            'OpenRouter client not initialized. Check OPENROUTER_API_KEY environment variable.',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Get test parameters from query
    const { searchParams } = new URL(request.url);
    const latitude = searchParams.get('lat') || '40.7128'; // Default to NYC
    const longitude = searchParams.get('lon') || '-74.0060';
    const customMessage = searchParams.get('message');

    const testMessage =
      customMessage ||
      `What's the weather like at coordinates ${latitude}, ${longitude}?`;
    const modelKey = (searchParams.get('model') || 'chat-model') as
      | 'chat-model'
      | 'chat-model-reasoning';

    const modelName = getModelName(modelKey);
    const modelConfig = getModelConfig(modelKey);

    console.log(`Testing OpenRouter tools with model: ${modelName}`);
    console.log(`Available tools: ${toolRegistry.getToolNames().join(', ')}`);

    // Test messages
    const messages: any[] = [
      {
        role: 'system',
        content:
          'You are a helpful assistant that can check the weather. When the user asks about weather, use the getWeather function with the provided coordinates.',
      },
      {
        role: 'user',
        content: testMessage,
      },
    ];

    // Create response stream
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Use our tool-enabled streaming
          const toolStream = streamChatWithTools(
            messages,
            modelName,
            { session: null }, // Mock session for testing
            {
              ...modelConfig,
              tools: ['getWeather'],
              maxSteps: 3,
            },
          );

          let hasContent = false;

          for await (const chunk of toolStream) {
            hasContent = true;

            // Send server-sent event format
            const sseData = `data: ${JSON.stringify(chunk)}\n\n`;
            controller.enqueue(encoder.encode(sseData));

            // Log tool calls for debugging
            if (chunk.type === 'tool_call') {
              console.log('Tool called:', chunk.data);
            } else if (chunk.type === 'tool_result') {
              console.log('Tool result:', chunk.data);
            }
          }

          if (!hasContent) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'error',
                  data: { error: 'No response generated' },
                })}\n\n`,
              ),
            );
          }
        } catch (error) {
          console.error('Tool streaming error:', error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                data: {
                  error:
                    error instanceof Error ? error.message : 'Unknown error',
                },
              })}\n\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Test-Model': modelName,
        'X-Available-Tools': toolRegistry.getToolNames().join(','),
      },
    });
  } catch (error) {
    console.error('OpenRouter tools test error:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({
        error: errorMessage,
        type: 'setup_error',
        availableTools: toolRegistry.getToolNames(),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      message,
      model = 'chat-model',
      latitude = 40.7128,
      longitude = -74.006,
      tools = ['getWeather'],
    } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!openRouterClient) {
      return new Response(
        JSON.stringify({
          error: 'OpenRouter client not initialized',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const modelName = getModelName(model as any);
    const modelConfig = getModelConfig(model as any);

    const messages: any[] = [
      {
        role: 'system',
        content: `You are a helpful assistant that can check the weather. When asked about weather, use the getWeather function. Default coordinates are latitude: ${latitude}, longitude: ${longitude}.`,
      },
      {
        role: 'user',
        content: message,
      },
    ];

    // Create response stream
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const toolStream = streamChatWithTools(
            messages,
            modelName,
            { session: null },
            {
              ...modelConfig,
              tools: tools,
              maxSteps: 5,
            },
          );

          for await (const chunk of toolStream) {
            const sseData = `data: ${JSON.stringify(chunk)}\n\n`;
            controller.enqueue(encoder.encode(sseData));
          }
        } catch (error) {
          console.error('POST tool streaming error:', error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                data: {
                  error:
                    error instanceof Error ? error.message : 'Unknown error',
                },
              })}\n\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('OpenRouter POST tools test error:', error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
