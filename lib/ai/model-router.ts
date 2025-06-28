/**
 * Model Router for Gemini Flash Lite Rollout
 * Phase 3: Production traffic routing with feature flags
 */

import type { ModelKey } from './openrouter-client';

export interface UserContext {
  userId?: string;
  isGuest: boolean;
  sessionId: string;
}

export interface RoutingConfig {
  geminiFlashLiteEnabled: boolean;
  trafficPercentage: number; // 0-100
  forceModel?: ModelKey; // Override for testing
}

// Production rollout configuration
// Start with 5% traffic as per Phase 3 plan
const ROLLOUT_CONFIG: RoutingConfig = {
  geminiFlashLiteEnabled: true,
  trafficPercentage: 5, // Start with 5% traffic
  // forceModel: undefined // Uncomment to force specific model for testing
};

/**
 * Determines if user should get Gemini Flash Lite based on:
 * 1. Feature flag status
 * 2. Traffic percentage
 * 3. User hashing for consistent experience
 */
export function shouldUseGeminiFlashLite(
  userContext: UserContext,
  config: RoutingConfig = ROLLOUT_CONFIG,
): boolean {
  // Feature flag check
  if (!config.geminiFlashLiteEnabled) {
    return false;
  }

  // Force model override (for testing)
  if (config.forceModel) {
    return config.forceModel === 'gemini-flash-lite';
  }

  // Traffic percentage routing using consistent user hashing
  const userHash = hashUserForRouting(userContext);
  const shouldRoute = userHash < config.trafficPercentage;

  return shouldRoute;
}

/**
 * Smart model selection that respects user choice but applies routing logic
 */
export function selectModelWithRouting(
  requestedModel: ModelKey,
  userContext: UserContext,
  config: RoutingConfig = ROLLOUT_CONFIG,
): ModelKey {
  // If user specifically requested Gemini Flash Lite, honor it (if enabled)
  if (requestedModel === 'gemini-flash-lite') {
    return config.geminiFlashLiteEnabled ? 'gemini-flash-lite' : 'chat-model';
  }

  // If user requested chat-model, apply routing logic
  if (requestedModel === 'chat-model') {
    return shouldUseGeminiFlashLite(userContext, config)
      ? 'gemini-flash-lite'
      : 'chat-model';
  }

  // For other models (reasoning, etc.), use as requested
  return requestedModel;
}

/**
 * Hash user identifier to ensure consistent routing
 * Same user always gets same experience during rollout
 */
function hashUserForRouting(userContext: UserContext): number {
  const identifier = userContext.userId || userContext.sessionId;
  let hash = 0;

  for (let i = 0; i < identifier.length; i++) {
    const char = identifier.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to 0-100 range
  return Math.abs(hash) % 100;
}

/**
 * Get current rollout statistics
 */
export function getRolloutStats(): {
  enabled: boolean;
  trafficPercentage: number;
  estimatedUsersAffected: string;
} {
  return {
    enabled: ROLLOUT_CONFIG.geminiFlashLiteEnabled,
    trafficPercentage: ROLLOUT_CONFIG.trafficPercentage,
    estimatedUsersAffected: `~${ROLLOUT_CONFIG.trafficPercentage}% of chat-model users`,
  };
}

/**
 * Admin function to update rollout configuration
 * Use with caution in production
 */
export function updateRolloutConfig(
  newConfig: Partial<RoutingConfig>,
): RoutingConfig {
  Object.assign(ROLLOUT_CONFIG, newConfig);

  console.log('🚀 Gemini Flash Lite rollout config updated:', {
    enabled: ROLLOUT_CONFIG.geminiFlashLiteEnabled,
    trafficPercentage: ROLLOUT_CONFIG.trafficPercentage,
    forceModel: ROLLOUT_CONFIG.forceModel,
  });

  return { ...ROLLOUT_CONFIG };
}

/**
 * Utility to gradually increase traffic over time
 */
export const ROLLOUT_SCHEDULE = {
  week1: {
    trafficPercentage: 5,
    description: 'Initial rollout - monitor closely',
  },
  week2: {
    trafficPercentage: 15,
    description: 'Expand if metrics are positive',
  },
  week3: { trafficPercentage: 35, description: 'Broader rollout if stable' },
  week4: { trafficPercentage: 100, description: 'Full rollout if successful' },
};

export type RolloutPhase = keyof typeof ROLLOUT_SCHEDULE;
