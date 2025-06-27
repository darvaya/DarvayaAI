import { NextResponse } from 'next/server';
import {
  getPerformanceMetrics,
  resetPerformanceMetrics,
  openRouterCache,
} from '@/lib/ai/performance';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'reset') {
      resetPerformanceMetrics();
      return NextResponse.json({
        message: 'Performance metrics reset successfully',
        timestamp: new Date().toISOString(),
      });
    }

    const metrics = getPerformanceMetrics();

    // Add cache statistics
    const cacheStats = {
      size: openRouterCache.size(),
      hitRate: metrics.cacheHitRate,
      hits: metrics.cacheHits,
      misses: metrics.cacheMisses,
    };

    // Calculate additional insights
    const insights = {
      status:
        metrics.errorRate < 0.05
          ? 'healthy'
          : metrics.errorRate < 0.15
            ? 'warning'
            : 'critical',
      performanceGrade: getPerformanceGrade(metrics),
      recommendations: getPerformanceRecommendations(metrics),
    };

    return NextResponse.json({
      metrics,
      cache: cacheStats,
      insights,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Performance API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch performance metrics' },
      { status: 500 },
    );
  }
}

function getPerformanceGrade(metrics: any): string {
  const { averageLatency, errorRate, cacheHitRate } = metrics;

  let score = 100;

  // Latency scoring (target: < 2000ms)
  if (averageLatency > 5000) score -= 30;
  else if (averageLatency > 3000) score -= 20;
  else if (averageLatency > 2000) score -= 10;

  // Error rate scoring (target: < 1%)
  if (errorRate > 0.1) score -= 40;
  else if (errorRate > 0.05) score -= 20;
  else if (errorRate > 0.01) score -= 10;

  // Cache hit rate scoring (target: > 20%)
  if (cacheHitRate < 0.1) score -= 15;
  else if (cacheHitRate < 0.2) score -= 10;
  else if (cacheHitRate > 0.5) score += 5;

  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function getPerformanceRecommendations(metrics: any): string[] {
  const recommendations: string[] = [];

  if (metrics.averageLatency > 3000) {
    recommendations.push(
      'High latency detected. Consider optimizing model selection or enabling caching.',
    );
  }

  if (metrics.errorRate > 0.05) {
    recommendations.push(
      'High error rate detected. Check OpenRouter API status and network connectivity.',
    );
  }

  if (metrics.cacheHitRate < 0.2 && metrics.requestCount > 10) {
    recommendations.push(
      'Low cache hit rate. Consider implementing request deduplication or longer cache TTL.',
    );
  }

  if (metrics.requestsPerMinute > 100) {
    recommendations.push(
      'High request volume. Consider implementing request batching or rate limiting.',
    );
  }

  if (metrics.tokensGenerated / metrics.requestCount > 2000) {
    recommendations.push(
      'High average tokens per request. Consider optimizing prompts or using max_tokens limits.',
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      'Performance looks good! No immediate optimizations needed.',
    );
  }

  return recommendations;
}
