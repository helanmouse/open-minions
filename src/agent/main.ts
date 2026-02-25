import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import type { LLMAdapter } from '../llm/types.js';
import type { TaskContext, SandboxStatus } from '../types/shared.js';
import { AgentLoop } from '../worker/agent-loop.js';
import { ToolRegistry } from '../tools/registry.js';
import { bashTool } from '../tools/bash.js';
import { readTool, writeTool, editTool, listFilesTool } from '../tools/file-ops.js';
import { searchCodeTool } from '../tools/search.js';
import { gitTool } from '../tools/git.js';
import { buildSystemPrompt } from './planner.js';
import { Watchdog } from './watchdog.js';

export interface SandboxAgentOptions {
  hostRepoPath: string;   // /host-repo (read-only mount)
  runDir: string;         // /minion-run
  llm: LLMAdapter;
}

export class SandboxAgent {
  private hostRepoPath: string;
  private runDir: string;
  private llm: LLMAdapter;
  private workdir: string;

  constructor(opts: SandboxAgentOptions) {
    this.hostRepoPath = opts.hostRepoPath;
    this.runDir = opts.runDir;
    this.llm = opts.llm;
    this.workdir = join(opts.runDir, 'workspace');
  }
  private updateStatus(status: Partial<SandboxStatus>): void {
    let current: SandboxStatus = { phase: 'init' };
    try {
      current = JSON.parse(readFileSync(join(this.runDir, 'status.json'), 'utf-8'));
    } catch {}
    Object.assign(current, status);
    writeFileSync(join(this.runDir, 'status.json'), JSON.stringify(current, null, 2));
  }

  async run(): Promise<void> {
    try {
      // Phase 1: Read context
      const context: TaskContext = JSON.parse(
        readFileSync(join(this.runDir, 'context.json'), 'utf-8')
      );

      // Phase 2: Clone from host-repo
      this.updateStatus({ phase: 'cloning' });
      execFileSync('git', ['clone', `file://${this.hostRepoPath}`, this.workdir], {
        encoding: 'utf-8', timeout: 120_000,
      });
      execFileSync('git', ['checkout', '-b', context.branch], {
        cwd: this.workdir, encoding: 'utf-8',
      });
      execFileSync('git', ['config', 'user.email', 'minion@localhost'], {
        cwd: this.workdir, encoding: 'utf-8',
      });
      execFileSync('git', ['config', 'user.name', 'Minion Agent'], {
        cwd: this.workdir, encoding: 'utf-8',
      });

      // Phase 3-5: Plan + Execute via Agent Loop
      this.updateStatus({ phase: 'planning' });
      const registry = new ToolRegistry();
      [bashTool, readTool, writeTool, editTool, listFilesTool, searchCodeTool, gitTool]
        .forEach(t => registry.register(t));

      const systemPrompt = buildSystemPrompt(context);
      const toolNames = ['bash', 'read', 'write', 'edit', 'list_files', 'search_code', 'git'];

      this.updateStatus({ phase: 'executing' });
      const loop = new AgentLoop(this.llm, registry, {
        maxIterations: context.maxIterations,
      });
      const result = await loop.run(
        context.description,
        toolNames,
        { workdir: this.workdir, task: { id: context.taskId, description: context.description } as any },
        systemPrompt,
      );

      // Phase 7: Deliver — generate patches
      this.updateStatus({ phase: 'delivering' });
      try {
        execFileSync('git', [
          'format-patch', `origin/${context.baseBranch}`,
          '--output-directory', join(this.runDir, 'patches'),
        ], { cwd: this.workdir, encoding: 'utf-8' });
      } catch {
        // No commits to patch — that's ok if agent didn't make changes
      }

      this.updateStatus({
        phase: 'done',
        summary: result.output || 'Task completed',
      });
    } catch (e: any) {
      this.updateStatus({
        phase: 'failed',
        error: e.message,
      });
      throw e;
    }
  }
}

// Container entry point — run when executed directly
const isMain = process.argv[1]?.endsWith('agent/main.ts')
  || process.argv[1]?.endsWith('agent/main.js');

if (isMain) {
  (async () => {
    const { loadConfig } = await import('../config/index.js');
    const { createLLMAdapter } = await import('../llm/factory.js');
    try {
      const { config } = await import('dotenv');
      config({ path: '/minion-run/.env' });
    } catch {}
    const cfg = loadConfig();
    const llm = createLLMAdapter(cfg.llm);
    const agent = new SandboxAgent({
      hostRepoPath: '/host-repo',
      runDir: '/minion-run',
      llm,
    });
    await agent.run();
  })().catch(e => {
    console.error('Sandbox Agent failed:', e);
    process.exit(1);
  });
}
