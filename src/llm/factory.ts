import type { LLMAdapter, LLMConfig } from './types.js';
import { OpenAIAdapter } from './openai.js';
import { AnthropicAdapter } from './anthropic.js';
import { ZhipuAdapter } from './zhipu.js';
import { OllamaAdapter } from './ollama.js';
import { PiAiAdapter, type PiAiConfig } from './pi-ai-adapter.js';

export function createLLMAdapter(config: LLMConfig | PiAiConfig): LLMAdapter {
  switch (config.provider) {
    case 'openai':
      return new OpenAIAdapter(config);
    case 'anthropic':
      return new AnthropicAdapter(config);
    case 'zhipu':
      return new ZhipuAdapter(config);
    case 'ollama':
      return new OllamaAdapter(config);
    case 'pi-ai':
    case 'pi':
      return new PiAiAdapter(config);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}
