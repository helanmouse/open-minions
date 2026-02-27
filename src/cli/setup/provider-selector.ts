// src/cli/setup/provider-selector.ts
import { getProviders } from '@mariozechner/pi-ai';
import type { ProviderInfo } from './types.js';

export class ProviderSelector {
  private providers: string[];

  constructor(
    private onSelect: (provider: string) => Promise<void>,
    private onCancel: () => void
  ) {
    this.providers = this.loadProviders();
  }

  private loadProviders(): string[] {
    return getProviders();
  }

  getProviders(): string[] {
    return this.providers;
  }

  async select(provider: string): Promise<void> {
    await this.onSelect(provider);
  }
}
