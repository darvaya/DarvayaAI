import { openRouterClient, getModelName } from '@/lib/ai/openrouter-client';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { codePrompt, updateDocumentPrompt } from '@/lib/ai/prompts';

export const codeDocumentHandler = createDocumentHandler<'code'>({
  kind: 'code',
  onCreateDocument: async ({ title, dataStream }) => {
    const client = openRouterClient();
    if (!client) {
      throw new Error('OpenRouter client not initialized');
    }

    let draftContent = '';

    const stream = await client.chat.completions.create({
      model: getModelName('artifact-model'), // Use artifact-model mapping
      messages: [
        {
          role: 'system',
          content: codePrompt,
        },
        {
          role: 'user',
          content: title,
        },
      ],
      stream: true,
      temperature: 0.3,
      max_tokens: 4000,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        draftContent += content;
        dataStream.writeData({
          type: 'text-delta',
          content: content,
        });
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
      model: getModelName('artifact-model'), // Use artifact-model mapping
      messages: [
        {
          role: 'system',
          content: updateDocumentPrompt(document.content, 'code'),
        },
        {
          role: 'user',
          content: description,
        },
      ],
      stream: true,
      temperature: 0.3,
      max_tokens: 4000,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        draftContent += content;
        dataStream.writeData({
          type: 'text-delta',
          content: content,
        });
      }
    }

    return draftContent;
  },
});
