#!/usr/bin/env node

// Simple test to check streaming API
async function testStreaming() {
  console.log('🧪 Testing streaming API...');

  const testPayload = {
    id: `test-${Date.now()}`,
    message: {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: 'Hello, how are you?',
      parts: [{ type: 'text', text: 'Hello, how are you?' }],
    },
    selectedChatModel: 'gemini-flash-lite',
    selectedVisibilityType: 'private',
  };

  try {
    const response = await fetch(
      'https://darvayaai-production.up.railway.app/api/chat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TestScript/1.0',
        },
        body: JSON.stringify(testPayload),
      },
    );

    console.log('📊 Response status:', response.status);
    console.log(
      '📊 Response headers:',
      Object.fromEntries(response.headers.entries()),
    );

    if (!response.ok) {
      const text = await response.text();
      console.log('❌ Error response:', text);
      return;
    }

    if (response.body) {
      const reader = response.body.getReader();
      let chunks = 0;
      let totalData = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.log('✅ Stream completed');
            break;
          }

          chunks++;
          const text = new TextDecoder().decode(value);
          totalData += text;

          console.log(
            `📦 Chunk ${chunks}:`,
            text.substring(0, 100) + (text.length > 100 ? '...' : ''),
          );

          if (chunks > 20) {
            console.log('⚠️  Too many chunks, stopping test');
            break;
          }
        }
      } finally {
        reader.releaseLock();
      }

      console.log('📈 Total chunks received:', chunks);
      console.log('📊 Total data length:', totalData.length);

      if (totalData.length === 0) {
        console.log('❌ No data received from stream');
      } else {
        console.log('✅ Streaming appears to be working');
      }
    } else {
      console.log('❌ No response body');
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testStreaming();
