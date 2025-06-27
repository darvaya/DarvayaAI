#!/usr/bin/env node

/**
 * Test script for OpenRouter integration
 *
 * Usage:
 *   node scripts/test-openrouter.js
 *   node scripts/test-openrouter.js "Custom test message"
 *   node scripts/test-openrouter.js "Custom message" "chat-model-reasoning"
 */

const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function testGetEndpoint(message, model) {
  const url = new URL('/api/test-openrouter', baseUrl);
  if (message) url.searchParams.set('message', message);
  if (model) url.searchParams.set('model', model);

  console.log(`🧪 Testing GET: ${url.toString()}`);
  console.log('📡 Connecting to OpenRouter...\n');

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Test failed:', error);
      return false;
    }

    console.log('✅ Connection successful!');
    console.log(`📊 Model: ${response.headers.get('X-Test-Model')}`);
    console.log(`🎯 Status: ${response.headers.get('X-Test-Status')}`);
    console.log('\n📝 Streaming response:');
    console.log('─'.repeat(50));

    // Handle streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let accumulatedResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'token' && data.content) {
              process.stdout.write(data.content);
              accumulatedResponse += data.content;
            } else if (data.type === 'finish') {
              console.log('\n');
            } else if (data.type === 'error') {
              console.error('\n❌ Streaming error:', data.error);
            }
          } catch (e) {
            // Ignore JSON parse errors for incomplete chunks
          }
        }
      }
    }

    console.log('─'.repeat(50));
    console.log(`✅ Test completed successfully!`);
    console.log(`📏 Response length: ${accumulatedResponse.length} characters`);

    return true;
  } catch (error) {
    console.error('❌ Network error:', error.message);
    return false;
  }
}

async function testPostEndpoint(message, model) {
  const url = `${baseUrl}/api/test-openrouter`;

  console.log(`🧪 Testing POST: ${url}`);
  console.log('📡 Sending request...\n');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message || 'Hello! This is a POST test message.',
        model: model || 'chat-model',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ POST test failed:', error);
      return false;
    }

    console.log('✅ POST request successful!');
    console.log('\n📝 Streaming response:');
    console.log('─'.repeat(50));

    // Handle streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'token' && data.content) {
              process.stdout.write(data.content);
            } else if (data.type === 'finish') {
              console.log('\n');
            }
          } catch (e) {
            // Ignore JSON parse errors
          }
        }
      }
    }

    console.log('─'.repeat(50));
    console.log(`✅ POST test completed successfully!`);

    return true;
  } catch (error) {
    console.error('❌ POST network error:', error.message);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const message = args[0];
  const model = args[1];

  console.log('🚀 OpenRouter Integration Test');
  console.log('='.repeat(50));

  // Check if development server is running
  try {
    const healthCheck = await fetch(`${baseUrl}/api/health`);
    if (!healthCheck.ok) {
      throw new Error('Health check failed');
    }
    console.log('✅ Development server is running');
  } catch (error) {
    console.error('❌ Development server not accessible at', baseUrl);
    console.error('💡 Make sure to run: npm run dev');
    process.exit(1);
  }

  console.log('\n1️⃣ Testing GET endpoint...');
  const getSuccess = await testGetEndpoint(message, model);

  if (getSuccess) {
    console.log('\n2️⃣ Testing POST endpoint...');
    const postSuccess = await testPostEndpoint(message, model);

    if (postSuccess) {
      console.log('\n🎉 All tests passed! OpenRouter integration is working.');
    } else {
      console.log('\n⚠️  GET test passed but POST test failed.');
    }
  } else {
    console.log(
      '\n❌ GET test failed. Check your OPENROUTER_API_KEY and try again.',
    );
  }

  console.log('\n📋 Environment checklist:');
  console.log('□ OPENROUTER_API_KEY is set');
  console.log('□ Development server is running (npm run dev)');
  console.log('□ Network connection is available');
}

main().catch(console.error);
