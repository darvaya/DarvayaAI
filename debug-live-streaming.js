#!/usr/bin/env node

/**
 * Live Streaming Debug Script
 *
 * Tests the actual chat API to diagnose why streaming isn't working
 */

const https = require('node:https');
const { spawn } = require('node:child_process');

console.log('🔍 Debugging Live Streaming Issues...\n');

// Test 1: Check if the app is running
console.log('📡 Test 1: Checking if Next.js app is running...');
async function checkAppRunning() {
  try {
    const response = await fetch('http://localhost:3000/api/health');
    if (response.ok) {
      console.log('✅ App is running on localhost:3000');
      return true;
    } else {
      console.log('❌ App health check failed');
      return false;
    }
  } catch (error) {
    console.log('❌ App is not running on localhost:3000');
    console.log('   Starting the app...');
    return false;
  }
}

// Test 2: Test chat API with tool execution
async function testChatAPI() {
  console.log('\n💬 Test 2: Testing Chat API with tool execution...');

  try {
    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 'test-chat-id',
        message: {
          role: 'user',
          content: 'Create a simple blog post about AI',
        },
        selectedChatModel: 'openrouter/anthropic/claude-3.5-sonnet',
        selectedVisibilityType: 'private',
      }),
    });

    console.log(`📊 Response Status: ${response.status}`);
    console.log(
      `📊 Response Headers:`,
      Object.fromEntries(response.headers.entries()),
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ API Error Response:', errorText);
      return;
    }

    // Test streaming response
    const reader = response.body?.getReader();
    if (!reader) {
      console.log('❌ No readable stream in response');
      return;
    }

    console.log('📡 Reading stream...');
    let chunkCount = 0;
    let hasToolCall = false;
    let hasTextDelta = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunkCount++;
        const chunk = new TextDecoder().decode(value);
        console.log(
          `📦 Chunk ${chunkCount}:`,
          chunk.substring(0, 200) + (chunk.length > 200 ? '...' : ''),
        );

        // Check for specific events
        if (chunk.includes('tool-call') || chunk.includes('tool_call')) {
          hasToolCall = true;
          console.log('🔧 Found tool call in stream');
        }
        if (chunk.includes('text-delta')) {
          hasTextDelta = true;
          console.log('📝 Found text-delta in stream');
        }

        // Safety limit
        if (chunkCount > 50) {
          console.log('⚠️ Stopping after 50 chunks for safety');
          break;
        }
      }
    } catch (streamError) {
      console.log('❌ Stream reading error:', streamError.message);
    }

    console.log(`\n📊 Stream Summary:`);
    console.log(`   Total chunks: ${chunkCount}`);
    console.log(`   Tool calls detected: ${hasToolCall ? 'Yes' : 'No'}`);
    console.log(`   Text deltas detected: ${hasTextDelta ? 'Yes' : 'No'}`);
  } catch (error) {
    console.log('❌ Chat API test failed:', error.message);
  }
}

// Test 3: Check current implementation files
async function checkImplementationFiles() {
  console.log('\n📁 Test 3: Checking implementation files...');

  const fs = require('node:fs');
  const filesToCheck = [
    'lib/ai/coordinated-streaming.ts',
    'app/(chat)/api/chat/route.ts',
    'lib/ai/tools-handler.ts',
    'components/data-stream-handler.tsx',
  ];

  filesToCheck.forEach((file) => {
    if (fs.existsSync(file)) {
      const stats = fs.statSync(file);
      console.log(
        `✅ ${file} (${stats.size} bytes, modified: ${stats.mtime.toISOString()})`,
      );
    } else {
      console.log(`❌ ${file} - Missing!`);
    }
  });
}

// Test 4: Run with development server
async function startDevServer() {
  console.log('\n🚀 Starting development server...');

  const devProcess = spawn('npm', ['run', 'dev'], {
    stdio: 'pipe',
    detached: false,
  });

  let serverReady = false;

  devProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('📡 Dev Server:', output.trim());

    if (output.includes('Ready') || output.includes('started server')) {
      serverReady = true;
      console.log('✅ Development server is ready!');
    }
  });

  devProcess.stderr.on('data', (data) => {
    console.log('⚠️ Dev Server Error:', data.toString().trim());
  });

  // Wait for server to start
  for (let i = 0; i < 30; i++) {
    if (serverReady) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log(`⏳ Waiting for server... (${i + 1}/30)`);
  }

  return serverReady;
}

// Main execution
async function main() {
  // Check implementation files first
  await checkImplementationFiles();

  // Check if app is running
  const isRunning = await checkAppRunning();

  if (!isRunning) {
    // Try to start the dev server
    const started = await startDevServer();
    if (!started) {
      console.log('❌ Could not start development server');
      process.exit(1);
    }

    // Wait a bit more for full startup
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // Test the chat API
  await testChatAPI();

  console.log('\n🔍 Debug Summary:');
  console.log('If streaming is not working:');
  console.log('1. Check browser developer tools for JavaScript errors');
  console.log(
    '2. Look at Network tab to see if streaming connections are established',
  );
  console.log('3. Check server console for error messages');
  console.log('4. Verify environment variables are properly set');
}

main().catch(console.error);
