'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  OpenAIMessage,
  OpenAIChatOptions,
  OpenAIChatHelpers,
  ChatStatus,
  Attachment,
  StreamingChunk,
} from '@/lib/types/openai';
import {
  createUserMessage,
  createAssistantMessage,
  convertMessagesToOpenAI,
  getLastUserMessage,
  removeIncompleteAssistantMessages,
  generateMessageId,
  sanitizeMessageContent,
} from '@/lib/utils/message-formatting';
import { ChatError } from '@/lib/types/openai';

/**
 * Core OpenAI-compatible chat hook
 *
 * Replaces Vercel AI SDK's useChat with direct OpenAI message format
 * and manual streaming implementation for better control and debugging.
 */
export function useOpenAIChat(
  options: OpenAIChatOptions & {
    selectedChatModel?: string;
    selectedVisibilityType?: 'public' | 'private';
  },
): OpenAIChatHelpers {
  const {
    id,
    initialMessages = [],
    onFinish,
    onError,
    onResponse,
    selectedChatModel = 'gemini-flash-lite',
    selectedVisibilityType = 'private',
  } = options;

  // Convert initial messages to OpenAI format
  const [messages, setMessages] = useState<OpenAIMessage[]>(() =>
    convertMessagesToOpenAI(initialMessages),
  );

  const [input, setInput] = useState('');
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  // Abort controller for canceling requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Track current streaming message ID
  const streamingMessageIdRef = useRef<string | null>(null);

  // Clear error when starting new requests
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Stop current request
  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus('idle');
    streamingMessageIdRef.current = null;
  }, []);

  // Add a message to the conversation
  const addMessage = useCallback((message: OpenAIMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  // Process streaming response
  const processStreamingResponse = useCallback(
    async (response: Response, assistantMessageId: string) => {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new ChatError('No response body available');
      }

      let currentContent = '';
      let toolCalls: any[] = [];

      try {
        setStatus('streaming');

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter((line) => line.trim());

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);

              if (data === '[DONE]') {
                continue;
              }

              try {
                const parsed: StreamingChunk = JSON.parse(data);

                // Handle error in stream
                if (parsed.error) {
                  throw new ChatError(
                    parsed.error.message,
                    undefined,
                    parsed.error.type,
                  );
                }

                const delta = parsed.choices?.[0]?.delta;

                if (delta?.content) {
                  currentContent += delta.content;

                  // Update message in real-time
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: currentContent }
                        : msg,
                    ),
                  );
                }

                // Handle tool calls
                if (delta?.tool_calls) {
                  toolCalls = [...toolCalls, ...delta.tool_calls];

                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, tool_calls: toolCalls }
                        : msg,
                    ),
                  );
                }
              } catch (parseError) {
                console.warn('Failed to parse streaming chunk:', parseError);
                // Continue processing other chunks
              }
            }
          }
        }

        // Finalize the message
        const finalMessage: OpenAIMessage = {
          id: assistantMessageId,
          role: 'assistant',
          content: currentContent,
          ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
          createdAt: new Date(),
        };

        // Update final message
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId ? finalMessage : msg,
          ),
        );

        // Call onFinish callback
        if (onFinish) {
          onFinish(finalMessage);
        }
      } finally {
        reader.releaseLock();
        setStatus('idle');
        streamingMessageIdRef.current = null;
      }
    },
    [onFinish],
  );

  // Send a message to the API
  const sendMessage = useCallback(
    async (content: string, attachments: Attachment[] = []) => {
      if (!content.trim()) {
        return;
      }

      clearError();

      // Create user message
      const userMessage = createUserMessage(content, attachments);
      const assistantMessageId = generateMessageId();

      // Add user message immediately
      setMessages((prev) => [...prev, userMessage]);

      // Clear input
      setInput('');

      // Add empty assistant message for streaming
      const initialAssistantMessage = createAssistantMessage('');
      initialAssistantMessage.id = assistantMessageId;
      setMessages((prev) => [...prev, initialAssistantMessage]);

      // Track streaming message
      streamingMessageIdRef.current = assistantMessageId;

      try {
        setStatus('loading');

        // Create abort controller
        abortControllerRef.current = new AbortController();

        // Prepare request in the format expected by the API
        const requestBody = {
          id,
          message: {
            id: userMessage.id,
            createdAt: userMessage.createdAt,
            role: userMessage.role,
            content: userMessage.content,
            parts: [{ type: 'text' as const, text: userMessage.content }],
            experimental_attachments: attachments,
          },
          selectedChatModel,
          selectedVisibilityType,
        };

        // Make API call
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current.signal,
        });

        // Call onResponse callback
        if (onResponse) {
          onResponse(response);
        }

        if (!response.ok) {
          const errorData = await response.text();
          let errorMessage = `HTTP ${response.status}`;

          try {
            const parsed = JSON.parse(errorData);
            errorMessage =
              parsed.error?.message || parsed.message || errorMessage;
          } catch {
            errorMessage = errorData || errorMessage;
          }

          throw new ChatError(errorMessage, response.status);
        }

        // Process streaming response
        await processStreamingResponse(response, assistantMessageId);
      } catch (err) {
        // Remove the empty assistant message on error
        setMessages((prev) =>
          prev.filter((msg) => msg.id !== assistantMessageId),
        );

        const chatError =
          err instanceof ChatError
            ? err
            : new ChatError(
                err instanceof Error
                  ? err.message
                  : 'An unexpected error occurred',
              );

        setError(chatError);
        setStatus('error');

        if (onError) {
          onError(chatError);
        }

        console.error('Chat error:', chatError);
      } finally {
        abortControllerRef.current = null;
      }
    },
    [id, clearError, processStreamingResponse, onResponse, onError],
  );

  // Retry the last message
  const retryLastMessage = useCallback(async () => {
    const lastUserMessage = getLastUserMessage(messages);

    if (!lastUserMessage) {
      return;
    }

    // Remove incomplete assistant messages
    const cleanedMessages = removeIncompleteAssistantMessages(messages);
    setMessages(cleanedMessages);

    // Resend the last user message
    await sendMessage(lastUserMessage.content);
  }, [messages, sendMessage]);

  // Clear the entire conversation
  const clearChat = useCallback(() => {
    stop();
    setMessages([]);
    setInput('');
    clearError();
  }, [stop, clearError]);

  // Legacy compatibility methods for gradual migration
  const handleSubmit = useCallback(
    (event?: React.FormEvent) => {
      if (event) {
        event.preventDefault();
      }

      if (input.trim()) {
        sendMessage(input.trim());
      }
    },
    [input, sendMessage],
  );

  const append = useCallback(
    (message: Partial<OpenAIMessage>) => {
      const fullMessage: OpenAIMessage = {
        id: message.id || generateMessageId(),
        role: message.role || 'user',
        content: sanitizeMessageContent(message.content),
        createdAt: message.createdAt || new Date(),
        ...(message.tool_calls && { tool_calls: message.tool_calls }),
        ...(message.tool_call_id && { tool_call_id: message.tool_call_id }),
      };

      if (fullMessage.role === 'user') {
        sendMessage(fullMessage.content);
      } else {
        addMessage(fullMessage);
      }
    },
    [sendMessage, addMessage],
  );

  const reload = useCallback(async () => {
    await retryLastMessage();
  }, [retryLastMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    // Core state
    messages,
    input,
    status,
    error,

    // Core actions
    sendMessage,
    addMessage,
    setInput,
    retryLastMessage,
    stop,

    // State management
    setMessages,
    clearChat,

    // Legacy compatibility
    handleSubmit,
    append,
    reload,
  };
}
