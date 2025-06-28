#!/usr/bin/env node

/**
 * Direct Gemini Flash Lite Test - Bypasses Database
 * Tests the OpenRouter model integration directly
 */

const { config } = require('dotenv');
const OpenAI = require('openai');

// Load environment variables
config({ path: '.env.local' });

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const testCases = [
  {
    name: 'Simple Chat Query',
    prompt: 'Hello! How are you today?',
    expectedLatency: 80,
  },
  {
    name: 'Conversational Chat',
    prompt:
      "Can you help me plan a productive morning routine? I'm a software developer working from home.",
    expectedLatency: 100,
  },
  {
    name: 'Code Generation',
    prompt:
      'Create a Python function that takes a list of numbers and returns the top 3 largest values with their indices',
    expectedLatency: 120,
  },
];

async function testGeminiFlashLite() {
  console.log('🧪 DIRECT GEMINI FLASH LITE TEST');
  console.log('================================');
  console.log('');

  // Check OpenRouter API key
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENROUTER_API_KEY not found in .env.local');
    console.log('💡 Add your OpenRouter API key to continue testing');
    process.exit(1);
  }

  console.log('✅ OpenRouter API key found');

  // Create OpenRouter client
  const client = new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'AI Chatbot - Gemini Flash Lite Test',
    },
  });

  console.log('✅ OpenRouter client initialized');
  console.log('');

  const results = [];

  for (const testCase of testCases) {
    console.log(`🧪 Testing: ${testCase.name}`);
    console.log(`📝 Prompt: "${testCase.prompt}"`);
    console.log(`⏱️  Expected: <${testCase.expectedLatency}ms`);
    console.log('');

    try {
      const startTime = Date.now();

      const response = await client.chat.completions.create({
        model: 'google/gemini-2.0-flash-lite-001',
        messages: [
          {
            role: 'user',
            content: testCase.prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 8000,
        top_p: 0.9,
      });

      const endTime = Date.now();
      const latency = endTime - startTime;
      const content = response.choices[0]?.message?.content || '';
      const tokens = response.usage;

      console.log(
        `⚡ Latency: ${latency}ms ${latency <= testCase.expectedLatency ? '✅' : '⚠️'}`,
      );
      console.log(
        `📊 Tokens: ${tokens?.prompt_tokens || 0} input + ${tokens?.completion_tokens || 0} output`,
      );
      console.log(`📏 Response length: ${content.length} chars`);
      console.log(
        `💰 Cost estimate: ~$${((tokens?.total_tokens || 0) * 0.000001).toFixed(6)}`,
      );
      console.log('');
      console.log('📝 Response preview:');
      console.log(
        content.substring(0, 200) + (content.length > 200 ? '...' : ''),
      );
      console.log('');
      console.log('─'.repeat(50));
      console.log('');

      results.push({
        testCase: testCase.name,
        latency,
        success: true,
        responseLength: content.length,
        tokens: tokens?.total_tokens || 0,
        meetLatencyTarget: latency <= testCase.expectedLatency,
      });
    } catch (error) {
      console.error(`❌ Test failed: ${error.message}`);
      console.log('');

      results.push({
        testCase: testCase.name,
        latency: null,
        success: false,
        error: error.message,
      });
    }
  }

  // Generate summary
  console.log('📊 TEST SUMMARY');
  console.log('===============');
  console.log('');

  const successfulTests = results.filter((r) => r.success);
  const avgLatency =
    successfulTests.reduce((sum, r) => sum + r.latency, 0) /
    successfulTests.length;
  const latencyTargetsMet = successfulTests.filter(
    (r) => r.meetLatencyTarget,
  ).length;

  console.log(
    `✅ Successful tests: ${successfulTests.length}/${results.length}`,
  );
  console.log(`⚡ Average latency: ${avgLatency.toFixed(1)}ms`);
  console.log(
    `🎯 Latency targets met: ${latencyTargetsMet}/${successfulTests.length}`,
  );
  console.log('');

  if (successfulTests.length > 0) {
    console.log('🎉 GEMINI FLASH LITE IS WORKING!');
    console.log('');
    console.log('📈 Performance vs Baseline (140ms):');
    const improvement = ((140 - avgLatency) / 140) * 100;
    console.log(
      `   ${improvement > 0 ? '⬆️' : '⬇️'} ${Math.abs(improvement).toFixed(1)}% ${improvement > 0 ? 'FASTER' : 'SLOWER'}`,
    );
    console.log('');

    if (improvement >= 25) {
      console.log('✅ GO CRITERIA MET: ≥25% latency improvement achieved!');
    } else {
      console.log('⚠️  Latency improvement below 25% target');
    }
  } else {
    console.log('❌ All tests failed - check configuration');
  }

  console.log('');
  console.log('🚀 Next steps:');
  console.log('1. Record these results in test-results-tracker.md');
  console.log('2. Compare quality manually against baseline model');
  console.log('3. Test remaining use cases (artifacts, sheets)');
}

testGeminiFlashLite().catch(console.error);
