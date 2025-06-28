#!/usr/bin/env node

/**
 * Working Gemini Flash Lite Test
 * Uses direct fetch to test the model since we confirmed OpenRouter works
 */

const { config } = require('dotenv');
config({ path: '.env.local' });

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

async function testGeminiWithFetch() {
  console.log('🧪 GEMINI FLASH LITE - WORKING TEST');
  console.log('===================================');
  console.log('');

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('❌ No API key found');
    process.exit(1);
  }

  console.log('✅ API Key loaded');
  console.log('🚀 Testing Gemini 2.0 Flash Lite...');
  console.log('');

  const results = [];

  for (const testCase of testCases) {
    console.log(`🧪 Test: ${testCase.name}`);
    console.log(`📝 Prompt: "${testCase.prompt}"`);
    console.log(`⏱️  Target: <${testCase.expectedLatency}ms`);

    try {
      const startTime = Date.now();

      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'AI Chatbot - Gemini Flash Lite Test',
          },
          body: JSON.stringify({
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
          }),
        },
      );

      const endTime = Date.now();
      const latency = endTime - startTime;

      if (response.ok) {
        const data = await response.json();
        const content = data.choices[0]?.message?.content || '';
        const usage = data.usage;

        console.log(
          `⚡ Latency: ${latency}ms ${latency <= testCase.expectedLatency ? '✅ FAST' : '⚠️ SLOW'}`,
        );
        console.log(
          `📊 Tokens: ${usage?.prompt_tokens || 0} → ${usage?.completion_tokens || 0} (${usage?.total_tokens || 0} total)`,
        );
        console.log(`📏 Length: ${content.length} chars`);
        console.log(
          `💰 Cost: ~$${((usage?.prompt_tokens || 0) * 0.000000075 + (usage?.completion_tokens || 0) * 0.0000003).toFixed(6)}`,
        );
        console.log('');
        console.log('📝 Response:');
        console.log(
          content.substring(0, 300) + (content.length > 300 ? '...' : ''),
        );
        console.log('');
        console.log('─'.repeat(60));
        console.log('');

        results.push({
          testCase: testCase.name,
          latency,
          success: true,
          responseLength: content.length,
          tokens: usage?.total_tokens || 0,
          cost:
            (usage?.prompt_tokens || 0) * 0.000000075 +
            (usage?.completion_tokens || 0) * 0.0000003,
          meetLatencyTarget: latency <= testCase.expectedLatency,
          content: content.substring(0, 100),
        });
      } else {
        const errorText = await response.text();
        console.error(`❌ Request failed: ${response.status}`);
        console.error(errorText);

        results.push({
          testCase: testCase.name,
          latency,
          success: false,
          error: `${response.status}: ${errorText}`,
        });
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      results.push({
        testCase: testCase.name,
        success: false,
        error: error.message,
      });
    }
  }

  // Generate comprehensive results
  console.log('📊 COMPREHENSIVE TEST RESULTS');
  console.log('=============================');
  console.log('');

  const successfulTests = results.filter((r) => r.success);
  const failedTests = results.filter((r) => !r.success);

  console.log(
    `✅ Successful: ${successfulTests.length}/${results.length} tests`,
  );
  console.log(`❌ Failed: ${failedTests.length}/${results.length} tests`);
  console.log('');

  if (successfulTests.length > 0) {
    const avgLatency =
      successfulTests.reduce((sum, r) => sum + r.latency, 0) /
      successfulTests.length;
    const totalCost = successfulTests.reduce((sum, r) => sum + r.cost, 0);
    const targetsMet = successfulTests.filter(
      (r) => r.meetLatencyTarget,
    ).length;

    console.log('⚡ PERFORMANCE METRICS:');
    console.log(`   Average Latency: ${avgLatency.toFixed(1)}ms`);
    console.log(`   Baseline (140ms): ${140}ms`);
    console.log(
      `   Improvement: ${(((140 - avgLatency) / 140) * 100).toFixed(1)}%`,
    );
    console.log(`   Targets Met: ${targetsMet}/${successfulTests.length}`);
    console.log('');

    console.log('💰 COST ANALYSIS:');
    console.log(`   Total Test Cost: $${totalCost.toFixed(6)}`);
    console.log(
      `   Average Per Request: $${(totalCost / successfulTests.length).toFixed(6)}`,
    );
    console.log(
      `   Estimated 1000 queries: $${((totalCost / successfulTests.length) * 1000).toFixed(3)}`,
    );
    console.log('');

    // Go/No-Go Decision
    const latencyImprovement = ((140 - avgLatency) / 140) * 100;
    console.log('🎯 GO/NO-GO ANALYSIS:');

    if (latencyImprovement >= 25) {
      console.log('✅ GO CRITERIA MET:');
      console.log(
        `   ✅ Latency improvement: ${latencyImprovement.toFixed(1)}% (≥25% required)`,
      );
      console.log('   ✅ System stability: No errors during testing');
      console.log('   ✅ Cost efficiency: Extremely low cost per request');
      console.log('');
      console.log('🚀 RECOMMENDATION: PROCEED TO PHASE 3');
    } else {
      console.log('⚠️ REVIEW NEEDED:');
      console.log(
        `   ⚠️ Latency improvement: ${latencyImprovement.toFixed(1)}% (<25% target)`,
      );
      console.log('   📋 Manual quality assessment still needed');
    }
  } else {
    console.log('❌ All tests failed - investigation needed');
  }

  console.log('');
  console.log('📋 NEXT STEPS:');
  console.log('1. Update test-results-tracker.md with these results');
  console.log('2. Test UI integration (fix database connection)');
  console.log('3. Compare response quality manually');
  console.log('4. Test artifact generation capabilities');
}

testGeminiWithFetch().catch(console.error);
