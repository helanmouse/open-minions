// src/cli/setup/tui-setup.ts
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createInterface } from 'readline';
import { TUI, SelectList, Container, TextComponent } from '@mariozechner/pi-tui';
import { getProviders, getModels } from '@mariozechner/pi-ai';
import type { SelectItem } from '@mariozechner/pi-tui';
import type { SetupConfig, SetupResult } from './types.js';

/**
 * TuiSetup - Main class for TUI-based setup workflow
 *
 * Orchestrates the setup process including:
 * - Provider selection
 * - Model selection
 * - API key input
 * - Configuration persistence
 */
export class TuiSetup {
  private readonly minionHome: string;
  private readonly piDir: string;
  private mockConfig?: SetupConfig;

  /**
   * Create a new TuiSetup instance
   * @param minionHome - Path to the minion home directory (e.g., ~/.minion)
   */
  constructor(minionHome: string) {
    this.minionHome = minionHome;
    this.piDir = join(minionHome, '.pi');
  }

  /**
   * Set a mock configuration for testing purposes
   * When set, run() will use this configuration instead of prompting user
   * @param config - The mock configuration to use
   */
  setMockConfig(config: SetupConfig): void {
    this.mockConfig = config;
  }

  /**
   * Run the setup workflow
   * @returns Promise<SetupResult> containing the configuration and save status
   */
  async run(): Promise<SetupResult> {
    let config: SetupConfig;

    if (this.mockConfig) {
      config = this.mockConfig;
    } else {
      // Interactive mode using TUI
      const provider = await this.selectProvider();
      const model = await this.selectModel(provider);
      const apiKey = await this.selectApiKey(provider);

      config = { provider, model, apiKey };
    }

    // Save the configuration
    await this.saveConfig(config);

    return {
      config,
      saved: true,
    };
  }

  /**
   * Select a provider using TUI SelectList
   * @returns Promise<string> the selected provider ID
   */
  async selectProvider(): Promise<string> {
    const providers = getProviders();
    const items: SelectItem[] = providers.map((p) => ({
      value: p,
      label: this.formatProviderLabel(p),
      description: this.getProviderDescription(p),
    }));

    return this.runSelectList('Select a Provider', items);
  }

  /**
   * Select a model using TUI SelectList
   * @param provider - The provider to get models from
   * @returns Promise<string> the selected model ID
   */
  async selectModel(provider: string): Promise<string> {
    const models = getModels(provider as any);
    const items: SelectItem[] = models.map((m) => ({
      value: m.id,
      label: m.name,
      description: m.reasoning ? 'Reasoning model' : 'Standard model',
    }));

    return this.runSelectList('Select a Model', items);
  }

  /**
   * Select or input API key
   * Checks environment variable first, falls back to readline input
   * @param provider - The provider to get the API key for
   * @returns Promise<string> the API key
   */
  async selectApiKey(provider: string): Promise<string> {
    const envVarName = this.getEnvVarName(provider);
    const envKey = process.env[envVarName];

    if (envKey) {
      return envKey;
    }

    // Fallback to readline input
    return this.promptForApiKey(envVarName);
  }

  /**
   * Run a SelectList TUI and return the selected value
   * @param title - The title to display
   * @param items - The items to select from
   * @returns Promise<string> the selected value
   */
  private async runSelectList(title: string, items: SelectItem[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const ui = new TUI();
      const container = new Container();

      // Add title
      container.addChild(new TextComponent(title, { bottom: 1 }));

      // Create select list
      const selectList = new SelectList(items);
      selectList.onSelect = (item: SelectItem) => {
        ui.stop();
        resolve(item.value);
      };
      selectList.onCancel = () => {
        ui.stop();
        reject(new Error('Selection cancelled'));
      };

      container.addChild(selectList);
      ui.addChild(container);
      ui.setFocus(selectList);

      ui.start();
    });
  }

  /**
   * Prompt for API key using readline
   * @param envVarName - The environment variable name to display
   * @returns Promise<string> the entered API key
   */
  private async promptForApiKey(envVarName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(`Enter API key (${envVarName}): `, (answer) => {
        rl.close();
        if (answer.trim()) {
          resolve(answer.trim());
        } else {
          reject(new Error('API key is required'));
        }
      });
    });
  }

  /**
   * Format provider label for display
   * @param provider - The provider ID
   * @returns Formatted label
   */
  private formatProviderLabel(provider: string): string {
    const labels: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google',
      zai: 'Zhipu AI',
      xai: 'xAI (Grok)',
      groq: 'Groq',
      deepseek: 'DeepSeek',
    };
    return labels[provider] || provider;
  }

  /**
   * Get provider description
   * @param provider - The provider ID
   * @returns Provider description
   */
  private getProviderDescription(provider: string): string {
    const descriptions: Record<string, string> = {
      openai: 'GPT-4o, GPT-4o-mini, o1, o3-mini',
      anthropic: 'Claude 3.5 Sonnet, Claude 3.5 Haiku',
      google: 'Gemini 2.0 Flash, Gemini Pro',
      zai: 'GLM-4 Flash, GLM-4 Plus',
      xai: 'Grok-2, Grok-mini',
      groq: 'Llama 3.3, Mixtral',
    };
    return descriptions[provider] || '';
  }

  /**
   * Save configuration to ~/.minion/.pi/models.json and config.json
   * @param config - The configuration to save
   */
  async saveConfig(config: SetupConfig): Promise<void> {
    // Ensure .pi directory exists
    await this.ensurePiDir();

    // Save models.json with provider and model info
    await this.saveModelsJson(config);

    // Save config.json with current selection
    await this.saveConfigJson(config);
  }

  /**
   * Ensure the .pi directory exists
   */
  private async ensurePiDir(): Promise<void> {
    if (!existsSync(this.piDir)) {
      await mkdir(this.piDir, { recursive: true });
    }
  }

  /**
   * Save models.json with provider configuration
   * @param config - The configuration containing provider and model info
   */
  private async saveModelsJson(config: SetupConfig): Promise<void> {
    const modelsJsonPath = join(this.piDir, 'models.json');

    let existingModels: any = {};
    if (existsSync(modelsJsonPath)) {
      try {
        const content = await readFile(modelsJsonPath, 'utf-8');
        existingModels = JSON.parse(content);
      } catch {
        // If file is corrupt, start fresh
        existingModels = {};
      }
    }

    // Initialize providers object if it doesn't exist
    if (!existingModels.providers) {
      existingModels.providers = {};
    }

    // Get the environment variable name for API key
    const envVarName = this.getEnvVarName(config.provider);

    // Add or update the provider configuration
    existingModels.providers[config.provider] = {
      baseUrl: this.getBaseUrl(config.provider),
      apiKey: `$${envVarName}`,
      api: 'openai-completions',
      models: [
        {
          id: config.model,
          name: config.model,
          reasoning: this.isReasoningModel(config.model),
          input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 4096,
        },
      ],
    };

    await writeFile(modelsJsonPath, JSON.stringify(existingModels, null, 2));
  }

  /**
   * Save config.json with current provider and model selection
   * @param config - The configuration to save
   */
  private async saveConfigJson(config: SetupConfig): Promise<void> {
    const configJsonPath = join(this.piDir, 'config.json');

    let existingConfig: any = {};
    if (existsSync(configJsonPath)) {
      try {
        const content = await readFile(configJsonPath, 'utf-8');
        existingConfig = JSON.parse(content);
      } catch {
        existingConfig = {};
      }
    }

    // Update current selection (don't save API key directly)
    existingConfig.provider = config.provider;
    existingConfig.model = config.model;

    await writeFile(configJsonPath, JSON.stringify(existingConfig, null, 2));
  }

  /**
   * Get the base URL for a provider
   * @param provider - The provider identifier
   * @returns The base URL or undefined for default
   */
  private getBaseUrl(provider: string): string | undefined {
    const baseUrls: Record<string, string> = {
      deepseek: 'https://api.deepseek.com/v1',
      zai: 'https://open.bigmodel.cn/api/paas/v4',
    };
    return baseUrls[provider];
  }

  /**
   * Get the environment variable name for a provider's API key
   * @param provider - The provider identifier
   * @returns The environment variable name
   */
  private getEnvVarName(provider: string): string {
    const envVars: Record<string, string> = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      google: 'GOOGLE_API_KEY',
      zai: 'ZHIPU_API_KEY',
      xai: 'XAI_API_KEY',
      groq: 'GROQ_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
    };
    return envVars[provider] || `${provider.toUpperCase()}_API_KEY`;
  }

  /**
   * Check if a model is a reasoning model
   * @param model - The model identifier
   * @returns True if the model is a reasoning model
   */
  private isReasoningModel(model: string): boolean {
    const reasoningPatterns = ['o1', 'o3', 'r1', 'reasoning'];
    return reasoningPatterns.some((pattern) => model.toLowerCase().includes(pattern));
  }
}
