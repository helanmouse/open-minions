import type { LLMAdapter, LLMConfig } from './types.js';
import type { Message, ToolDef, LLMEvent } from '../types.js';

export class OpenAIAdapter implements LLMAdapter {
  provider = 'openai';
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async *chat(messages: Message[], tools: ToolDef[]): AsyncIterable<LLMEvent> {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      })),
    };
    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      yield { type: 'error', error: `OpenAI API error: ${res.status} ${await res.text()}` };
      return;
    }

    const data = await res.json() as any;
    const choice = data.choices?.[0];
    if (!choice) {
      yield { type: 'error', error: 'No choices in response' };
      return;
    }

    if (choice.message.content) {
      yield { type: 'text_delta', content: choice.message.content };
    }
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        yield {
          type: 'tool_call',
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        };
      }
    }
    yield { type: 'done', usage: data.usage };
  }
}
