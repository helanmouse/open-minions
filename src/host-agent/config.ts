import { getModel } from '@mariozechner/pi-ai';
import type { Model, Api } from '@mariozechner/pi-ai';
import type { LLMConfig } from '../llm/types.js';
import { resolveProvider } from '../llm/provider-aliases.js';
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
    let userBaseUrl = '';

    try {
      const content = JSON.parse(readFileSync(modelsJson, 'utf-8'));
      // Get default provider and model from pi-mono config
      const providers = Object.keys(content.providers || {});
      if (providers.length > 0) {
        provider = providers[0];
        const providerConfig = content.providers[provider];
        // Preserve user-configured baseUrl (user override > alias default > pi-ai default)
        if (providerConfig.baseUrl) {
          userBaseUrl = providerConfig.baseUrl;
        }
        const models = providerConfig.models || [];
        if (models.length > 0) {
          model = models[0].id;
        }
      }
    } catch {
      // Fall back to env vars
    }

    // Resolve alias: e.g. zhipu → zai with CN baseUrl
    const resolved = resolveProvider(provider, model, userBaseUrl);
    const modelObj = getModel(resolved.piProvider as any, resolved.modelId as any);
    if (resolved.baseUrl) {
      (modelObj as any).baseUrl = resolved.baseUrl;
    }
    return modelObj;
  }

  async getApiKey(model: Model<Api>, originalProvider?: string): Promise<string> {
    // Check environment variable for resolved provider first (e.g. ZAI_API_KEY)
    const envKey = `${model.provider.toUpperCase()}_API_KEY`;
    if (process.env[envKey]) {
      return process.env[envKey]!;
    }

    // Check env var for original/alias provider (e.g. ZHIPU_API_KEY)
    if (originalProvider && originalProvider !== model.provider) {
      const aliasEnvKey = `${originalProvider.toUpperCase()}_API_KEY`;
      if (process.env[aliasEnvKey]) {
        return process.env[aliasEnvKey]!;
      }
    }

    // Check LLM_API_KEY as fallback
    if (process.env.LLM_API_KEY) {
      return process.env.LLM_API_KEY;
    }

    // Check .pi/config.json for stored API keys (try both provider names)
    const configPath = join(this.agentDir, '.pi', 'config.json');
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.apiKeys) {
        if (config.apiKeys[model.provider]) {
          return config.apiKeys[model.provider];
        }
        if (originalProvider && config.apiKeys[originalProvider]) {
          return config.apiKeys[originalProvider];
        }
      }
    } catch {
      // Fall through
    }

    throw new Error(`API key not found for ${model.provider}. Set ${envKey} or run: minion setup`);
  }

  /**
   * Return the raw user-configured provider and model names (before alias resolution).
   * Used by HostAgent to write .env so sandbox can resolve aliases itself.
   */
  getRawProviderConfig(): { provider: string; model: string } {
    const modelsJson = join(this.agentDir, '.pi', 'models.json');
    let provider = process.env.LLM_PROVIDER || 'openai';
    let model = process.env.LLM_MODEL || 'gpt-4o';

    try {
      const content = JSON.parse(readFileSync(modelsJson, 'utf-8'));
      const providers = Object.keys(content.providers || {});
      if (providers.length > 0) {
        provider = providers[0];
        const providerConfig = content.providers[provider];
        const models = providerConfig.models || [];
        if (models.length > 0) {
          model = models[0].id;
        }
      }
    } catch {
      // Fall back to env vars
    }

    return { provider, model };
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
