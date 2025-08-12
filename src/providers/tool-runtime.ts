import Ajv from 'ajv';
import type { Provider, CompleteOpts, ChatMessage, ToolSpec } from './types.js';

const ajv = new Ajv();

export async function runWithTools(
  provider: Provider,
  opts: CompleteOpts,
  implementations: Record<string, (args: any) => any | Promise<any>>,
  maxRounds = 5
) {
  let messages: ChatMessage[] = [...opts.messages];
  for (let i = 0; i < maxRounds; i++) {
    const res = await provider.complete({ ...opts, messages });
    if (res.toolCalls && res.toolCalls.length) {
      for (const call of res.toolCalls) {
        const spec = opts.tools?.find(t => t.name === call.name);
        let args: any = {};
        try {
          args = call.arguments ? JSON.parse(call.arguments) : {};
        } catch {
          throw new Error(`Invalid JSON for tool ${call.name}`);
        }
        if (spec) {
          const validate = ajv.compile(spec.parameters);
          const valid = validate(args);
          if (!valid) {
            throw new Error(`Invalid arguments for tool ${spec.name}: ${ajv.errorsText(validate.errors)}`);
          }
        }
        const impl = implementations[call.name];
        const result = impl ? await impl(args) : null;
        messages.push({
          role: 'tool',
          name: call.name,
          tool_call_id: call.id,
          content: JSON.stringify(result ?? null)
        });
      }
      continue;
    }
    return { text: res.text, usage: res.usage, messages };
  }
  throw new Error('Max tool calling rounds exceeded');
}
