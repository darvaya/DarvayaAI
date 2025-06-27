import { convertToOpenAITool } from '../tools-handler';
import type { ToolExecutor, ToolExecutionContext } from '../tools-handler';
import type { CustomDataStreamWriter } from '../streaming';
import { generateUUID } from '@/lib/utils';
import {
  artifactKinds,
  documentHandlersByArtifactKind,
} from '@/lib/artifacts/server';

// Tool executor function
const createDocumentExecutor: ToolExecutor = async (args, context) => {
  try {
    const { title, kind } = args;
    const { session, dataStream } = context;

    // Validate input parameters
    if (typeof title !== 'string' || !title.trim()) {
      return {
        success: false,
        error: 'Invalid title: must be a non-empty string',
      };
    }

    if (typeof kind !== 'string' || !artifactKinds.includes(kind as any)) {
      return {
        success: false,
        error: `Invalid kind: must be one of ${artifactKinds.join(', ')}`,
      };
    }

    if (!session?.user?.id) {
      return {
        success: false,
        error: 'User session required to create documents',
      };
    }

    if (!dataStream) {
      return {
        success: false,
        error: 'Data stream required for document creation',
      };
    }

    console.log(`Creating document: "${title}" of type "${kind}"`);

    const id = generateUUID();

    // Send document metadata to the client via data stream
    dataStream.writeData({
      type: 'kind',
      content: kind,
    });

    dataStream.writeData({
      type: 'id',
      content: id,
    });

    dataStream.writeData({
      type: 'title',
      content: title,
    });

    dataStream.writeData({
      type: 'clear',
      content: '',
    });

    // Find the appropriate document handler
    const documentHandler = documentHandlersByArtifactKind.find(
      (handler) => handler.kind === kind,
    );

    if (!documentHandler) {
      return {
        success: false,
        error: `No document handler found for kind: ${kind}`,
      };
    }

    // Create a compatibility wrapper for DataStreamWriter interface
    const dataStreamWrapper = {
      writeData: dataStream.writeData.bind(dataStream),
      writeMessageAnnotation:
        dataStream.writeMessageAnnotation.bind(dataStream),
      writeText: dataStream.writeText.bind(dataStream),
      // Add minimal stubs for unused methods to satisfy the interface
      write: () => {},
      writeSource: () => {},
      merge: () => {},
      onError: () => {},
    };

    // Execute the document creation
    await documentHandler.onCreateDocument({
      id,
      title,
      dataStream: dataStreamWrapper as any, // Type assertion to bypass interface mismatch
      session,
    });

    // Signal completion
    dataStream.writeData({ type: 'finish', content: '' });

    return {
      success: true,
      result: {
        id,
        title,
        kind,
        content: 'A document was created and is now visible to the user.',
      },
    };
  } catch (error) {
    console.error('Create document tool error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

// OpenAI function definition
const createDocumentToolDefinition = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'The title of the document to create',
      minLength: 1,
      maxLength: 200,
    },
    kind: {
      type: 'string',
      description: 'The type of document to create',
      enum: [...artifactKinds],
    },
  },
  required: ['title', 'kind'],
};

// Register the tool with our system
convertToOpenAITool(
  'createDocument',
  'Create a document for writing or content creation activities. This tool will call other functions that will generate the contents of the document based on the title and kind.',
  createDocumentToolDefinition,
  createDocumentExecutor,
);

// Export for direct usage if needed
export { createDocumentExecutor };
export const createDocumentToolName = 'createDocument';
