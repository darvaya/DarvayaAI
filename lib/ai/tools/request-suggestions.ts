import { z } from 'zod';
import type { Session } from 'next-auth';
import { type DataStreamWriter, tool } from 'ai';
import { getDocumentById, saveSuggestions } from '@/lib/db/queries';
import type { Suggestion } from '@/lib/db/schema';
import { generateUUID } from '@/lib/utils';
import { openRouterClient } from '../openrouter-client';

interface RequestSuggestionsProps {
  session: Session;
  dataStream: DataStreamWriter;
}

export const requestSuggestions = ({
  session,
  dataStream,
}: RequestSuggestionsProps) =>
  tool({
    description: 'Request suggestions for a document',
    parameters: z.object({
      documentId: z
        .string()
        .describe('The ID of the document to request edits'),
    }),
    execute: async ({ documentId }) => {
      const document = await getDocumentById({ id: documentId });

      if (!document || !document.content) {
        return {
          error: 'Document not found',
        };
      }

      const client = openRouterClient();
      if (!client) {
        throw new Error('OpenRouter client not initialized');
      }

      const suggestions: Array<
        Omit<Suggestion, 'userId' | 'createdAt' | 'documentCreatedAt'>
      > = [];

      // Since we can't use streamObject with OpenRouter directly, let's make a regular call
      const response = await client.chat.completions.create({
        model: 'x-ai/grok-2-1212', // artifact-model
        messages: [
          {
            role: 'system',
            content:
              'You are a help writing assistant. Given a piece of writing, please offer suggestions to improve the piece of writing and describe the change. It is very important for the edits to contain full sentences instead of just words. Max 5 suggestions. Return your response as a JSON array with objects containing: originalSentence, suggestedSentence, and description.',
          },
          {
            role: 'user',
            content: document.content,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return { error: 'No suggestions generated' };
      }

      try {
        const suggestionsData = JSON.parse(content);
        if (Array.isArray(suggestionsData)) {
          for (const item of suggestionsData) {
            const suggestion = {
              originalText: item.originalSentence || '',
              suggestedText: item.suggestedSentence || '',
              description: item.description || '',
              id: generateUUID(),
              documentId: documentId,
              isResolved: false,
            };

            dataStream.writeData({
              type: 'suggestion',
              content: suggestion,
            });

            suggestions.push(suggestion);
          }
        }
      } catch (error) {
        console.error('Error parsing suggestions:', error);
        return { error: 'Failed to parse suggestions' };
      }

      if (session.user?.id) {
        const userId = session.user.id;

        await saveSuggestions({
          suggestions: suggestions.map((suggestion) => ({
            ...suggestion,
            userId,
            createdAt: new Date(),
            documentCreatedAt: document.createdAt,
          })),
        });
      }

      return {
        id: documentId,
        title: document.title,
        kind: document.kind,
        message: 'Suggestions have been added to the document',
      };
    },
  });
