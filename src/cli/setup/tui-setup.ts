// src/cli/setup/tui-setup.ts
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
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
      // In interactive mode, we would:
      // 1. Show ProviderSelector for provider selection
      // 2. Show ModelSelector for model selection
      // 3. Show ApiKeyInput for API key entry
      // For now, we use mock config pattern
      throw new Error('Interactive mode not yet implemented. Use setMockConfig() for testing.');
    }

    // Save the configuration
    await this.saveConfig(config);

    return {
      config,
      saved: true,
    };
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
