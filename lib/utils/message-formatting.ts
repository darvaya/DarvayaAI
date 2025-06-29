import type { OpenAIMessage, MessageRole } from '../types/openai';
import { generateUUID } from '../utils';

/**
 * Utility functions for OpenAI message formatting and conversion
 */

// Generate a unique message ID
export function generateMessageId(): string {
  return generateUUID();
}

// Create a user message in OpenAI format
export function createUserMessage(
  content: string,
  attachments?: Array<{ url: string; name: string; contentType: string }>,
): OpenAIMessage {
  return {
    id: generateMessageId(),
    role: 'user',
    content,
    createdAt: new Date(),
  };
}

// Create an assistant message in OpenAI format
export function createAssistantMessage(
  content = '',
  toolCalls?: OpenAIMessage['tool_calls'],
): OpenAIMessage {
  return {
    id: generateMessageId(),
    role: 'assistant',
    content,
    tool_calls: toolCalls,
    createdAt: new Date(),
  };
}

// Create a tool response message
export function createToolMessage(
  content: string,
  toolCallId: string,
): OpenAIMessage {
  return {
    id: generateMessageId(),
    role: 'tool',
    content,
    tool_call_id: toolCallId,
    createdAt: new Date(),
  };
}

// Convert from Vercel AI SDK UIMessage format to OpenAI format
export function convertUIMessageToOpenAI(uiMessage: any): OpenAIMessage {
  // Handle messages with 'parts' array (Vercel AI SDK format)
  if (uiMessage.parts && Array.isArray(uiMessage.parts)) {
    // Extract text content from parts
    const textParts = uiMessage.parts.filter(
      (part: any) => part.type === 'text',
    );
    const content = textParts.map((part: any) => part.text || '').join('');

    // Handle tool calls from parts
    const toolCallParts = uiMessage.parts.filter(
      (part: any) => part.type === 'tool-invocation',
    );
    const tool_calls = toolCallParts.map((part: any) => ({
      id: part.toolInvocation?.toolCallId || generateMessageId(),
      type: 'function' as const,
      function: {
        name: part.toolInvocation?.toolName || '',
        arguments: JSON.stringify(part.toolInvocation?.args || {}),
      },
    }));

    return {
      id: uiMessage.id || generateMessageId(),
      role: uiMessage.role || 'user',
      content,
      tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
      createdAt: uiMessage.createdAt
        ? new Date(uiMessage.createdAt)
        : new Date(),
    };
  }

  // Handle standard format (already mostly OpenAI compatible)
  return {
    id: uiMessage.id || generateMessageId(),
    role: uiMessage.role || 'user',
    content: uiMessage.content || '',
    tool_calls: uiMessage.tool_calls,
    tool_call_id: uiMessage.tool_call_id,
    createdAt: uiMessage.createdAt ? new Date(uiMessage.createdAt) : new Date(),
  };
}

// Convert array of messages from any format to OpenAI format
export function convertMessagesToOpenAI(messages: any[]): OpenAIMessage[] {
  return messages.map(convertUIMessageToOpenAI);
}

// Validate that a message has the correct OpenAI format
export function validateOpenAIMessage(message: any): message is OpenAIMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  // Check required fields
  if (!['user', 'assistant', 'system', 'tool'].includes(message.role)) {
    return false;
  }

  if (typeof message.content !== 'string') {
    return false;
  }

  // Validate tool calls if present
  if (message.tool_calls) {
    if (!Array.isArray(message.tool_calls)) {
      return false;
    }

    for (const toolCall of message.tool_calls) {
      if (!toolCall.id || !toolCall.function?.name) {
        return false;
      }
    }
  }

  return true;
}

// Clean and sanitize message content
export function sanitizeMessageContent(content: any): string {
  if (typeof content === 'string') {
    return content;
  }

  if (content && typeof content === 'object') {
    return JSON.stringify(content);
  }

  return String(content || '');
}

// Format messages for API request (removes UI-specific fields)
export function formatMessagesForAPI(
  messages: OpenAIMessage[],
): Omit<OpenAIMessage, 'id' | 'createdAt'>[] {
  return messages.map(({ id, createdAt, ...message }) => ({
    role: message.role,
    content: sanitizeMessageContent(message.content),
    ...(message.tool_calls && { tool_calls: message.tool_calls }),
    ...(message.tool_call_id && { tool_call_id: message.tool_call_id }),
  }));
}

// Get the last user message from a conversation
export function getLastUserMessage(
  messages: OpenAIMessage[],
): OpenAIMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i];
    }
  }
  return null;
}

// Get the last assistant message from a conversation
export function getLastAssistantMessage(
  messages: OpenAIMessage[],
): OpenAIMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      return messages[i];
    }
  }
  return null;
}

// Remove incomplete assistant messages (useful for retry)
export function removeIncompleteAssistantMessages(
  messages: OpenAIMessage[],
): OpenAIMessage[] {
  return messages.filter((message, index) => {
    // Keep all non-assistant messages
    if (message.role !== 'assistant') {
      return true;
    }

    // Keep assistant messages that have content or are the last message
    return message.content.trim().length > 0 || index === messages.length - 1;
  });
}

// Convert OpenAI message to UI message format (for compatibility)
export function convertOpenAIToUIMessage(message: OpenAIMessage): any {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    parts: [{ type: 'text', text: message.content }],
    createdAt: message.createdAt,
    ...(message.tool_calls && { tool_calls: message.tool_calls }),
    ...(message.tool_call_id && { tool_call_id: message.tool_call_id }),
  };
}

// Create a message for display purposes (adds default values)
export function createDisplayMessage(
  message: Partial<OpenAIMessage>,
): OpenAIMessage {
  return {
    id: message.id || generateMessageId(),
    role: message.role || 'user',
    content: sanitizeMessageContent(message.content),
    createdAt: message.createdAt || new Date(),
    ...(message.tool_calls && { tool_calls: message.tool_calls }),
    ...(message.tool_call_id && { tool_call_id: message.tool_call_id }),
  };
}
