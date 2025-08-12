import OpenAI from 'openai';
import Ajv from 'ajv';
import {
  Provider,
  CompleteOpts,
  StreamEvent,
  ChatMessage,
  ToolSpec,
  ProviderResult
} from './types.js';

interface OpenAIConfig {
  apiKey: string;
  baseURL?: string;
  organization?: string;
  project?: string;
  maxRetries: number;
  baseDelayMs: number;
  useResponses: boolean;
}

const ajv = new Ajv();

function mapMessages(messages: ChatMessage[]): any[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    name: m.name,
    tool_call_id: m.tool_call_id
  }));
}

function mapTools(tools: ToolSpec[] | undefined): any[] | undefined {
  if (!tools) return undefined;
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }));
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OpenAIProvider implements Provider {
  private client: OpenAI;
  private cfg: OpenAIConfig;

  constructor(cfg: OpenAIConfig) {
    this.cfg = cfg;
    this.client = new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL,
      organization: cfg.organization,
      project: cfg.project
    });
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (err: any) {
        const status = err?.status || err?.response?.status;
        if ((status === 429 || status >= 500) && attempt < this.cfg.maxRetries) {
          const delayMs =
            this.cfg.baseDelayMs * Math.pow(2, attempt) + Math.random() * 100;
          await delay(delayMs);
          attempt++;
          continue;
        }
        throw err;
      }
    }
  }

  async complete(opts: CompleteOpts): Promise<ProviderResult> {
    const params: any = {
      model: opts.model,
      messages: mapMessages(opts.messages),
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      tools: mapTools(opts.tools),
      tool_choice: opts.toolChoice,
    };
    if (opts.jsonMode) {
      params.response_format = { type: 'json_object' };
    }

    const res = await this.withRetry(() => this.client.chat.completions.create(params));
    const choice = res.choices[0];
    const msg = choice.message as any;
    const toolCalls = msg.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || '{}')
    }));
    return {
      message: {
        role: msg.role,
        content: msg.content || '',
        toolCalls,
      },
      usage: res.usage
        ? {
            promptTokens: res.usage.prompt_tokens,
            completionTokens: res.usage.completion_tokens,
            totalTokens: res.usage.total_tokens,
          }
        : undefined,
    };
  }

  async *stream(opts: CompleteOpts): AsyncIterable<StreamEvent> {
    const params: any = {
      model: opts.model,
      messages: mapMessages(opts.messages),
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      tools: mapTools(opts.tools),
      tool_choice: opts.toolChoice,
      stream: true,
    };
    if (opts.jsonMode) {
      params.response_format = { type: 'json_object' };
    }
    const stream = await this.withRetry(() =>
      this.client.chat.completions.create(params)
    );
    for await (const part of stream) {
      const delta = part.choices[0].delta as any;
      if (delta.content) {
        yield { type: 'text-delta', textDelta: delta.content };
      }
      if (delta.tool_calls) {
        for (const [index, tc] of delta.tool_calls.entries()) {
          yield {
            type: 'tool-call-delta',
            toolCallId: tc.id,
            name: tc.function?.name,
            argumentsDelta: tc.function?.arguments || '',
            index,
          };
        }
      }
      if (part.usage) {
        yield {
          type: 'usage',
          promptTokens: part.usage.prompt_tokens,
          completionTokens: part.usage.completion_tokens,
          totalTokens: part.usage.total_tokens,
        };
      }
    }
    yield { type: 'done' };
  }

  /**
   * Validate arguments against tool schema
   */
  validateToolArguments(tool: ToolSpec, args: any): void {
    const validate = ajv.compile(tool.parameters);
    if (!validate(args)) {
      throw new Error(`Invalid arguments for tool ${tool.name}`);
    }
  }
}

export function openaiTools(tools: ToolSpec[] | undefined) {
  return mapTools(tools);
}
