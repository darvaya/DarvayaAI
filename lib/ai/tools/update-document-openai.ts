import { convertToOpenAITool } from '../tools-handler';
import type { ToolExecutor } from '../tools-handler';
import { getDocumentById } from '@/lib/db/queries';
import { documentHandlersByArtifactKind } from '@/lib/artifacts/server';

// Tool executor function
const updateDocumentExecutor: ToolExecutor = async (args, context) => {
  try {
    const { id, description } = args;
    const { session, dataStream } = context;

    // Validate input parameters
    if (typeof id !== 'string' || !id.trim()) {
      return {
        success: false,
        error: 'Invalid id: must be a non-empty string',
      };
    }

    if (typeof description !== 'string' || !description.trim()) {
      return {
        success: false,
        error: 'Invalid description: must be a non-empty string',
      };
    }

    if (!session?.user?.id) {
      return {
        success: false,
        error: 'User session required to update documents',
      };
    }

    if (!dataStream) {
      return {
        success: false,
        error: 'Data stream required for document updates',
      };
    }

    console.log(`Updating document ${id} with description: "${description}"`);

    // Get the document
    const document = await getDocumentById({ id });

    if (!document) {
      return {
        success: false,
        error: 'Document not found',
      };
    }

    // Send clear signal to client
    dataStream.writeData({
      type: 'clear',
      content: document.title,
    });

    // Find the appropriate document handler
    const documentHandler = documentHandlersByArtifactKind.find(
      (handler) => handler.kind === document.kind,
    );

    if (!documentHandler) {
      return {
        success: false,
        error: `No document handler found for kind: ${document.kind}`,
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

    // Execute the document update
    await documentHandler.onUpdateDocument({
      document,
      description,
      dataStream: dataStreamWrapper as any, // Type assertion to bypass interface mismatch
      session,
    });

    // Don't send finish event here - let the main stream handler control completion

    return {
      success: true,
      result: {
        id,
        title: document.title,
        kind: document.kind,
        content: 'The document has been updated successfully.',
      },
    };
  } catch (error) {
    console.error('Update document tool error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

// OpenAI function definition
const updateDocumentToolDefinition = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      description: 'The ID of the document to update',
      minLength: 1,
    },
    description: {
      type: 'string',
      description: 'The description of changes that need to be made',
      minLength: 1,
      maxLength: 1000,
    },
  },
  required: ['id', 'description'],
};

// Register the tool with our system
convertToOpenAITool(
  'updateDocument',
  'Update a document with the given description.',
  updateDocumentToolDefinition,
  updateDocumentExecutor,
);

// Export for direct usage if needed
export { updateDocumentExecutor };
export const updateDocumentToolName = 'updateDocument';
