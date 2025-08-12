import { GeminiCLI } from '../../src/cli/gemini-cli.js';

jest.mock('openai', () => {
  const createMock = jest.fn();
  const constructor = jest.fn(() => ({
    chat: { completions: { create: createMock } }
  }));
  (constructor as any).__createMock = createMock;
  return { __esModule: true, default: constructor };
});

const getCreateMock = () => (require('openai').default as any).__createMock as jest.Mock;

describe('CLI with OpenAI provider', () => {
  beforeEach(() => getCreateMock().mockReset());

  test('generate command uses openai', async () => {
    getCreateMock().mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: 'hello from openai' } }],
    });
    const cli = new GeminiCLI();
    const out = await cli.executeCommand('generate', ['hi'], { provider: 'openai', model: 'gpt' });
    expect(out).toContain('hello from openai');
  });
});
