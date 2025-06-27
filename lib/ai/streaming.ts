import type OpenAI from 'openai';

// Types for streaming responses
export interface StreamChunk {
  type: 'token' | 'tool_call' | 'tool_result' | 'error' | 'data' | 'finish';
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
}

export interface StreamingOptions {
  onChunk?: (chunk: StreamChunk) => void;
  onError?: (error: Error) => void;
  onFinish?: (response: any) => void;
}

// Custom data stream writer to replace AI SDK's DataStreamWriter
export class CustomDataStreamWriter {
  private encoder = new TextEncoder();
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  constructor(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.controller = controller;
  }

  writeData(data: any) {
    if (!this.controller) return;

    const chunk = this.encoder.encode(`0:${JSON.stringify(data)}\n`);
    this.controller.enqueue(chunk);
  }

  writeMessageAnnotation(annotation: any) {
    if (!this.controller) return;

    const chunk = this.encoder.encode(`8:${JSON.stringify(annotation)}\n`);
    this.controller.enqueue(chunk);
  }

  writeText(text: string) {
    if (!this.controller) return;

    const chunk = this.encoder.encode(`1:${text}\n`);
    this.controller.enqueue(chunk);
  }

  close() {
    if (this.controller) {
      this.controller.close();
      this.controller = null;
    }
  }
}

// Function to create a data stream (replacement for AI SDK's createDataStream)
export function createCustomDataStream(
  execute: (dataStream: CustomDataStreamWriter) => Promise<void>,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const dataStream = new CustomDataStreamWriter(controller);

      try {
        await execute(dataStream);
      } catch (error) {
        console.error('Data stream error:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const errorChunk = new TextEncoder().encode(
          `9:${JSON.stringify({ error: errorMessage })}\n`,
        );
        controller.enqueue(errorChunk);
      } finally {
        dataStream.close();
      }
    },
  });
}

// Basic OpenAI stream parser (simplified version)
export async function* parseOpenAIStream(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
): AsyncGenerator<StreamChunk> {
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;

    if (!delta) continue;

    // Handle regular content tokens
    if (delta.content) {
      yield {
        type: 'token',
        content: delta.content,
      };
    }

    // Handle finish reason
    if (chunk.choices[0]?.finish_reason) {
      yield {
        type: 'finish',
      };
    }
  }
}

// Extract reasoning tokens from content (for models like o1)
export function extractReasoningTokens(content: string): {
  reasoning: string;
  content: string;
} {
  const thinkTagRegex = /<think>([\s\S]*?)<\/think>/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  match = thinkTagRegex.exec(content);
  while (match !== null) {
    matches.push(match[1]);
    match = thinkTagRegex.exec(content);
  }

  const reasoning = matches.join('\n\n');
  const cleanContent = content.replace(thinkTagRegex, '').trim();

  return {
    reasoning,
    content: cleanContent,
  };
}

// Server-Sent Events formatter
export function formatSSEChunk(chunk: StreamChunk): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

// Create a streaming response for API routes
export function createStreamingResponse(
  stream: AsyncIterable<StreamChunk>,
  headers: Record<string, string> = {},
): Response {
  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const sseChunk = formatSSEChunk(chunk);
          controller.enqueue(encoder.encode(sseChunk));
        }
      } catch (error) {
        const errorChunk = formatSSEChunk({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        controller.enqueue(encoder.encode(errorChunk));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...headers,
    },
  });
}

// Word-based chunking for smooth streaming (replacement for smoothStream)
export function createWordChunker(text: string): string[] {
  const words = text.split(/(\s+)/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const word of words) {
    currentChunk += word;
    if (word.includes(' ') || currentChunk.length > 10) {
      chunks.push(currentChunk);
      currentChunk = '';
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}
