import { describe, it, expect } from 'vitest';
import { HostAgent } from '../src/host-agent/index.js';
import type { LLMAdapter } from '../src/llm/types.js';
import type { Message, ToolDef, LLMEvent } from '../src/types/shared.js';
import type { Sandbox, SandboxHandle } from '../src/sandbox/types.js';
import { TaskStore } from '../src/task/store.js';
import { mkdtempSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

function mockLLM(responses: string[]): LLMAdapter {
  let idx = 0;
  return {
    provider: 'mock',
    async *chat(_msgs: Message[], _tools: ToolDef[]) {
      yield { type: 'text_delta' as const, content: responses[idx++] || '{}' };
      yield { type: 'done' as const };
    },
  };
}

function mockSandbox(): Sandbox & { started: boolean } {
  const mock = {
    started: false,
    buildContainerOptions: () => ({}),
    async pull() {},
    async start(): Promise<SandboxHandle> {
      mock.started = true;
      return {
        containerId: 'mock-container-123',
        async *logs() { yield 'Working...\n'; },
        async wait() { return { exitCode: 0 }; },
        async stop() {},
      };
    },
  };
  return mock;
}

describe('HostAgent', () => {
  it('assembles TaskContext and writes context.json', async () => {
    const runBase = mkdtempSync(join(tmpdir(), 'minion-ha-'));
    const repoDir = mkdtempSync(join(tmpdir(), 'minion-repo-'));
    execSync('git init', { cwd: repoDir });
    execSync('git config user.email "t@t.com" && git config user.name "T"', { cwd: repoDir });
    execSync('echo "hello" > index.ts && git add . && git commit -m "init"', { cwd: repoDir });

    const llm = mockLLM([
      // Task parser response
      JSON.stringify({ description: 'Fix login bug', repoUrl: null, issueUrl: null, branch: null }),
      // Project analysis response
      JSON.stringify({ language: 'typescript', framework: 'express', packageManager: 'npm' }),
    ]);
    const sandbox = mockSandbox();
    const store = new TaskStore(join(runBase, 'tasks.json'));

    const agent = new HostAgent({ llm, sandbox, store, minionHome: runBase });
    const taskId = await agent.prepare('修复登录bug', { repo: repoDir, yes: true });

    const contextPath = join(runBase, 'runs', taskId, 'context.json');
    expect(existsSync(contextPath)).toBe(true);
    const ctx = JSON.parse(readFileSync(contextPath, 'utf-8'));
    expect(ctx.description).toBe('Fix login bug');
    expect(ctx.taskId).toBe(taskId);
  });
});
