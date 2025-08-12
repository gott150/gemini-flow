import { GeminiProvider } from './gemini.js';
import { OpenAIProvider } from './openai.js';
export { GeminiProvider, OpenAIProvider };
export type { Provider, ChatMessage, ToolSpec, StreamEvent, CompleteOpts } from './types.js';

export function getProvider(name: 'gemini' | 'openai') {
  return name === 'openai' ? new OpenAIProvider() : new GeminiProvider();
}
