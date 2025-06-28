import { openRouterClient } from '@/lib/ai/openrouter-client';

export async function GET() {
  try {
    console.log('🧪 Debug: Checking OpenRouter configuration...');

    // Check environment variables
    const hasApiKey = !!process.env.OPENROUTER_API_KEY;
    const apiKeyLength = process.env.OPENROUTER_API_KEY?.length || 0;

    console.log('🧪 Debug: API Key present:', hasApiKey);
    console.log('🧪 Debug: API Key length:', apiKeyLength);

    // Try to get client
    let clientAvailable = false;
    try {
      const client = openRouterClient();
      clientAvailable = !!client;
      console.log('🧪 Debug: Client created:', clientAvailable);
    } catch (error) {
      console.error('🧪 Debug: Client creation failed:', error);
    }

    return Response.json({
      status: 'debug',
      environment: process.env.NODE_ENV,
      hasApiKey,
      apiKeyLength,
      clientAvailable,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('🧪 Debug error:', error);
    return Response.json(
      {
        error: 'Debug failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    console.log('🧪 Debug: Testing simple OpenRouter request...');

    const client = openRouterClient();
    if (!client) {
      return Response.json(
        {
          error: 'No OpenRouter client available',
        },
        { status: 500 },
      );
    }

    // Test a simple completion
    const response = await client.chat.completions.create(
      {
        model: 'google/gemini-2.0-flash-lite-001',
        messages: [
          { role: 'user', content: 'Say "Hello from debug endpoint"' },
        ],
        max_tokens: 20,
      },
      {
        headers: {
          'HTTP-Referer': 'https://darvayaai-production.up.railway.app',
          'X-Title': 'DarvayaAI Debug',
        },
      },
    );

    console.log(
      '🧪 Debug: OpenRouter response:',
      response.choices[0]?.message?.content,
    );

    return Response.json({
      status: 'success',
      message: response.choices[0]?.message?.content,
      usage: response.usage,
      model: response.model,
    });
  } catch (error) {
    console.error('🧪 Debug: OpenRouter test failed:', error);
    return Response.json(
      {
        error: 'OpenRouter test failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
