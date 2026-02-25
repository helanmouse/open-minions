import { describe, it, expect } from 'vitest';
import { SandboxAgent } from '../src/agent/main.js';
import type { LLMAdapter } from '../src/llm/types.js';
import type { Message, ToolDef, LLMEvent, TaskContext } from '../src/types/shared.js';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

function mockLLM(responses: LLMEvent[][]): LLMAdapter {
  let idx = 0;
  return {
    provider: 'mock',
    async *chat(_msgs: Message[], _tools: ToolDef[]) {
      const events = responses[idx++] || [{ type: 'done' as const }];
      for (const e of events) yield e;
    },
  };
}

function setupHostRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'minion-host-repo-'));
  execSync('git init', { cwd: dir });
  execSync('git config user.email "t@t.com" && git config user.name "T"', { cwd: dir });
  writeFileSync(join(dir, 'index.ts'), 'console.log("hello");\n');
  execSync('git add . && git commit -m "initial"', { cwd: dir });
  return dir;
}

describe('SandboxAgent', () => {
  it('clones from host-repo, runs agent loop, produces patches', async () => {
    const hostRepo = setupHostRepo();
    const runDir = mkdtempSync(join(tmpdir(), 'minion-run-'));
    mkdirSync(join(runDir, 'patches'), { recursive: true });

    const context: TaskContext = {
      taskId: 'test123',
      description: 'Add a greeting function',
      repoType: 'local',
      branch: 'minion/test123',
      baseBranch: 'main',
      projectAnalysis: { language: 'typescript' },
      rules: [],
      maxIterations: 5,
      timeout: 10,
    };
    writeFileSync(join(runDir, 'context.json'), JSON.stringify(context));

    const llm = mockLLM([
      [
        { type: 'tool_call', id: 'tc1', name: 'write',
          arguments: JSON.stringify({ path: 'greet.ts', content: 'export function greet() { return "hi"; }\n' }) },
        { type: 'done' },
      ],
      [
        { type: 'tool_call', id: 'tc2', name: 'bash',
          arguments: JSON.stringify({ command: 'git add . && git commit -m "feat: add greeting"' }) },
        { type: 'done' },
      ],
      [{ type: 'text_delta', content: 'Done. Added greeting function.' }, { type: 'done' }],
    ]);

    const agent = new SandboxAgent({ hostRepoPath: hostRepo, runDir, llm });
    await agent.run();

    // Verify status.json
    const status = JSON.parse(readFileSync(join(runDir, 'status.json'), 'utf-8'));
    expect(status.phase).toBe('done');

    // Verify patches were generated
    const { readdirSync } = await import('fs');
    const patches = readdirSync(join(runDir, 'patches')).filter(f => f.endsWith('.patch'));
    expect(patches.length).toBeGreaterThan(0);
  });
});
