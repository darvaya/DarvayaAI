'use client';

import { useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { useArtifactSelector, useArtifact } from '@/hooks/use-artifact';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';
import { toast } from './toast';
import type { Session } from 'next-auth';
import { useSearchParams } from 'next/navigation';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import { ChatSDKError } from '@/lib/errors';
import { trackChatMessage } from '@/lib/analytics';

// New OpenAI SDK imports
import { useOpenAIChat } from '@/hooks/use-openai-chat';
import type { OpenAIMessage, ChatStatus } from '@/lib/types/openai';
import { convertMessagesToOpenAI } from '@/lib/utils/message-formatting';

// Compatibility imports for existing components
import type { UIMessage, Attachment as VercelAttachment } from 'ai';
import type { UseChatHelpers } from '@ai-sdk/react';

// Type conversion utilities
function convertOpenAIToUIMessage(message: OpenAIMessage): UIMessage {
  return {
    id: message.id || generateUUID(),
    role: message.role === 'tool' ? 'assistant' : message.role, // Map tool role to assistant
    content: message.content,
    createdAt: message.createdAt || new Date(),
    // Convert content to parts format for compatibility
    parts: [
      {
        type: 'text' as const,
        text: message.content,
      },
    ],
  };
}

function convertChatStatusToVercelStatus(
  status: ChatStatus,
): UseChatHelpers['status'] {
  switch (status) {
    case 'idle':
      return 'ready';
    case 'streaming':
      return 'streaming';
    case 'error':
      return 'error';
    case 'loading':
      return 'submitted';
    default:
      return 'ready';
  }
}

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
  initialMessages: Array<any>; // Accept both UIMessage and OpenAIMessage formats
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

  // Convert initial messages to OpenAI format
  const openAIInitialMessages = convertMessagesToOpenAI(initialMessages);

  const {
    messages: openAIMessages,
    setMessages: setOpenAIMessages,
    handleSubmit: openAIHandleSubmit,
    input,
    setInput: openAISetInput,
    append: openAIAppend,
    status: openAIStatus,
    stop,
    reload: openAIReload,
    sendMessage,
    error,
  } = useOpenAIChat({
    id,
    initialMessages: openAIInitialMessages,
    selectedChatModel: initialChatModel,
    selectedVisibilityType: visibilityType,
    onFinish: (message) => {
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

  // Create compatibility wrappers for existing components
  const messages = openAIMessages.map(convertOpenAIToUIMessage);
  const status = convertChatStatusToVercelStatus(openAIStatus);

  // Wrapper functions to maintain existing component interfaces
  const setMessages: UseChatHelpers['setMessages'] = (updater) => {
    if (typeof updater === 'function') {
      setOpenAIMessages((prev) => {
        const uiMessages = prev.map(convertOpenAIToUIMessage);
        const updated = updater(uiMessages);
        // Convert back to OpenAI format
        return convertMessagesToOpenAI(updated);
      });
    } else {
      setOpenAIMessages(convertMessagesToOpenAI(updater));
    }
  };

  const handleSubmit: UseChatHelpers['handleSubmit'] = (event, options) => {
    if (event && typeof event === 'object' && 'preventDefault' in event) {
      // Convert to proper FormEvent for our handler
      const formEvent = event as React.FormEvent;
      openAIHandleSubmit(formEvent);
    } else {
      openAIHandleSubmit();
    }
    return Promise.resolve(null); // Return promise to match expected signature
  };

  const append: UseChatHelpers['append'] = (message, options) => {
    const openAIMessage: OpenAIMessage = {
      id: generateUUID(),
      role: message.role === 'data' ? 'assistant' : message.role, // Map data role
      content: message.content,
      createdAt: new Date(),
    };
    openAIAppend(openAIMessage);
    return Promise.resolve(null); // Return promise to match expected signature
  };

  const reload: UseChatHelpers['reload'] = (chatRequestOptions) => {
    openAIReload();
    return Promise.resolve(null); // Return promise to match expected signature
  };

  // Create compatible setInput function
  const setInput: React.Dispatch<React.SetStateAction<string>> = (value) => {
    if (typeof value === 'function') {
      openAISetInput(value(input));
    } else {
      openAISetInput(value);
    }
  };

  const searchParams = useSearchParams();
  const query = searchParams.get('query');

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  // Add debugging for streaming status
  useEffect(() => {
    console.log('🔄 Chat status changed:', openAIStatus);
    if (openAIStatus === 'streaming') {
      console.log('📡 Starting to stream...');
    } else if (openAIStatus === 'error') {
      console.log('❌ Stream error occurred');
      if (error) {
        console.error('Error details:', error);
      }
    }
  }, [openAIStatus, error]);

  // Track messages for streaming behavior
  useEffect(() => {
    console.log(
      '💬 Messages updated:',
      openAIMessages.length,
      'total messages',
    );
    const lastMessage = openAIMessages[openAIMessages.length - 1];
    if (lastMessage?.role === 'assistant') {
      console.log(
        `🤖 Assistant message received: ${lastMessage.content?.substring(0, 50)}...`,
      );
    }
  }, [openAIMessages]);

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

  const [attachments, setAttachments] = useState<Array<VercelAttachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  // Add artifact handling - we'll need to adapt this for OpenAI streaming format
  const { artifact, setArtifact, setMetadata } = useArtifact();

  // For now, we'll implement a simplified artifact handling
  // TODO: Implement proper artifact streaming integration in Phase 3
  useEffect(() => {
    // This is a placeholder for artifact handling
    // We'll implement proper streaming artifact integration in Phase 3
    console.log('🎨 Artifact system ready for Phase 3 integration');
  }, [openAIMessages]);

  // Auto-resume functionality (simplified for OpenAI format)
  useEffect(() => {
    if (
      autoResume &&
      openAIMessages.length === 0 &&
      openAIInitialMessages.length > 0
    ) {
      console.log(
        '🔄 Auto-resuming conversation with',
        openAIInitialMessages.length,
        'messages',
      );
      setOpenAIMessages(openAIInitialMessages);
    }
  }, [
    autoResume,
    openAIMessages.length,
    openAIInitialMessages,
    setOpenAIMessages,
  ]);

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

      {isArtifactVisible && (
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
      )}
    </>
  );
}
