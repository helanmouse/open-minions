import { describe, it, expect } from 'vitest';
import { PROVIDER_SOURCES } from './sources.js';

describe('ProviderSources', () => {
  it('should have zai provider with multiple sources', () => {
    const zai = PROVIDER_SOURCES.zai;
    expect(zai).toBeDefined();
    expect(zai.provider).toBe('zai');
    expect(zai.displayName).toBe('Zhipu AI (GLM)');
    expect(zai.sources.length).toBeGreaterThanOrEqual(4); // cn-openai, cn-anthropic, intl-openai, intl-anthropic, custom
  });

  it('should have cn-openai source with correct URL and API type', () => {
    const cnSource = PROVIDER_SOURCES.zai.sources.find(s => s.id === 'cn-openai');
    expect(cnSource).toBeDefined();
    expect(cnSource?.url).toBe('https://open.bigmodel.cn/api/paas/v4');
    expect(cnSource?.isCustom).toBe(false);
    expect(cnSource?.apiType).toBe('openai-completions');
  });

  it('should have cn-anthropic source with correct URL and API type', () => {
    const cnSource = PROVIDER_SOURCES.zai.sources.find(s => s.id === 'cn-anthropic');
    expect(cnSource).toBeDefined();
    expect(cnSource?.url).toBe('https://open.bigmodel.cn/api/anthropic');
    expect(cnSource?.isCustom).toBe(false);
    expect(cnSource?.apiType).toBe('anthropic-messages');
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
