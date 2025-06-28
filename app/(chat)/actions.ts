'use server';

import { generateText, type UIMessage } from 'ai';
import { cookies } from 'next/headers';
import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
} from '@/lib/db/queries';
import type { VisibilityType } from '@/components/visibility-selector';
import { openRouterClient } from '@/lib/ai/openrouter-client';

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set('chat-model', model);
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: UIMessage;
}) {
  const client = openRouterClient();
  if (!client) {
    throw new Error('OpenRouter client not initialized');
  }

  const response = await client.chat.completions.create({
    model: 'x-ai/grok-2-1212', // title-model
    messages: [
      {
        role: 'system',
        content: `- you will generate a short title based on the first message a user begins a conversation with
- ensure it is not more than 80 characters long
- the title should be a summary of the user's message
- do not use quotes or colons`,
      },
      {
        role: 'user',
        content: JSON.stringify(message),
      },
    ],
    temperature: 0.7,
    max_tokens: 100,
  });

  const title = response.choices[0]?.message?.content || 'New Chat';
  return title;
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const [message] = await getMessageById({ id });

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  await updateChatVisiblityById({ chatId, visibility });
}
