import type { LLMAdapter, LLMConfig } from './types.js';
import type { Message, ToolDef, LLMEvent } from '../types/shared.js';

function logLLM(direction: 'REQ' | 'RES', data: unknown): void {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.error(`[${timestamp}] [LLM:${direction}] ${typeof data === 'string' ? data : JSON.stringify(data, null, 2).substring(0, 2000)}`);
}

/**
 * Zhipu AI (智谱 AI) Adapter
 *
 * Zhipu provides an Anthropic-compatible API with some differences:
 * - Base URL: https://open.bigmodel.cn/api/anthropic
 * - Does NOT support role='tool' messages
 * - Tool results must be sent as user messages with special formatting
 * - Tool calls use content array with tool_use blocks
 */
export class ZhipuAdapter implements LLMAdapter {
  provider = 'zhipu';
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async *chat(messages: Message[], tools: ToolDef[]): AsyncIterable<LLMEvent> {
    // Zhipu API base URL
    const baseUrl = this.config.baseUrl || 'https://open.bigmodel.cn/api/anthropic';
    // Ensure baseUrl ends with /v1
    const apiBaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;

    const systemMsg = messages.find(m => m.role === 'system');
    const nonSystemMsgs = messages.filter(m => m.role !== 'system');

    // Convert messages to Zhipu format
    // Zhipu doesn't support role='tool', so we convert tool results to user messages
    const apiMessages: any[] = [];

    for (const msg of nonSystemMsgs) {
      if (msg.role === 'tool') {
        // Convert tool result to user message format
        apiMessages.push({
          role: 'user',
          content: `[Tool Result for ${msg.tool_call_id}]:\n${msg.content}`,
        });
      } else if (msg.role === 'assistant') {
        const assistantMsg: any = { role: 'assistant', content: msg.content || [] };
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          // Zhipu format: tool_use blocks in content array
          const blocks: any[] = msg.content ? [{ type: 'text', text: msg.content }] : [];
          for (const tc of msg.tool_calls) {
            blocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: JSON.parse(tc.arguments),
            });
          }
          assistantMsg.content = blocks;
        }
        apiMessages.push(assistantMsg);
      } else {
        // user messages
        apiMessages.push(msg);
      }
    }

    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: 8192,
      messages: apiMessages,
    };
    if (systemMsg) body.system = systemMsg.content;
    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    logLLM('REQ', JSON.stringify({
      model: this.config.model,
      system: systemMsg?.content?.substring(0, 100) + '...',
      messages: nonSystemMsgs.length,
      tools: tools.length,
    }));

    const res = await fetch(`${apiBaseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      logLLM('RES', `Error ${res.status}: ${errorText}`);
      yield { type: 'error', error: `Zhipu API error: ${res.status} ${errorText}` };
      return;
    }

    const data = await res.json() as any;
    logLLM('RES', JSON.stringify({
      type: data.type,
      content_blocks: data.content?.length || 0,
      usage: data.usage,
      full_response: JSON.stringify(data).substring(0, 1000),
    }));

    for (const block of data.content || []) {
      if (block.type === 'text') {
        yield { type: 'text_delta', content: block.text };
      } else if (block.type === 'tool_use') {
        logLLM('RES', `Tool call: ${block.name}`);
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
