import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';

export interface FlowConfig {
  provider?: 'gemini' | 'openai';
  model?: string;
}

export function loadConfig(cwd = process.cwd()): FlowConfig {
  const jsonPath = path.join(cwd, 'flow.config.json');
  const yamlPath = path.join(cwd, 'flow.config.yaml');
  const ymlPath = path.join(cwd, 'flow.config.yml');
  if (fs.existsSync(jsonPath)) {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  }
  if (fs.existsSync(yamlPath)) {
    return YAML.parse(fs.readFileSync(yamlPath, 'utf8')) as FlowConfig;
  }
  if (fs.existsSync(ymlPath)) {
    return YAML.parse(fs.readFileSync(ymlPath, 'utf8')) as FlowConfig;
  }
  return {};
}

export function resolveProviderModel(cliProvider?: string, cliModel?: string) {
  const config = loadConfig();
  const provider = (cliProvider || config.provider || 'gemini') as 'gemini' | 'openai';
  const model =
    cliModel ||
    config.model ||
    (provider === 'openai'
      ? process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini'
      : 'gemini-1.5-flash');
  return { provider, model };
}
