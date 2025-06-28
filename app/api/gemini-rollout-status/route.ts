import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import {
  generatePhase3Report,
  getRolloutMetrics,
  evaluateRolloutSuccess,
  exportMetricsForAnalytics,
} from '@/lib/ai/phase3-monitor';
import { getRolloutStats } from '@/lib/ai/model-router';

/**
 * GET /api/gemini-rollout-status
 * Returns Phase 3 rollout status and metrics
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    // Only allow authenticated users (could restrict to admins)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';
    const timeWindow = Number.parseInt(searchParams.get('hours') || '24');

    if (format === 'report') {
      // Return formatted text report
      const report = generatePhase3Report();

      return new NextResponse(report, {
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-cache',
        },
      });
    }

    // Return JSON metrics
    const metrics = getRolloutMetrics(timeWindow);
    const evaluation = evaluateRolloutSuccess(metrics);
    const rolloutConfig = getRolloutStats();

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      timeWindowHours: timeWindow,
      rolloutConfig,
      metrics,
      evaluation,
      status: evaluation.shouldProceed ? 'PROCEED' : 'REVIEW_NEEDED',
    });
  } catch (error) {
    console.error('Rollout status error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rollout status' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/gemini-rollout-status
 * Update rollout configuration (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    // Check authentication and admin rights
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // TODO: Add admin role check
    // if (session.user.role !== 'admin') {
    //   return NextResponse.json({ error: 'Admin required' }, { status: 403 });
    // }

    const { updateRolloutConfig } = await import('@/lib/ai/model-router');
    const body = await request.json();

    const validFields = [
      'geminiFlashLiteEnabled',
      'trafficPercentage',
      'forceModel',
    ];
    const updates: any = {};

    for (const field of validFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid update fields provided' },
        { status: 400 },
      );
    }

    // Validate traffic percentage
    if ('trafficPercentage' in updates) {
      const percentage = updates.trafficPercentage;
      if (
        typeof percentage !== 'number' ||
        percentage < 0 ||
        percentage > 100
      ) {
        return NextResponse.json(
          {
            error: 'trafficPercentage must be a number between 0 and 100',
          },
          { status: 400 },
        );
      }
    }

    const newConfig = updateRolloutConfig(updates);

    console.log(`🔧 Rollout config updated by ${session.user.email}:`, updates);

    return NextResponse.json({
      success: true,
      newConfig,
      updatedBy: session.user.email,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Rollout config update error:', error);
    return NextResponse.json(
      { error: 'Failed to update rollout configuration' },
      { status: 500 },
    );
  }
}
