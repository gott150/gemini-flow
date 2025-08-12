import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Provider, CompleteOpts, StreamEvent, ChatMessage, ToolSpec } from './types';

function mapMessages(messages: ChatMessage[]): any[] {
  return messages.map(m => {
    if (m.role === 'tool') {
      return {
        role: 'tool',
        parts: [
          {
            functionResponse: {
              name: m.name || '',
              response: { result: m.content }
            }
          }
        ],
        toolCallId: m.tool_call_id
      };
    }
    return {
      role: m.role,
      parts: [{ text: m.content }]
    };
  });
}

function mapTools(tools?: ToolSpec[]) {
  if (!tools?.length) return undefined;
  return tools.map(t => ({
    functionDeclarations: [
      {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    ]
  }));
}

function mapToolChoice(choice?: CompleteOpts['toolChoice']) {
  if (!choice || choice === 'auto') return undefined;
  return {
    function_calling_config: {
      mode: 'ANY',
      allowed_function_names: [choice.name]
    }
  };
}

export class GeminiProvider implements Provider {
  name: 'gemini' = 'gemini';
  private client: GoogleGenerativeAI;

  constructor(apiKey = process.env.GOOGLE_AI_API_KEY!) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async complete(opts: CompleteOpts) {
    const model = this.client.getGenerativeModel({ model: opts.model });
    const result = await model.generateContent({
      contents: mapMessages(opts.messages),
      tools: mapTools(opts.tools),
      toolConfig: mapToolChoice(opts.toolChoice),
      generationConfig: {
        temperature: opts.temperature,
        maxOutputTokens: opts.maxTokens,
        responseMimeType: opts.jsonMode ? 'application/json' : undefined
      }
    });
    const response = await result.response;
    const text = response.text();
    const toolCalls = response.candidates?.[0]?.content?.parts
      ?.filter((p: any) => p.functionCall)
      .map((p: any) => ({
        id: p.functionCall.name ?? '',
        name: p.functionCall.name ?? '',
        arguments: p.functionCall.args ?? p.functionCall.arguments ?? ''
      }));
    const usageMeta = response.usageMetadata;
    const usage = usageMeta
      ? {
          promptTokens: usageMeta.promptTokenCount ?? 0,
          completionTokens: usageMeta.candidatesTokenCount ?? 0
        }
      : undefined;
    return { text, toolCalls, usage };
  }

  async *stream(opts: CompleteOpts): AsyncIterable<StreamEvent> {
    const model = this.client.getGenerativeModel({ model: opts.model });
    const stream = await model.generateContentStream({
      contents: mapMessages(opts.messages),
      tools: mapTools(opts.tools),
      toolConfig: mapToolChoice(opts.toolChoice),
      generationConfig: {
        temperature: opts.temperature,
        maxOutputTokens: opts.maxTokens,
        responseMimeType: opts.jsonMode ? 'application/json' : undefined
      }
    });
    for await (const chunk of stream.stream) {
      const parts = chunk.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.text) {
          yield { type: 'text-delta', value: part.text };
        }
        if (part.functionCall) {
          yield {
            type: 'tool-call-delta',
            value: {
              id: part.functionCall.name ?? '',
              name: part.functionCall.name,
              argumentsDelta: part.functionCall.args ?? part.functionCall.arguments
            }
          };
        }
      }
    }
    const usageMeta = stream.response.usageMetadata;
    if (usageMeta) {
      yield {
        type: 'usage',
        value: {
          promptTokens: usageMeta.promptTokenCount ?? 0,
          completionTokens: usageMeta.candidatesTokenCount ?? 0
        }
      };
    }
    yield { type: 'done' };
  }
}
