// test/cli/setup/apikey-input.test.ts
import { describe, it, expect } from 'vitest';
import { ApiKeyInput } from '../../../src/cli/setup/apikey-input.js';

describe('ApiKeyInput', () => {
  it('should collect API key from user', async () => {
    const input = new ApiKeyInput('openai');
    // Mock input by setting value directly
    input.setMockValue('sk-test-key-12345');

    const apiKey = await input.getInput();
    expect(apiKey).toBe('sk-test-key-12345');
  });

  it('should validate non-empty API key', async () => {
    const input = new ApiKeyInput('openai');
    input.setMockValue('');

    await expect(input.getInput()).rejects.toThrow('API key cannot be empty');
  });

  it('should return provider', () => {
    const input = new ApiKeyInput('anthropic');
    expect(input.getProvider()).toBe('anthropic');
  });

  it('should handle whitespace-only API key', async () => {
    const input = new ApiKeyInput('openai');
    input.setMockValue('   ');

    await expect(input.getInput()).rejects.toThrow('API key cannot be empty');
  });
});
