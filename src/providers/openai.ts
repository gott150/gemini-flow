import OpenAI from 'openai';
import type { Provider, CompleteOpts, StreamEvent, ChatMessage, ToolSpec } from './types';

function mapMessages(messages: ChatMessage[]) {
  return messages.map(m => ({
    role: m.role,
    content: m.content,
    name: m.name,
    tool_call_id: m.tool_call_id
  }));
}

function mapTools(tools?: ToolSpec[]) {
  if (!tools?.length) return undefined;
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }));
}

function mapToolChoice(choice?: CompleteOpts['toolChoice']) {
  if (!choice || choice === 'auto') return 'auto' as const;
  return { type: 'function', function: { name: choice.name } } as const;
}

function isRetryable(error: any): boolean {
  const status = error?.status || error?.response?.status;
  return status === 429 || (status >= 500 && status < 600);
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class OpenAIProvider implements Provider {
  name: 'openai' = 'openai';
  private client: OpenAI;
  private useResponses: boolean;
  private maxRetries: number;
  private baseDelay: number;

  constructor(opts: { client?: OpenAI; apiKey?: string; baseURL?: string; organization?: string; project?: string; useResponses?: boolean; maxRetries?: number; baseDelayMs?: number } = {}) {
    this.client = opts.client ||
      new OpenAI({
        apiKey: opts.apiKey || process.env.OPENAI_API_KEY!,
        baseURL: opts.baseURL || process.env.OPENAI_BASE_URL,
        organization: opts.organization || process.env.OPENAI_ORG,
        project: opts.project || process.env.OPENAI_PROJECT
      });
    this.useResponses = opts.useResponses ?? process.env.OPENAI_USE_RESPONSES === 'true';
    this.maxRetries = opts.maxRetries ?? Number(process.env.OPENAI_MAX_RETRIES || 5);
    this.baseDelay = opts.baseDelayMs ?? Number(process.env.OPENAI_BASE_DELAY_MS || 500);
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (err) {
        if (attempt >= this.maxRetries || !isRetryable(err)) throw err;
        const delay = this.baseDelay * Math.pow(2, attempt) * (0.5 + Math.random() / 2);
        await sleep(delay);
        attempt++;
      }
    }
  }

  async complete(opts: CompleteOpts) {
    return this.withRetry(async () => {
      if (this.useResponses) {
        const res = await this.client.responses.create({
          model: opts.model,
          input: [{ role: 'user', content: mapMessages(opts.messages).map(m => m.content).join('\n') }],
          tools: mapTools(opts.tools),
          tool_choice: mapToolChoice(opts.toolChoice),
          temperature: opts.temperature,
          max_output_tokens: opts.maxTokens,
          response_format: opts.jsonMode ? { type: 'json_object' } : undefined
        } as any);
        const text = res.output_text;
        const usage = res.usage ? { promptTokens: res.usage.prompt_tokens ?? 0, completionTokens: res.usage.completion_tokens ?? 0 } : undefined;
        const toolCalls = res.output?.[0]?.tool_calls?.map((tc: any) => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments }));
        return { text, toolCalls, usage };
      } else {
        const res = await this.client.chat.completions.create({
          model: opts.model,
          messages: mapMessages(opts.messages),
          tools: mapTools(opts.tools),
          tool_choice: mapToolChoice(opts.toolChoice),
          temperature: opts.temperature,
          max_tokens: opts.maxTokens,
          response_format: opts.jsonMode ? { type: 'json_object' } : undefined
        });
        const choice = res.choices[0];
        const text = choice.message.content || undefined;
        const toolCalls = choice.message.tool_calls?.map(tc => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments }));
        const usage = res.usage ? { promptTokens: res.usage.prompt_tokens ?? 0, completionTokens: res.usage.completion_tokens ?? 0 } : undefined;
        return { text, toolCalls, usage };
      }
    });
  }

  async *stream(opts: CompleteOpts): AsyncIterable<StreamEvent> {
    const stream = await this.withRetry(async () =>
      this.client.chat.completions.create({
        model: opts.model,
        messages: mapMessages(opts.messages),
        tools: mapTools(opts.tools),
        tool_choice: mapToolChoice(opts.toolChoice),
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        response_format: opts.jsonMode ? { type: 'json_object' } : undefined,
        stream: true
      })
    );

    let usage: { promptTokens: number; completionTokens: number } | undefined;
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) {
        yield { type: 'text-delta', value: String(delta.content) };
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          yield {
            type: 'tool-call-delta',
            value: {
              id: tc.id!,
              name: tc.function?.name,
              argumentsDelta: tc.function?.arguments || ''
            }
          };
        }
      }
      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens ?? 0,
          completionTokens: chunk.usage.completion_tokens ?? 0
        };
      }
    }
    if (usage) {
      yield { type: 'usage', value: usage };
    }
    yield { type: 'done' };
  }
}
