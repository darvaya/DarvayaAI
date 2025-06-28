import { auth } from '@/app/(auth)/auth';
import type { NextRequest } from 'next/server';
import { getChatsByUserId } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import * as Sentry from '@sentry/nextjs';

export async function GET(request: NextRequest) {
  // Add Sentry instrumentation
  Sentry.getCurrentScope().setTag('api.route', 'history');

  const { searchParams } = request.nextUrl;

  const limit = Number.parseInt(searchParams.get('limit') || '20');
  const startingAfter = searchParams.get('starting_after');
  const endingBefore = searchParams.get('ending_before');

  if (startingAfter && endingBefore) {
    return new ChatSDKError(
      'bad_request:api',
      'Only one of starting_after or ending_before can be provided.',
    ).toResponse();
  }

  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return Response.json('Unauthorized', { status: 401 });
  }

  // Set user context for better error tracking
  Sentry.setUser({
    id: session.user.id,
    email: session.user.email || undefined,
  });

  // Bypass database in local development if connection fails
  if (
    process.env.NODE_ENV === 'development' &&
    !process.env.DATABASE_URL?.includes('localhost')
  ) {
    console.log('🔧 Development mode: Bypassing database for chat history');
    // Return empty paginated structure that frontend expects
    return Response.json({
      chats: [],
      hasMore: false,
    });
  }

  try {
    const chats = await getChatsByUserId({
      id: session.user.id,
      limit,
      startingAfter,
      endingBefore,
    });

    return Response.json(chats);
  } catch (error) {
    console.error('Database connection failed:', error);

    // In development, return empty paginated structure instead of error
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 Development fallback: Returning empty chat history');
      return Response.json({
        chats: [],
        hasMore: false,
      });
    }

    throw error;
  }
}
