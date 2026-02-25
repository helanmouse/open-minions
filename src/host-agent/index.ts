import { randomBytes } from 'crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import type { LLMAdapter } from '../llm/types.js';
import type { Sandbox } from '../sandbox/types.js';
import type { TaskContext, TaskRequest, SandboxStatus } from '../types/shared.js';
import type { ProjectAnalysis } from '../types/host.js';
import { TaskStore } from '../task/store.js';
import { parseTaskDescription } from './task-parser.js';
import { prepareRepo, cleanupRepo } from './repo-preparer.js';
import { applyPatches, pushRepo } from './patch-applier.js';

export interface HostAgentOptions {
  llm: LLMAdapter;
  sandbox: Sandbox;
  store: TaskStore;
  minionHome: string;  // ~/.minion
}

export interface RunOptions {
  repo?: string;
  image?: string;
  yes?: boolean;
  detach?: boolean;
  timeout?: number;
  maxIterations?: number;
}

export class HostAgent {
  private llm: LLMAdapter;
  private sandbox: Sandbox;
  private store: TaskStore;
  private minionHome: string;

  constructor(opts: HostAgentOptions) {
    this.llm = opts.llm;
    this.sandbox = opts.sandbox;
    this.store = opts.store;
    this.minionHome = opts.minionHome;
  }

  async prepare(rawInput: string, opts: RunOptions = {}): Promise<string> {
    const taskId = randomBytes(6).toString('hex');
    const runDir = join(this.minionHome, 'runs', taskId);
    mkdirSync(join(runDir, 'patches'), { recursive: true });

    // Step 1: Parse natural language
    const parsed = await parseTaskDescription(this.llm, rawInput);

    // Step 2: Determine repo
    const repoPath = opts.repo || parsed.repoUrl || process.cwd();
    const repoType = repoPath.startsWith('http') || repoPath.startsWith('git@')
      ? 'remote' as const : 'local' as const;

    // Step 3: Analyze project (LLM-powered, read-only scan)
    const analysis = await this.analyzeProject(repoPath);

    // Step 4: Prepare repo (remote → clone to runDir)
    const prepared = await prepareRepo({ repoType, repo: repoPath, runDir });

    // Step 5: Build TaskRequest and store
    const branch = parsed.branch || `minion/${taskId}`;
    const request: TaskRequest = {
      id: taskId,
      description: parsed.description,
      repo: repoPath,
      repoType,
      branch,
      baseBranch: 'main',
      image: opts.image,
      fromUrl: parsed.issueUrl || undefined,
      push: repoType === 'remote',
      maxIterations: opts.maxIterations || 50,
      timeout: opts.timeout || 30,
      created_at: new Date().toISOString(),
    };
    this.store.create(request);
    this.store.update(taskId, { workdir: prepared.repoPath });

    // Step 6: Write context.json for Sandbox Agent
    const context: TaskContext = {
      taskId,
      description: parsed.description,
      repoType,
      branch,
      baseBranch: 'main',
      projectAnalysis: analysis as unknown as Record<string, unknown>,
      rules: [],
      maxIterations: request.maxIterations,
      timeout: request.timeout,
    };
    writeFileSync(join(runDir, 'context.json'), JSON.stringify(context, null, 2));

    // Step 7: Write .env for LLM credentials
    writeFileSync(join(runDir, '.env'), [
      `LLM_PROVIDER=${process.env.LLM_PROVIDER || ''}`,
      `LLM_MODEL=${process.env.LLM_MODEL || ''}`,
      `LLM_API_KEY=${process.env.LLM_API_KEY || ''}`,
      `LLM_BASE_URL=${process.env.LLM_BASE_URL || ''}`,
    ].join('\n'));

    return taskId;
  }

  async run(taskId: string, opts: RunOptions = {}): Promise<void> {
    const task = this.store.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const runDir = join(this.minionHome, 'runs', taskId);
    const image = task.request.image || 'minion-base';

    await this.sandbox.pull(image);

    this.store.update(taskId, { status: 'running', started_at: new Date().toISOString() });
    const handle = await this.sandbox.start({
      image,
      repoPath: task.workdir,
      runDir,
      memory: '4g',
      cpus: 2,
      network: 'bridge',
    });
    this.store.update(taskId, { containerId: handle.containerId });

    const cleanup = () => { handle.stop().catch(() => {}); };
    process.on('SIGINT', cleanup);

    try {
      if (!opts.detach) {
        for await (const line of handle.logs()) {
          process.stdout.write(line);
        }
      }
      const { exitCode } = await handle.wait();
      if (exitCode === 0) {
        await this.harvest(taskId);
      } else {
        this.store.update(taskId, {
          status: 'failed',
          error: `Container exited with code ${exitCode}`,
          finished_at: new Date().toISOString(),
        });
      }
    } finally {
      process.removeListener('SIGINT', cleanup);
      await handle.stop();
    }
  }

  private async harvest(taskId: string): Promise<void> {
    const task = this.store.get(taskId)!;
    const runDir = join(this.minionHome, 'runs', taskId);
    const patchDir = join(runDir, 'patches');

    let summary = '';
    try {
      const status: SandboxStatus = JSON.parse(readFileSync(join(runDir, 'status.json'), 'utf-8'));
      summary = status.summary || '';
    } catch {}

    const patchResult = applyPatches(task.workdir, patchDir);

    if (patchResult.success) {
      if (task.request.push) {
        pushRepo(task.workdir, task.request.branch);
        cleanupRepo(task.workdir);
      }
      this.store.update(taskId, {
        status: 'done',
        result: {
          branch: task.request.branch,
          commits: patchResult.commits,
          filesChanged: 0,
          summary,
        },
        finished_at: new Date().toISOString(),
      });
    } else {
      this.store.update(taskId, {
        status: 'failed',
        error: `Patch apply failed: ${patchResult.error}`,
        finished_at: new Date().toISOString(),
      });
    }
  }

  private async analyzeProject(repoPath: string): Promise<ProjectAnalysis> {
    const { readdirSync, readFileSync: readFs } = await import('fs');
    const entries = readdirSync(repoPath, { withFileTypes: true })
      .map(e => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`)
      .join('\n');

    const keyFiles = ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'Makefile', 'pom.xml'];
    const fileContents: string[] = [];
    for (const f of keyFiles) {
      try {
        const content = readFs(join(repoPath, f), 'utf-8');
        fileContents.push(`--- ${f} ---\n${content.slice(0, 2000)}`);
      } catch {}
    }

    const prompt = `Analyze this project and return JSON with: language, framework, packageManager, buildTool, testFramework, lintCommand, testCommand, monorepo (boolean), notes.

Directory listing:
${entries}

${fileContents.join('\n\n')}

Return ONLY valid JSON, no markdown fences.`;

    let text = '';
    for await (const event of this.llm.chat(
      [{ role: 'user', content: prompt }],
      [],
    )) {
      if (event.type === 'text_delta') text += event.content;
    }
    try {
      return JSON.parse(text.trim());
    } catch {
      return { language: 'unknown' };
    }
  }
}
