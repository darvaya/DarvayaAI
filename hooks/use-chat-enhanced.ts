'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import type { UseChatHelpers } from '@ai-sdk/react';

// Enhanced hook that wraps useChat with OpenRouter optimizations
export interface EnhancedChatOptions {
  id: string;
  initialMessages?: UIMessage[];
  selectedChatModel?: string;
  selectedVisibilityType?: 'public' | 'private';
  experimentalThrottle?: number;
  sendExtraMessageFields?: boolean;
  onFinish?: () => void;
  onError?: (error: Error) => void;
  experimental_prepareRequestBody?: (body: any) => any;
  // OpenRouter specific options
  performanceTracking?: boolean;
  cachingEnabled?: boolean;
  retryAttempts?: number;
}

export interface EnhancedChatHelpers extends UseChatHelpers {
  // Additional OpenRouter features
  performanceMetrics: {
    latency: number;
    tokensPerSecond: number;
    cacheHitRate: number;
    requestCount: number;
  };
  retry: () => void;
  clearCache: () => void;
  getConnectionStatus: () => 'connected' | 'disconnected' | 'connecting';
}

interface PerformanceState {
  latency: number;
  tokensPerSecond: number;
  cacheHitRate: number;
  requestCount: number;
  cacheHits: number;
  startTime: number;
  tokenCount: number;
}

// Request cache for caching responses
const requestCache = new Map<
  string,
  {
    response: any;
    timestamp: number;
    ttl: number;
  }
>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_RETRY_ATTEMPTS = 3;

export function useChatEnhanced(
  options: EnhancedChatOptions,
): EnhancedChatHelpers {
  const {
    performanceTracking = true,
    cachingEnabled = true,
    retryAttempts = MAX_RETRY_ATTEMPTS,
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
  });

  // Connection status tracking
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'disconnected' | 'connecting'
  >('disconnected');

  // Retry state
  const retryCount = useRef(0);
  const lastRequestBody = useRef<any>(null);

  // Generate cache key for requests
  const generateCacheKey = useCallback((body: any) => {
    return JSON.stringify({
      message: body.message,
      model: body.selectedChatModel,
      visibility: body.selectedVisibilityType,
    });
  }, []);

  // Check cache for similar requests
  const checkCache = useCallback(
    (body: any) => {
      if (!cachingEnabled) return null;

      const cacheKey = generateCacheKey(body);
      const cached = requestCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < cached.ttl) {
        // Update cache hit metrics
        setPerformanceState((prev) => ({
          ...prev,
          cacheHits: prev.cacheHits + 1,
          requestCount: prev.requestCount + 1,
          cacheHitRate: (prev.cacheHits + 1) / (prev.requestCount + 1),
        }));
        return cached.response;
      }

      return null;
    },
    [cachingEnabled, generateCacheKey],
  );

  // Store response in cache
  const storeInCache = useCallback(
    (body: any, response: any) => {
      if (!cachingEnabled) return;

      const cacheKey = generateCacheKey(body);
      requestCache.set(cacheKey, {
        response,
        timestamp: Date.now(),
        ttl: CACHE_TTL,
      });
    },
    [cachingEnabled, generateCacheKey],
  );

  // Enhanced prepare request body with caching and performance tracking
  const enhancedPrepareRequestBody = useCallback(
    (body: any) => {
      const startTime = Date.now();

      // Store for potential retry
      lastRequestBody.current = body;
      retryCount.current = 0;

      // Update performance tracking
      setPerformanceState((prev) => ({
        ...prev,
        startTime,
        tokenCount: 0,
        requestCount: prev.requestCount + 1,
      }));

      setConnectionStatus('connecting');

      // Check cache first
      const cachedResponse = checkCache(body);
      if (cachedResponse) {
        setConnectionStatus('connected');
        return cachedResponse;
      }

      // Call original prepare function if provided
      const preparedBody = options.experimental_prepareRequestBody
        ? options.experimental_prepareRequestBody(body)
        : body;

      return preparedBody;
    },
    [options.experimental_prepareRequestBody, checkCache],
  );

  // Enhanced onFinish with performance tracking and caching
  const enhancedOnFinish = useCallback(() => {
    const endTime = Date.now();
    const latency = endTime - performanceState.startTime;
    const tokensPerSecond = performanceState.tokenCount / (latency / 1000) || 0;

    // Update performance metrics
    setPerformanceState((prev) => ({
      ...prev,
      latency,
      tokensPerSecond,
    }));

    setConnectionStatus('connected');
    retryCount.current = 0;

    // Store successful response in cache
    if (lastRequestBody.current) {
      storeInCache(lastRequestBody.current, {
        success: true,
        timestamp: endTime,
      });
    }

    // Call original onFinish if provided
    if (options.onFinish) {
      options.onFinish();
    }
  }, [
    performanceState.startTime,
    performanceState.tokenCount,
    options.onFinish,
    storeInCache,
  ]);

  // Enhanced error handling with retry logic
  const enhancedOnError = useCallback(
    (error: Error) => {
      console.error('[Enhanced Chat] Error:', error);
      setConnectionStatus('disconnected');

      // Implement retry logic
      if (retryCount.current < retryAttempts) {
        retryCount.current += 1;
        console.log(
          `[Enhanced Chat] Retrying request (attempt ${retryCount.current}/${retryAttempts})`,
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

  // Use the original useChat hook with our enhanced options
  const chatHelpers = useChat({
    ...chatOptions,
    experimental_prepareRequestBody: enhancedPrepareRequestBody,
    onFinish: enhancedOnFinish,
    onError: enhancedOnError,
  });

  // Track streaming data for performance metrics
  useEffect(() => {
    if (chatHelpers.data && chatHelpers.data.length > 0) {
      setPerformanceState((prev) => ({
        ...prev,
        tokenCount: chatHelpers.data?.length || 0,
      }));
    }
  }, [chatHelpers.data]);

  // Enhanced retry function
  const retry = useCallback(() => {
    if (chatHelpers.messages.length > 0) {
      console.log('[Enhanced Chat] Retrying last request');
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
    }));
    console.log('[Enhanced Chat] Cache cleared');
  }, []);

  // Get connection status
  const getConnectionStatus = useCallback(() => {
    return connectionStatus;
  }, [connectionStatus]);

  // Auto-reconnect logic
  useEffect(() => {
    if (
      connectionStatus === 'disconnected' &&
      retryCount.current < retryAttempts
    ) {
      const reconnectDelay = Math.pow(2, retryCount.current) * 1000;
      const timer = setTimeout(() => {
        console.log('[Enhanced Chat] Attempting auto-reconnect');
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

  // Return enhanced chat helpers
  return {
    ...chatHelpers,
    performanceMetrics: {
      latency: performanceState.latency,
      tokensPerSecond: performanceState.tokensPerSecond,
      cacheHitRate: performanceState.cacheHitRate,
      requestCount: performanceState.requestCount,
    },
    retry,
    clearCache,
    getConnectionStatus,
  };
}
