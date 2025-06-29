'use client';

import { useState } from 'react';

export default function StreamingTest() {
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const testStreaming = async () => {
    setResponse('');
    setError('');
    setStatus('loading');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: '550e8400-e29b-41d4-a716-446655440000',
          message: {
            id: '550e8400-e29b-41d4-a716-446655440001',
            createdAt: new Date().toISOString(),
            role: 'user',
            content: 'Say hello',
            parts: [{ type: 'text', text: 'Say hello' }],
          },
          selectedChatModel: 'gemini-flash-lite',
          selectedVisibilityType: 'private',
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        setError(`HTTP ${res.status}: ${errorText}`);
        setStatus('error');
        return;
      }

      if (!res.body) {
        setError('No response body');
        setStatus('error');
        return;
      }

      setStatus('streaming');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('✅ Stream complete');
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        console.log('📦 Received chunk:', chunk);
        fullResponse += chunk;
        setResponse(fullResponse);
      }

      setStatus('complete');
    } catch (err) {
      console.error('❌ Streaming error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Streaming Test</h1>

      <button
        type="button"
        onClick={testStreaming}
        disabled={status === 'loading' || status === 'streaming'}
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 mb-4"
      >
        {status === 'loading' || status === 'streaming'
          ? 'Testing...'
          : 'Test Streaming'}
      </button>

      <div className="mb-4">
        <strong>Status:</strong> {status}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="p-4 bg-gray-100 rounded">
        <strong>Raw Response:</strong>
        <pre className="whitespace-pre-wrap font-mono text-sm mt-2">
          {response || 'No response yet...'}
        </pre>
      </div>
    </div>
  );
}
