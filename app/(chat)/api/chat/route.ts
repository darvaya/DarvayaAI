import { appendClientMessage } from 'ai';
import { auth, type UserType } from '@/app/(auth)/auth';
import { type RequestHints, systemPrompt } from '@/lib/ai/prompts';
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  getStreamIdsByChatId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { selectModelWithRouting } from '@/lib/ai/model-router';
import {
  recordPerformanceMetric,
  calculateCost,
} from '@/lib/ai/phase3-monitor';
import { createDocumentToolName } from '@/lib/ai/tools/create-document-openai';
import { updateDocumentToolName } from '@/lib/ai/tools/update-document-openai';
import { requestSuggestionsToolName } from '@/lib/ai/tools/request-suggestions-openai';
import { weatherToolName } from '@/lib/ai/tools/get-weather-openai';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
import { after } from 'next/server';
import type { Chat } from '@/lib/db/schema';
import { differenceInSeconds } from 'date-fns';
import { ChatSDKError } from '@/lib/errors';
import * as Sentry from '@sentry/nextjs';
import { getModelConfig } from '@/lib/ai/openrouter-client';
import { CustomDataStreamWriter } from '@/lib/ai/streaming';
import {
  CoordinatedDataStreamWriter,
  createCoordinatedStreamWriter,
} from '@/lib/ai/coordinated-streaming';
import { streamChatWithTools, toolRegistry } from '@/lib/ai/tools-handler';

// Import tools to ensure they are registered with the global registry
import '@/lib/ai/tools/get-weather-openai';
import '@/lib/ai/tools/create-document-openai';
import '@/lib/ai/tools/update-document-openai';
import '@/lib/ai/tools/request-suggestions-openai';

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      if (error.message.includes('REDIS_URL')) {
        console.log(
          ' > Resumable streams are disabled due to missing REDIS_URL',
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
}

export async function POST(request: Request) {
  // Add Sentry instrumentation
  Sentry.getCurrentScope().setTag('api.route', 'chat');

  let requestBody: PostRequestBody;
  let session: any = null;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { error_type: 'request_parsing' },
    });
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const { id, message, selectedChatModel, selectedVisibilityType } =
      requestBody;

    session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    // Set user context for better error tracking
    Sentry.setUser({
      id: session.user.id,
      email: session.user.email || undefined,
    });

    const userType: UserType = session.user.type;

    // Development bypass for database calls
    const isDevelopmentBypass =
      process.env.NODE_ENV === 'development' &&
      !process.env.DATABASE_URL?.includes('localhost');

    let messageCount = 0;
    let chat = null;
    let previousMessages: any[] = [];

    if (!isDevelopmentBypass) {
      try {
        messageCount = await getMessageCountByUserId({
          id: session.user.id,
          differenceInHours: 24,
        });

        if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
          return new ChatSDKError('rate_limit:chat').toResponse();
        }

        chat = await getChatById({ id });

        if (!chat) {
          const title = await generateTitleFromUserMessage({
            message,
          });

          await saveChat({
            id,
            userId: session.user.id,
            title,
            visibility: selectedVisibilityType,
          });
        } else {
          if (chat.userId !== session.user.id) {
            return new ChatSDKError('forbidden:chat').toResponse();
          }
        }

        previousMessages = await getMessagesByChatId({ id });
      } catch (error) {
        console.error(
          'Database error in development, continuing with fallbacks:',
          error,
        );
        // Continue with empty data in development
      }
    } else {
      console.log('🔧 Development mode: Bypassing database calls for chat');
    }

    const messages = appendClientMessage({
      messages: previousMessages,
      message,
    });

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    // Generate stream ID for all cases
    const streamId = generateUUID();

    // Save message and create stream ID only if not in development bypass
    if (!isDevelopmentBypass) {
      try {
        await saveMessages({
          messages: [
            {
              chatId: id,
              id: message.id,
              role: 'user',
              parts: message.parts,
              attachments: message.experimental_attachments ?? [],
              createdAt: new Date(),
            },
          ],
        });

        await createStreamId({ streamId, chatId: id });
      } catch (error) {
        console.error('Database error saving message in development:', error);
        // Continue without saving in development
      }
    } else {
      console.log(
        '🔧 Development mode: Skipping message save and stream ID creation',
      );
    }

    const stream = new ReadableStream({
      start(controller) {
        const writer = createCoordinatedStreamWriter(controller);

        // Convert UI messages to OpenAI format
        const openAiMessages = messages.map((msg: any) => ({
          role: msg.role,
          content: msg.content || (msg.parts ? msg.parts[0]?.text : ''),
        }));

        // Set up tools for non-reasoning models
        const availableTools =
          selectedChatModel === 'chat-model-reasoning'
            ? []
            : [
                weatherToolName,
                createDocumentToolName,
                updateDocumentToolName,
                requestSuggestionsToolName,
              ];

        // Tools are already imported at the top level and registered with the global registry
        console.log('🔧 Available tools:', availableTools);
        console.log(
          '🔧 Registered tools in global registry:',
          toolRegistry.getToolNames(),
        );

        // Start streaming with OpenRouter
        (async () => {
          // Apply Phase 3 model routing logic
          const userContext = {
            userId: session.user.id,
            isGuest: session.user.type === 'guest',
            sessionId: `session_${session.user.id}_${Date.now()}`,
          };

          // Route model selection (Phase 3: 5% traffic to Gemini Flash Lite)
          const routedModel = selectModelWithRouting(
            selectedChatModel as
              | 'chat-model'
              | 'chat-model-reasoning'
              | 'gemini-flash-lite',
            userContext,
          );

          const modelConfig = getModelConfig(routedModel);
          const systemMessage = systemPrompt({
            selectedChatModel: routedModel,
            requestHints,
          });

          // Add system message to the beginning
          const messagesWithSystem = [
            { role: 'system' as const, content: systemMessage },
            ...openAiMessages,
          ];

          // Get the actual model name from mappings
          const { getModelName } = await import('@/lib/ai/openrouter-client');
          const modelName = getModelName(routedModel);

          // Log routing decision for monitoring
          if (selectedChatModel === routedModel) {
            console.log(
              `🚀 Model selection: Using ${routedModel} (direct selection) for user ${session.user.id}`,
            );
          } else {
            console.log(
              `🚀 Model routing: ${selectedChatModel} → ${routedModel} (smart routing) for user ${session.user.id}`,
            );
          }

          // Send routing info to data stream for monitoring (serialize properly for Redis)
          writer.writeData({
            type: 'model-routing',
            data: JSON.stringify({
              originalModel: selectedChatModel,
              routedModel,
              userId: session.user.id,
              timestamp: new Date().toISOString(),
            }),
          });

          const streamGenerator = streamChatWithTools(
            messagesWithSystem,
            modelName,
            { session, dataStream: writer },
            {
              temperature: modelConfig.temperature,
              max_tokens: modelConfig.max_tokens,
              top_p: modelConfig.top_p,
              tools: availableTools,
              maxSteps: 5,
            },
          );

          let fullContent = '';
          const startTime = Date.now();
          let tokenUsage = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          };

          let streamCompleted = false;

          try {
            for await (const chunk of streamGenerator) {
              if (chunk.type === 'content') {
                fullContent += chunk.data;
                writer.writeText(chunk.data);
              } else if (chunk.type === 'tool_call') {
                // FIXED: Remove double serialization - pass data directly
                writer.writeData({
                  type: 'tool-call',
                  data: chunk.data,
                });
              } else if (chunk.type === 'tool_result') {
                // FIXED: Remove double serialization - pass data directly
                writer.writeData({
                  type: 'tool-result',
                  data: chunk.data,
                });
              } else if (chunk.type === 'finish') {
                streamCompleted = true;

                // Record performance metrics for Phase 3 monitoring
                const endTime = Date.now();
                const latency = endTime - startTime;

                // Extract token usage from chunk if available
                if (chunk.data?.usage) {
                  tokenUsage = chunk.data.usage;
                }

                const cost = calculateCost(routedModel, {
                  promptTokens: tokenUsage.prompt_tokens || 0,
                  completionTokens: tokenUsage.completion_tokens || 0,
                });

                // Record the performance metric
                recordPerformanceMetric({
                  model: routedModel,
                  userId: session.user.id,
                  sessionId: userContext.sessionId,
                  timestamp: new Date().toISOString(),
                  latency,
                  tokenUsage: {
                    promptTokens: tokenUsage.prompt_tokens || 0,
                    completionTokens: tokenUsage.completion_tokens || 0,
                    totalTokens: tokenUsage.total_tokens || 0,
                  },
                  cost,
                  success: true,
                });

                // Save the assistant message
                if (session.user?.id && fullContent) {
                  try {
                    const assistantId = generateUUID();

                    await saveMessages({
                      messages: [
                        {
                          id: assistantId,
                          chatId: id,
                          role: 'assistant',
                          parts: [{ type: 'text', text: fullContent }],
                          attachments: [],
                          createdAt: new Date(),
                        },
                      ],
                    });
                  } catch (error) {
                    console.error('Failed to save chat:', error);
                  }
                }
                break;
              }
            }

            // If the stream didn't complete naturally, ensure we still finish properly
            if (!streamCompleted && fullContent) {
              console.log(
                '🔧 Stream did not complete naturally, finishing manually',
              );

              const endTime = Date.now();
              const latency = endTime - startTime;
              const cost = calculateCost(routedModel, {
                promptTokens: tokenUsage.prompt_tokens || 0,
                completionTokens: tokenUsage.completion_tokens || 0,
              });

              recordPerformanceMetric({
                model: routedModel,
                userId: session.user.id,
                sessionId: userContext.sessionId,
                timestamp: new Date().toISOString(),
                latency,
                tokenUsage: {
                  promptTokens: tokenUsage.prompt_tokens || 0,
                  completionTokens: tokenUsage.completion_tokens || 0,
                  totalTokens: tokenUsage.total_tokens || 0,
                },
                cost,
                success: true,
              });

              // Save the assistant message
              if (session.user?.id && fullContent) {
                try {
                  const assistantId = generateUUID();

                  await saveMessages({
                    messages: [
                      {
                        id: assistantId,
                        chatId: id,
                        role: 'assistant',
                        parts: [{ type: 'text', text: fullContent }],
                        attachments: [],
                        createdAt: new Date(),
                      },
                    ],
                  });
                } catch (error) {
                  console.error('Failed to save chat:', error);
                }
              }
            }
          } catch (error) {
            console.error('Streaming error:', error);
            writer.writeData({
              type: 'error',
              data: {
                error: 'An error occurred while processing your request.',
              },
            });

            // Record failed performance metric
            const endTime = Date.now();
            const latency = endTime - startTime;

            recordPerformanceMetric({
              model: routedModel,
              userId: session.user.id,
              sessionId: userContext.sessionId,
              timestamp: new Date().toISOString(),
              latency,
              tokenUsage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
              },
              cost: 0,
              success: false,
            });
          } finally {
            console.log('🔧 Closing stream writer');
            writer.close();
          }
        })();
      },
    });

    // Disable resumable streams to avoid Redis serialization issues
    // Use direct streaming instead for now
    console.log('🔧 Using direct streaming (Redis resumable streams disabled)');
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    // Only capture unexpected errors (ChatSDKError already handles itself)
    if (!(error instanceof ChatSDKError)) {
      Sentry.captureException(error, {
        tags: {
          api_route: 'chat',
          user_id: session?.user?.id,
        },
      });
    }
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    throw error;
  }
}

export async function GET(request: Request) {
  // Add Sentry instrumentation
  Sentry.getCurrentScope().setTag('api.route', 'chat-resume');

  const streamContext = getStreamContext();
  const resumeRequestedAt = new Date();

  if (!streamContext) {
    return new Response(null, { status: 204 });
  }

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  // Set user context for better error tracking
  Sentry.setUser({
    id: session.user.id,
    email: session.user.email || undefined,
  });

  let chat: Chat;

  try {
    chat = await getChatById({ id: chatId });
  } catch {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (!chat) {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (chat.visibility === 'private' && chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const streamIds = await getStreamIdsByChatId({ chatId });

  if (!streamIds.length) {
    return new ChatSDKError('not_found:stream').toResponse();
  }

  const recentStreamId = streamIds.at(-1);

  if (!recentStreamId) {
    return new ChatSDKError('not_found:stream').toResponse();
  }

  const emptyDataStream = new ReadableStream({
    start(controller) {
      controller.close();
    },
  });

  const stream = await streamContext.resumableStream(
    recentStreamId,
    () => emptyDataStream,
  );

  /*
   * For when the generation is streaming during SSR
   * but the resumable stream has concluded at this point.
   */
  if (!stream) {
    const messages = await getMessagesByChatId({ id: chatId });
    const mostRecentMessage = messages.at(-1);

    if (!mostRecentMessage) {
      return new Response(emptyDataStream, { status: 200 });
    }

    if (mostRecentMessage.role !== 'assistant') {
      return new Response(emptyDataStream, { status: 200 });
    }

    const messageCreatedAt = new Date(mostRecentMessage.createdAt);

    if (differenceInSeconds(resumeRequestedAt, messageCreatedAt) > 15) {
      return new Response(emptyDataStream, { status: 200 });
    }

    const restoredStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const chunk = encoder.encode(
          `0:${JSON.stringify({
            type: 'append-message',
            message: JSON.stringify(mostRecentMessage),
          })}\n`,
        );
        controller.enqueue(chunk);
        controller.close();
      },
    });

    return new Response(restoredStream, { status: 200 });
  }

  return new Response(stream, { status: 200 });
}

export async function DELETE(request: Request) {
  // Add Sentry instrumentation
  Sentry.getCurrentScope().setTag('api.route', 'chat-delete');

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  // Set user context for better error tracking
  Sentry.setUser({
    id: session.user.id,
    email: session.user.email || undefined,
  });

  const chat = await getChatById({ id });

  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
