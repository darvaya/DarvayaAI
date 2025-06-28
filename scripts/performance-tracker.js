#!/usr/bin/env node

/**
 * Performance Tracker for Gemini Flash Lite Testing
 * Helps measure and compare response times between models
 */

const fs = require('node:fs');
const path = require('node:path');

class PerformanceTracker {
  constructor() {
    this.results = [];
    this.testSession = {
      startTime: new Date().toISOString(),
      testCases: [],
      summary: {},
    };
  }

  /**
   * Record a test result
   */
  recordTest(testCase, model, metrics, qualityScore, notes = '') {
    const result = {
      timestamp: new Date().toISOString(),
      testCase,
      model,
      metrics: {
        latencyMs: metrics.latencyMs,
        totalTimeMs: metrics.totalTimeMs,
        inputTokens: metrics.inputTokens || 0,
        outputTokens: metrics.outputTokens || 0,
        errorRate: metrics.errorRate || 0,
      },
      qualityScore: qualityScore,
      notes: notes,
    };

    this.results.push(result);
    console.log(
      `✅ Recorded: ${testCase} - ${model} - ${metrics.latencyMs}ms - Quality: ${qualityScore}/10`,
    );
  }

  /**
   * Calculate averages and comparisons
   */
  generateReport() {
    console.log('\n📊 PERFORMANCE ANALYSIS REPORT');
    console.log('==============================');

    const modelGroups = this.groupByModel();
    const testCaseGroups = this.groupByTestCase();

    // Model comparison
    console.log('\n🏆 MODEL PERFORMANCE COMPARISON');
    console.log('--------------------------------');
    Object.keys(modelGroups).forEach((model) => {
      const results = modelGroups[model];
      const avgLatency = this.calculateAverage(results, 'metrics.latencyMs');
      const avgQuality = this.calculateAverage(results, 'qualityScore');
      const testCount = results.length;

      console.log(`${model}:`);
      console.log(`  Average Latency: ${avgLatency.toFixed(1)}ms`);
      console.log(`  Average Quality: ${avgQuality.toFixed(1)}/10`);
      console.log(`  Tests Completed: ${testCount}`);
      console.log('');
    });

    // Test case analysis
    console.log('\n📋 TEST CASE ANALYSIS');
    console.log('---------------------');
    Object.keys(testCaseGroups).forEach((testCase) => {
      console.log(`\n${testCase}:`);
      const results = testCaseGroups[testCase];

      results.forEach((result) => {
        console.log(
          `  ${result.model}: ${result.metrics.latencyMs}ms (Quality: ${result.qualityScore}/10)`,
        );
      });
    });

    // Performance deltas
    if (modelGroups['gemini-flash-lite'] && modelGroups['chat-model']) {
      console.log('\n🚀 GEMINI FLASH LITE vs CHAT MODEL');
      console.log('----------------------------------');
      const gemini = modelGroups['gemini-flash-lite'];
      const chatModel = modelGroups['chat-model'];

      const geminiAvgLatency = this.calculateAverage(
        gemini,
        'metrics.latencyMs',
      );
      const chatModelAvgLatency = this.calculateAverage(
        chatModel,
        'metrics.latencyMs',
      );
      const latencyImprovement =
        ((chatModelAvgLatency - geminiAvgLatency) / chatModelAvgLatency) * 100;

      const geminiAvgQuality = this.calculateAverage(gemini, 'qualityScore');
      const chatModelAvgQuality = this.calculateAverage(
        chatModel,
        'qualityScore',
      );
      const qualityDelta =
        ((geminiAvgQuality - chatModelAvgQuality) / chatModelAvgQuality) * 100;

      console.log(
        `Latency Change: ${latencyImprovement > 0 ? '+' : ''}${latencyImprovement.toFixed(1)}% ${latencyImprovement > 0 ? '(FASTER)' : '(SLOWER)'}`,
      );
      console.log(
        `Quality Change: ${qualityDelta > 0 ? '+' : ''}${qualityDelta.toFixed(1)}% ${qualityDelta > 0 ? '(BETTER)' : '(WORSE)'}`,
      );
    }
  }

  /**
   * Save results to file
   */
  saveResults() {
    const filename = `performance-results-${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(process.cwd(), 'test-results', filename);

    // Ensure directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const reportData = {
      session: this.testSession,
      results: this.results,
      summary: this.generateSummaryStats(),
    };

    fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2));
    console.log(`\n💾 Results saved to: ${filename}`);
  }

  /**
   * Load previous results for comparison
   */
  loadPreviousResults(filename) {
    const filepath = path.join(process.cwd(), 'test-results', filename);
    if (fs.existsSync(filepath)) {
      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      this.results = [...this.results, ...data.results];
      console.log(`📁 Loaded ${data.results.length} previous results`);
    }
  }

  // Helper methods
  groupByModel() {
    return this.results.reduce((acc, result) => {
      if (!acc[result.model]) acc[result.model] = [];
      acc[result.model].push(result);
      return acc;
    }, {});
  }

  groupByTestCase() {
    return this.results.reduce((acc, result) => {
      if (!acc[result.testCase]) acc[result.testCase] = [];
      acc[result.testCase].push(result);
      return acc;
    }, {});
  }

  calculateAverage(results, path) {
    const values = results.map((r) => this.getNestedValue(r, path));
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj) || 0;
  }

  generateSummaryStats() {
    return {
      totalTests: this.results.length,
      modelsCompared: Object.keys(this.groupByModel()),
      testCases: Object.keys(this.groupByTestCase()),
      completedAt: new Date().toISOString(),
    };
  }
}

/**
 * Interactive CLI for recording test results
 */
function interactiveMode() {
  const tracker = new PerformanceTracker();

  console.log('🎯 INTERACTIVE PERFORMANCE TRACKING');
  console.log('===================================');
  console.log('');
  console.log('📝 Record your test results as you perform manual testing');
  console.log('');
  console.log('Commands:');
  console.log('  record - Record a new test result');
  console.log('  report - Generate performance report');
  console.log('  save   - Save results to file');
  console.log('  exit   - Exit tracker');
  console.log('');

  // Simplified example for demonstration
  console.log('📋 Example usage:');
  console.log('After testing a prompt, record results like:');
  console.log('');
  console.log('Test Case: Conversational Chat');
  console.log('Model: gemini-flash-lite');
  console.log('Latency: 85ms');
  console.log('Quality Score: 8/10');
  console.log('');

  // For now, just show the template
  tracker.recordTest(
    'Conversational Chat',
    'gemini-flash-lite',
    { latencyMs: 85 },
    8,
    'Example result',
  );
  tracker.recordTest(
    'Conversational Chat',
    'chat-model',
    { latencyMs: 140 },
    8,
    'Baseline comparison',
  );

  tracker.generateReport();

  console.log('\n📊 Use this format to track your actual test results!');
}

/**
 * Generate Go/No-Go decision matrix
 */
function generateGoNoGoMatrix() {
  console.log('\n🎯 GO/NO-GO DECISION MATRIX');
  console.log('===========================');
  console.log('');
  console.log('Based on your proposal success criteria:');
  console.log('');
  console.log('✅ GO CRITERIA (need ≥2 of 3):');
  console.log('   □ ≥25% latency improvement with <10% quality degradation');
  console.log('   □ ≥20% cost reduction with maintained user satisfaction');
  console.log('   □ ≥90% system stability with new model integration');
  console.log('');
  console.log('❌ NO-GO CRITERIA (any single trigger):');
  console.log('   □ >15% increase in user-reported quality issues');
  console.log('   □ >5% increase in system error rates');
  console.log('   □ Cost increases despite efficiency gains');
  console.log('');
  console.log('📊 Fill in the checkboxes based on your test results');
}

// Main execution
function main() {
  const args = process.argv.slice(2);

  if (args.includes('--interactive')) {
    interactiveMode();
  } else if (args.includes('--matrix')) {
    generateGoNoGoMatrix();
  } else {
    console.log('📊 PERFORMANCE TRACKER');
    console.log('======================');
    console.log('');
    console.log('Options:');
    console.log('  --interactive  Start interactive tracking session');
    console.log('  --matrix       Show Go/No-Go decision matrix');
    console.log('');
    console.log('💡 Use alongside manual testing to track metrics');
  }
}

main();
