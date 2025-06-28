import { openRouterClient } from '@/lib/ai/openrouter-client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('🧪 Test chat request:', body);

    const client = openRouterClient();
    if (!client) {
      return new Response('OpenRouter client not available', { status: 500 });
    }

    // Simple stream without tools
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          console.log('🧪 Making OpenRouter API call...');

          const response = await client.chat.completions.create(
            {
              model: 'google/gemini-2.0-flash-lite-001',
              messages: [
                {
                  role: 'user',
                  content: body.message || 'Hello, how are you?',
                },
              ],
              stream: true,
              max_tokens: 100,
            },
            {
              headers: {
                'HTTP-Referer': 'https://darvayaai-production.up.railway.app',
                'X-Title': 'DarvayaAI',
              },
            },
          );

          console.log('🧪 Stream started, processing chunks...');

          for await (const chunk of response) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              console.log('🧪 Chunk:', content);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'content',
                    data: content,
                  })}\n\n`,
                ),
              );
            }

            if (chunk.choices[0]?.finish_reason) {
              console.log('🧪 Stream finished');
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'finish',
                    data: {},
                  })}\n\n`,
                ),
              );
              break;
            }
          }
        } catch (error) {
          console.error('🧪 Stream error:', error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                data: error instanceof Error ? error.message : 'Unknown error',
              })}\n\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('🧪 Test chat error:', error);
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
