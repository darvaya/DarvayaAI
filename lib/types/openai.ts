/**
 * OpenAI-compatible types for frontend chat implementation
 *
 * These types align with OpenAI's ChatCompletion API format
 * while maintaining compatibility with our existing features.
 */

// Core OpenAI message types
export interface OpenAIMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string; // For tool response messages
  createdAt?: Date;
}

// Tool calling types (OpenAI format)
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

// Simplified attachment interface matching our usage
export interface Attachment {
  url: string;
  name: string;
  contentType: string;
}

// Chat status for UI state management
export type ChatStatus = 'idle' | 'loading' | 'streaming' | 'error';

// Core options for the useOpenAIChat hook
export interface OpenAIChatOptions {
  id: string;
  initialMessages?: OpenAIMessage[];
  onFinish?: (message: OpenAIMessage) => void;
  onError?: (error: Error) => void;
  onResponse?: (response: Response) => void;
}

// The main interface returned by useOpenAIChat
export interface OpenAIChatHelpers {
  // Core state
  messages: OpenAIMessage[];
  input: string;
  status: ChatStatus;
  error: Error | null;

  // Core actions
  sendMessage: (content: string, attachments?: Attachment[]) => Promise<void>;
  addMessage: (message: OpenAIMessage) => void;
  setInput: (input: string) => void;
  retryLastMessage: () => Promise<void>;
  stop: () => void;

  // State management
  setMessages: React.Dispatch<React.SetStateAction<OpenAIMessage[]>>;
  clearChat: () => void;

  // Legacy compatibility for gradual migration
  handleSubmit: (event?: React.FormEvent) => void;
  append: (message: Partial<OpenAIMessage>) => void;
  reload: () => Promise<void>;
}

// Request format for our /api/chat endpoint
export interface ChatRequest {
  id: string;
  message: OpenAIMessage;
  selectedChatModel?: string;
  selectedVisibilityType?: 'public' | 'private';
  attachments?: Attachment[];
}

// Streaming response chunk format
export interface StreamingChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      role?: string;
      tool_calls?: ToolCall[];
    };
    finish_reason?: string;
  }>;
  error?: {
    message: string;
    type: string;
  };
}

// Utility type for message generation
export type MessageRole = OpenAIMessage['role'];

// Error types
export class ChatError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ChatError';
  }
}
