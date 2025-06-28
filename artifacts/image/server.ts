import { openRouterClient, getModelName } from '@/lib/ai/openrouter-client';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { updateDocumentPrompt } from '@/lib/ai/prompts';

const imagePrompt = `Generate a detailed description for creating an image based on the user's request. Focus on visual elements, composition, style, and artistic details.`;

export const imageDocumentHandler = createDocumentHandler<'image'>({
  kind: 'image',
  onCreateDocument: async ({ title, dataStream }) => {
    const client = openRouterClient();
    if (!client) {
      throw new Error('OpenRouter client not initialized');
    }

    let draftContent = '';

    const stream = await client.chat.completions.create({
      model: getModelName('image-model'), // Use image-model mapping
      messages: [
        {
          role: 'system',
          content: imagePrompt,
        },
        {
          role: 'user',
          content: title,
        },
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 1000,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        draftContent += content;

        // CRITICAL FIX: Use coordinated streaming method if available
        if ('writeToolContentDelta' in dataStream) {
          // This is a CoordinatedDataStreamWriter, use the proper method
          (dataStream as any).writeToolContentDelta(content);
        } else {
          // Fallback for regular DataStreamWriter
          dataStream.writeData({
            type: 'text-delta',
            content: content,
          });
        }
      }
    }

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    const client = openRouterClient();
    if (!client) {
      throw new Error('OpenRouter client not initialized');
    }

    let draftContent = '';

    const stream = await client.chat.completions.create({
      model: getModelName('image-model'), // Use image-model mapping
      messages: [
        {
          role: 'system',
          content: updateDocumentPrompt(document.content, 'image'),
        },
        {
          role: 'user',
          content: description,
        },
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 1000,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        draftContent += content;

        // CRITICAL FIX: Use coordinated streaming method if available
        if ('writeToolContentDelta' in dataStream) {
          // This is a CoordinatedDataStreamWriter, use the proper method
          (dataStream as any).writeToolContentDelta(content);
        } else {
          // Fallback for regular DataStreamWriter
          dataStream.writeData({
            type: 'text-delta',
            content: content,
          });
        }
      }
    }

    return draftContent;
  },
});
