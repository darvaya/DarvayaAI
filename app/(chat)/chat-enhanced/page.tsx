import { auth } from '@/app/(auth)/auth';
import { Chat } from '@/components/chat';
import { getChatById, getMessagesByChatId } from '@/lib/db/queries';
import { convertToCoreMessages } from 'ai';
import { notFound } from 'next/navigation';
import { convertMessagesToOpenAI } from '@/lib/utils/message-formatting';

export default async function ChatEnhancedPage() {
  const session = await auth();

  if (!session || !session.user) {
    return notFound();
  }

  // Create a new enhanced chat with default settings
  const chatId = `enhanced-${Date.now()}`;

  return (
    <Chat
      key={chatId}
      id={chatId}
      initialMessages={[]}
      initialChatModel="gpt-4"
      initialVisibilityType="private"
      isReadonly={false}
      session={session}
      autoResume={false}
    />
  );
}
