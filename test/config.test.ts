import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config/index.js';

describe('loadConfig', () => {
  it('returns default config when no env vars set', () => {
    const config = loadConfig();
    expect(config.llm.provider).toBe('openai');
    expect(config.llm.model).toBe('gpt-4o');
    expect(config.sandbox.memory).toBe('4g');
    expect(config.sandbox.cpus).toBe(2);
    expect(config.agent.maxIterations).toBe(50);
    expect(config.agent.timeout).toBe(30);
  });

  it('reads LLM config from env', () => {
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.LLM_MODEL = 'claude-sonnet-4-20250514';
    const config = loadConfig();
    expect(config.llm.provider).toBe('anthropic');
    expect(config.llm.model).toBe('claude-sonnet-4-20250514');
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
  });
});
