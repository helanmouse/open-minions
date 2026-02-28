import { describe, it, expect } from 'vitest';
import { createLLMAdapter } from '../src/llm/factory.js';

describe('LLM factory', () => {
  it('creates openai adapter', () => {
    const adapter = createLLMAdapter({
      provider: 'openai', model: 'gpt-4o', apiKey: 'test', baseUrl: undefined,
    });
    expect(adapter).toBeDefined();
    expect(adapter.provider).toBe('openai');
  });

  it('creates anthropic adapter', () => {
    const adapter = createLLMAdapter({
      provider: 'anthropic', model: 'claude-sonnet-4-20250514', apiKey: 'test', baseUrl: undefined,
    });
    expect(adapter).toBeDefined();
    expect(adapter.provider).toBe('anthropic');
  });

  it('falls back to PiAiAdapter for unknown provider', () => {
    const adapter = createLLMAdapter({
      provider: 'unknown' as any, model: '', apiKey: '', baseUrl: undefined,
    });
    expect(adapter).toBeDefined();
    expect(adapter.provider).toBe('pi-ai');
  });
});
