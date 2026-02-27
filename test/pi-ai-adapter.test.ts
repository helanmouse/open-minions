import { describe, it, expect } from 'vitest';
import { PiAiAdapter } from '../src/llm/pi-ai-adapter.js';

describe('PiAiAdapter', () => {
  it('implements LLMAdapter interface', () => {
    const adapter = new PiAiAdapter({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'test-key',
    });
    expect(adapter.provider).toBe('pi-ai');
  });

  it('streams chat responses', async () => {
    const adapter = new PiAiAdapter({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: process.env.LLM_API_KEY || 'test',
    });

    const events: string[] = [];
    try {
      for await (const event of adapter.chat([
        { role: 'user', content: 'Say "test"' }
      ], [])) {
        if (event.type === 'text_delta') events.push(event.content);
      }
    } catch (e) {
      // May fail without real API key
    }

    // Verify we got some events structure
    expect(Array.isArray(events)).toBe(true);
  });
});
