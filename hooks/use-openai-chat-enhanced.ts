'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { useOpenAIChat } from './use-openai-chat';
import type { OpenAIMessage } from '@/lib/types/openai';
import type { OpenAIChatHelpers } from '@/lib/types/openai';

// Enhanced hook that wraps useOpenAIChat with performance tracking and optimizations
export interface EnhancedOpenAIChatOptions {
  id: string;
  initialMessages?: OpenAIMessage[];
  selectedChatModel?: string;
  selectedVisibilityType?: 'public' | 'private';
  body?: Record<string, any>;
  onFinish?: () => void;
  onError?: (error: Error) => void;
  // OpenRouter/Enhanced specific options
  performanceTracking?: boolean;
  cachingEnabled?: boolean;
  retryAttempts?: number;
  experimentalThrottle?: number;
}

export interface EnhancedOpenAIChatHelpers extends OpenAIChatHelpers {
  // Additional enhanced features
  performanceMetrics: {
    latency: number;
    tokensPerSecond: number;
    cacheHitRate: number;
    requestCount: number;
    totalTokens: number;
    averageResponseTime: number;
  };
  retry: () => void;
  clearCache: () => void;
  getConnectionStatus: () => 'connected' | 'disconnected' | 'connecting';
  exportMetrics: () => string;
}

interface PerformanceState {
  latency: number;
  tokensPerSecond: number;
  cacheHitRate: number;
  requestCount: number;
  cacheHits: number;
  startTime: number;
  tokenCount: number;
  totalTokens: number;
  responseTimesSum: number;
  averageResponseTime: number;
}

interface CacheEntry {
  response: any;
  timestamp: number;
  ttl: number;
  tokens: number;
}

// Request cache for caching responses
const requestCache = new Map<string, CacheEntry>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_THROTTLE = 100;

export function useOpenAIChatEnhanced(
  options: EnhancedOpenAIChatOptions,
): EnhancedOpenAIChatHelpers {
  const {
    performanceTracking = true,
    cachingEnabled = true,
    retryAttempts = MAX_RETRY_ATTEMPTS,
    experimentalThrottle = DEFAULT_THROTTLE,
    ...chatOptions
  } = options;

  // Performance tracking state
  const [performanceState, setPerformanceState] = useState<PerformanceState>({
    latency: 0,
    tokensPerSecond: 0,
    cacheHitRate: 0,
    requestCount: 0,
    cacheHits: 0,
    startTime: 0,
    tokenCount: 0,
    totalTokens: 0,
    responseTimesSum: 0,
    averageResponseTime: 0,
  });

  // Connection status tracking
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'disconnected' | 'connecting'
  >('disconnected');

  // Retry state
  const retryCount = useRef(0);
  const lastRequestBody = useRef<any>(null);
  const responseBuffer = useRef<string>('');
  const throttleTimer = useRef<NodeJS.Timeout>();

  // Generate cache key for requests
  const generateCacheKey = useCallback(
    (message: OpenAIMessage, model: string) => {
      return JSON.stringify({
        content: message.content,
        role: message.role,
        model,
        visibility: options.selectedVisibilityType,
      });
    },
    [options.selectedVisibilityType],
  );

  // Check cache for similar requests
  const checkCache = useCallback(
    (message: OpenAIMessage, model: string) => {
      if (!cachingEnabled) return null;

      const cacheKey = generateCacheKey(message, model);
      const cached = requestCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < cached.ttl) {
        // Update cache hit metrics
        setPerformanceState((prev) => ({
          ...prev,
          cacheHits: prev.cacheHits + 1,
          requestCount: prev.requestCount + 1,
          cacheHitRate: (prev.cacheHits + 1) / (prev.requestCount + 1),
          totalTokens: prev.totalTokens + cached.tokens,
        }));

        console.log('[Enhanced OpenAI Chat] Cache hit for request');
        return cached.response;
      }

      return null;
    },
    [cachingEnabled, generateCacheKey],
  );

  // Store response in cache
  const storeInCache = useCallback(
    (message: OpenAIMessage, model: string, response: any, tokens: number) => {
      if (!cachingEnabled) return;

      const cacheKey = generateCacheKey(message, model);
      requestCache.set(cacheKey, {
        response,
        timestamp: Date.now(),
        ttl: CACHE_TTL,
        tokens,
      });

      console.log('[Enhanced OpenAI Chat] Response cached');
    },
    [cachingEnabled, generateCacheKey],
  );

  // Enhanced performance tracking for requests
  const trackRequestStart = useCallback(() => {
    const startTime = Date.now();

    // Store for potential retry
    lastRequestBody.current = { startTime };
    retryCount.current = 0;
    responseBuffer.current = '';

    // Update performance tracking
    setPerformanceState((prev) => ({
      ...prev,
      startTime,
      tokenCount: 0,
      requestCount: prev.requestCount + 1,
    }));

    setConnectionStatus('connecting');
  }, []);

  // Enhanced onFinish with performance tracking and caching
  const enhancedOnFinish = useCallback(() => {
    const endTime = Date.now();
    const latency = endTime - performanceState.startTime;
    const tokensPerSecond =
      responseBuffer.current.length / (latency / 1000) || 0;
    const tokenCount = responseBuffer.current.length;

    // Update performance metrics
    setPerformanceState((prev) => {
      const newResponseTimeSum = prev.responseTimesSum + latency;
      const newRequestCount = prev.requestCount;
      return {
        ...prev,
        latency,
        tokensPerSecond,
        tokenCount,
        totalTokens: prev.totalTokens + tokenCount,
        responseTimesSum: newResponseTimeSum,
        averageResponseTime:
          newRequestCount > 0 ? newResponseTimeSum / newRequestCount : 0,
      };
    });

    setConnectionStatus('connected');
    retryCount.current = 0;

    // Store successful response in cache (simplified for now)
    // Cache integration can be enhanced with specific message content when needed

    // Call original onFinish if provided
    if (options.onFinish) {
      options.onFinish();
    }

    console.log('[Enhanced OpenAI Chat] Request completed successfully');
  }, [
    performanceState.startTime,
    responseBuffer.current,
    options.onFinish,
    options.selectedChatModel,
    storeInCache,
  ]);

  // Enhanced error handling with retry logic
  const enhancedOnError = useCallback(
    (error: Error) => {
      console.error('[Enhanced OpenAI Chat] Error:', error);
      setConnectionStatus('disconnected');

      // Implement retry logic
      if (retryCount.current < retryAttempts) {
        retryCount.current += 1;
        console.log(
          `[Enhanced OpenAI Chat] Retrying request (attempt ${retryCount.current}/${retryAttempts})`,
        );

        // Add exponential backoff
        const delay = Math.pow(2, retryCount.current - 1) * 1000;
        setTimeout(() => {
          setConnectionStatus('connecting');
          // The retry will be handled by the retry function
        }, delay);
      } else {
        // Call original onError if provided
        if (options.onError) {
          options.onError(error);
        }
      }
    },
    [retryAttempts, options.onError],
  );

  // Use our OpenAI chat hook with enhanced options
  const chatHelpers = useOpenAIChat({
    id: options.id,
    initialMessages: options.initialMessages,
    selectedChatModel: options.selectedChatModel,
    selectedVisibilityType: options.selectedVisibilityType,
    onFinish: enhancedOnFinish,
    onError: enhancedOnError,
  });

  // Enhanced sendMessage with throttling and performance tracking
  const enhancedSendMessage = useCallback(
    async (content: string, attachments: any[] = []) => {
      if (throttleTimer.current) {
        clearTimeout(throttleTimer.current);
      }

      return new Promise<void>((resolve) => {
        throttleTimer.current = setTimeout(async () => {
          try {
            // Track request start
            trackRequestStart();
            await chatHelpers.sendMessage(content, attachments);
            resolve();
          } catch (error) {
            enhancedOnError(error as Error);
            resolve();
          }
        }, experimentalThrottle);
      });
    },
    [
      chatHelpers.sendMessage,
      experimentalThrottle,
      enhancedOnError,
      trackRequestStart,
    ],
  );

  // Track streaming data for performance metrics (throttled)
  useEffect(() => {
    if (chatHelpers.messages.length > 0) {
      const lastMessage = chatHelpers.messages[chatHelpers.messages.length - 1];
      if (lastMessage.role === 'assistant') {
        responseBuffer.current = lastMessage.content;
      }
    }
  }, [chatHelpers.messages]);

  // Enhanced retry function
  const retry = useCallback(() => {
    if (chatHelpers.messages.length > 0) {
      console.log('[Enhanced OpenAI Chat] Retrying last request');
      setConnectionStatus('connecting');
      chatHelpers.reload();
    }
  }, [chatHelpers]);

  // Clear cache function
  const clearCache = useCallback(() => {
    requestCache.clear();
    setPerformanceState((prev) => ({
      ...prev,
      cacheHits: 0,
      requestCount: 0,
      cacheHitRate: 0,
      totalTokens: 0,
      responseTimesSum: 0,
      averageResponseTime: 0,
    }));
    console.log('[Enhanced OpenAI Chat] Cache cleared');
  }, []);

  // Get connection status
  const getConnectionStatus = useCallback(() => {
    return connectionStatus;
  }, [connectionStatus]);

  // Export performance metrics
  const exportMetrics = useCallback(() => {
    const metrics = {
      ...performanceState,
      connectionStatus,
      cacheSize: requestCache.size,
      timestamp: new Date().toISOString(),
    };
    return JSON.stringify(metrics, null, 2);
  }, [performanceState, connectionStatus]);

  // Auto-reconnect logic
  useEffect(() => {
    if (
      connectionStatus === 'disconnected' &&
      retryCount.current < retryAttempts
    ) {
      const reconnectDelay = Math.pow(2, retryCount.current) * 1000;
      const timer = setTimeout(() => {
        console.log('[Enhanced OpenAI Chat] Attempting auto-reconnect');
        retry();
      }, reconnectDelay);

      return () => clearTimeout(timer);
    }
  }, [connectionStatus, retryAttempts, retry]);

  // Performance metrics cleanup
  useEffect(() => {
    const cleanup = () => {
      // Clean expired cache entries periodically
      for (const [key, value] of requestCache.entries()) {
        if (Date.now() - value.timestamp > value.ttl) {
          requestCache.delete(key);
        }
      }
    };

    const interval = setInterval(cleanup, 60000); // Clean every minute
    return () => clearInterval(interval);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (throttleTimer.current) {
        clearTimeout(throttleTimer.current);
      }
    };
  }, []);

  // Return enhanced chat helpers
  return {
    ...chatHelpers,
    sendMessage: enhancedSendMessage,
    performanceMetrics: {
      latency: performanceState.latency,
      tokensPerSecond: performanceState.tokensPerSecond,
      cacheHitRate: performanceState.cacheHitRate,
      requestCount: performanceState.requestCount,
      totalTokens: performanceState.totalTokens,
      averageResponseTime: performanceState.averageResponseTime,
    },
    retry,
    clearCache,
    getConnectionStatus,
    exportMetrics,
  };
}
