import { OpenAIProvider } from '../../src/providers/openai.js';
import { runWithTools } from '../../src/providers/tool-runtime.js';
import type { ToolSpec } from '../../src/providers/types.js';

describe('OpenAIProvider', () => {
  test('non-streaming completion returns text', async () => {
    const client: any = {
      chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'hello' } }], usage: { prompt_tokens: 1, completion_tokens: 2 } }) } },
      responses: { create: jest.fn() }
    };
    const provider = new OpenAIProvider({ client });
    const res = await provider.complete({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.text).toBe('hello');
    expect(res.usage).toEqual({ promptTokens: 1, completionTokens: 2 });
  });

  test('streaming emits deltas and usage', async () => {
    const client: any = {
      chat: { completions: { create: jest.fn(async () => {
        async function* gen() {
          yield { choices: [{ delta: { content: 'h' } }] } as any;
          yield { choices: [{ delta: { content: 'i' } }] } as any;
          yield { usage: { prompt_tokens: 1, completion_tokens: 1 } } as any;
        }
        return gen();
      }) } },
      responses: { create: jest.fn() }
    };
    const provider = new OpenAIProvider({ client });
    const chunks: string[] = [];
    for await (const ev of provider.stream({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] })) {
      if (ev.type === 'text-delta') chunks.push(ev.value);
    }
    expect(chunks.join('')).toBe('hi');
  });

  test('tool calling bridge executes local tool', async () => {
    const client: any = {
      chat: { completions: { create: jest.fn()
        .mockResolvedValueOnce({ choices: [{ message: { tool_calls: [{ id: '1', function: { name: 'get_time', arguments: '{}' } }] } }], usage: { prompt_tokens: 1, completion_tokens: 0 } })
        .mockResolvedValueOnce({ choices: [{ message: { content: 'done' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) } },
      responses: { create: jest.fn() }
    };
    const provider = new OpenAIProvider({ client });
    const tool: ToolSpec = { name: 'get_time', parameters: { type: 'object', properties: {} } };
    const impl = { get_time: () => 'noon' };
    const result = await runWithTools(provider, { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'what time?' }], tools: [tool] }, impl);
    expect(result.text).toBe('done');
  });

  test('CLI integration uses provider flag', async () => {
    const stub = {
      name: 'openai',
      complete: jest.fn().mockResolvedValue({ text: 'cli' }),
      stream: async function* () {}
    } as any;
    await jest.unstable_mockModule('../../src/providers/index.js', () => ({ getProvider: () => stub }));
    const { default: cliProgram } = await import('../../src/cli/flow.js');
    const output: string[] = [];
    const log = console.log;
    console.log = (msg?: any) => { output.push(String(msg)); };
    await cliProgram.parseAsync(['node', 'flow', '--provider', 'openai', 'plan', 'hi']);
    console.log = log;
    expect(output.join('\n')).toContain('cli');
  });
});
