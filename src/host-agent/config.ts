import { getModel } from '@mariozechner/pi-ai';
import type { Model, Api } from '@mariozechner/pi-ai';
import type { LLMConfig } from '../llm/types.js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface MinionsExtraConfig {
  sandbox: {
    memory: string;
    cpus: number;
    network: string;
    image?: string;
  };
  pi: {
    runtimeDir?: string;
  };
}

export interface MinionsFullConfig extends LLMConfig, MinionsExtraConfig {}

export class MinionsConfig {
  private agentDir: string;
  private extra: MinionsExtraConfig;

  constructor(cwd: string, agentDir?: string) {
    this.agentDir = agentDir || join(homedir(), '.minion');
    this.extra = this.loadExtraConfig();
  }

  async getModel(): Promise<Model<Api>> {
    // Load config from .pi/models.json if it exists, otherwise use env vars
    const modelsJson = join(this.agentDir, '.pi', 'models.json');
    let provider = process.env.LLM_PROVIDER || 'openai';
    let model = process.env.LLM_MODEL || 'gpt-4o';

    try {
      const content = JSON.parse(readFileSync(modelsJson, 'utf-8'));
      // Get default provider and model from pi-mono config
      const providers = Object.keys(content.providers || {});
      if (providers.length > 0) {
        provider = providers[0];
        const models = content.providers[provider].models || [];
        if (models.length > 0) {
          model = models[0].id;
        }
      }
    } catch {
      // Fall back to env vars
    }

    return getModel(provider as any, model as any);
  }

  async getApiKey(model: Model<Api>): Promise<string> {
    // Check environment variable first
    const envKey = `${model.provider.toUpperCase()}_API_KEY`;
    if (process.env[envKey]) {
      return process.env[envKey]!;
    }

    // Check LLM_API_KEY as fallback
    if (process.env.LLM_API_KEY) {
      return process.env.LLM_API_KEY;
    }

    // Check .pi/config.json for stored API keys
    const configPath = join(this.agentDir, '.pi', 'config.json');
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.apiKeys && config.apiKeys[model.provider]) {
        return config.apiKeys[model.provider];
      }
    } catch {
      // Fall through
    }

    throw new Error(`API key not found for ${model.provider}. Set ${envKey} or run: minion setup`);
  }

  getLLMConfig(): LLMConfig {
    return {
      provider: (process.env.LLM_PROVIDER as any) || 'openai',
      model: process.env.LLM_MODEL || 'gpt-4o',
      apiKey: process.env.LLM_API_KEY || '',
      baseUrl: process.env.LLM_BASE_URL,
    };
  }

  getExtraConfig(): MinionsExtraConfig {
    return this.extra;
  }

  private loadExtraConfig(): MinionsExtraConfig {
    const configPath = join(this.agentDir, 'config.json');
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      return {
        sandbox: config.sandbox || {
          memory: '4g',
          cpus: 2,
          network: 'bridge',
        },
        pi: {
          runtimeDir: join(this.agentDir, 'pi-runtime'),
        },
      };
    } catch {
      return {
        sandbox: {
          memory: '4g',
          cpus: 2,
          network: 'bridge',
        },
        pi: {
          runtimeDir: join(this.agentDir, 'pi-runtime'),
        },
      };
    }
  }

  saveConfig(config: Partial<MinionsExtraConfig>): void {
    const current = this.loadExtraConfig();
    const merged = {
      ...current,
      ...config,
    };
    mkdirSync(this.agentDir, { recursive: true });
    writeFileSync(join(this.agentDir, 'config.json'), JSON.stringify(merged, null, 2));
    this.extra = merged;
  }
}
