import { getModel, streamSimple, type Model, type Context, type Tool } from '@mariozechner/pi-ai';
import type { LLMAdapter, LLMConfig } from './types.js';
import type { Message as MinionsMessage, ToolDef, LLMEvent } from '../types/shared.js';

export interface PiAiConfig {
  provider: 'pi-ai' | 'pi';
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export class PiAiAdapter implements LLMAdapter {
  provider = 'pi-ai';
  private model: Model<any>;
  private apiKey: string;

  constructor(config: PiAiConfig) {
    // Use getModel() factory, not new PiAI()
    this.model = getModel(config.provider as any, config.model as any);
    this.apiKey = config.apiKey;
  }

  async *chat(messages: MinionsMessage[], tools: ToolDef[]): AsyncGenerator<LLMEvent> {
    // Convert minions messages to pi-ai format
    const piMessages = messages.map(m => this.convertMessage(m));

    // Convert minions tools to pi-ai format
    const piTools: any[] = tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    const context: Context = {
      messages: piMessages,
      tools: piTools.length > 0 ? piTools : undefined,
    };

    const eventStream = streamSimple(this.model, context, {
      apiKey: this.apiKey,
    });

    for await (const event of eventStream) {
      switch (event.type) {
        case 'text_delta':
          yield { type: 'text_delta', content: event.delta };
          break;
        case 'toolcall_end':
          yield {
            type: 'tool_call',
            id: event.toolCall.id,
            name: event.toolCall.name,
            arguments: JSON.stringify(event.toolCall.arguments), // pi-ai returns object, minions expects string
          };
          break;
        case 'done':
          yield { type: 'done', usage: { input_tokens: event.message.usage?.input || 0, output_tokens: event.message.usage?.output || 0 } };
          break;
        case 'error':
          yield { type: 'error', error: event.error.errorMessage || 'LLM error' };
          break;
      }
    }
  }

  private convertMessage(m: MinionsMessage): any {
    if (m.role === 'user') {
      return { role: 'user', content: m.content, timestamp: Date.now() };
    }
    if (m.role === 'assistant') {
      const content: any[] = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          content.push({
            type: 'toolCall',
            id: tc.id,
            name: tc.name,
            arguments: JSON.parse(tc.arguments),
          });
        }
      }
      return {
        role: 'assistant', content,
        api: this.model.api, provider: this.model.provider, model: this.model.id,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop', timestamp: Date.now(),
      };
    }
    if (m.role === 'tool') {
      return {
        role: 'toolResult', // pi-ai uses 'toolResult' not 'tool'
        toolCallId: m.tool_call_id,
        toolName: '',
        content: [{ type: 'text', text: String(m.content) }],
        isError: false,
        timestamp: Date.now(),
      };
    }
    return m;
  }
}
