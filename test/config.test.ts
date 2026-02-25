import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config/index.js';

describe('loadConfig', () => {
  it('returns default config when no env vars set', () => {
    const config = loadConfig();
    expect(config.server.port).toBe(3000);
    expect(config.server.host).toBe('127.0.0.1');
    expect(config.redis.url).toBe('redis://localhost:6379');
    expect(config.llm.provider).toBe('openai');
  });
});
