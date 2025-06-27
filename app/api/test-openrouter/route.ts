import type { NextRequest } from 'next/server';
import {
  openRouterClient,
  getModelName,
  getModelConfig,
} from '@/lib/ai/openrouter-client';
import { parseOpenAIStream, createStreamingResponse } from '@/lib/ai/streaming';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    // Test basic connectivity
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

    // Get test message from query params or use default
    const { searchParams } = new URL(request.url);
    const testMessage =
      searchParams.get('message') ||
      'Hello! This is a test message. Please respond briefly.';
    const modelKey = (searchParams.get('model') || 'chat-model') as
      | 'chat-model'
      | 'chat-model-reasoning';

    // Get model configuration
    const modelName = getModelName(modelKey);
    const modelConfig = getModelConfig(modelKey);

    console.log(`Testing OpenRouter with model: ${modelName}`);

    // Create a simple chat completion request
    const client = openRouterClient();
    const stream = await client.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant. Respond briefly to test the connection.',
        },
        {
          role: 'user',
          content: testMessage,
        },
      ],
      stream: true,
      ...modelConfig,
    });

    // Parse the stream using our custom parser
    const parsedStream = parseOpenAIStream(stream);

    // Return streaming response
    return createStreamingResponse(parsedStream, {
      'X-Test-Model': modelName,
      'X-Test-Status': 'success',
    });
  } catch (error) {
    console.error('OpenRouter test error:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const isAuthError =
      errorMessage.includes('401') || errorMessage.includes('unauthorized');
    const isRateLimit =
      errorMessage.includes('429') || errorMessage.includes('rate limit');

    let debugInfo = {
      error: errorMessage,
      type: 'unknown',
      suggestion: 'Check server logs for more details',
    };

    if (isAuthError) {
      debugInfo = {
        error: 'Authentication failed',
        type: 'auth',
        suggestion: 'Check your OPENROUTER_API_KEY environment variable',
      };
    } else if (isRateLimit) {
      debugInfo = {
        error: 'Rate limit exceeded',
        type: 'rate_limit',
        suggestion: 'Wait a moment and try again',
      };
    }

    return new Response(JSON.stringify(debugInfo), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, model = 'chat-model' } = body;

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

    const client = openRouterClient();
    const stream = await client.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant testing the OpenRouter integration.',
        },
        {
          role: 'user',
          content: message,
        },
      ],
      stream: true,
      ...modelConfig,
    });

    const parsedStream = parseOpenAIStream(stream);
    return createStreamingResponse(parsedStream);
  } catch (error) {
    console.error('OpenRouter POST test error:', error);

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
