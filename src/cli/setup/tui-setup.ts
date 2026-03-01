// src/cli/setup/tui-setup.ts
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createInterface } from 'readline';
import { TUI, SelectList, Container, TextComponent, TextEditor, ProcessTerminal } from '@mariozechner/pi-tui';
import { getProviders, getModels } from '@mariozechner/pi-ai';
import type { SelectItem } from '@mariozechner/pi-tui';
import type { SetupConfig, SetupResult, SourceSelectionResult } from './types.js';
import { getProviderSources, type ProviderSources } from './sources.js';
import { SourceSelector } from './source-selector.js';

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
      const sourceResult = await this.selectSource(provider);
      const model = await this.selectModel(provider);
      const apiKey = await this.selectApiKey(provider);

      config = {
        provider,
        source: sourceResult.sourceId,
        model,
        apiKey,
        customUrl: sourceResult.baseUrl || undefined,
        apiType: sourceResult.apiType
      };
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
   * Select a source for the given provider
   * @param provider - The provider to select a source for
   * @returns Promise containing sourceId, baseUrl, and apiType
   */
  async selectSource(provider: string): Promise<SourceSelectionResult> {
    const providerSources = getProviderSources(provider);

    if (!providerSources) {
      // Provider doesn't have multi-source config, use default
      return { sourceId: 'official', baseUrl: '' };
    }

    const selector = new SourceSelector();
    return selector.selectSource(providerSources);
  }

  /**
   * Select a model using TUI SelectList
   * @param provider - The provider to get models from
   * @returns Promise<string> the selected model ID
   */
  async selectModel(provider: string): Promise<string> {
    const models = getModels(provider as any);
    // Reverse the order to show newest models first
    const items: SelectItem[] = models.reverse().map((m) => ({
      value: m.id,
      label: m.name,
      description: m.reasoning ? 'Reasoning model' : 'Standard model',
    }));

    return this.runSelectList('Select a Model', items);
  }

  /**
   * Select or input API key
   * Uses TUI TextEditor for input, with environment variable as default
   * @param provider - The provider to get the API key for
   * @returns Promise<string> the API key
   */
  async selectApiKey(provider: string): Promise<string> {
    const envVarName = this.getEnvVarName(provider);
    const envKey = process.env[envVarName];

    // Always prompt for API key using TUI, with env var as default
    return this.promptForApiKeyTUI(envVarName, envKey);
  }

  /**
   * Run a SelectList TUI and return the selected value
   * @param title - The title to display
   * @param items - The items to select from
   * @returns Promise<string> the selected value
   */
  private async runSelectList(title: string, items: SelectItem[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const terminal = new ProcessTerminal();
      const ui = new TUI(terminal);
      const container = new Container();

      // Add title
      container.addChild(new TextComponent(title, { bottom: 1, top: 0 }));

      // Create select list
      const maxVisible = Math.min(items.length, 15);
      const selectList = new SelectList(items, maxVisible);
      selectList.onSelect = (item: SelectItem) => {
        console.error('\nSelected:', item.value);
        ui.stop();
        resolve(item.value);
      };
      selectList.onCancel = () => {
        console.error('\nCancelled');
        ui.stop();
        reject(new Error('Selection cancelled'));
      };

      container.addChild(selectList);
      ui.addChild(container);
      ui.setFocus(selectList);

      console.error('Starting TUI...');
      ui.start();
      console.error('TUI started');
    });
  }

  /**
   * Prompt for API key using TUI TextEditor
   * @param envVarName - The environment variable name to display
   * @param defaultValue - Default value (from environment variable)
   * @returns Promise<string> the entered API key
   */
  private async promptForApiKeyTUI(envVarName: string, defaultValue?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const terminal = new ProcessTerminal();
      const ui = new TUI(terminal);
      const container = new Container();

      // Add title and instructions
      if (defaultValue) {
        const masked = defaultValue.length > 12
          ? `${defaultValue.slice(0, 8)}...${defaultValue.slice(-4)}`
          : '***';
        container.addChild(new TextComponent(
          `API Key (${envVarName})`,
          { bottom: 2, top: 0 }
        ));
        container.addChild(new TextComponent(
          `Current: ${masked} (from environment)`,
          { bottom: 1, top: 1 }
        ));
        container.addChild(new TextComponent(
          'Press Enter to keep, or type new key and press Enter',
          { bottom: 0, top: 2 }
        ));
      } else {
        container.addChild(new TextComponent(
          `Enter API Key (${envVarName})`,
          { bottom: 1, top: 0 }
        ));
        container.addChild(new TextComponent(
          'Press Enter when done, Ctrl+C to cancel',
          { bottom: 0, top: 1 }
        ));
      }

      // Create text editor for input
      const editor = new TextEditor();
      // Start with empty input - user can type new key or just press Enter to use existing
      editor.setText('');

      editor.onSubmit = () => {
        const value = editor.getText().trim();

        // If empty and we have a default, use the default
        if (!value && defaultValue) {
          ui.stop();
          resolve(defaultValue);
          return;
        }

        if (!value) {
          console.error('\nError: API key is required');
          console.error('Press Ctrl+C to cancel or enter a valid API key');
          return;
        }

        ui.stop();
        resolve(value);
      };

      container.addChild(editor);
      ui.addChild(container);
      ui.setFocus(editor);

      console.error('Starting TUI...');
      ui.start();
      console.error('TUI started');
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

    // Determine base URL: prefer customUrl, fall back to source-based URL, then default
    let baseUrl = config.customUrl;
    let apiType = config.apiType;

    if (!baseUrl && config.source) {
      baseUrl = this.getBaseUrlForSource(config.provider, config.source);
      // Also get apiType from source if not already set
      if (!apiType) {
        apiType = this.getApiTypeForSource(config.provider, config.source);
      }
    }
    if (!baseUrl) {
      baseUrl = this.getBaseUrl(config.provider) || '';
    }

    // Build provider configuration
    const providerConfig: any = {
      apiKey: `$${envVarName}`,
      api: apiType || 'openai-completions',
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

    // Only set baseUrl if it's not empty
    if (baseUrl) {
      providerConfig.baseUrl = baseUrl;
    }

    // Add source configuration if sourceId is specified
    if (config.source) {
      providerConfig.sources = {
        [config.source]: {
          baseUrl,
          apiKey: `$${envVarName}`,
        },
      };
      providerConfig.currentSource = config.source;
    }

    // Add or update the provider configuration
    existingModels.providers[config.provider] = providerConfig;

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
    if (config.source) {
      existingConfig.source = config.source;
    }
    if (config.apiType) {
      existingConfig.apiType = config.apiType;
    }

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
   * Get the base URL for a specific source of a provider
   * @param provider - The provider identifier
   * @param sourceId - The source identifier
   * @returns The base URL for the source, or empty string if not found
   */
  private getBaseUrlForSource(provider: string, sourceId: string): string {
    const providerSources = getProviderSources(provider);
    if (!providerSources) return '';

    const source = providerSources.sources.find(s => s.id === sourceId);
    return source?.url || '';
  }

  /**
   * Get the API type for a specific source of a provider
   * @param provider - The provider identifier
   * @param sourceId - The source identifier
   * @returns The API type for the source, or undefined if not found
   */
  private getApiTypeForSource(provider: string, sourceId: string): string | undefined {
    const providerSources = getProviderSources(provider);
    if (!providerSources) return undefined;

    const source = providerSources.sources.find(s => s.id === sourceId);
    return source?.apiType;
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
