import type { LLMAdapter } from '../llm/types.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { Message, LLMEvent, ToolContext } from '../types/shared.js';

// Logger utility
function logIter(iteration: number, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const iter = String(iteration).padStart(3, '0');
  console.error(`[${timestamp}] [ITER:${iter}] ${message}`);
  if (data !== undefined) {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    const lines = str.split('\n').slice(0, 20); // Limit output
    lines.forEach(line => console.error(`  ${line}`));
    if (str.split('\n').length > 20) {
      console.error(`  ... (${str.split('\n').length - 20} more lines)`);
    }
  }
}

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
  ) {
    logIter(0, `AgentLoop initialized with maxIterations: ${this.options.maxIterations}`);
  }

  async run(
    prompt: string,
    toolNames: string[],
    ctx: ToolContext,
    systemPrompt?: string,
  ): Promise<AgentLoopResult> {
    logIter(0, `Starting agent loop, available tools: ${toolNames.join(', ')}`);

    const messages: Message[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
      logIter(0, `System prompt set (${systemPrompt.length} chars)`);
    }
    messages.push({ role: 'user', content: prompt });
    logIter(0, `User prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);

    const toolDefs = this.registry.getToolDefs(toolNames);
    let output = '';
    let iterations = 0;

    while (iterations < this.options.maxIterations) {
      iterations++;
      logIter(iterations, '---');

      const pendingToolCalls: LLMEvent[] = [];
      let textContent = '';

      logIter(iterations, `Sending ${messages.length} messages to LLM...`);
      try {
        for await (const event of this.llm.chat(messages, toolDefs)) {
          if (event.type === 'text_delta') {
            textContent += event.content;
            // Show streaming text (truncated)
            if (event.content) {
              process.stderr.write('.');
            }
          } else if (event.type === 'tool_call') {
            pendingToolCalls.push(event);
            logIter(iterations, `Tool call requested: ${event.name}`);
          } else if (event.type === 'error') {
            logIter(iterations, `LLM error: ${event.error}`);
            return { output: `Error: ${event.error}`, iterations, messages };
          } else if (event.type === 'done') {
            logIter(iterations, `LLM done, usage: ${JSON.stringify(event.usage)}`);
          }
        }
        if (textContent) {
          console.error(); // New line after the dots
          logIter(iterations, `LLM response: ${textContent.substring(0, 200)}${textContent.length > 200 ? '...' : ''}`);
        }
      } catch (e: any) {
        logIter(iterations, `LLM call failed: ${e.message}`);
        return { output: `Error: ${e.message}`, iterations, messages };
      }

      // No tool calls — LLM is done
      if (pendingToolCalls.length === 0) {
        logIter(iterations, 'No tool calls, LLM finished');
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
      logIter(iterations, `Executing ${pendingToolCalls.length} tool(s)...`);
      for (const tc of pendingToolCalls) {
        if (tc.type !== 'tool_call') continue;
        const tool = this.registry.get(tc.name);
        let resultText: string;

        if (!tool) {
          logIter(iterations, `Unknown tool: ${tc.name}`);
          resultText = `Error: unknown tool "${tc.name}"`;
        } else {
          try {
            const params = JSON.parse(tc.arguments);
            logIter(iterations, `→ ${tc.name}(${JSON.stringify(params).substring(0, 100)})`);
            const startTime = Date.now();
            const result = await tool.execute(params, ctx);
            const elapsed = Date.now() - startTime;
            if (result.success) {
              logIter(iterations, `← ${tc.name} OK (${elapsed}ms)`, result.output.substring(0, 500));
              resultText = result.output;
            } else {
              logIter(iterations, `← ${tc.name} FAILED (${elapsed}ms): ${result.error}`);
              resultText = `Error: ${result.error}`;
            }
          } catch (e: any) {
            logIter(iterations, `← ${tc.name} ERROR: ${e.message}`);
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

    logIter(0, `Agent loop finished after ${iterations} iteration(s)`);
    return { output, iterations, messages };
  }
}
