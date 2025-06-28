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
import {
  createDocumentToolName,
  createDocumentExecutor,
} from '@/lib/ai/tools/create-document-openai';
import {
  updateDocumentToolName,
  updateDocumentExecutor,
} from '@/lib/ai/tools/update-document-openai';
import {
  requestSuggestionsToolName,
  requestSuggestionsExecutor,
} from '@/lib/ai/tools/request-suggestions-openai';
import {
  weatherToolName,
  getWeatherExecutor,
} from '@/lib/ai/tools/get-weather-openai';
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
import { streamChatWithTools, ToolRegistry } from '@/lib/ai/tools-handler';

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

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError('rate_limit:chat').toResponse();
    }

    const chat = await getChatById({ id });

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

    const previousMessages = await getMessagesByChatId({ id });

    const messages = appendClientMessage({
      // @ts-expect-error: todo add type conversion from DBMessage[] to UIMessage[]
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

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    const stream = new ReadableStream({
      start(controller) {
        const writer = new CustomDataStreamWriter(controller);

        // Convert UI messages to OpenAI format
        const openAiMessages = messages.map((msg: any) => ({
          role: msg.role,
          content: msg.content || (msg.parts ? msg.parts[0]?.text : ''),
        }));

        // Set up tools for non-reasoning models
        const toolRegistry = new ToolRegistry();
        const availableTools =
          selectedChatModel === 'chat-model-reasoning'
            ? []
            : [
                weatherToolName,
                createDocumentToolName,
                updateDocumentToolName,
                requestSuggestionsToolName,
              ];

        if (availableTools.length > 0) {
          toolRegistry.register(
            weatherToolName,
            {
              type: 'function',
              function: {
                name: weatherToolName,
                description: 'Get current weather for a location',
                parameters: {
                  type: 'object',
                  properties: {
                    latitude: { type: 'number', minimum: -90, maximum: 90 },
                    longitude: { type: 'number', minimum: -180, maximum: 180 },
                  },
                  required: ['latitude', 'longitude'],
                },
              },
            },
            getWeatherExecutor,
          );

          toolRegistry.register(
            createDocumentToolName,
            {
              type: 'function',
              function: {
                name: createDocumentToolName,
                description: 'Create a new document/artifact',
                parameters: {
                  type: 'object',
                  properties: {
                    kind: {
                      type: 'string',
                      enum: ['text', 'code', 'image', 'sheet'],
                      description: 'The type of document to create',
                    },
                    title: { type: 'string', description: 'Document title' },
                    content: {
                      type: 'string',
                      description: 'Document content',
                    },
                  },
                  required: ['kind', 'title', 'content'],
                },
              },
            },
            createDocumentExecutor,
          );

          toolRegistry.register(
            updateDocumentToolName,
            {
              type: 'function',
              function: {
                name: updateDocumentToolName,
                description: 'Update an existing document',
                parameters: {
                  type: 'object',
                  properties: {
                    documentId: {
                      type: 'string',
                      description: 'Document ID to update',
                    },
                    content: { type: 'string', description: 'New content' },
                  },
                  required: ['documentId', 'content'],
                },
              },
            },
            updateDocumentExecutor,
          );

          toolRegistry.register(
            requestSuggestionsToolName,
            {
              type: 'function',
              function: {
                name: requestSuggestionsToolName,
                description: 'Request follow-up suggestions',
                parameters: {
                  type: 'object',
                  properties: {
                    message: {
                      type: 'string',
                      description: 'Current message context',
                    },
                  },
                  required: ['message'],
                },
              },
            },
            requestSuggestionsExecutor,
          );
        }

        // Start streaming with OpenRouter
        (async () => {
          try {
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
            console.log(
              `🚀 Model routing: ${selectedChatModel} → ${routedModel} for user ${session.user.id}`,
            );

            // Send routing info to data stream for monitoring
            writer.writeData({
              type: 'model-routing',
              originalModel: selectedChatModel,
              routedModel,
              userId: session.user.id,
              timestamp: new Date().toISOString(),
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

            for await (const chunk of streamGenerator) {
              if (chunk.type === 'content') {
                fullContent += chunk.data;
                writer.writeText(chunk.data);
              } else if (chunk.type === 'tool_call') {
                writer.writeData({
                  type: 'tool-call',
                  toolCall: chunk.data,
                });
              } else if (chunk.type === 'tool_result') {
                writer.writeData({
                  type: 'tool-result',
                  result: chunk.data,
                });
              } else if (chunk.type === 'finish') {
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
          } catch (error) {
            console.error('Streaming error:', error);
            writer.writeData({
              type: 'error',
              error: 'An error occurred while processing your request.',
            });
          } finally {
            writer.close();
          }
        })();
      },
    });

    const streamContext = getStreamContext();

    if (streamContext) {
      return new Response(
        await streamContext.resumableStream(streamId, () => stream),
      );
    } else {
      return new Response(stream);
    }
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
