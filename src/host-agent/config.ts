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
    const modelsJson = join(this.agentDir, '.pi', 'models.json');
    const configJson = join(this.agentDir, '.pi', 'config.json');

    let provider = process.env.LLM_PROVIDER || 'openai';
    let sourceId: string | undefined;
    let model = process.env.LLM_MODEL || 'gpt-4o';
    let userBaseUrl = '';

    try {
      // 1. Read config.json FIRST for current selection
      const config = JSON.parse(readFileSync(configJson, 'utf-8'));
      if (config.provider) provider = config.provider;
      if (config.source) sourceId = config.source;
      if (config.model) model = config.model;

      // 2. Read models.json for provider configuration
      const models = JSON.parse(readFileSync(modelsJson, 'utf-8'));
      const providerConfig = models.providers[provider];

      if (providerConfig) {
        // 3. Get baseUrl from selected source
        const baseUrl = sourceId && providerConfig.sources?.[sourceId]?.baseUrl;
        userBaseUrl = baseUrl || providerConfig.baseUrl || '';
      }
    } catch {
      // Fall back to env vars
    }

    // 4. Resolve provider and get model
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

    // Check source configuration in models.json for API key
    const configPath = join(this.agentDir, '.pi', 'config.json');
    const modelsPath = join(this.agentDir, '.pi', 'models.json');
    try {
      // Read sourceId from config.json
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      const sourceId = config.source;

      if (sourceId) {
        // Read models.json to get source config
        const models = JSON.parse(readFileSync(modelsPath, 'utf-8'));

        // Check both resolved and original provider names
        const providerName = originalProvider || model.provider;
        const providerConfig = models.providers[providerName] || models.providers[model.provider];

        if (providerConfig?.sources?.[sourceId]?.apiKey) {
          let apiKey = providerConfig.sources[sourceId].apiKey;
          // Resolve $ENV_VAR syntax
          if (apiKey.startsWith('$')) {
            const envVar = apiKey.slice(1);
            apiKey = process.env[envVar] || apiKey;
          }
          return apiKey;
        }
      }
    } catch {
      // Fall through to next check
    }

    // Check .pi/config.json for stored API keys (try both provider names) for backward compatibility
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
   * Return the raw user-configured provider, model, and source names (before alias resolution).
   * Used by HostAgent to write .env so sandbox can resolve aliases itself.
   */
  getRawProviderConfig(): { provider: string; model: string; source?: string } {
    const configJson = join(this.agentDir, '.pi', 'config.json');
    let provider = process.env.LLM_PROVIDER || 'openai';
    let sourceId: string | undefined;
    let model = process.env.LLM_MODEL || 'gpt-4o';

    try {
      // Read config.json for current selection
      const config = JSON.parse(readFileSync(configJson, 'utf-8'));
      if (config.provider) provider = config.provider;
      if (config.source) sourceId = config.source;
      if (config.model) model = config.model;
    } catch {
      // Fall back to env vars
    }

    return { provider, model, source: sourceId };
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
