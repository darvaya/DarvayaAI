import { expect, test } from '../fixtures';
import { generateUUID } from '@/lib/utils';
import {
  convertMessagesToOpenAI,
  createUserMessage,
  validateOpenAIMessage,
} from '@/lib/utils/message-formatting';
import type { OpenAIMessage } from '@/lib/types/openai';

test.describe('OpenAI Chat Implementation Unit Tests', () => {
  test.describe('Message Formatting Utilities', () => {
    test('convertMessagesToOpenAI should handle UIMessage format correctly', async () => {
      const uiMessages = [
        {
          id: generateUUID(),
          role: 'user' as const,
          content: 'Hello world',
          parts: [{ type: 'text' as const, text: 'Hello world' }],
          createdAt: new Date(),
        },
        {
          id: generateUUID(),
          role: 'assistant' as const,
          content: 'Hi there!',
          parts: [{ type: 'text' as const, text: 'Hi there!' }],
          createdAt: new Date(),
        },
      ];

      const openAIMessages = convertMessagesToOpenAI(uiMessages);

      expect(openAIMessages).toHaveLength(2);
      expect(openAIMessages[0]).toMatchObject({
        role: 'user',
        content: 'Hello world',
      });
      expect(openAIMessages[1]).toMatchObject({
        role: 'assistant',
        content: 'Hi there!',
      });
    });

    test('convertMessagesToOpenAI should handle already converted OpenAI messages', async () => {
      const openAIMessages: OpenAIMessage[] = [
        {
          id: generateUUID(),
          role: 'user',
          content: 'Test message',
          createdAt: new Date(),
        },
      ];

      const result = convertMessagesToOpenAI(openAIMessages);

      expect(result).toEqual(openAIMessages);
      expect(result[0].content).toBe('Test message');
    });

    test('convertMessagesToOpenAI should handle complex parts arrays', async () => {
      const complexMessage = {
        id: generateUUID(),
        role: 'user' as const,
        content: '', // Empty content but has parts
        parts: [
          { type: 'text' as const, text: 'Hello ' },
          { type: 'text' as const, text: 'world!' },
        ],
        createdAt: new Date(),
      };

      const result = convertMessagesToOpenAI([complexMessage]);

      expect(result[0].content).toBe('Hello world!');
    });

    test('createUserMessage should generate valid OpenAI messages', async () => {
      const message = createUserMessage('Test content');

      expect(message.id).toBeDefined();
      expect(message.role).toBe('user');
      expect(message.content).toBe('Test content');
      expect(message.createdAt).toBeInstanceOf(Date);
    });

    test('validateMessage should catch invalid messages', async () => {
      const validMessage: OpenAIMessage = {
        id: generateUUID(),
        role: 'user',
        content: 'Valid message',
        createdAt: new Date(),
      };

      const invalidMessage = {
        role: 'invalid_role',
        content: '',
      } as any;

      expect(validateOpenAIMessage(validMessage)).toBe(true);
      expect(validateOpenAIMessage(invalidMessage)).toBe(false);
    });
  });

  test.describe('Chat API Integration', () => {
    test('OpenAI format messages should work with chat API', async ({
      adaContext,
    }) => {
      const chatId = generateUUID();

      // Test with OpenAI-formatted message
      const openAIMessage: OpenAIMessage = {
        id: generateUUID(),
        role: 'user',
        content: 'What is the capital of France?',
        createdAt: new Date(),
      };

      const response = await adaContext.request.post('/api/chat', {
        data: {
          id: chatId,
          message: openAIMessage,
          selectedChatModel: 'chat-model',
          selectedVisibilityType: 'private',
        },
      });

      expect(response.status()).toBe(200);

      const responseText = await response.text();
      expect(responseText).toBeTruthy();

      // Should contain streaming response
      const lines = responseText.split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);
    });

    test('Mixed message formats should be handled correctly', async ({
      adaContext,
    }) => {
      const chatId = generateUUID();

      // First send a message with parts format (legacy)
      const legacyMessage = {
        id: generateUUID(),
        role: 'user',
        content: 'Hello',
        parts: [{ type: 'text', text: 'Hello' }],
        createdAt: new Date().toISOString(),
      };

      const firstResponse = await adaContext.request.post('/api/chat', {
        data: {
          id: chatId,
          message: legacyMessage,
          selectedChatModel: 'chat-model',
          selectedVisibilityType: 'private',
        },
      });

      expect(firstResponse.status()).toBe(200);

      // Then send an OpenAI format message
      const openAIMessage: OpenAIMessage = {
        id: generateUUID(),
        role: 'user',
        content: 'Follow up question',
        createdAt: new Date(),
      };

      const secondResponse = await adaContext.request.post('/api/chat', {
        data: {
          id: chatId,
          message: openAIMessage,
          selectedChatModel: 'chat-model',
          selectedVisibilityType: 'private',
        },
      });

      expect(secondResponse.status()).toBe(200);
    });

    test('Error handling with malformed OpenAI messages', async ({
      adaContext,
    }) => {
      const chatId = generateUUID();

      // Test with missing required fields
      const malformedMessage = {
        role: 'user',
        // Missing content
      };

      const response = await adaContext.request.post('/api/chat', {
        data: {
          id: chatId,
          message: malformedMessage,
          selectedChatModel: 'chat-model',
          selectedVisibilityType: 'private',
        },
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe('Streaming Response Format', () => {
    test('Streaming responses should maintain OpenAI format', async ({
      adaContext,
    }) => {
      const chatId = generateUUID();

      const message: OpenAIMessage = {
        id: generateUUID(),
        role: 'user',
        content: 'Count to 3',
        createdAt: new Date(),
      };

      const response = await adaContext.request.post('/api/chat', {
        data: {
          id: chatId,
          message: message,
          selectedChatModel: 'chat-model',
          selectedVisibilityType: 'private',
        },
      });

      expect(response.status()).toBe(200);

      const responseText = await response.text();
      const lines = responseText.split('\n').filter(Boolean);

      // Check that streaming format is consistent
      expect(lines.length).toBeGreaterThan(0);

      // Should contain proper streaming events
      const hasAppendMessage = lines.some((line) =>
        line.includes('append-message'),
      );
      expect(hasAppendMessage).toBe(true);
    });

    test('Tool calls should work with OpenAI format', async ({
      adaContext,
    }) => {
      const chatId = generateUUID();

      const toolMessage: OpenAIMessage = {
        id: generateUUID(),
        role: 'user',
        content: 'What is the weather in Paris?',
        createdAt: new Date(),
      };

      const response = await adaContext.request.post('/api/chat', {
        data: {
          id: chatId,
          message: toolMessage,
          selectedChatModel: 'chat-model',
          selectedVisibilityType: 'private',
        },
      });

      expect(response.status()).toBe(200);

      const responseText = await response.text();

      // Should handle tool calls properly
      expect(responseText).toBeTruthy();

      // Check for tool-related streaming events
      const lines = responseText.split('\n').filter(Boolean);
      const hasToolEvents = lines.some(
        (line) => line.includes('tool-call') || line.includes('tool-result'),
      );

      // Tool events may or may not occur depending on the model's decision
      // But the response should be valid regardless
      expect(lines.length).toBeGreaterThan(0);
    });
  });

  test.describe('Performance and Error Recovery', () => {
    test('Large message handling', async ({ adaContext }) => {
      const chatId = generateUUID();

      // Create a large message content
      const largeContent = `${'A'.repeat(1000)} What is this?`;

      const message: OpenAIMessage = {
        id: generateUUID(),
        role: 'user',
        content: largeContent,
        createdAt: new Date(),
      };

      const response = await adaContext.request.post('/api/chat', {
        data: {
          id: chatId,
          message: message,
          selectedChatModel: 'chat-model',
          selectedVisibilityType: 'private',
        },
      });

      expect(response.status()).toBe(200);
    });

    test('Concurrent requests with OpenAI format', async ({ adaContext }) => {
      const requests = Array.from({ length: 3 }, (_, i) => {
        const chatId = generateUUID();
        const message: OpenAIMessage = {
          id: generateUUID(),
          role: 'user',
          content: `Test message ${i + 1}`,
          createdAt: new Date(),
        };

        return adaContext.request.post('/api/chat', {
          data: {
            id: chatId,
            message: message,
            selectedChatModel: 'chat-model',
            selectedVisibilityType: 'private',
          },
        });
      });

      const responses = await Promise.all(requests);

      // All requests should succeed
      responses.forEach((response) => {
        expect(response.status()).toBe(200);
      });
    });

    test('Invalid UTF-8 content handling', async ({ adaContext }) => {
      const chatId = generateUUID();

      const message: OpenAIMessage = {
        id: generateUUID(),
        role: 'user',
        content: 'Hello 🌍 world with emojis and special chars: àáâãäåæçèéêë',
        createdAt: new Date(),
      };

      const response = await adaContext.request.post('/api/chat', {
        data: {
          id: chatId,
          message: message,
          selectedChatModel: 'chat-model',
          selectedVisibilityType: 'private',
        },
      });

      expect(response.status()).toBe(200);
    });
  });

  test.describe('Backward Compatibility', () => {
    test('Legacy parts format should still work', async ({ adaContext }) => {
      const chatId = generateUUID();

      // Test the old Vercel AI SDK format
      const legacyMessage = {
        id: generateUUID(),
        role: 'user',
        content: 'Legacy format test',
        parts: [
          { type: 'text', text: 'Legacy ' },
          { type: 'text', text: 'format test' },
        ],
        createdAt: new Date().toISOString(),
      };

      const response = await adaContext.request.post('/api/chat', {
        data: {
          id: chatId,
          message: legacyMessage,
          selectedChatModel: 'chat-model',
          selectedVisibilityType: 'private',
        },
      });

      expect(response.status()).toBe(200);

      const responseText = await response.text();
      expect(responseText).toBeTruthy();
    });

    test('Mixed format conversation should work seamlessly', async ({
      adaContext,
    }) => {
      const chatId = generateUUID();

      // Start with legacy format
      const legacyMessage = {
        id: generateUUID(),
        role: 'user',
        content: 'Start conversation',
        parts: [{ type: 'text', text: 'Start conversation' }],
        createdAt: new Date().toISOString(),
      };

      const firstResponse = await adaContext.request.post('/api/chat', {
        data: {
          id: chatId,
          message: legacyMessage,
          selectedChatModel: 'chat-model',
          selectedVisibilityType: 'private',
        },
      });

      expect(firstResponse.status()).toBe(200);

      // Continue with OpenAI format
      const openAIMessage: OpenAIMessage = {
        id: generateUUID(),
        role: 'user',
        content: 'Continue conversation',
        createdAt: new Date(),
      };

      const secondResponse = await adaContext.request.post('/api/chat', {
        data: {
          id: chatId,
          message: openAIMessage,
          selectedChatModel: 'chat-model',
          selectedVisibilityType: 'private',
        },
      });

      expect(secondResponse.status()).toBe(200);
    });
  });
});
