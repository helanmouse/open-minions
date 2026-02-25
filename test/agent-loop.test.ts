import { describe, it, expect } from 'vitest';
import { AgentLoop } from '../src/worker/agent-loop.js';
import { ToolRegistry } from '../src/tools/registry.js';
import type { LLMAdapter } from '../src/llm/types.js';
import type { Message, ToolDef, LLMEvent, ToolContext } from '../src/types/shared.js';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function makeMockLLM(responses: LLMEvent[][]): LLMAdapter {
  let callIndex = 0;
  return {
    provider: 'mock',
    async *chat(_msgs: Message[], _tools: ToolDef[]) {
      const events = responses[callIndex++] || [{ type: 'done' as const }];
      for (const e of events) yield e;
    },
  };
}

const makeCtx = (): ToolContext => ({
  workdir: mkdtempSync(join(tmpdir(), 'minion-test-')),
  task: {
    id: '1', description: 'test', repo: '/tmp/test', repoType: 'local' as const,
    branch: 'minion/1', baseBranch: 'main', push: false,
    maxIterations: 50, timeout: 30, created_at: '',
  },
});

describe('AgentLoop', () => {
  it('returns text response when no tool calls', async () => {
    const llm = makeMockLLM([
      [{ type: 'text_delta', content: 'Done!' }, { type: 'done' }],
    ]);
    const registry = new ToolRegistry();
    const loop = new AgentLoop(llm, registry, { maxIterations: 5 });
    const result = await loop.run('Say hello', [], makeCtx());
    expect(result.output).toContain('Done!');
    expect(result.iterations).toBe(1);
  });

  it('executes tool calls and feeds results back', async () => {
    const llm = makeMockLLM([
      [
        { type: 'tool_call', id: 'tc1', name: 'echo', arguments: '{"text":"hi"}' },
        { type: 'done' },
      ],
      [{ type: 'text_delta', content: 'Finished' }, { type: 'done' }],
    ]);
    const registry = new ToolRegistry();
    registry.register({
      name: 'echo',
      description: 'Echo text',
      parameters: { type: 'object', properties: { text: { type: 'string' } } },
      async execute(params) {
        return { success: true, output: `echo: ${params.text}` };
      },
    });
    const loop = new AgentLoop(llm, registry, { maxIterations: 5 });
    const result = await loop.run('Use echo tool', ['echo'], makeCtx());
    expect(result.iterations).toBe(2);
    expect(result.output).toContain('Finished');
  });

  it('stops at max iterations', async () => {
    const llm = makeMockLLM(
      Array(10).fill([
        { type: 'tool_call', id: 'tc', name: 'echo', arguments: '{}' },
        { type: 'done' },
      ])
    );
    const registry = new ToolRegistry();
    registry.register({
      name: 'echo', description: '', parameters: {},
      async execute() { return { success: true, output: 'ok' }; },
    });
    const loop = new AgentLoop(llm, registry, { maxIterations: 3 });
    const result = await loop.run('Loop forever', ['echo'], makeCtx());
    expect(result.iterations).toBe(3);
  });
});
