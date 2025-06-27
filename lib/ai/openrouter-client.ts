import OpenAI from 'openai';
import { isTestEnvironment } from '../constants';

// OpenRouter configuration
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Model mappings from current XAI models to OpenRouter equivalents
export const MODEL_MAPPINGS = {
  'chat-model': 'x-ai/grok-2-vision-1212',
  'chat-model-reasoning': 'openai/o1-mini', // Using OpenAI's reasoning model
  'title-model': 'x-ai/grok-2-1212',
  'artifact-model': 'x-ai/grok-2-1212',
  'image-model': 'x-ai/grok-2-vision-1212', // For now, will implement image generation separately
} as const;

export type ModelKey = keyof typeof MODEL_MAPPINGS;

// OpenRouter client configuration
export function createOpenRouterClient() {
  if (isTestEnvironment) {
    // Return a mock client for testing
    return null;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }

  return new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    defaultHeaders: {
      'HTTP-Referer':
        process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
      'X-Title': process.env.OPENROUTER_APP_NAME || 'AI Chatbot',
    },
  });
}

// Global client instance
// Lazy initialization to avoid requiring API key at build time
let _openRouterClient: OpenAI | null = null;

export const openRouterClient = (): OpenAI => {
  if (!_openRouterClient) {
    _openRouterClient = createOpenRouterClient();
  }
  return _openRouterClient as OpenAI;
};

// Helper function to get the actual model name for OpenRouter
export function getModelName(modelKey: ModelKey): string {
  return MODEL_MAPPINGS[modelKey];
}

// Configuration for different model types
export const MODEL_CONFIGS = {
  'chat-model': {
    temperature: 0.7,
    max_tokens: 4000,
    top_p: 0.9,
  },
  'chat-model-reasoning': {
    temperature: 0.3,
    max_tokens: 8000,
    top_p: 0.95,
  },
  'title-model': {
    temperature: 0.5,
    max_tokens: 100,
    top_p: 0.8,
  },
  'artifact-model': {
    temperature: 0.4,
    max_tokens: 6000,
    top_p: 0.9,
  },
  'image-model': {
    temperature: 0.7,
    max_tokens: 1000,
    top_p: 0.9,
  },
} as const;

// Helper function to get model configuration
export function getModelConfig(modelKey: ModelKey) {
  return MODEL_CONFIGS[modelKey];
}
