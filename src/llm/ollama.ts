import type { LLMAdapter, LLMConfig } from './types.js';
import type { Message, ToolDef, LLMEvent } from '../types.js';

export class OllamaAdapter implements LLMAdapter {
  provider = 'ollama';
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async *chat(messages: Message[], tools: ToolDef[]): AsyncIterable<LLMEvent> {
    const baseUrl = this.config.baseUrl || 'http://localhost:11434';
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: false,
    };
    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      yield { type: 'error', error: `Ollama error: ${res.status} ${await res.text()}` };
      return;
    }

    const data = await res.json() as any;
    if (data.message?.content) {
      yield { type: 'text_delta', content: data.message.content };
    }
    if (data.message?.tool_calls) {
      for (const tc of data.message.tool_calls) {
        yield {
          type: 'tool_call',
          id: `ollama-${Date.now()}`,
          name: tc.function.name,
          arguments: JSON.stringify(tc.function.arguments),
        };
      }
    }
    yield { type: 'done' };
  }
}
