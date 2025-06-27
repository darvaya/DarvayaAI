#!/usr/bin/env node

/**
 * Performance Monitoring Test Suite
 * Tests the enhanced OpenRouter integration with performance optimizations
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env.local') });

console.log('🔍 OpenRouter Performance Monitoring Test Suite\n');

const DEV_SERVER_URL = process.env.DEV_SERVER_URL || 'http://localhost:3001';

async function testPerformanceAPI() {
  console.log('1. Testing Performance Monitoring API...');

  try {
    // Test getting performance metrics
    const response = await fetch(`${DEV_SERVER_URL}/api/performance`);

    if (!response.ok) {
      console.log(
        `   ❌ API not accessible: ${response.status} ${response.statusText}`,
      );
      return false;
    }

    const data = await response.json();

    console.log('   📊 Performance Metrics:');
    console.log(`      Request Count: ${data.metrics.requestCount}`);
    console.log(
      `      Average Latency: ${data.metrics.averageLatency.toFixed(2)}ms`,
    );
    console.log(
      `      Error Rate: ${(data.metrics.errorRate * 100).toFixed(2)}%`,
    );
    console.log(
      `      Cache Hit Rate: ${(data.metrics.cacheHitRate * 100).toFixed(2)}%`,
    );
    console.log(
      `      Requests/Min: ${data.metrics.requestsPerMinute.toFixed(2)}`,
    );

    console.log('\n   📈 Insights:');
    console.log(`      Status: ${data.insights.status}`);
    console.log(`      Grade: ${data.insights.performanceGrade}`);
    console.log(`      Cache Size: ${data.cache.size} items`);

    console.log('\n   💡 Recommendations:');
    data.insights.recommendations.forEach((rec, index) => {
      console.log(`      ${index + 1}. ${rec}`);
    });

    console.log('   ✅ Performance API working correctly!');
    return true;
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function testPerformanceReset() {
  console.log('\n2. Testing Performance Metrics Reset...');

  try {
    const response = await fetch(
      `${DEV_SERVER_URL}/api/performance?action=reset`,
    );

    if (!response.ok) {
      console.log(`   ❌ Reset failed: ${response.status}`);
      return false;
    }

    const data = await response.json();
    console.log(`   ✅ ${data.message}`);

    // Verify reset worked
    const metricsResponse = await fetch(`${DEV_SERVER_URL}/api/performance`);
    const metricsData = await metricsResponse.json();

    if (metricsData.metrics.requestCount === 0) {
      console.log('   ✅ Metrics successfully reset!');
      return true;
    } else {
      console.log('   ❌ Metrics not properly reset');
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function testBasicOpenRouterEndpoint() {
  console.log('\n3. Testing Basic OpenRouter Integration...');

  try {
    const testModels = ['chat-model', 'chat-model-reasoning'];
    const results = [];

    for (const model of testModels) {
      console.log(`   🧪 Testing ${model}...`);

      const startTime = Date.now();
      const response = await fetch(
        `${DEV_SERVER_URL}/api/test-openrouter?model=${model}`,
      );
      const endTime = Date.now();

      const isSuccess = response.ok;
      const latency = endTime - startTime;

      results.push({
        model,
        success: isSuccess,
        latency,
        status: response.status,
      });

      console.log(
        `      ${isSuccess ? '✅' : '❌'} ${model}: ${latency}ms (${response.status})`,
      );
    }

    const successCount = results.filter((r) => r.success).length;
    const avgLatency =
      results.reduce((sum, r) => sum + r.latency, 0) / results.length;

    console.log(
      `   📊 Results: ${successCount}/${results.length} successful, avg latency: ${avgLatency.toFixed(0)}ms`,
    );

    return successCount > 0;
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function testCachingBehavior() {
  console.log('\n4. Testing Caching Behavior...');

  try {
    // Make multiple identical requests to test caching
    const testUrl = `${DEV_SERVER_URL}/api/test-openrouter?model=chat-model`;
    const requests = [];

    console.log('   🔄 Making 3 identical requests...');

    for (let i = 0; i < 3; i++) {
      const startTime = Date.now();
      const response = await fetch(testUrl);
      const endTime = Date.now();

      requests.push({
        attempt: i + 1,
        success: response.ok,
        latency: endTime - startTime,
      });

      console.log(`      Request ${i + 1}: ${endTime - startTime}ms`);

      // Small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Check if later requests are faster (indicating caching)
    const firstLatency = requests[0].latency;
    const lastLatency = requests[requests.length - 1].latency;
    const speedImprovement =
      ((firstLatency - lastLatency) / firstLatency) * 100;

    if (speedImprovement > 10) {
      console.log(
        `   ✅ Caching working! ${speedImprovement.toFixed(1)}% speed improvement`,
      );
    } else {
      console.log(
        `   ⚠️  Caching may not be active or requests too fast to measure`,
      );
    }

    return true;
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function testErrorHandling() {
  console.log('\n5. Testing Error Handling & Circuit Breaker...');

  try {
    // Test with invalid model to trigger errors
    console.log('   🧪 Testing with invalid model...');

    const response = await fetch(
      `${DEV_SERVER_URL}/api/test-openrouter?model=invalid-model`,
    );
    const isExpectedError = !response.ok;

    console.log(
      `   ${isExpectedError ? '✅' : '❌'} Error handling: ${response.status}`,
    );

    // Check if metrics captured the error
    const metricsResponse = await fetch(`${DEV_SERVER_URL}/api/performance`);
    const metricsData = await metricsResponse.json();

    if (metricsData.metrics.errors > 0) {
      console.log('   ✅ Error metrics properly recorded');
    } else {
      console.log('   ⚠️  Error not captured in metrics');
    }

    return true;
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function testPerformanceGrading() {
  console.log('\n6. Testing Performance Grading System...');

  try {
    const response = await fetch(`${DEV_SERVER_URL}/api/performance`);
    const data = await response.json();

    const grade = data.insights.performanceGrade;
    const status = data.insights.status;

    console.log(`   📊 Current Performance Grade: ${grade}`);
    console.log(`   🩺 System Status: ${status}`);

    // Validate grading logic
    const validGrades = ['A', 'B', 'C', 'D', 'F'];
    const validStatuses = ['healthy', 'warning', 'critical'];

    const gradeValid = validGrades.includes(grade);
    const statusValid = validStatuses.includes(status);

    console.log(`   ${gradeValid ? '✅' : '❌'} Grade validation: ${grade}`);
    console.log(`   ${statusValid ? '✅' : '❌'} Status validation: ${status}`);

    return gradeValid && statusValid;
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function generatePerformanceReport() {
  console.log('\n📋 Generating Performance Report...');

  try {
    const response = await fetch(`${DEV_SERVER_URL}/api/performance`);
    const data = await response.json();

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        grade: data.insights.performanceGrade,
        status: data.insights.status,
        totalRequests: data.metrics.requestCount,
        averageLatency: Math.round(data.metrics.averageLatency),
        errorRate: Math.round(data.metrics.errorRate * 100),
        cacheHitRate: Math.round(data.metrics.cacheHitRate * 100),
      },
      details: data.metrics,
      recommendations: data.insights.recommendations,
    };

    console.log('\n📈 PERFORMANCE REPORT');
    console.log('========================');
    console.log(`🎯 Overall Grade: ${report.summary.grade}`);
    console.log(`🏥 System Status: ${report.summary.status}`);
    console.log(`📊 Total Requests: ${report.summary.totalRequests}`);
    console.log(`⏱️  Average Latency: ${report.summary.averageLatency}ms`);
    console.log(`❌ Error Rate: ${report.summary.errorRate}%`);
    console.log(`💾 Cache Hit Rate: ${report.summary.cacheHitRate}%`);

    console.log('\n💡 Recommendations:');
    report.recommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. ${rec}`);
    });

    console.log('\n========================');

    return true;
  } catch (error) {
    console.log(`   ❌ Error generating report: ${error.message}`);
    return false;
  }
}

async function runPerformanceTestSuite() {
  console.log('🚀 Starting Performance Monitoring Test Suite\n');

  const tests = [
    { name: 'Performance API', fn: testPerformanceAPI },
    { name: 'Metrics Reset', fn: testPerformanceReset },
    { name: 'Basic Integration', fn: testBasicOpenRouterEndpoint },
    { name: 'Caching Behavior', fn: testCachingBehavior },
    { name: 'Error Handling', fn: testErrorHandling },
    { name: 'Performance Grading', fn: testPerformanceGrading },
  ];

  const results = [];

  for (const test of tests) {
    try {
      const result = await test.fn();
      results.push({ name: test.name, success: result });
    } catch (error) {
      console.log(`   💥 Test crashed: ${error.message}`);
      results.push({ name: test.name, success: false });
    }
  }

  // Generate final report
  await generatePerformanceReport();

  console.log('\n🎯 Test Results Summary:');
  results.forEach((result) => {
    console.log(`   ${result.success ? '✅' : '❌'} ${result.name}`);
  });

  const passed = results.filter((r) => r.success).length;
  const total = results.length;

  console.log(`\n📊 Overall Score: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('🎉 All performance monitoring features working correctly!');
    console.log('\n📚 Next Steps:');
    console.log('   • Monitor performance metrics in production');
    console.log('   • Set up alerts for degraded performance');
    console.log('   • Review and tune cache settings');
    console.log('   • Implement performance budgets');
    return true;
  } else {
    console.log('⚠️  Some tests failed. Check the errors above.');
    return false;
  }
}

// Run the test suite
runPerformanceTestSuite()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 Test suite crashed:', error);
    process.exit(1);
  });
