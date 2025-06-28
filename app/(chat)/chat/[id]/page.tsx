import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { auth } from '@/app/(auth)/auth';
import { Chat } from '@/components/chat';
import { getChatById, getMessagesByChatId } from '@/lib/db/queries';

import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import type { DBMessage } from '@/lib/db/schema';
import type { Attachment, UIMessage } from 'ai';

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;

  // Development bypass for database calls (same as chat API)
  const isDevelopmentBypass =
    process.env.NODE_ENV === 'development' &&
    !process.env.DATABASE_URL?.includes('localhost');

  let chat = null;
  let messagesFromDb: Array<DBMessage> = [];

  if (!isDevelopmentBypass) {
    try {
      chat = await getChatById({ id });

      if (!chat) {
        notFound();
      }

      messagesFromDb = await getMessagesByChatId({ id });
    } catch (error) {
      console.error('Database error in development, using fallback:', error);
      // Create a fallback chat object for development
      chat = {
        id,
        userId: 'dev-user',
        title: 'Development Chat',
        visibility: 'private' as const,
        createdAt: new Date(),
      };
      messagesFromDb = [];
    }
  } else {
    console.log('🔧 Development mode: Using fallback chat data');
    // Create a fallback chat object for development
    chat = {
      id,
      userId: 'dev-user',
      title: 'Development Chat',
      visibility: 'private' as const,
      createdAt: new Date(),
    };
    messagesFromDb = [];
  }

  if (!chat) {
    notFound();
  }

  const session = await auth();

  if (!session) {
    redirect('/api/auth/guest');
  }

  if (chat.visibility === 'private') {
    if (!session.user) {
      return notFound();
    }

    if (session.user.id !== chat.userId) {
      return notFound();
    }
  }

  function convertToUIMessages(messages: Array<DBMessage>): Array<UIMessage> {
    console.log(
      '🔍 Converting database messages to UI messages:',
      messages.length,
      'messages',
    );

    return messages.map((message, messageIndex) => {
      console.log(`🔍 Processing message ${messageIndex}:`, {
        id: message.id,
        role: message.role,
        parts: message.parts,
      });

      // Validate and log original parts before sanitization
      if (message.parts && Array.isArray(message.parts)) {
        (message.parts as any[]).forEach((part: any, partIndex: number) => {
          if (part.type === 'text') {
            console.log(
              `🔍 Message ${messageIndex}, Part ${partIndex} - type: ${typeof part.text}, value:`,
              part.text,
            );
            if (typeof part.text !== 'string') {
              console.error(
                `❌ DATABASE: Non-string text part found in message ${messageIndex}, part ${partIndex}:`,
                part,
              );
              console.error(
                '🚨 This is likely the source of the "text parts expect string value" error!',
              );
            }
          }
        });
      }

      // Ensure all text parts have valid string values
      const sanitizedParts = (message.parts as any[]).map(
        (part: any, partIndex: number) => {
          if (part.type === 'text') {
            const originalText = part.text;
            const sanitizedText = String(part.text || '');

            if (originalText !== sanitizedText) {
              console.log(
                `✅ DATABASE: Sanitized message ${messageIndex}, part ${partIndex} from`,
                typeof originalText,
                'to string:',
                sanitizedText,
              );
            }

            return {
              ...part,
              text: sanitizedText, // Ensure text is always a string
            };
          }
          return part;
        },
      );

      const uiMessage = {
        id: message.id,
        parts: sanitizedParts as UIMessage['parts'],
        role: message.role as UIMessage['role'],
        // Note: content will soon be deprecated in @ai-sdk/react
        content: '',
        createdAt: message.createdAt,
        experimental_attachments:
          (message.attachments as Array<Attachment>) ?? [],
      };

      console.log(`✅ Converted message ${messageIndex}:`, {
        id: uiMessage.id,
        role: uiMessage.role,
        parts: uiMessage.parts,
      });

      return uiMessage;
    });
  }

  const cookieStore = await cookies();
  const chatModelFromCookie = cookieStore.get('chat-model');

  if (!chatModelFromCookie) {
    return (
      <>
        <Chat
          id={chat.id}
          initialMessages={convertToUIMessages(messagesFromDb)}
          initialChatModel={DEFAULT_CHAT_MODEL}
          initialVisibilityType={chat.visibility}
          isReadonly={session?.user?.id !== chat.userId}
          session={session}
          autoResume={true}
        />
      </>
    );
  }

  return (
    <>
      <Chat
        id={chat.id}
        initialMessages={convertToUIMessages(messagesFromDb)}
        initialChatModel={chatModelFromCookie.value}
        initialVisibilityType={chat.visibility}
        isReadonly={session?.user?.id !== chat.userId}
        session={session}
        autoResume={true}
      />
    </>
  );
}
