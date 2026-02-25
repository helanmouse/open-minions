import type { LLMAdapter } from '../llm/types.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { Message, LLMEvent, ToolContext } from '../types/shared.js';

export interface AgentLoopOptions {
  maxIterations: number;
}

export interface AgentLoopResult {
  output: string;
  iterations: number;
  messages: Message[];
}

export class AgentLoop {
  constructor(
    private llm: LLMAdapter,
    private registry: ToolRegistry,
    private options: AgentLoopOptions,
  ) {}

  async run(
    prompt: string,
    toolNames: string[],
    ctx: ToolContext,
    systemPrompt?: string,
  ): Promise<AgentLoopResult> {
    const messages: Message[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const toolDefs = this.registry.getToolDefs(toolNames);
    let output = '';
    let iterations = 0;

    while (iterations < this.options.maxIterations) {
      iterations++;
      const pendingToolCalls: LLMEvent[] = [];
      let textContent = '';

      for await (const event of this.llm.chat(messages, toolDefs)) {
        if (event.type === 'text_delta') {
          textContent += event.content;
        } else if (event.type === 'tool_call') {
          pendingToolCalls.push(event);
        } else if (event.type === 'error') {
          return { output: `Error: ${event.error}`, iterations, messages };
        }
      }

      // No tool calls — LLM is done
      if (pendingToolCalls.length === 0) {
        output = textContent;
        messages.push({ role: 'assistant', content: textContent });
        break;
      }

      // Record assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: textContent,
        tool_calls: pendingToolCalls.map(tc => {
          if (tc.type !== 'tool_call') throw new Error('unexpected');
          return { id: tc.id, name: tc.name, arguments: tc.arguments };
        }),
      });

      // Execute each tool call
      for (const tc of pendingToolCalls) {
        if (tc.type !== 'tool_call') continue;
        const tool = this.registry.get(tc.name);
        let resultText: string;
        if (!tool) {
          resultText = `Error: unknown tool "${tc.name}"`;
        } else {
          try {
            const params = JSON.parse(tc.arguments);
            const result = await tool.execute(params, ctx);
            resultText = result.success
              ? result.output
              : `Error: ${result.error}`;
          } catch (e: any) {
            resultText = `Error: ${e.message}`;
          }
        }
        messages.push({
          role: 'tool',
          content: resultText,
          tool_call_id: tc.id,
        });
      }
    }

    return { output, iterations, messages };
  }
}
