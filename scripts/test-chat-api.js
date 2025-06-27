#!/usr/bin/env node

/**
 * Test script for the migrated chat API
 * This tests the core OpenRouter integration without authentication
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env.local') });

console.log('🧪 Testing Chat API Migration to OpenRouter...\n');

async function testBasicChatStream() {
  console.log('1. Testing basic chat streaming...');

  try {
    // Import our OpenRouter client and streaming
    const { openRouterClient, getModelName, getModelConfig } = await import(
      '../lib/ai/openrouter-client.js'
    );
    const { streamChatWithTools, ToolRegistry } = await import(
      '../lib/ai/tools-handler.js'
    );

    if (!process.env.OPENROUTER_API_KEY) {
      console.log('   ❌ OPENROUTER_API_KEY not found in environment');
      return false;
    }

    // Test model configuration
    const modelConfig = getModelConfig('chat-model');
    const modelName = getModelName('chat-model');

    console.log(`   📋 Model: ${modelName}`);
    console.log(`   ⚙️  Config: ${JSON.stringify(modelConfig, null, 2)}`);

    // Create a simple test conversation
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant. Respond briefly.',
      },
      { role: 'user', content: 'Hello! Can you tell me what 2+2 equals?' },
    ];

    console.log('   💬 Sending test message...');

    // Test streaming without tools first
    const streamGenerator = streamChatWithTools(
      messages,
      modelName,
      { session: null }, // Mock session for testing
      {
        temperature: modelConfig.temperature,
        max_tokens: 100, // Keep it short for testing
        top_p: modelConfig.top_p,
        tools: [], // No tools for basic test
        maxSteps: 1,
      },
    );

    let fullResponse = '';
    let chunkCount = 0;

    for await (const chunk of streamGenerator) {
      chunkCount++;
      if (chunk.type === 'content') {
        fullResponse += chunk.data;
        process.stdout.write(chunk.data);
      }

      if (chunk.type === 'finish') {
        break;
      }

      // Safety limit
      if (chunkCount > 100) {
        console.log('\n   ⚠️  Stopped after 100 chunks for safety');
        break;
      }
    }

    console.log(`\n   ✅ Received ${chunkCount} chunks`);
    console.log(`   📝 Full response: "${fullResponse.trim()}"`);

    if (fullResponse.trim().length > 0) {
      console.log('   ✅ Basic chat streaming works!');
      return true;
    } else {
      console.log('   ❌ No response received');
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    console.log(`   📋 Stack: ${error.stack}`);
    return false;
  }
}

async function testReasoningModel() {
  console.log('\n2. Testing reasoning model...');

  try {
    const { getModelName, getModelConfig } = await import(
      '../lib/ai/openrouter-client.js'
    );
    const { streamChatWithTools } = await import('../lib/ai/tools-handler.js');

    const modelConfig = getModelConfig('chat-model-reasoning');
    const modelName = getModelName('chat-model-reasoning');

    console.log(`   📋 Reasoning Model: ${modelName}`);

    const messages = [
      { role: 'system', content: 'Think step by step.' },
      { role: 'user', content: 'What is 15 * 23? Show your thinking.' },
    ];

    console.log('   🧠 Testing reasoning model...');

    const streamGenerator = streamChatWithTools(
      messages,
      modelName,
      { session: null },
      {
        temperature: modelConfig.temperature,
        max_tokens: 200,
        top_p: modelConfig.top_p,
        tools: [], // Reasoning models typically don't use tools
        maxSteps: 1,
      },
    );

    let fullResponse = '';
    let chunkCount = 0;

    for await (const chunk of streamGenerator) {
      chunkCount++;
      if (chunk.type === 'content') {
        fullResponse += chunk.data;
        process.stdout.write(chunk.data);
      }

      if (chunk.type === 'finish') {
        break;
      }

      if (chunkCount > 150) {
        console.log('\n   ⚠️  Stopped after 150 chunks for safety');
        break;
      }
    }

    console.log(`\n   ✅ Received ${chunkCount} chunks`);

    if (
      fullResponse.includes('345') ||
      fullResponse.includes('15') ||
      fullResponse.includes('23')
    ) {
      console.log('   ✅ Reasoning model works!');
      return true;
    } else {
      console.log('   ⚠️  Response may not contain expected calculation');
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function testModelMappings() {
  console.log('\n3. Testing model mappings...');

  try {
    const { getModelName, MODEL_MAPPINGS } = await import(
      '../lib/ai/openrouter-client.js'
    );

    console.log('   📋 Available models:');
    for (const [key, value] of Object.entries(MODEL_MAPPINGS)) {
      const mappedName = getModelName(key);
      console.log(`     ${key} → ${mappedName}`);

      if (mappedName !== value) {
        console.log(`   ❌ Mapping mismatch for ${key}`);
        return false;
      }
    }

    console.log('   ✅ All model mappings work correctly!');
    return true;
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Chat API Migration Tests\n');

  const results = {
    basicChat: await testBasicChatStream(),
    reasoning: await testReasoningModel(),
    mappings: await testModelMappings(),
  };

  console.log('\n📊 Test Results:');
  console.log(`   Basic Chat: ${results.basicChat ? '✅' : '❌'}`);
  console.log(`   Reasoning Model: ${results.reasoning ? '✅' : '❌'}`);
  console.log(`   Model Mappings: ${results.mappings ? '✅' : '❌'}`);

  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.values(results).length;

  console.log(`\n🎯 Score: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log(
      '🎉 All tests passed! Chat API migration is working correctly.',
    );
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check the errors above.');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch((error) => {
  console.error('💥 Test runner failed:', error);
  process.exit(1);
});
