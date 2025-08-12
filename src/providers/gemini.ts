import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  Provider,
  CompleteOpts,
  StreamEvent,
  ChatMessage,
  ToolSpec,
  ProviderResult
} from './types.js';

interface GeminiConfig {
  apiKey: string;
}

function mapMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : m.role,
    parts: [{ text: m.content }]
  }));
}

export class GeminiProvider implements Provider {
  private client: GoogleGenerativeAI;

  constructor(cfg: GeminiConfig) {
    this.client = new GoogleGenerativeAI(cfg.apiKey);
  }

  async complete(opts: CompleteOpts): Promise<ProviderResult> {
    const model = this.client.getGenerativeModel({ model: opts.model });
    const res = await model.generateContent({
      contents: mapMessages(opts.messages)
    });
    const text = await res.response.text();
    return {
      message: { role: 'assistant', content: text }
    };
  }

  async *stream(opts: CompleteOpts): AsyncIterable<StreamEvent> {
    const model = this.client.getGenerativeModel({ model: opts.model });
    const stream = await model.generateContentStream({
      contents: mapMessages(opts.messages)
    });
    for await (const chunk of stream.stream) {
      const text = chunk.text();
      if (text) {
        yield { type: 'text-delta', textDelta: text };
      }
    }
    yield { type: 'done' };
  }
}

export function geminiTools(tools: ToolSpec[] | undefined) {
  if (!tools) return undefined;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters
  }));
}
