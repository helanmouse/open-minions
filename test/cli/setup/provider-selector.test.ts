// test/cli/setup/provider-selector.test.ts
import { describe, it, expect } from 'vitest';
import { ProviderSelector } from '../../../src/cli/setup/provider-selector.js';

describe('ProviderSelector', () => {
  it('should load all providers from pi-ai', async () => {
    const selector = new ProviderSelector(async (provider) => {
      expect(provider).toBeTruthy();
      expect(typeof provider).toBe('string');
    }, () => {});

    const providers = selector.getProviders();
    expect(providers.length).toBeGreaterThan(0);
    expect(providers.some(p => p.id === 'openai')).toBe(true);
    expect(providers.some(p => p.id === 'anthropic')).toBe(true);

    const openai = providers.find(p => p.id === 'openai');
    expect(openai).toBeDefined();
    expect(openai?.label).toBe('OpenAI');
    expect(openai?.description).toBe('GPT-4o, GPT-4o-mini, o1, o3-mini');
  });

  it('should call onSelect when provider selected', async () => {
    let selectedProvider: string | undefined;
    const selector = new ProviderSelector(
      async (provider) => { selectedProvider = provider; },
      () => {}
    );

    await selector.select('openai');
    expect(selectedProvider).toBe('openai');
  });
});
