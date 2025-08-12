import { OpenAIProvider } from '../../../src/providers/openai.js';
import { ToolSpec } from '../../../src/providers/types.js';

jest.mock('openai', () => {
  const createMock = jest.fn();
  const constructor = jest.fn(() => ({
    chat: { completions: { create: createMock } }
  }));
  (constructor as any).__createMock = createMock;
  return { __esModule: true, default: constructor };
});

const getCreateMock = () => (require('openai').default as any).__createMock as jest.Mock;

describe('OpenAIProvider', () => {
  beforeEach(() => {
    getCreateMock().mockReset();
  });

  test('non-streaming completion returns text', async () => {
    getCreateMock().mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: 'hi' } }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
    });
    const provider = new OpenAIProvider({ apiKey: 'k', maxRetries: 0, baseDelayMs: 0, useResponses: false });
    const res = await provider.complete({ model: 'gpt', messages: [{ role: 'user', content: 'hello' }] });
    expect(res.message.content).toBe('hi');
    expect(res.usage?.totalTokens).toBe(3);
  });

  test('streaming yields deltas and done', async () => {
    const stream = {
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: 'hello' } }] };
        yield {
          choices: [{ delta: { content: ' world' } }],
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
        };
      }
    };
    getCreateMock().mockResolvedValueOnce(stream);

    const provider = new OpenAIProvider({ apiKey: 'k', maxRetries: 0, baseDelayMs: 0, useResponses: false });
    const events: string[] = [];
    for await (const ev of provider.stream({ model: 'gpt', messages: [{ role: 'user', content: 'hi' }] })) {
      if (ev.type === 'text-delta') events.push(ev.textDelta);
    }
    expect(events.join('')).toBe('hello world');
  });

  test('tool calling loop', async () => {
    const mock = getCreateMock();
    mock
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                { id: '1', function: { name: 'get_time', arguments: '{}' } }
              ]
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        choices: [
          { message: { role: 'assistant', content: 'It is 12:00' } }
        ]
      });

    const provider = new OpenAIProvider({ apiKey: 'k', maxRetries: 0, baseDelayMs: 0, useResponses: false });
    const tool: ToolSpec = { name: 'get_time', parameters: { type: 'object', properties: {}, required: [] } };
    const messages = [{ role: 'user' as const, content: 'time?' }];
    const first = await provider.complete({ model: 'gpt', messages, tools: [tool] });
    expect(first.message.toolCalls?.[0].name).toBe('get_time');
    const result = '12:00';
    messages.push(first.message);
    messages.push({ role: 'tool', content: result, tool_call_id: first.message.toolCalls![0].id });
    const second = await provider.complete({ model: 'gpt', messages });
    expect(second.message.content).toBe('It is 12:00');
  });
});
