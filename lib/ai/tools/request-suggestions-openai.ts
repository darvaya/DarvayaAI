import { convertToOpenAITool } from '../tools-handler';
import type { ToolExecutor, } from '../tools-handler';
import { getDocumentById, saveSuggestions } from '@/lib/db/queries';
import type { Suggestion } from '@/lib/db/schema';
import { generateUUID } from '@/lib/utils';
import {
  openRouterClient,
  getModelName,
  getModelConfig,
} from '../openrouter-client';

// Tool executor function
const requestSuggestionsExecutor: ToolExecutor = async (args, context) => {
  try {
    const { documentId } = args;
    const { session, dataStream } = context;

    // Validate input parameters
    if (typeof documentId !== 'string' || !documentId.trim()) {
      return {
        success: false,
        error: 'Invalid documentId: must be a non-empty string',
      };
    }

    if (!session?.user?.id) {
      return {
        success: false,
        error: 'User session required to request suggestions',
      };
    }

    if (!dataStream) {
      return {
        success: false,
        error: 'Data stream required for suggestions',
      };
    }

    console.log(`Requesting suggestions for document: ${documentId}`);

    // Get the document
    const document = await getDocumentById({ id: documentId });

    if (!document || !document.content) {
      return {
        success: false,
        error: 'Document not found or has no content',
      };
    }

    if (!openRouterClient) {
      return {
        success: false,
        error: 'OpenRouter client not initialized',
      };
    }

    const suggestions: Array<
      Omit<Suggestion, 'userId' | 'createdAt' | 'documentCreatedAt'>
    > = [];

    // Use artifact model for suggestions
    const modelName = getModelName('artifact-model');
    const modelConfig = getModelConfig('artifact-model');

    // Create structured output request for suggestions
    const client = openRouterClient();
    const response = await client.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful writing assistant. Given a piece of writing, please offer suggestions to improve the piece of writing and describe the change. It is very important for the edits to contain full sentences instead of just words. Max 5 suggestions. Respond with a JSON array of objects with fields: originalSentence, suggestedSentence, and description.',
        },
        {
          role: 'user',
          content: document.content,
        },
      ],
      ...modelConfig,
      // Request JSON response
      response_format: { type: 'json_object' },
    });

    let suggestionsData: any[];
    try {
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content received');
      }

      // Parse the JSON response
      const parsed = JSON.parse(content);

      // Handle different possible response formats
      suggestionsData = Array.isArray(parsed)
        ? parsed
        : parsed.suggestions || [];
    } catch (parseError) {
      console.error('Failed to parse suggestions response:', parseError);
      return {
        success: false,
        error: 'Failed to parse suggestions from AI response',
      };
    }

    // Process and stream each suggestion
    for (const element of suggestionsData) {
      if (
        !element.originalSentence ||
        !element.suggestedSentence ||
        !element.description
      ) {
        console.warn('Skipping invalid suggestion:', element);
        continue;
      }

      const suggestion = {
        originalText: element.originalSentence,
        suggestedText: element.suggestedSentence,
        description: element.description,
        id: generateUUID(),
        documentId: documentId,
        isResolved: false,
      };

      // Stream the suggestion to the client
      dataStream.writeData({
        type: 'suggestion',
        content: suggestion,
      });

      suggestions.push(suggestion);
    }

    // Save suggestions to database
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
      success: true,
      result: {
        id: documentId,
        title: document.title,
        kind: document.kind,
        message: 'Suggestions have been added to the document',
        suggestionsCount: suggestions.length,
      },
    };
  } catch (error) {
    console.error('Request suggestions tool error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

// OpenAI function definition
const requestSuggestionsToolDefinition = {
  type: 'object',
  properties: {
    documentId: {
      type: 'string',
      description: 'The ID of the document to request suggestions for',
      minLength: 1,
    },
  },
  required: ['documentId'],
};

// Register the tool with our system
convertToOpenAITool(
  'requestSuggestions',
  'Request suggestions for a document',
  requestSuggestionsToolDefinition,
  requestSuggestionsExecutor,
);

// Export for direct usage if needed
export { requestSuggestionsExecutor };
export const requestSuggestionsToolName = 'requestSuggestions';
