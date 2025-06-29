'use client';

import { useOpenAIChat } from '@/hooks/use-openai-chat';
import type { OpenAIMessage } from '@/lib/types/openai';
import { useState } from 'react';

/**
 * Test component for the new useOpenAIChat hook
 *
 * This validates that our OpenAI SDK migration works correctly
 * with the existing API endpoints before full migration.
 */
export function ChatOpenAITest({
  chatId = 'test-openai-chat',
  initialMessages = [],
}: {
  chatId?: string;
  initialMessages?: OpenAIMessage[];
}) {
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setDebugLogs((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  };

  const {
    messages,
    input,
    setInput,
    status,
    error,
    sendMessage,
    stop,
    retryLastMessage,
    clearChat,
  } = useOpenAIChat({
    id: chatId,
    initialMessages,
    selectedChatModel: 'gemini-flash-lite',
    selectedVisibilityType: 'private',
    onFinish: (message) => {
      addLog(`✅ Message finished: ${message.content.substring(0, 50)}...`);
    },
    onError: (error) => {
      addLog(`❌ Error: ${error.message}`);
    },
    onResponse: (response) => {
      addLog(`📡 Response received: ${response.status} ${response.statusText}`);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      addLog(`📤 Sending message: ${input}`);
      await sendMessage(input.trim());
    }
  };

  const testMessages = [
    'Hello, can you help me test the new OpenAI integration?',
    'What is the weather like?',
    'Can you create a simple JavaScript function?',
  ];

  const sendTestMessage = async (message: string) => {
    addLog(`🧪 Test message: ${message}`);
    await sendMessage(message);
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4 space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-blue-800 mb-2">
          🧪 OpenAI Chat Hook Test
        </h2>
        <p className="text-blue-600 text-sm">
          Testing the new useOpenAIChat hook implementation. Status:{' '}
          <span className="font-mono">{status}</span>
        </p>
        {error && (
          <p className="text-red-600 text-sm mt-2">Error: {error.message}</p>
        )}
      </div>

      {/* Quick Test Buttons */}
      <div className="flex flex-wrap gap-2">
        {testMessages.map((message, index) => (
          <button
            key={`test-${message.slice(0, 20)}`}
            type="button"
            onClick={() => sendTestMessage(message)}
            disabled={status === 'loading' || status === 'streaming'}
            className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
          >
            Test {index + 1}
          </button>
        ))}
        <button
          type="button"
          onClick={retryLastMessage}
          disabled={
            status === 'loading' ||
            status === 'streaming' ||
            messages.length === 0
          }
          className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 disabled:opacity-50"
        >
          Retry Last
        </button>
        <button
          type="button"
          onClick={clearChat}
          className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          Clear Chat
        </button>
        {status === 'streaming' && (
          <button
            type="button"
            onClick={stop}
            className="px-3 py-1 text-sm bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
          >
            Stop
          </button>
        )}
      </div>

      {/* Messages Display */}
      <div className="flex-1 border rounded-lg overflow-hidden">
        <div className="h-64 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {messages.length === 0 ? (
            <p className="text-gray-500 text-center">
              No messages yet. Try sending a test message!
            </p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`p-3 rounded-lg max-w-[80%] ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white ml-auto'
                    : message.role === 'assistant'
                      ? 'bg-white border'
                      : 'bg-gray-200'
                }`}
              >
                <div className="text-xs opacity-70 mb-1">
                  {message.role} • {message.createdAt?.toLocaleTimeString()}
                </div>
                <div className="whitespace-pre-wrap">
                  {message.content ||
                    (status === 'streaming' && message.role === 'assistant'
                      ? '...'
                      : '')}
                </div>
                {message.tool_calls && (
                  <div className="mt-2 text-xs bg-gray-100 p-2 rounded">
                    <strong>Tool Calls:</strong>
                    <pre className="mt-1">
                      {JSON.stringify(message.tool_calls, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={status === 'loading' || status === 'streaming'}
          className="flex-1 px-3 py-2 border rounded-lg disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={
            !input.trim() || status === 'loading' || status === 'streaming'
          }
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
        >
          {status === 'loading'
            ? 'Sending...'
            : status === 'streaming'
              ? 'Streaming...'
              : 'Send'}
        </button>
      </form>

      {/* Debug Logs */}
      <div className="bg-gray-100 rounded-lg p-3">
        <h3 className="text-sm font-semibold mb-2">Debug Logs:</h3>
        <div className="text-xs space-y-1 max-h-32 overflow-y-auto font-mono">
          {debugLogs.length === 0 ? (
            <p className="text-gray-500">No logs yet...</p>
          ) : (
            debugLogs.map((log) => (
              <div key={log} className="text-gray-700">
                {log}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Implementation Status */}
      <div className="text-xs text-gray-500 border-t pt-2">
        <strong>Implementation Status:</strong>
        <ul className="list-disc list-inside mt-1 space-y-1">
          <li>✅ OpenAI message format</li>
          <li>✅ Manual streaming with ReadableStream</li>
          <li>✅ Tool calls support (ready for testing)</li>
          <li>✅ Error handling and abort controller</li>
          <li>✅ Legacy compatibility methods</li>
          <li>⏳ Integration with existing components (Phase 2)</li>
        </ul>
      </div>
    </div>
  );
}
