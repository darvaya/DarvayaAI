import { isTestEnvironment } from '../constants';
import { openRouterClient } from './openrouter-client';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';

// For now, disable the old provider system in non-test environments
// and use OpenRouter client directly in the consuming files
export const myProvider = isTestEnvironment
  ? {
      languageModel: (modelName: string) => {
        switch (modelName) {
          case 'chat-model':
            return chatModel;
          case 'chat-model-reasoning':
            return reasoningModel;
          case 'title-model':
            return titleModel;
          case 'artifact-model':
            return artifactModel;
          default:
            return chatModel;
        }
      },
      imageModel: (modelName: string) => chatModel, // fallback for tests
    }
  : {
      languageModel: (modelName: string) => {
        throw new Error(
          `Use OpenRouter client directly instead of myProvider for ${modelName}`,
        );
      },
      imageModel: (modelName: string) => {
        throw new Error(
          `Use OpenRouter client directly instead of myProvider for ${modelName}`,
        );
      },
    };

// Export OpenRouter client for direct use
export { openRouterClient };
