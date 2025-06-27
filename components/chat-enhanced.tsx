'use client';

import type { Attachment, UIMessage } from 'ai';
import { useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, fetchWithErrorHandlers, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';
import { toast } from './toast';
import type { Session } from 'next-auth';
import { useSearchParams } from 'next/navigation';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import { useAutoResume } from '@/hooks/use-auto-resume';
import { ChatSDKError } from '@/lib/errors';
import { trackChatMessage } from '@/lib/analytics';
import { useChatEnhanced } from '@/hooks/use-chat-enhanced';

// Performance indicator component
function PerformanceIndicator({
  metrics,
  connectionStatus,
}: {
  metrics: any;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
}) {
  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500';
      case 'disconnected':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'Disconnected';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500 px-4 py-2 border-b">
      <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
      <span>{getStatusText()}</span>

      {metrics.requestCount > 0 && (
        <>
          <span className="mx-2">•</span>
          <span>Latency: {metrics.latency.toFixed(0)}ms</span>

          {metrics.tokensPerSecond > 0 && (
            <>
              <span className="mx-2">•</span>
              <span>Speed: {metrics.tokensPerSecond.toFixed(1)} tokens/s</span>
            </>
          )}

          {metrics.cacheHitRate > 0 && (
            <>
              <span className="mx-2">•</span>
              <span>Cache: {(metrics.cacheHitRate * 100).toFixed(0)}%</span>
            </>
          )}
        </>
      )}
    </div>
  );
}

export function ChatEnhanced({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  session,
  autoResume,
  showPerformanceIndicator = true,
}: {
  id: string;
  initialMessages: Array<UIMessage>;
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  session: Session;
  autoResume: boolean;
  showPerformanceIndicator?: boolean;
}) {
  const { mutate } = useSWRConfig();

  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const {
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    append,
    status,
    stop,
    reload,
    experimental_resume,
    data,
    // Enhanced features
    performanceMetrics,
    retry,
    clearCache,
    getConnectionStatus,
  } = useChatEnhanced({
    id,
    initialMessages,
    experimentalThrottle: 100,
    sendExtraMessageFields: true,
    experimental_prepareRequestBody: (body) => ({
      id,
      message: body.messages.at(-1),
      selectedChatModel: initialChatModel,
      selectedVisibilityType: visibilityType,
    }),
    onFinish: () => {
      // Track assistant response
      trackChatMessage({
        chatId: id,
        messageType: 'assistant',
        hasAttachments: false,
        userId: session?.user?.id,
      });

      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    onError: (error) => {
      if (error instanceof ChatSDKError) {
        toast({
          type: 'error',
          description: error.message,
        });
      }
    },
    // Enhanced options
    performanceTracking: true,
    cachingEnabled: true,
    retryAttempts: 3,
  });

  const searchParams = useSearchParams();
  const query = searchParams.get('query');

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      append({
        role: 'user',
        content: query,
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, '', `/chat/${id}`);
    }
  }, [query, append, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Array<Vote>>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  useAutoResume({
    autoResume,
    initialMessages,
    experimental_resume,
    data,
    setMessages,
  });

  // Performance monitoring controls
  const handleRetry = () => {
    console.log('[ChatEnhanced] Manual retry triggered');
    retry();
  };

  const handleClearCache = () => {
    console.log('[ChatEnhanced] Cache cleared');
    clearCache();
    toast({
      type: 'success',
      description: 'Cache cleared successfully',
    });
  };

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <ChatHeader
          chatId={id}
          selectedModelId={initialChatModel}
          selectedVisibilityType={initialVisibilityType}
          isReadonly={isReadonly}
          session={session}
        />

        {/* Performance Indicator */}
        {showPerformanceIndicator && (
          <PerformanceIndicator
            metrics={performanceMetrics}
            connectionStatus={getConnectionStatus()}
          />
        )}

        <Messages
          chatId={id}
          status={status}
          votes={votes}
          messages={messages}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
          isArtifactVisible={isArtifactVisible}
        />

        <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
          {!isReadonly && (
            <MultimodalInput
              chatId={id}
              input={input}
              setInput={setInput}
              handleSubmit={handleSubmit}
              status={status}
              stop={stop}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages}
              setMessages={setMessages}
              append={append}
              selectedVisibilityType={visibilityType}
              session={session}
            />
          )}
        </form>

        {/* Enhanced controls for performance monitoring */}
        {showPerformanceIndicator &&
          getConnectionStatus() === 'disconnected' && (
            <div className="flex justify-center gap-2 p-4 bg-red-50 border-t border-red-200">
              <button
                type="button"
                onClick={handleRetry}
                className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                Retry Connection
              </button>
              <button
                type="button"
                onClick={handleClearCache}
                className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Clear Cache
              </button>
            </div>
          )}
      </div>

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        status={status}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={append}
        messages={messages}
        setMessages={setMessages}
        reload={reload}
        votes={votes}
        isReadonly={isReadonly}
        selectedVisibilityType={visibilityType}
      />
    </>
  );
}
