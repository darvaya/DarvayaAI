'use client';

import type { Attachment, UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useEffect, useState, useRef } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, fetchWithErrorHandlers, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import {
  useArtifactSelector,
  useArtifact,
  initialArtifactData,
} from '@/hooks/use-artifact';
import { artifactDefinitions } from './artifact';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';
import { toast } from './toast';
import type { Session } from 'next-auth';
import { useSearchParams } from 'next/navigation';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import { useAutoResume } from '@/hooks/use-auto-resume';
import { ChatSDKError } from '@/lib/errors';
import { trackChatMessage } from '@/lib/analytics';

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  session,
  autoResume,
}: {
  id: string;
  initialMessages: Array<UIMessage>;
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  session: Session;
  autoResume: boolean;
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
  } = useChat({
    id,
    initialMessages: initialMessages.map((msg) => {
      // Debug and ensure message parts are properly formatted
      console.log('🔍 Initial message:', msg.id, msg.parts);
      if (msg.parts) {
        const sanitizedParts = msg.parts.map((part: any) => {
          if (part.type === 'text' && typeof part.text !== 'string') {
            console.warn('⚠️ Non-string text part found:', part);
            return { ...part, text: String(part.text || '') };
          }
          return part;
        });
        return { ...msg, parts: sanitizedParts };
      }
      return msg;
    }),
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    fetch: fetchWithErrorHandlers,
    experimental_prepareRequestBody: (body) => {
      const lastMessage = body.messages.at(-1);

      // Transform AI SDK message format to our API schema format
      const transformedMessage = {
        id: lastMessage?.id || generateUUID(),
        createdAt: lastMessage?.createdAt || new Date(),
        role: lastMessage?.role || 'user',
        content: lastMessage?.content || '',
        parts: [
          {
            type: 'text' as const,
            text: String(lastMessage?.content || ''), // Ensure it's a string
          },
        ],
        experimental_attachments: lastMessage?.experimental_attachments || [],
      };

      return {
        id,
        message: transformedMessage,
        selectedChatModel: initialChatModel,
        selectedVisibilityType: visibilityType,
      };
    },
    onFinish: () => {
      console.log('🎉 Chat stream finished successfully');
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
      console.error('❌ Chat stream error:', error);
      if (error instanceof ChatSDKError) {
        toast({
          type: 'error',
          description: error.message,
        });
      }
    },
  });

  const searchParams = useSearchParams();
  const query = searchParams.get('query');

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  // Add debugging for streaming status and data
  useEffect(() => {
    console.log('🔄 Chat status changed:', status);
  }, [status]);

  useEffect(() => {
    if (data?.length) {
      console.log(
        '📊 New streaming data:',
        data.length,
        'chunks, latest:',
        data[data.length - 1],
      );
    }
  }, [data]);

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

  // Add artifact handling from DataStreamHandler
  const { artifact, setArtifact, setMetadata } = useArtifact();
  const lastProcessedIndex = useRef(-1);

  // ENHANCED: Process data stream for artifacts with coordinated tool events
  useEffect(() => {
    if (!data?.length) return;

    const newDeltas = data.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = data.length - 1;

    newDeltas.forEach((delta: any) => {
      // Enhanced deserialization for tool events
      let processedDelta = delta;
      const isToolEvent = [
        'tool-call',
        'tool-result',
        'tool-start',
        'tool-complete',
        'tool-error',
        'model-routing',
      ].includes(delta.type);

      if (isToolEvent && typeof delta.content === 'string') {
        try {
          const parsedContent = JSON.parse(delta.content);
          processedDelta = {
            ...delta,
            content: parsedContent,
            data: parsedContent,
          };
        } catch (error) {
          // Use original delta if parsing fails
          console.warn(
            `Failed to parse ${delta.type} in Chat component:`,
            error,
          );
          processedDelta = delta;
        }
      }

      const artifactDefinition = artifactDefinitions.find(
        (artifactDefinition) => artifactDefinition.kind === artifact.kind,
      );

      if (artifactDefinition?.onStreamPart) {
        artifactDefinition.onStreamPart({
          streamPart: processedDelta,
          setArtifact,
          setMetadata,
        });
      }

      setArtifact((draftArtifact) => {
        if (!draftArtifact) {
          return { ...initialArtifactData, status: 'streaming' };
        }

        switch (processedDelta.type) {
          case 'id':
            return {
              ...draftArtifact,
              documentId: processedDelta.content as string,
              status: 'streaming',
            };

          case 'title':
            return {
              ...draftArtifact,
              title: processedDelta.content as string,
              status: 'streaming',
            };

          case 'kind':
            return {
              ...draftArtifact,
              kind: processedDelta.content as any,
              status: 'streaming',
            };

          case 'clear':
            return {
              ...draftArtifact,
              content: '',
              status: 'streaming',
            };

          case 'finish':
            return {
              ...draftArtifact,
              status: 'idle',
            };

          // NEW: Handle coordinated tool execution events
          case 'tool-start':
            console.log('🔧 Tool started:', processedDelta.data);
            return {
              ...draftArtifact,
              status: 'streaming',
              isVisible: true, // Make artifact visible when tool starts
            };

          case 'tool-complete':
            console.log('✅ Tool completed:', processedDelta.data);
            return {
              ...draftArtifact,
              status: 'idle', // Tool completed successfully
            };

          case 'tool-error':
            console.warn(
              '❌ Tool error:',
              processedDelta.data?.error || processedDelta.content,
            );
            return {
              ...draftArtifact,
              status: 'idle', // Reset to idle state on error
            };

          default:
            return draftArtifact;
        }
      });
    });
  }, [data, setArtifact, setMetadata, artifact]);

  useAutoResume({
    autoResume,
    initialMessages,
    experimental_resume,
    data,
    setMessages,
  });

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
