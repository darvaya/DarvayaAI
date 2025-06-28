import OpenAI from 'openai';
import { isTestEnvironment } from '../constants';

// OpenRouter configuration
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Model mappings - Using only Gemini models (no Grok)
export const MODEL_MAPPINGS = {
  'chat-model': 'google/gemini-2.0-flash-lite-001', // Changed from Grok to Gemini
  'chat-model-reasoning': 'openai/o1-mini', // Keep OpenAI for reasoning
  'gemini-flash-lite': 'google/gemini-2.0-flash-lite-001', // REVERTED: OpenRouter chat completions has auth issues
  'title-model': 'google/gemini-2.0-flash-lite-001', // Changed from Grok to Gemini
  'artifact-model': 'google/gemini-2.0-flash-lite-001', // Changed from Grok to Gemini
  'image-model': 'google/gemini-2.0-flash-lite-001', // Changed from Grok to Gemini
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

  // Create OpenAI client configured for OpenRouter
  const client = new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey: apiKey,
    // Don't set default headers here - OpenRouter expects them per request
  });

  return client;
}

// Global client instance
// Lazy initialization to avoid requiring API key at build time
let _openRouterClient: OpenAI | null = null;

// Reset client (useful when environment changes)
export function resetOpenRouterClient() {
  console.log('🔧 Resetting OpenRouter client...');
  _openRouterClient = null;
}

export const openRouterClient = (): OpenAI => {
  if (!_openRouterClient) {
    console.log('🔧 Creating new OpenRouter client...');
    console.log(
      '🔧 API Key present:',
      process.env.OPENROUTER_API_KEY ? 'Yes' : 'No',
    );
    if (process.env.OPENROUTER_API_KEY) {
      console.log(
        '🔧 API Key starts with:',
        `${process.env.OPENROUTER_API_KEY.substring(0, 10)}...`,
      );
    }
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
  'gemini-flash-lite': {
    temperature: 0.7,
    max_tokens: 8000,
    top_p: 0.9,
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
