import type { Message, ToolDef, LLMEvent } from '../types/shared.js';

export interface LLMAdapter {
  provider: string;
  chat(messages: Message[], tools: ToolDef[]): AsyncIterable<LLMEvent>;
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'zhipu' | 'ollama' | 'pi-ai' | 'pi';
  model: string;
  apiKey: string;
  baseUrl?: string;
}
