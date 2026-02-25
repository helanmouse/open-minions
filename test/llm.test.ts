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

  it('throws on unknown provider', () => {
    expect(() => createLLMAdapter({
      provider: 'unknown' as any, model: '', apiKey: '', baseUrl: undefined,
    })).toThrow();
  });
});
