import type { LLMAdapter, LLMConfig } from './types.js';
import type { Message, ToolDef, LLMEvent } from '../types/shared.js';

function logLLM(direction: 'REQ' | 'RES', data: unknown): void {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.error(`[${timestamp}] [LLM:${direction}] ${typeof data === 'string' ? data : JSON.stringify(data, null, 2).substring(0, 2000)}`);
}

/**
 * Zhipu GLM Adapter
 *
 * Official GLM API using OpenAI-compatible format:
 * - Base URL: https://open.bigmodel.cn/api/paas/v4
 * - Endpoint: /chat/completions
 * - Authorization: Bearer {api_key}
 * - Format: OpenAI-compatible (messages array, tools array)
 */
export class ZhipuAdapter implements LLMAdapter {
  provider = 'zhipu';
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async *chat(messages: Message[], tools: ToolDef[]): AsyncIterable<LLMEvent> {
    // GLM official API base URL
    const baseUrl = this.config.baseUrl || 'https://open.bigmodel.cn/api/paas/v4';
    const apiUrl = `${baseUrl}/chat/completions`;

    // Extract system message
    const systemMsg = messages.find(m => m.role === 'system');

    // Convert messages to GLM/OpenAI format
    const apiMessages: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        continue; // Handle separately
      } else if (msg.role === 'tool') {
        // Tool result - add as user message with tool result format
        apiMessages.push({
          role: 'user',
          content: `[Tool Result for ${msg.tool_call_id}]:\n${msg.content}`,
        });
      } else if (msg.role === 'assistant') {
        const assistantMsg: any = { role: 'assistant', content: msg.content || '' };
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          // GLM uses OpenAI tool_calls format
          assistantMsg.tool_calls = msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          }));
        }
        apiMessages.push(assistantMsg);
      } else {
        // user message
        apiMessages.push(msg);
      }
    }

    // Prepend system message to first user message if exists
    if (systemMsg && apiMessages.length > 0) {
      const firstUserMsg = apiMessages.find(m => m.role === 'user');
      if (firstUserMsg) {
        firstUserMsg.content = `${systemMsg.content}\n\n${firstUserMsg.content}`;
      }
    }

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: apiMessages,
      max_tokens: 8192,
      temperature: 0.7,
    };

    // Add tools if available (OpenAI format)
    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      body.tool_choice = 'auto';
    }

    logLLM('REQ', JSON.stringify({
      url: apiUrl,
      model: this.config.model,
      messages: apiMessages.length,
      tools: tools.length,
    }));

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
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
      id: data.id,
      model: data.model,
      choices: data.choices?.length,
      usage: data.usage,
    }));

    if (!data.choices || data.choices.length === 0) {
      yield { type: 'error', error: 'Zhipu API: No choices returned' };
      return;
    }

    const choice = data.choices[0];
    const message = choice.message;

    // Output text content (reasoning models like glm-5 put text in reasoning_content)
    const text = message.content || message.reasoning_content || '';
    if (text) {
      yield { type: 'text_delta', content: text };
    }

    // Handle tool calls (OpenAI format)
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const tc of message.tool_calls) {
        if (tc.type === 'function') {
          logLLM('RES', `Tool call: ${tc.function.name}`);
          yield {
            type: 'tool_call',
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          };
        }
      }
    }

    yield { type: 'done', usage: data.usage };
  }
}
