/**
 * Phase 3 Monitoring: Gemini Flash Lite Performance Tracking
 * Production rollout monitoring and metrics collection
 */

import type { ModelKey } from './openrouter-client';

export interface ModelPerformanceMetric {
  model: ModelKey;
  userId: string;
  sessionId: string;
  timestamp: string;
  latency: number;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost: number;
  success: boolean;
  error?: string;
  userSatisfaction?: number; // 1-5 rating if available
}

export interface RolloutMetrics {
  totalRequests: number;
  geminiFlashLiteRequests: number;
  trafficPercentage: number;
  averageLatency: {
    geminiFlashLite: number;
    baseline: number;
    improvement: number;
  };
  costSavings: {
    totalSaved: number;
    percentageSaved: number;
  };
  errorRates: {
    geminiFlashLite: number;
    baseline: number;
  };
  userSatisfaction: {
    geminiFlashLite: number;
    baseline: number;
  };
}

// In-memory storage for metrics (in production, use Redis or database)
const performanceMetrics: ModelPerformanceMetric[] = [];
const MAX_METRICS_STORED = 10000; // Limit memory usage

/**
 * Record a performance metric for analysis
 */
export function recordPerformanceMetric(metric: ModelPerformanceMetric): void {
  performanceMetrics.push(metric);

  // Prevent memory overflow
  if (performanceMetrics.length > MAX_METRICS_STORED) {
    performanceMetrics.splice(
      0,
      performanceMetrics.length - MAX_METRICS_STORED,
    );
  }

  // Log for real-time monitoring
  console.log(
    `📊 Performance: ${metric.model} - ${metric.latency}ms - $${metric.cost.toFixed(6)} - ${metric.success ? '✅' : '❌'}`,
  );
}

/**
 * Calculate cost based on token usage and model pricing
 */
export function calculateCost(
  model: ModelKey,
  tokenUsage: { promptTokens: number; completionTokens: number },
): number {
  const pricing = {
    'gemini-flash-lite': {
      prompt: 0.000000075, // $0.000075/1K tokens
      completion: 0.0000003, // $0.0003/1K tokens
    },
    'chat-model': {
      prompt: 0.000003, // Approximate current pricing
      completion: 0.000015,
    },
    'chat-model-reasoning': {
      prompt: 0.000015, // Higher for reasoning models
      completion: 0.00006,
    },
    'title-model': {
      prompt: 0.000003, // Same as chat-model
      completion: 0.000015,
    },
    'artifact-model': {
      prompt: 0.000003, // Same as chat-model
      completion: 0.000015,
    },
    'image-model': {
      prompt: 0.000003, // Same as chat-model
      completion: 0.000015,
    },
  } as const;

  const modelPricing = pricing[model];

  return (
    tokenUsage.promptTokens * modelPricing.prompt +
    tokenUsage.completionTokens * modelPricing.completion
  );
}

/**
 * Get comprehensive rollout metrics for dashboard
 */
export function getRolloutMetrics(timeWindowHours = 24): RolloutMetrics {
  const cutoffTime = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
  const recentMetrics = performanceMetrics.filter(
    (m) => new Date(m.timestamp) > cutoffTime,
  );

  const geminiMetrics = recentMetrics.filter(
    (m) => m.model === 'gemini-flash-lite',
  );
  const baselineMetrics = recentMetrics.filter((m) => m.model === 'chat-model');

  const totalRequests = recentMetrics.length;
  const geminiRequests = geminiMetrics.length;

  // Calculate averages
  const avgGeminiLatency =
    geminiMetrics.length > 0
      ? geminiMetrics.reduce((sum, m) => sum + m.latency, 0) /
        geminiMetrics.length
      : 0;

  const avgBaselineLatency =
    baselineMetrics.length > 0
      ? baselineMetrics.reduce((sum, m) => sum + m.latency, 0) /
        baselineMetrics.length
      : 140; // Default baseline

  // Cost calculations
  const geminiBenchmarkCost = geminiMetrics.reduce((sum, m) => sum + m.cost, 0);
  const baselineBenchmarkCost = baselineMetrics.reduce(
    (sum, m) => sum + m.cost,
    0,
  );

  // Error rates
  const geminiErrors = geminiMetrics.filter((m) => !m.success).length;
  const baselineErrors = baselineMetrics.filter((m) => !m.success).length;

  return {
    totalRequests,
    geminiFlashLiteRequests: geminiRequests,
    trafficPercentage:
      totalRequests > 0 ? (geminiRequests / totalRequests) * 100 : 0,
    averageLatency: {
      geminiFlashLite: avgGeminiLatency,
      baseline: avgBaselineLatency,
      improvement:
        avgBaselineLatency > 0
          ? ((avgBaselineLatency - avgGeminiLatency) / avgBaselineLatency) * 100
          : 0,
    },
    costSavings: {
      totalSaved: Math.max(0, baselineBenchmarkCost - geminiBenchmarkCost),
      percentageSaved:
        baselineBenchmarkCost > 0
          ? ((baselineBenchmarkCost - geminiBenchmarkCost) /
              baselineBenchmarkCost) *
            100
          : 0,
    },
    errorRates: {
      geminiFlashLite:
        geminiMetrics.length > 0
          ? (geminiErrors / geminiMetrics.length) * 100
          : 0,
      baseline:
        baselineMetrics.length > 0
          ? (baselineErrors / baselineMetrics.length) * 100
          : 0,
    },
    userSatisfaction: {
      geminiFlashLite: calculateAverageSatisfaction(geminiMetrics),
      baseline: calculateAverageSatisfaction(baselineMetrics),
    },
  };
}

/**
 * Check if rollout metrics meet success criteria
 */
export function evaluateRolloutSuccess(metrics: RolloutMetrics): {
  shouldProceed: boolean;
  criteriaEvaluation: {
    latency: { pass: boolean; value: number; target: number };
    cost: { pass: boolean; value: number; target: number };
    stability: { pass: boolean; value: number; target: number };
  };
  recommendation: string;
} {
  const criteriaEvaluation = {
    latency: {
      pass: metrics.averageLatency.improvement >= 0, // At least maintain latency
      value: metrics.averageLatency.improvement,
      target: 0,
    },
    cost: {
      pass: metrics.costSavings.percentageSaved >= 20,
      value: metrics.costSavings.percentageSaved,
      target: 20,
    },
    stability: {
      pass:
        metrics.errorRates.geminiFlashLite <= metrics.errorRates.baseline + 2, // Allow 2% increase
      value: metrics.errorRates.geminiFlashLite,
      target: metrics.errorRates.baseline + 2,
    },
  };

  const passedCriteria = Object.values(criteriaEvaluation).filter(
    (c) => c.pass,
  ).length;
  const shouldProceed = passedCriteria >= 2; // Need 2/3 criteria

  let recommendation = '';
  if (shouldProceed) {
    if (passedCriteria === 3) {
      recommendation = 'Excellent results! Ready to scale to 25% traffic.';
    } else {
      recommendation =
        'Good results! Consider monitoring closely before scaling.';
    }
  } else {
    recommendation =
      'Performance concerns detected. Review metrics and consider adjustments.';
  }

  return {
    shouldProceed,
    criteriaEvaluation,
    recommendation,
  };
}

/**
 * Generate Phase 3 status report
 */
export function generatePhase3Report(): string {
  const metrics = getRolloutMetrics(24);
  const evaluation = evaluateRolloutSuccess(metrics);

  return `
🚀 PHASE 3 ROLLOUT STATUS REPORT
================================

📊 TRAFFIC METRICS (24h):
• Total Requests: ${metrics.totalRequests}
• Gemini Flash Lite: ${metrics.geminiFlashLiteRequests} (${metrics.trafficPercentage.toFixed(1)}%)

⚡ PERFORMANCE:
• Gemini Flash Lite: ${metrics.averageLatency.geminiFlashLite.toFixed(1)}ms
• Baseline: ${metrics.averageLatency.baseline.toFixed(1)}ms
• Improvement: ${metrics.averageLatency.improvement > 0 ? '+' : ''}${metrics.averageLatency.improvement.toFixed(1)}%

💰 COST SAVINGS:
• Total Saved: $${metrics.costSavings.totalSaved.toFixed(4)}
• Percentage: ${metrics.costSavings.percentageSaved.toFixed(1)}%

🔧 RELIABILITY:
• Gemini Flash Lite Error Rate: ${metrics.errorRates.geminiFlashLite.toFixed(1)}%
• Baseline Error Rate: ${metrics.errorRates.baseline.toFixed(1)}%

✅ SUCCESS CRITERIA:
• Latency: ${evaluation.criteriaEvaluation.latency.pass ? '✅' : '❌'} (${evaluation.criteriaEvaluation.latency.value.toFixed(1)}%)
• Cost: ${evaluation.criteriaEvaluation.cost.pass ? '✅' : '❌'} (${evaluation.criteriaEvaluation.cost.value.toFixed(1)}%)
• Stability: ${evaluation.criteriaEvaluation.stability.pass ? '✅' : '❌'} (${evaluation.criteriaEvaluation.stability.value.toFixed(1)}%)

🎯 RECOMMENDATION: ${evaluation.recommendation}

${evaluation.shouldProceed ? '🟢 PROCEED' : '🟡 REVIEW NEEDED'}
  `;
}

function calculateAverageSatisfaction(
  metrics: ModelPerformanceMetric[],
): number {
  const withSatisfaction = metrics.filter((m) => m.userSatisfaction);
  if (withSatisfaction.length === 0) return 0;

  return (
    withSatisfaction.reduce((sum, m) => sum + (m.userSatisfaction || 0), 0) /
    withSatisfaction.length
  );
}

/**
 * Export metrics for external monitoring systems
 */
export function exportMetricsForAnalytics(): {
  metrics: ModelPerformanceMetric[];
  summary: RolloutMetrics;
  evaluation: ReturnType<typeof evaluateRolloutSuccess>;
} {
  const summary = getRolloutMetrics(24);
  const evaluation = evaluateRolloutSuccess(summary);

  return {
    metrics: performanceMetrics.slice(), // Copy array
    summary,
    evaluation,
  };
}
