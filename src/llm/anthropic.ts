import type { LLMAdapter, LLMConfig } from './types.js';
import type { Message, ToolDef, LLMEvent } from '../types.js';

export class AnthropicAdapter implements LLMAdapter {
  provider = 'anthropic';
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async *chat(messages: Message[], tools: ToolDef[]): AsyncIterable<LLMEvent> {
    const baseUrl = this.config.baseUrl || 'https://api.anthropic.com/v1';
    const systemMsg = messages.find(m => m.role === 'system');
    const nonSystemMsgs = messages.filter(m => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: 8192,
      messages: nonSystemMsgs.map(m => ({ role: m.role, content: m.content })),
    };
    if (systemMsg) body.system = systemMsg.content;
    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const res = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      yield { type: 'error', error: `Anthropic API error: ${res.status} ${await res.text()}` };
      return;
    }

    const data = await res.json() as any;
    for (const block of data.content || []) {
      if (block.type === 'text') {
        yield { type: 'text_delta', content: block.text };
      } else if (block.type === 'tool_use') {
        yield {
          type: 'tool_call',
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input),
        };
      }
    }
    yield { type: 'done', usage: data.usage };
  }
}
