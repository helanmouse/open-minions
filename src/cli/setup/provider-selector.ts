// src/cli/setup/provider-selector.ts
import { getProviders } from '@mariozechner/pi-ai';
import type { ProviderInfo } from './types.js';

export class ProviderSelector {
  private providers: ProviderInfo[];

  constructor(
    private onSelect: (provider: string) => Promise<void>,
    private onCancel: () => void
  ) {
    this.providers = this.loadProviders();
  }

  private loadProviders(): ProviderInfo[] {
    const knownProviders = getProviders();
    return knownProviders.map((p) => ({
      id: p,
      label: this.formatLabel(p),
      description: this.getDescription(p),
    }));
  }

  private formatLabel(provider: string): string {
    const labels: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google',
      zai: '智谱 AI (Zhipu)',
      xai: 'xAI (Grok)',
      groq: 'Groq',
      deepseek: 'DeepSeek',
    };
    return labels[provider] || provider;
  }

  private getDescription(provider: string): string {
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

  getProviders(): ProviderInfo[] {
    return this.providers;
  }

  async select(provider: string): Promise<void> {
    await this.onSelect(provider);
  }
}
