#!/usr/bin/env node
import { Command } from 'commander';
import { getProvider } from '../providers/index.js';
import { resolveProviderModel } from '../config.js';
import { runWithTools } from '../providers/tool-runtime.js';

const program = new Command();
program
  .name('flow')
  .option('--provider <provider>', 'gemini or openai')
  .option('--model <model>', 'model name');

program
  .command('plan')
  .argument('<prompt...>')
  .action(async (promptParts: string[]) => {
    const opts = program.opts();
    const { provider, model } = resolveProviderModel(opts.provider, opts.model);
    const p = getProvider(provider);
    const res = await p.complete({ model, messages: [{ role: 'user', content: promptParts.join(' ') }] });
    if (res.text) console.log(res.text);
  });

program
  .command('run')
  .argument('<prompt...>')
  .action(async (promptParts: string[]) => {
    const opts = program.opts();
    const { provider, model } = resolveProviderModel(opts.provider, opts.model);
    const p = getProvider(provider);
    const result = await runWithTools(
      p,
      { model, messages: [{ role: 'user', content: promptParts.join(' ') }] },
      {}
    );
    if (result.text) console.log(result.text);
  });

if (process.argv[1] === new URL(import.meta.url).pathname) {
  program.parseAsync(process.argv);
}

export default program;
