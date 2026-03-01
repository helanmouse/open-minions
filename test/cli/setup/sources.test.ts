import { describe, it, expect } from 'vitest';
import { PROVIDER_SOURCES } from '../../../src/cli/setup/sources.js';

describe('ProviderSources', () => {
  it('should have zai provider with 3 sources', () => {
    const zai = PROVIDER_SOURCES.zai;
    expect(zai).toBeDefined();
    expect(zai.provider).toBe('zai');
    expect(zai.displayName).toBe('Zhipu AI');
    expect(zai.sources).toHaveLength(3);
  });

  it('should have official-cn source with correct URL', () => {
    const cnSource = PROVIDER_SOURCES.zai.sources.find(s => s.id === 'official-cn');
    expect(cnSource).toBeDefined();
    expect(cnSource?.url).toBe('https://open.bigmodel.cn/api/paas/v4');
    expect(cnSource?.isCustom).toBe(false);
  });

  it('should have custom source with empty URL', () => {
    const customSource = PROVIDER_SOURCES.zai.sources.find(s => s.id === 'custom');
    expect(customSource).toBeDefined();
    expect(customSource?.url).toBe('');
    expect(customSource?.isCustom).toBe(true);
  });

  it('should have openai provider with official and custom sources', () => {
    const openai = PROVIDER_SOURCES.openai;
    expect(openai).toBeDefined();
    expect(openai.sources).toHaveLength(2);
    expect(openai.sources[0].id).toBe('official');
    expect(openai.sources[1].id).toBe('custom');
  });
});
