import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs';
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

// Logger utility for detailed output
function log(phase: string, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.error(`[${timestamp}] [${phase}] ${message}`);
  if (data) {
    console.error(JSON.stringify(data, null, 2));
  }
}

function logError(phase: string, message: string, error: unknown): void {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.error(`[${timestamp}] [${phase}/ERROR] ${message}`);
  if (error instanceof Error) {
    console.error(`  Message: ${error.message}`);
    console.error(`  Stack: ${error.stack}`);
  } else {
    console.error(`  Details:`, error);
  }
}

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
    log('INIT', `SandboxAgent initialized with workdir: ${this.workdir}`);
  }

  private updateStatus(status: Partial<SandboxStatus>): void {
    let current: SandboxStatus = { phase: 'init' };
    try {
      current = JSON.parse(readFileSync(join(this.runDir, 'status.json'), 'utf-8'));
    } catch {}
    Object.assign(current, status);
    writeFileSync(join(this.runDir, 'status.json'), JSON.stringify(current, null, 2));
    log('STATUS', `Updated: ${JSON.stringify(status)}`);
  }

  async run(): Promise<void> {
    try {
      log('START', '=== Sandbox Agent Execution Started ===');

      // Phase 1: Read context
      log('CONTEXT', 'Reading task context...');
      const context: TaskContext = JSON.parse(
        readFileSync(join(this.runDir, 'context.json'), 'utf-8')
      );
      log('CONTEXT', `Task: ${context.description}`, {
        taskId: context.taskId,
        branch: context.branch,
        baseBranch: context.baseBranch,
        maxIterations: context.maxIterations,
      });

      // Phase 2: Clone from host-repo
      log('CLONE', 'Preparing workspace...');
      this.updateStatus({ phase: 'cloning' });

      // Clean existing workspace if present
      if (existsSync(this.workdir)) {
        log('CLONE', `Removing existing workspace: ${this.workdir}`);
        rmSync(this.workdir, { recursive: true, force: true });
      }

      log('CLONE', `Cloning from ${this.hostRepoPath} to ${this.workdir}`);
      try {
        execFileSync('git', ['clone', `file://${this.hostRepoPath}`, this.workdir], {
          encoding: 'utf-8', timeout: 120_000, stdio: 'inherit',
        });
        log('CLONE', 'Repository cloned successfully');
      } catch (e) {
        logError('CLONE', 'Failed to clone repository', e);
        throw e;
      }

      log('GIT', `Creating branch: ${context.branch}`);
      try {
        execFileSync('git', ['checkout', '-b', context.branch], {
          cwd: this.workdir, encoding: 'utf-8', stdio: 'inherit',
        });
      } catch (e) {
        logError('GIT', 'Failed to create branch', e);
        throw e;
      }

      log('GIT', 'Configuring git user');
      execFileSync('git', ['config', 'user.email', 'minion@localhost'], {
        cwd: this.workdir, encoding: 'utf-8',
      });
      execFileSync('git', ['config', 'user.name', 'Minion Agent'], {
        cwd: this.workdir, encoding: 'utf-8',
      });

      // Phase 3-5: Plan + Execute via Agent Loop
      log('PLAN', 'Building system prompt and registering tools...');
      this.updateStatus({ phase: 'planning' });

      const registry = new ToolRegistry();
      const tools = [bashTool, readTool, writeTool, editTool, listFilesTool, searchCodeTool, gitTool];
      tools.forEach(t => {
        registry.register(t);
        log('TOOLS', `Registered: ${t.name}`);
      });

      const systemPrompt = buildSystemPrompt(context);
      log('PLAN', `System prompt built (${systemPrompt.length} chars)`);

      const toolNames = ['bash', 'read', 'write', 'edit', 'list_files', 'search_code', 'git'];

      log('EXEC', 'Starting agent loop...');
      this.updateStatus({ phase: 'executing' });
      const loop = new AgentLoop(this.llm, registry, {
        maxIterations: context.maxIterations,
      });

      let result: Awaited<ReturnType<typeof loop.run>>;
      try {
        result = await loop.run(
          context.description,
          toolNames,
          { workdir: this.workdir, task: { id: context.taskId, description: context.description } as any },
          systemPrompt,
        );
        log('EXEC', 'Agent loop completed');
      } catch (e) {
        logError('EXEC', 'Agent loop failed', e);
        throw e;
      }

      // Phase 7: Deliver — generate patches
      log('PATCH', 'Generating patches...');
      this.updateStatus({ phase: 'delivering' });
      try {
        execFileSync('git', [
          'format-patch', `origin/${context.baseBranch}`,
          '--output-directory', join(this.runDir, 'patches'),
        ], { cwd: this.workdir, encoding: 'utf-8', stdio: 'inherit' });
        log('PATCH', 'Patches generated successfully');
      } catch (e: any) {
        // No commits to patch — that's ok if agent didn't make changes
        log('PATCH', `No patches generated: ${e.message}`);
      }

      this.updateStatus({
        phase: 'done',
        summary: result.output || 'Task completed',
      });
      log('DONE', '=== Task Completed Successfully ===');
    } catch (e: any) {
      logError('FATAL', 'Task failed', e);
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
    log('ENTRY', 'Sandbox Agent starting...');
    const { loadConfig } = await import('../config/index.js');
    const { createLLMAdapter } = await import('../llm/factory.js');

    log('CONFIG', 'Loading .env from /minion-run/.env');
    try {
      const { config: dotenvConfig } = await import('dotenv');
      dotenvConfig({ path: '/minion-run/.env' });
    } catch (e) {
      logError('CONFIG', 'Failed to load .env', e);
    }

    log('CONFIG', 'Loading LLM configuration');
    const cfg = loadConfig();
    log('CONFIG', `LLM Provider: ${cfg.llm.provider}, Model: ${cfg.llm.model}`);

    const llm = createLLMAdapter(cfg.llm);
    log('CONFIG', 'LLM adapter created');

    const agent = new SandboxAgent({
      hostRepoPath: '/host-repo',
      runDir: '/minion-run',
      llm,
    });

    await agent.run();
    log('EXIT', 'Sandbox Agent exiting successfully');
    process.exit(0);
  })().catch(e => {
    logError('EXIT', 'Sandbox Agent failed with fatal error', e);
    process.exit(1);
  });
}
