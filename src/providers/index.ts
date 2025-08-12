import { Provider } from './types.js';
import { GeminiProvider } from './gemini.js';
import { OpenAIProvider } from './openai.js';

export function createProvider(name: string, apiKey?: string): Provider {
  switch (name) {
    case 'openai':
      return new OpenAIProvider({
        apiKey: apiKey || process.env.OPENAI_API_KEY || '',
        baseURL: process.env.OPENAI_BASE_URL,
        organization: process.env.OPENAI_ORG,
        project: process.env.OPENAI_PROJECT,
        maxRetries: Number(process.env.OPENAI_MAX_RETRIES || '3'),
        baseDelayMs: Number(process.env.OPENAI_BASE_DELAY_MS || '250'),
        useResponses: process.env.OPENAI_USE_RESPONSES === 'true'
      });
    case 'gemini':
    default:
      return new GeminiProvider({
        apiKey: apiKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || ''
      });
  }
}
