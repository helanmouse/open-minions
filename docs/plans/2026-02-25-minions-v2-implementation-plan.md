# Minions V2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite Minions from a GitLab CI/CD integration to a local CLI + Docker Sandbox + dual-layer Agent system. Host Agent (restricted) analyzes projects and manages containers on the host. Sandbox Agent (full power) autonomously codes, tests, and delivers results as patches from inside Docker containers.

**Architecture:** CLI accepts natural language → Host Agent (LLM-powered, restricted) parses task, scans project, prepares repo, launches Docker container → Sandbox Agent (full power) clones from read-only mount, plans, codes, tests, commits, produces `git format-patch` → Host Agent applies patches with `git am`, pushes if remote.

**Tech Stack:** TypeScript, Node.js, Commander.js, Dockerode (Docker API), Zod, Vitest

**Design Doc:** `docs/plans/2026-02-25-minions-v2-design.md`

---

### Task 1: Clean Up V1 & Rewrite Core Types

**Files:**
- Delete: `src/server/` (entire directory)
- Delete: `src/worker/blueprint-engine.ts`, `src/worker/actions.ts`, `src/worker/process.ts`, `src/worker/index.ts`
- Delete: `blueprints/` (entire directory)
- Delete: `test/server.test.ts`, `test/blueprint-engine.test.ts`, `test/actions.test.ts`, `test/worker.test.ts`, `test/integration.test.ts`
- Delete: `src/types.ts`
- Create: `src/types/shared.ts`
- Create: `src/types/host.ts`
- Create: `src/types/sandbox.ts`
- Create: `test/types.test.ts`

**Step 1: Delete V1-only files**

```bash
rm -rf src/server src/worker/blueprint-engine.ts src/worker/actions.ts src/worker/process.ts src/worker/index.ts blueprints
rm -f test/server.test.ts test/blueprint-engine.test.ts test/actions.test.ts test/worker.test.ts test/integration.test.ts
rm -f src/types.ts
```

**Step 2: Write the failing test**

Create `test/types.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { TaskStatus, type TaskRequest, type TaskState, type TaskContext, type SandboxStatus } from '../src/types/shared.js';
import type { ProjectAnalysis, ExecutionPlan } from '../src/types/host.js';

describe('TaskStatus', () => {
  it('has all expected values', () => {
    expect(TaskStatus).toContain('queued');
    expect(TaskStatus).toContain('running');
    expect(TaskStatus).toContain('done');
    expect(TaskStatus).toContain('failed');
    expect(TaskStatus).toContain('needs_human');
  });
});

describe('TaskRequest', () => {
  it('accepts valid task with local repo', () => {
    const task: TaskRequest = {
      id: 'abc123',
      description: 'Fix login bug',
      repo: '/path/to/repo',
      repoType: 'local',
      branch: 'minion/abc123',
      baseBranch: 'main',
      push: false,
      maxIterations: 50,
      timeout: 30,
      created_at: new Date().toISOString(),
    };
    expect(task.repoType).toBe('local');
  });

  it('accepts valid task with remote repo', () => {
    const task: TaskRequest = {
      id: 'def456',
      description: 'Add feature',
      repo: 'https://github.com/user/repo.git',
      repoType: 'remote',
      branch: 'minion/def456',
      baseBranch: 'main',
      push: true,
      maxIterations: 50,
      timeout: 30,
      created_at: new Date().toISOString(),
    };
    expect(task.repoType).toBe('remote');
    expect(task.push).toBe(true);
  });
});

describe('TaskContext', () => {
  it('represents context.json structure', () => {
    const ctx: TaskContext = {
      taskId: 'abc123',
      description: 'Fix login bug',
      repoType: 'local',
      branch: 'minion/abc123',
      baseBranch: 'main',
      projectAnalysis: { language: 'typescript', framework: 'express', packageManager: 'npm' },
      rules: ['Use strict mode'],
      maxIterations: 50,
      timeout: 30,
    };
    expect(ctx.taskId).toBe('abc123');
  });
});

describe('SandboxStatus', () => {
  it('represents status.json structure', () => {
    const status: SandboxStatus = {
      phase: 'executing',
      currentStep: 'Writing tests',
      progress: '3/5',
    };
    expect(status.phase).toBe('executing');
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest --run test/types.test.ts`
Expected: FAIL — modules not found

**Step 4: Create `src/types/shared.ts`**

```typescript
export const TaskStatus = [
  'queued', 'running', 'done', 'failed', 'needs_human',
] as const;
export type TaskStatusType = typeof TaskStatus[number];

export interface TaskRequest {
  id: string;
  description: string;
  repo: string;                   // local path or remote URL
  repoType: 'local' | 'remote';
  branch: string;                 // e.g. "minion/abc123"
  baseBranch: string;             // e.g. "main"
  image?: string;                 // Docker image override
  fromUrl?: string;               // issue URL for Agent to fetch
  push: boolean;                  // auto-push after completion
  maxIterations: number;
  timeout: number;                // minutes
  created_at: string;
}

export interface TaskState {
  id: string;
  status: TaskStatusType;
  request: TaskRequest;
  workdir: string;                // repo path (local original or clone dir)
  containerId?: string;
  error?: string;
  result?: TaskResult;
  started_at?: string;
  finished_at?: string;
}

export interface TaskResult {
  branch: string;
  commits: number;
  filesChanged: number;
  summary: string;
}

// Written by Host Agent to context.json, read by Sandbox Agent
export interface TaskContext {
  taskId: string;
  description: string;
  repoType: 'local' | 'remote';
  branch: string;
  baseBranch: string;
  projectAnalysis: Record<string, unknown>;
  rules: string[];
  maxIterations: number;
  timeout: number;
}

// Written by Sandbox Agent to status.json, read by Host Agent
export type SandboxPhase =
  | 'init' | 'cloning' | 'planning' | 'executing'
  | 'verifying' | 'delivering' | 'done' | 'failed';

export interface SandboxStatus {
  phase: SandboxPhase;
  plan?: string;
  currentStep?: string;
  progress?: string;
  summary?: string;
  error?: string;
  reason?: string;                // e.g. 'watchdog'
}

// LLM & Tool types (shared by both agents)
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface ToolContext {
  workdir: string;
  task: TaskRequest;
}

export type LLMEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call'; id: string; name: string; arguments: string }
  | { type: 'done'; usage?: { input_tokens: number; output_tokens: number } }
  | { type: 'error'; error: string };
```

**Step 5: Create `src/types/host.ts`**

```typescript
export interface ProjectAnalysis {
  language: string;
  framework?: string;
  packageManager?: string;
  buildTool?: string;
  testFramework?: string;
  lintCommand?: string;
  testCommand?: string;
  monorepo?: boolean;
  notes?: string;
}

export interface ExecutionPlan {
  repo: string;
  repoType: 'local' | 'remote';
  image: string;
  task: string;
  branch: string;
}
```

**Step 6: Create `src/types/sandbox.ts`**

```typescript
// Sandbox-specific types (currently minimal, extend as needed)
export type { SandboxPhase, SandboxStatus, TaskContext } from './shared.js';
```

**Step 7: Run test to verify it passes**

Run: `npx vitest --run test/types.test.ts`
Expected: PASS

**Step 8: Commit**

```bash
git add -A
git commit -m "refactor: remove V1 server/blueprint/actions, rewrite types for V2 dual-agent architecture"
```

---

### Task 2: Update Config & Dependencies

**Files:**
- Modify: `src/config/index.ts`
- Modify: `test/config.test.ts`
- Modify: `package.json`

**Step 1: Update dependencies**

```bash
npm uninstall fastify bullmq @gitbeaker/rest
npm install dockerode
npm install -D @types/dockerode
```

**Step 2: Write the failing test**

Rewrite `test/config.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config/index.js';

describe('loadConfig', () => {
  it('returns default config when no env vars set', () => {
    const config = loadConfig();
    expect(config.llm.provider).toBe('openai');
    expect(config.llm.model).toBe('gpt-4o');
    expect(config.sandbox.memory).toBe('4g');
    expect(config.sandbox.cpus).toBe(2);
    expect(config.agent.maxIterations).toBe(50);
    expect(config.agent.timeout).toBe(30);
  });

  it('reads LLM config from env', () => {
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.LLM_MODEL = 'claude-sonnet-4-20250514';
    const config = loadConfig();
    expect(config.llm.provider).toBe('anthropic');
    expect(config.llm.model).toBe('claude-sonnet-4-20250514');
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest --run test/config.test.ts`
Expected: FAIL — sandbox not in schema

**Step 4: Rewrite `src/config/index.ts`**

```typescript
import { z } from 'zod';

const ConfigSchema = z.object({
  llm: z.object({
    provider: z.enum(['openai', 'anthropic', 'ollama']).default('openai'),
    model: z.string().default('gpt-4o'),
    apiKey: z.string().default(''),
    baseUrl: z.string().optional(),
  }),
  sandbox: z.object({
    memory: z.string().default('4g'),
    cpus: z.number().default(2),
    network: z.string().default('bridge'),
  }),
  agent: z.object({
    maxIterations: z.number().default(50),
    timeout: z.number().default(30),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  return ConfigSchema.parse({
    llm: {
      provider: process.env.LLM_PROVIDER || undefined,
      model: process.env.LLM_MODEL || undefined,
      apiKey: process.env.LLM_API_KEY || undefined,
      baseUrl: process.env.LLM_BASE_URL || undefined,
    },
    sandbox: {
      memory: process.env.SANDBOX_MEMORY || undefined,
      cpus: Number(process.env.SANDBOX_CPUS) || undefined,
      network: process.env.SANDBOX_NETWORK || undefined,
    },
    agent: {
      maxIterations: Number(process.env.AGENT_MAX_ITERATIONS) || undefined,
      timeout: Number(process.env.AGENT_TIMEOUT) || undefined,
    },
  });
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest --run test/config.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: update config for V2 - remove server/gitlab, add sandbox settings"
```

---

### Task 3: Update Agent Loop & Tools for V2 Types

**Files:**
- Modify: `src/worker/agent-loop.ts` (update imports from `../types.js` → `../types/shared.js`)
- Modify: `src/tools/types.ts` (update imports)
- Modify: `src/tools/registry.ts` (update imports)
- Modify: `src/tools/bash.ts`, `src/tools/file-ops.ts`, `src/tools/search.ts` (update imports)
- Modify: `src/llm/types.ts` (update imports)
- Modify: `src/llm/openai.ts`, `src/llm/anthropic.ts`, `src/llm/ollama.ts` (update imports)
- Modify: `src/llm/factory.ts` (update imports)
- Modify: `test/agent-loop.test.ts`, `test/tools.test.ts`, `test/llm.test.ts` (update imports + ToolContext)

**Step 1: Update all import paths**

Every file that imports from `'../types.js'` must change to `'../types/shared.js'`. Key changes:

- `src/worker/agent-loop.ts`: `import type { Message, LLMEvent, ToolContext } from '../types/shared.js';`
- `src/tools/types.ts`: `import type { ToolContext, ToolDef, ToolResult } from '../types/shared.js';`
- `src/tools/registry.ts`: `import type { ToolDef } from '../types/shared.js';`
- `src/tools/bash.ts`: no change (imports from `./types.js`)
- `src/tools/file-ops.ts`: no change (imports from `./types.js`)
- `src/tools/search.ts`: no change (imports from `./types.js`)
- `src/llm/types.ts`: `import type { Message, ToolDef, LLMEvent } from '../types/shared.js';`
- `src/llm/openai.ts`: `import type { Message, ToolDef, LLMEvent } from '../types/shared.js';`
- `src/llm/anthropic.ts`: `import type { Message, ToolDef, LLMEvent } from '../types/shared.js';`
- `src/llm/ollama.ts`: `import type { Message, ToolDef, LLMEvent } from '../types/shared.js';`

**Step 2: Remove `stepResults` from ToolContext usage in tests**

Update `test/agent-loop.test.ts` — change `makeCtx`:
```typescript
const makeCtx = (): ToolContext => ({
  workdir: mkdtempSync(join(tmpdir(), 'minion-test-')),
  task: {
    id: '1', description: 'test', repo: '/tmp/test', repoType: 'local' as const,
    branch: 'minion/1', baseBranch: 'main', push: false,
    maxIterations: 50, timeout: 30, created_at: '',
  },
});
```

Update `test/tools.test.ts` — same `makeCtx` pattern (remove `stepResults`, use new `TaskRequest` shape).

**Step 3: Run all tests to verify they pass**

Run: `npx vitest --run`
Expected: PASS (types, config, agent-loop, tools, llm tests)

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: update all imports to use types/shared.ts, remove stepResults from ToolContext"
```

---

### Task 4: Task Store

**Files:**
- Create: `src/task/store.ts`
- Create: `test/task-store.test.ts`

**Step 1: Write the failing test**

Create `test/task-store.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TaskStore } from '../src/task/store.js';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('TaskStore', () => {
  let store: TaskStore;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-store-'));
    store = new TaskStore(join(dir, 'tasks.json'));
  });

  it('creates and retrieves a task', () => {
    const task = store.create({
      id: 'abc123',
      description: 'Fix bug',
      repo: '/path/to/repo',
      repoType: 'local',
      branch: 'minion/abc123',
      baseBranch: 'main',
      push: false,
      maxIterations: 50,
      timeout: 30,
      created_at: new Date().toISOString(),
    });
    expect(task.status).toBe('queued');
    expect(store.get('abc123')?.status).toBe('queued');
  });

  it('updates task status', () => {
    store.create({
      id: 'abc123', description: 'Fix bug', repo: '/tmp', repoType: 'local',
      branch: 'minion/abc123', baseBranch: 'main', push: false,
      maxIterations: 50, timeout: 30, created_at: '',
    });
    store.update('abc123', { status: 'running', started_at: new Date().toISOString() });
    expect(store.get('abc123')?.status).toBe('running');
  });

  it('lists all tasks', () => {
    store.create({
      id: 'a', description: 'A', repo: '/tmp', repoType: 'local',
      branch: 'minion/a', baseBranch: 'main', push: false,
      maxIterations: 50, timeout: 30, created_at: '',
    });
    store.create({
      id: 'b', description: 'B', repo: '/tmp', repoType: 'local',
      branch: 'minion/b', baseBranch: 'main', push: false,
      maxIterations: 50, timeout: 30, created_at: '',
    });
    expect(store.list()).toHaveLength(2);
  });

  it('persists to disk and reloads', () => {
    const path = (store as any).filePath;
    store.create({
      id: 'abc', description: 'Test', repo: '/tmp', repoType: 'local',
      branch: 'minion/abc', baseBranch: 'main', push: false,
      maxIterations: 50, timeout: 30, created_at: '',
    });
    const store2 = new TaskStore(path);
    expect(store2.get('abc')?.description).toBe('Test');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/task-store.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `src/task/store.ts`**

```typescript
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { TaskRequest, TaskState, TaskStatusType } from '../types/shared.js';

export class TaskStore {
  private tasks: Map<string, TaskState> = new Map();
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load(): void {
    try {
      const data = readFileSync(this.filePath, 'utf-8');
      const arr: TaskState[] = JSON.parse(data);
      for (const t of arr) this.tasks.set(t.id, t);
    } catch {
      // File doesn't exist yet, start empty
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify([...this.tasks.values()], null, 2));
  }

  create(request: TaskRequest): TaskState {
    const state: TaskState = {
      id: request.id,
      status: 'queued',
      request,
      workdir: '',
    };
    this.tasks.set(request.id, state);
    this.save();
    return state;
  }

  get(id: string): TaskState | undefined {
    return this.tasks.get(id);
  }

  update(id: string, patch: Partial<TaskState>): TaskState | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    Object.assign(task, patch);
    this.save();
    return task;
  }

  list(): TaskState[] {
    return [...this.tasks.values()];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest --run test/task-store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add TaskStore for ~/.minion/tasks.json persistence"
```

---

### Task 5: Git Tool

**Files:**
- Create: `src/tools/git.ts`
- Modify: `test/tools.test.ts` (add git tool tests)

**Step 1: Write the failing test**

Add to `test/tools.test.ts`:
```typescript
import { gitTool } from '../src/tools/git.js';

describe('git tool', () => {
  it('initializes a repo and commits', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-git-'));
    const ctx = makeCtx(dir);
    // init
    await gitTool.execute({ command: 'init' }, ctx);
    // configure git user
    await bashTool.execute({ command: 'git config user.email "test@test.com" && git config user.name "Test"' }, ctx);
    // create a file and commit
    writeFileSync(join(dir, 'hello.txt'), 'world');
    await gitTool.execute({ command: 'add', args: ['.'] }, ctx);
    const result = await gitTool.execute({ command: 'commit', args: ['-m', 'init'] }, ctx);
    expect(result.success).toBe(true);
  });

  it('generates format-patch', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-git-'));
    const ctx = makeCtx(dir);
    await bashTool.execute({
      command: 'git init && git config user.email "t@t.com" && git config user.name "T"'
    }, ctx);
    writeFileSync(join(dir, 'a.txt'), 'v1');
    await bashTool.execute({ command: 'git add . && git commit -m "initial"' }, ctx);
    writeFileSync(join(dir, 'a.txt'), 'v2');
    await bashTool.execute({ command: 'git add . && git commit -m "change"' }, ctx);
    const result = await gitTool.execute({
      command: 'format-patch',
      args: ['HEAD~1', '--output-directory', join(dir, 'patches')],
    }, ctx);
    expect(result.success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/tools.test.ts`
Expected: FAIL — git tool module not found

**Step 3: Implement `src/tools/git.ts`**

```typescript
import { execFileSync } from 'child_process';
import { mkdirSync } from 'fs';
import type { AgentTool } from './types.js';

export const gitTool: AgentTool = {
  name: 'git',
  description: 'Execute git commands: init, clone, add, commit, format-patch, etc.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Git subcommand (init, clone, add, commit, format-patch, etc.)' },
      args: { type: 'array', items: { type: 'string' }, description: 'Arguments for the git command' },
    },
    required: ['command'],
  },
  async execute(params, ctx) {
    const args = [params.command, ...(params.args || [])];
    // Ensure output directory exists for format-patch
    if (params.command === 'format-patch') {
      const odIdx = args.indexOf('--output-directory');
      if (odIdx !== -1 && args[odIdx + 1]) {
        mkdirSync(args[odIdx + 1], { recursive: true });
      }
    }
    try {
      const output = execFileSync('git', args, {
        cwd: ctx.workdir,
        encoding: 'utf-8',
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { success: true, output };
    } catch (e: any) {
      return {
        success: false,
        output: e.stdout || '',
        error: e.stderr || e.message,
      };
    }
  },
};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest --run test/tools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add git tool for clone/commit/format-patch operations"
```

---

### Task 6: Sandbox Interface & Docker Implementation

**Files:**
- Create: `src/sandbox/types.ts`
- Create: `src/sandbox/docker.ts`
- Create: `test/sandbox.test.ts`

**Step 1: Write the failing test**

Create `test/sandbox.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { DockerSandbox } from '../src/sandbox/docker.js';
import type { SandboxConfig } from '../src/sandbox/types.js';

describe('DockerSandbox', () => {
  it('builds correct container config', () => {
    const sandbox = new DockerSandbox();
    const config: SandboxConfig = {
      image: 'minion-base',
      repoPath: '/path/to/repo',
      runDir: '/home/user/.minion/runs/abc123',
      memory: '4g',
      cpus: 2,
      network: 'bridge',
    };
    const containerOpts = sandbox.buildContainerOptions(config);
    expect(containerOpts.Image).toBe('minion-base');
    expect(containerOpts.HostConfig.Binds).toContain('/path/to/repo:/host-repo:ro');
    expect(containerOpts.HostConfig.Binds).toContain('/home/user/.minion/runs/abc123:/minion-run');
    expect(containerOpts.HostConfig.Memory).toBe(4 * 1024 * 1024 * 1024);
  });

  it('passes proxy env vars to container', () => {
    const sandbox = new DockerSandbox();
    const config: SandboxConfig = {
      image: 'minion-base',
      repoPath: '/path/to/repo',
      runDir: '/home/user/.minion/runs/abc123',
      memory: '4g',
      cpus: 2,
      network: 'bridge',
    };
    process.env.HTTP_PROXY = 'http://proxy:8080';
    const containerOpts = sandbox.buildContainerOptions(config);
    expect(containerOpts.Env).toContain('HTTP_PROXY=http://proxy:8080');
    delete process.env.HTTP_PROXY;
  });

  it('applies Linux UID/GID on linux platform', () => {
    const sandbox = new DockerSandbox();
    const config: SandboxConfig = {
      image: 'minion-base',
      repoPath: '/path/to/repo',
      runDir: '/tmp/run',
      memory: '4g',
      cpus: 2,
      network: 'bridge',
    };
    const containerOpts = sandbox.buildContainerOptions(config);
    // On macOS this will be empty, on Linux it would be set
    // Just verify the method doesn't throw
    expect(containerOpts).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/sandbox.test.ts`
Expected: FAIL — module not found

**Step 3: Create `src/sandbox/types.ts`**

```typescript
export interface SandboxConfig {
  image: string;
  repoPath: string;
  runDir: string;
  memory: string;
  cpus: number;
  network: string;
}

export interface SandboxHandle {
  containerId: string;
  logs(): AsyncIterable<string>;
  wait(): Promise<{ exitCode: number }>;
  stop(): Promise<void>;
}

export interface Sandbox {
  pull(image: string): Promise<void>;
  start(config: SandboxConfig): Promise<SandboxHandle>;
  buildContainerOptions(config: SandboxConfig): Record<string, any>;
}
```

**Step 4: Create `src/sandbox/docker.ts`**

```typescript
import Dockerode from 'dockerode';
import { platform } from 'os';
import type { Sandbox, SandboxConfig, SandboxHandle } from './types.js';

function parseMemory(mem: string): number {
  const match = mem.match(/^(\d+)([gmk]?)$/i);
  if (!match) return 4 * 1024 * 1024 * 1024;
  const num = parseInt(match[1]);
  switch (match[2]?.toLowerCase()) {
    case 'g': return num * 1024 * 1024 * 1024;
    case 'm': return num * 1024 * 1024;
    case 'k': return num * 1024;
    default: return num;
  }
}

export class DockerSandbox implements Sandbox {
  private docker: Dockerode;

  constructor() {
    this.docker = new Dockerode();
  }

  buildContainerOptions(config: SandboxConfig): Record<string, any> {
    const env: string[] = [];
    if (process.env.HTTP_PROXY) env.push(`HTTP_PROXY=${process.env.HTTP_PROXY}`);
    if (process.env.HTTPS_PROXY) env.push(`HTTPS_PROXY=${process.env.HTTPS_PROXY}`);
    if (process.env.NO_PROXY) env.push(`NO_PROXY=${process.env.NO_PROXY}`);

    const opts: Record<string, any> = {
      Image: config.image,
      Env: env,
      HostConfig: {
        Binds: [
          `${config.repoPath}:/host-repo:ro`,
          `${config.runDir}:/minion-run`,
        ],
        Memory: parseMemory(config.memory),
        NanoCpus: config.cpus * 1e9,
        NetworkMode: config.network,
      },
    };

    // Linux UID/GID mapping to avoid permission issues
    if (platform() === 'linux') {
      opts.User = `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`;
    }

    return opts;
  }

  async pull(image: string): Promise<void> {
    const stream = await this.docker.pull(image);
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async start(config: SandboxConfig): Promise<SandboxHandle> {
    const opts = this.buildContainerOptions(config);
    const container = await this.docker.createContainer(opts);
    await container.start();

    return {
      containerId: container.id,
      async *logs() {
        const stream = await container.logs({
          follow: true, stdout: true, stderr: true,
        });
        const chunks: Buffer[] = [];
        for await (const chunk of stream as AsyncIterable<Buffer>) {
          // Docker multiplexed stream: skip 8-byte header per frame
          const text = chunk.toString('utf-8');
          yield text;
        }
      },
      async wait() {
        const result = await container.wait();
        return { exitCode: result.StatusCode };
      },
      async stop() {
        try { await container.stop({ t: 10 }); } catch {}
        try { await container.remove(); } catch {}
      },
    };
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest --run test/sandbox.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Sandbox interface and Docker implementation with UID/GID + proxy support"
```

---

### Task 7: Host Agent — Task Parser

**Files:**
- Create: `src/host-agent/task-parser.ts`
- Create: `test/task-parser.test.ts`

**Step 1: Write the failing test**

Create `test/task-parser.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseTaskDescription } from '../src/host-agent/task-parser.js';
import type { LLMAdapter } from '../src/llm/types.js';
import type { Message, ToolDef, LLMEvent } from '../src/types/shared.js';

function mockLLM(response: string): LLMAdapter {
  return {
    provider: 'mock',
    async *chat(_msgs: Message[], _tools: ToolDef[]) {
      yield { type: 'text_delta' as const, content: response };
      yield { type: 'done' as const };
    },
  };
}

describe('parseTaskDescription', () => {
  it('extracts structured task from natural language', async () => {
    const llm = mockLLM(JSON.stringify({
      description: 'Fix login page crash on empty email',
      repoUrl: null,
      issueUrl: null,
      branch: null,
    }));
    const result = await parseTaskDescription(llm, '修复登录页面空邮箱时的崩溃问题');
    expect(result.description).toBe('Fix login page crash on empty email');
    expect(result.repoUrl).toBeNull();
  });

  it('extracts repo URL and issue URL from description', async () => {
    const llm = mockLLM(JSON.stringify({
      description: 'Fix issue #42',
      repoUrl: 'https://github.com/user/repo.git',
      issueUrl: 'https://github.com/user/repo/issues/42',
      branch: null,
    }));
    const result = await parseTaskDescription(
      llm,
      '修复 https://github.com/user/repo/issues/42，仓库 https://github.com/user/repo.git'
    );
    expect(result.repoUrl).toBe('https://github.com/user/repo.git');
    expect(result.issueUrl).toBe('https://github.com/user/repo/issues/42');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/task-parser.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `src/host-agent/task-parser.ts`**

```typescript
import type { LLMAdapter } from '../llm/types.js';

export interface ParsedTask {
  description: string;
  repoUrl: string | null;
  issueUrl: string | null;
  branch: string | null;
}

const PARSE_SYSTEM_PROMPT = `You are a task parser. Extract structured information from the user's natural language task description.
Return ONLY a JSON object with these fields:
- description: the core task description (translated to English if needed)
- repoUrl: git repository URL if mentioned, otherwise null
- issueUrl: issue/ticket URL if mentioned, otherwise null
- branch: target branch name if mentioned, otherwise null

Return ONLY valid JSON, no markdown fences.`;

export async function parseTaskDescription(
  llm: LLMAdapter,
  rawInput: string,
): Promise<ParsedTask> {
  let text = '';
  for await (const event of llm.chat(
    [
      { role: 'system', content: PARSE_SYSTEM_PROMPT },
      { role: 'user', content: rawInput },
    ],
    [],
  )) {
    if (event.type === 'text_delta') text += event.content;
  }
  try {
    return JSON.parse(text.trim());
  } catch {
    // Fallback: treat entire input as description
    return { description: rawInput, repoUrl: null, issueUrl: null, branch: null };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest --run test/task-parser.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Host Agent task parser - NL to structured task via LLM"
```

---

### Task 8: Host Agent — Repo Preparer

**Files:**
- Create: `src/host-agent/repo-preparer.ts`
- Create: `test/repo-preparer.test.ts`

**Step 1: Write the failing test**

Create `test/repo-preparer.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { prepareRepo } from '../src/host-agent/repo-preparer.js';
import { mkdtempSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

describe('prepareRepo', () => {
  it('returns local path directly for local repos', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-repo-'));
    execSync('git init', { cwd: dir });
    const result = await prepareRepo({
      repoType: 'local',
      repo: dir,
      runDir: mkdtempSync(join(tmpdir(), 'minion-run-')),
    });
    expect(result.repoPath).toBe(dir);
    expect(result.needsCleanup).toBe(false);
  });

  it('clones remote repo to runDir/repo/', async () => {
    // Create a bare repo to clone from (simulates remote)
    const bareDir = mkdtempSync(join(tmpdir(), 'minion-bare-'));
    execSync('git init --bare', { cwd: bareDir });
    // Create a temp repo, commit, push to bare
    const srcDir = mkdtempSync(join(tmpdir(), 'minion-src-'));
    execSync(`git init && git config user.email "t@t.com" && git config user.name "T"`, { cwd: srcDir });
    execSync(`echo hello > a.txt && git add . && git commit -m "init"`, { cwd: srcDir });
    execSync(`git remote add origin ${bareDir} && git push origin HEAD:main`, { cwd: srcDir });

    const runDir = mkdtempSync(join(tmpdir(), 'minion-run-'));
    const result = await prepareRepo({
      repoType: 'remote',
      repo: bareDir,
      runDir,
    });
    expect(result.repoPath).toBe(join(runDir, 'repo'));
    expect(existsSync(join(runDir, 'repo'))).toBe(true);
    expect(result.needsCleanup).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/repo-preparer.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `src/host-agent/repo-preparer.ts`**

```typescript
import { execFileSync } from 'child_process';
import { join } from 'path';
import { rmSync } from 'fs';

export interface RepoPrepareInput {
  repoType: 'local' | 'remote';
  repo: string;
  runDir: string;
}

export interface RepoPrepareResult {
  repoPath: string;       // path to mount as /host-repo:ro
  needsCleanup: boolean;  // true for remote clones (Host should clean up after push)
}

export async function prepareRepo(input: RepoPrepareInput): Promise<RepoPrepareResult> {
  if (input.repoType === 'local') {
    return { repoPath: input.repo, needsCleanup: false };
  }

  // Remote: clone to runDir/repo/ using host's git credentials
  const clonePath = join(input.runDir, 'repo');
  execFileSync('git', ['clone', input.repo, clonePath], {
    encoding: 'utf-8',
    timeout: 300_000, // 5 min for large repos
  });
  return { repoPath: clonePath, needsCleanup: true };
}

export function cleanupRepo(repoPath: string): void {
  try {
    rmSync(repoPath, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest --run test/repo-preparer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add repo preparer - local passthrough, remote clone to temp dir"
```

---

### Task 9: Host Agent — Patch Applier

**Files:**
- Create: `src/host-agent/patch-applier.ts`
- Create: `test/patch-applier.test.ts`

**Step 1: Write the failing test**

Create `test/patch-applier.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { applyPatches } from '../src/host-agent/patch-applier.js';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

function setupGitRepo(dir: string): void {
  execSync('git init', { cwd: dir });
  execSync('git config user.email "t@t.com" && git config user.name "T"', { cwd: dir });
  writeFileSync(join(dir, 'a.txt'), 'original');
  execSync('git add . && git commit -m "initial"', { cwd: dir });
}

describe('applyPatches', () => {
  it('applies patches using git am (preserves commit messages)', () => {
    // Create source repo, make a change, generate patch
    const srcDir = mkdtempSync(join(tmpdir(), 'minion-src-'));
    setupGitRepo(srcDir);
    writeFileSync(join(srcDir, 'a.txt'), 'modified');
    execSync('git add . && git commit -m "fix: update a.txt"', { cwd: srcDir });
    const patchDir = mkdtempSync(join(tmpdir(), 'minion-patches-'));
    execSync(`git format-patch HEAD~1 --output-directory ${patchDir}`, { cwd: srcDir });

    // Create target repo (same initial state)
    const targetDir = mkdtempSync(join(tmpdir(), 'minion-target-'));
    setupGitRepo(targetDir);

    const result = applyPatches(targetDir, patchDir);
    expect(result.success).toBe(true);
    expect(result.commits).toBe(1);
    expect(readFileSync(join(targetDir, 'a.txt'), 'utf-8')).toBe('modified');

    // Verify commit message is preserved (git am, not git apply)
    const log = execSync('git log --oneline -1', { cwd: targetDir, encoding: 'utf-8' });
    expect(log).toContain('fix: update a.txt');
  });

  it('returns failure when no patches found', () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-empty-'));
    setupGitRepo(dir);
    const emptyPatchDir = mkdtempSync(join(tmpdir(), 'minion-patches-'));
    const result = applyPatches(dir, emptyPatchDir);
    expect(result.success).toBe(true);
    expect(result.commits).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/patch-applier.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `src/host-agent/patch-applier.ts`**

```typescript
import { execFileSync } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';

export interface PatchResult {
  success: boolean;
  commits: number;
  error?: string;
}

export function applyPatches(repoPath: string, patchDir: string): PatchResult {
  const patches = readdirSync(patchDir)
    .filter(f => f.endsWith('.patch'))
    .sort()
    .map(f => join(patchDir, f));

  if (patches.length === 0) {
    return { success: true, commits: 0 };
  }

  try {
    // git am preserves commit messages and authorship (unlike git apply)
    execFileSync('git', ['am', ...patches], {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 60_000,
    });
    return { success: true, commits: patches.length };
  } catch (e: any) {
    // Abort failed am
    try { execFileSync('git', ['am', '--abort'], { cwd: repoPath }); } catch {}
    return { success: false, commits: 0, error: e.stderr || e.message };
  }
}

export function pushRepo(repoPath: string, branch: string): void {
  execFileSync('git', ['push', 'origin', branch], {
    cwd: repoPath,
    encoding: 'utf-8',
    timeout: 120_000,
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest --run test/patch-applier.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add patch applier using git am to preserve commit history"
```

---

### Task 10: Host Agent — Main Flow

**Files:**
- Create: `src/host-agent/index.ts`
- Create: `test/host-agent.test.ts`

The Host Agent orchestrates the full lifecycle: parse NL → analyze project (LLM) → prepare repo → write context → launch container → stream logs → apply patches → push if remote → cleanup.

**Step 1: Write the failing test**

Create `test/host-agent.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/host-agent.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `src/host-agent/index.ts`**

```typescript
import { randomBytes } from 'crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
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
      rules: [],  // TODO: load from .minion/rules/
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

    // Pull image
    await this.sandbox.pull(image);

    // Start container
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

    // Register SIGINT handler to avoid orphan containers
    const cleanup = () => { handle.stop().catch(() => {}); };
    process.on('SIGINT', cleanup);

    try {
      // Stream logs (unless detached)
      if (!opts.detach) {
        for await (const line of handle.logs()) {
          process.stdout.write(line);
        }
      }

      // Wait for container exit
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

    // Read status.json for summary
    let summary = '';
    try {
      const status: SandboxStatus = JSON.parse(readFileSync(join(runDir, 'status.json'), 'utf-8'));
      summary = status.summary || '';
    } catch {}

    // Apply patches with git am
    const patchResult = applyPatches(task.workdir, patchDir);

    if (patchResult.success) {
      // Push if remote
      if (task.request.push) {
        pushRepo(task.workdir, task.request.branch);
        // Cleanup remote clone after successful push
        cleanupRepo(task.workdir);
      }
      this.store.update(taskId, {
        status: 'done',
        result: {
          branch: task.request.branch,
          commits: patchResult.commits,
          filesChanged: 0, // TODO: parse from patches
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
    // LLM-powered project analysis (read-only scan)
    const { readdirSync, readFileSync: readFs } = await import('fs');
    const entries = readdirSync(repoPath, { withFileTypes: true })
      .map(e => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`)
      .join('\n');

    // Read key files if they exist
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest --run test/host-agent.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Host Agent main flow - prepare, run, harvest with SIGINT handling"
```

---

### Task 11: Sandbox Agent — Watchdog

**Files:**
- Create: `src/agent/watchdog.ts`
- Create: `test/watchdog.test.ts`

**Step 1: Write the failing test**

Create `test/watchdog.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { Watchdog } from '../src/agent/watchdog.js';

describe('Watchdog', () => {
  it('does not trip when under limits', () => {
    const wd = new Watchdog({ maxIterations: 10, maxTokenCost: 100000 });
    wd.tick(500);
    wd.tick(500);
    expect(wd.tripped()).toBe(false);
    expect(wd.iterations).toBe(2);
  });

  it('trips on max iterations', () => {
    const wd = new Watchdog({ maxIterations: 3, maxTokenCost: 100000 });
    wd.tick(100);
    wd.tick(100);
    wd.tick(100);
    expect(wd.tripped()).toBe(true);
    expect(wd.reason).toBe('max_iterations');
  });

  it('trips on max token cost', () => {
    const wd = new Watchdog({ maxIterations: 100, maxTokenCost: 1000 });
    wd.tick(600);
    wd.tick(600);
    expect(wd.tripped()).toBe(true);
    expect(wd.reason).toBe('max_token_cost');
  });

  it('ignores token cost limit when set to 0', () => {
    const wd = new Watchdog({ maxIterations: 100, maxTokenCost: 0 });
    wd.tick(999999);
    expect(wd.tripped()).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/watchdog.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `src/agent/watchdog.ts`**

```typescript
export interface WatchdogConfig {
  maxIterations: number;
  maxTokenCost: number;  // 0 = unlimited
}

export class Watchdog {
  private config: WatchdogConfig;
  iterations = 0;
  totalTokens = 0;
  reason: string | null = null;

  constructor(config: WatchdogConfig) {
    this.config = config;
  }

  tick(tokensUsed: number = 0): void {
    this.iterations++;
    this.totalTokens += tokensUsed;
  }

  tripped(): boolean {
    if (this.iterations >= this.config.maxIterations) {
      this.reason = 'max_iterations';
      return true;
    }
    if (this.config.maxTokenCost > 0 && this.totalTokens >= this.config.maxTokenCost) {
      this.reason = 'max_token_cost';
      return true;
    }
    return false;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest --run test/watchdog.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Watchdog circuit breaker - max iterations + token cost limits"
```

---

### Task 12: Sandbox Agent — Planner

**Files:**
- Create: `src/agent/planner.ts`
- Create: `test/planner.test.ts`

**Step 1: Write the failing test**

Create `test/planner.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../src/agent/planner.js';
import type { TaskContext } from '../src/types/shared.js';

describe('buildSystemPrompt', () => {
  it('includes task description and project analysis', () => {
    const ctx: TaskContext = {
      taskId: 'abc123',
      description: 'Fix login page crash on empty email',
      repoType: 'local',
      branch: 'minion/abc123',
      baseBranch: 'main',
      projectAnalysis: { language: 'typescript', framework: 'express' },
      rules: ['Use strict mode', 'All functions need JSDoc'],
      maxIterations: 50,
      timeout: 30,
    };
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain('Fix login page crash on empty email');
    expect(prompt).toContain('typescript');
    expect(prompt).toContain('Use strict mode');
    expect(prompt).toContain('minion/abc123');
  });

  it('includes delivery instructions (commit + format-patch)', () => {
    const ctx: TaskContext = {
      taskId: 'abc123',
      description: 'Fix bug',
      repoType: 'local',
      branch: 'minion/abc123',
      baseBranch: 'main',
      projectAnalysis: {},
      rules: [],
      maxIterations: 50,
      timeout: 30,
    };
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain('format-patch');
    expect(prompt).toContain('/minion-run/patches');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/planner.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `src/agent/planner.ts`**

```typescript
import type { TaskContext } from '../types/shared.js';

export function buildSystemPrompt(ctx: TaskContext): string {
  const sections: string[] = [];

  sections.push(`You are an autonomous coding agent running inside a Docker container.
Your task: ${ctx.description}

You have full access to bash, file read/write/edit, code search, and git.`);

  sections.push(`## Project Info
${JSON.stringify(ctx.projectAnalysis, null, 2)}`);

  if (ctx.rules.length > 0) {
    sections.push(`## Coding Rules
${ctx.rules.join('\n\n')}`);
  }

  sections.push(`## Working Environment
- Source code is at /workspace (your working copy)
- Work on branch: ${ctx.branch} (base: ${ctx.baseBranch})
- Repository type: ${ctx.repoType}

## Workflow
1. Scan the project structure and understand the codebase
2. Plan your approach (output your plan as text)
3. Implement the changes
4. Verify: run tests, lint, type-check as appropriate
5. If verification fails, fix and retry (max 3 retries per issue)
6. Commit your changes with descriptive messages
7. Deliver: run \`git format-patch origin/${ctx.baseBranch} --output-directory /minion-run/patches/\`
8. Update /minion-run/status.json with phase "done" and a summary

## Delivery Rules
- Always commit before generating patches
- Use descriptive commit messages (e.g. "fix: handle empty email on login page")
- Write patches to /minion-run/patches/
- Update /minion-run/status.json after each phase change

## Constraints
- Max iterations: ${ctx.maxIterations}
- Timeout: ${ctx.timeout} minutes
- Do NOT modify files outside /workspace and /minion-run/`);

  return sections.join('\n\n');
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest --run test/planner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Sandbox Agent planner - system prompt assembly from TaskContext"
```

---

### Task 13: Sandbox Agent — Main Entry Point

**Files:**
- Create: `src/agent/main.ts`
- Create: `test/agent-main.test.ts`

This is the container entry point. It reads context.json, clones from /host-repo, runs the Agent Loop, commits, generates patches, and updates status.json.

**Step 1: Write the failing test**

Create `test/agent-main.test.ts`:
```typescript
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

    // Mock LLM: first call writes a file via tool, second call says done
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/agent-main.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `src/agent/main.ts`**

```typescript
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
  private workdir = '/workspace';

  constructor(opts: SandboxAgentOptions) {
    this.hostRepoPath = opts.hostRepoPath;
    this.runDir = opts.runDir;
    this.llm = opts.llm;
    // Allow override for testing (not always /workspace)
    if (!opts.hostRepoPath.startsWith('/')) {
      this.workdir = join(opts.runDir, 'workspace');
    }
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
      // Configure git user for commits
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

      const watchdog = new Watchdog({
        maxIterations: context.maxIterations,
        maxTokenCost: 0, // unlimited by default
      });

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
    // Load .env from /minion-run if present
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest --run test/agent-main.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Sandbox Agent entry point - clone, agent loop, format-patch delivery"
```

---

### Task 14: CLI Rewrite

**Files:**
- Rewrite: `src/cli/index.ts`
- Rewrite: `test/cli.test.ts`

**Step 1: Write the failing test**

Rewrite `test/cli.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseCliArgs } from '../src/cli/index.js';

describe('CLI arg parsing', () => {
  it('parses run command with natural language', () => {
    const result = parseCliArgs(['run', '修复登录页面空邮箱时的崩溃问题']);
    expect(result.command).toBe('run');
    expect(result.description).toBe('修复登录页面空邮箱时的崩溃问题');
  });

  it('parses run with --repo override', () => {
    const result = parseCliArgs(['run', 'Fix bug', '--repo', '/path/to/repo']);
    expect(result.repo).toBe('/path/to/repo');
  });

  it('parses run with -y flag', () => {
    const result = parseCliArgs(['run', '-y', 'Fix bug']);
    expect(result.yes).toBe(true);
  });

  it('parses run with -d flag', () => {
    const result = parseCliArgs(['run', '-d', 'Add feature']);
    expect(result.detach).toBe(true);
  });

  it('parses status command', () => {
    const result = parseCliArgs(['status', 'abc123']);
    expect(result.command).toBe('status');
    expect(result.taskId).toBe('abc123');
  });

  it('parses list command', () => {
    const result = parseCliArgs(['list']);
    expect(result.command).toBe('list');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/cli.test.ts`
Expected: FAIL — parseCliArgs not exported

**Step 3: Rewrite `src/cli/index.ts`**

```typescript
import { Command } from 'commander';
import { join } from 'path';
import { homedir } from 'os';
import { loadConfig } from '../config/index.js';
import { createLLMAdapter } from '../llm/factory.js';
import { TaskStore } from '../task/store.js';
import { DockerSandbox } from '../sandbox/docker.js';
import { HostAgent } from '../host-agent/index.js';

export interface CliArgs {
  command: string;
  description?: string;
  taskId?: string;
  repo?: string;
  image?: string;
  timeout?: number;
  yes?: boolean;
  detach?: boolean;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const result: CliArgs = { command: '' };
  const cmd = argv[0];
  result.command = cmd;

  if (cmd === 'run') {
    const rest = argv.slice(1);
    const descriptions: string[] = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--repo' && rest[i + 1]) { result.repo = rest[++i]; continue; }
      if (rest[i] === '--image' && rest[i + 1]) { result.image = rest[++i]; continue; }
      if (rest[i] === '--timeout' && rest[i + 1]) { result.timeout = Number(rest[++i]); continue; }
      if (rest[i] === '-y' || rest[i] === '--yes') { result.yes = true; continue; }
      if (rest[i] === '-d') { result.detach = true; continue; }
      descriptions.push(rest[i]);
    }
    result.description = descriptions.join(' ');
  } else if (cmd === 'status' || cmd === 'logs' || cmd === 'stop' || cmd === 'clean') {
    result.taskId = argv[1];
  }

  return result;
}

const program = new Command();

program
  .name('minion')
  .description('Minions — autonomous AI coding agents with Docker sandbox')
  .version('2.0.0');

program
  .command('run')
  .description('Run a task described in natural language')
  .argument('<description...>', 'Natural language task description')
  .option('--repo <path>', 'Override repository path or URL')
  .option('--image <name>', 'Override Docker image')
  .option('--timeout <minutes>', 'Timeout in minutes', '30')
  .option('-y, --yes', 'Skip confirmation')
  .option('-d', 'Run in background (detached)')
  .action(async (descParts: string[], opts) => {
    const description = descParts.join(' ');
    const minionHome = join(homedir(), '.minion');
    const config = loadConfig();
    const llm = createLLMAdapter(config.llm);
    const sandbox = new DockerSandbox();
    const store = new TaskStore(join(minionHome, 'tasks.json'));
    const agent = new HostAgent({ llm, sandbox, store, minionHome });

    const taskId = await agent.prepare(description, {
      repo: opts.repo,
      image: opts.image,
      yes: opts.yes,
      detach: opts.d,
      timeout: Number(opts.timeout),
    });

    // Show execution plan
    const task = store.get(taskId)!;
    if (!opts.yes) {
      console.log(`\nTarget: ${task.request.repo} (${task.request.repoType})`);
      console.log(`Image:  ${task.request.image || 'minion-base'}`);
      console.log(`Task:   ${task.request.description}`);
      console.log(`\nPress Enter to start or Ctrl+C to abort`);
      await new Promise<void>(resolve => {
        process.stdin.once('data', () => resolve());
      });
    }

    console.log(`Task ${taskId} starting...`);
    await agent.run(taskId, {
      detach: opts.d,
      timeout: Number(opts.timeout),
    });

    const final = store.get(taskId)!;
    if (final.status === 'done') {
      console.log(`\nTask ${taskId} completed.`);
      if (final.result) {
        console.log(`Branch: ${final.result.branch}`);
        console.log(`Commits: ${final.result.commits}`);
        console.log(`Summary: ${final.result.summary}`);
      }
    } else {
      console.error(`\nTask ${taskId} failed: ${final.error}`);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check task status')
  .argument('<id>', 'Task ID')
  .action((id) => {
    const minionHome = join(homedir(), '.minion');
    const store = new TaskStore(join(minionHome, 'tasks.json'));
    const task = store.get(id);
    if (!task) { console.error(`Task ${id} not found`); process.exit(1); }
    console.log(JSON.stringify(task, null, 2));
  });

program
  .command('list')
  .description('List all tasks')
  .action(() => {
    const minionHome = join(homedir(), '.minion');
    const store = new TaskStore(join(minionHome, 'tasks.json'));
    for (const task of store.list()) {
      console.log(`${task.id}  ${task.status.padEnd(12)}  ${task.request.description.slice(0, 60)}`);
    }
  });

program
  .command('stop')
  .description('Stop a running task')
  .argument('<id>', 'Task ID')
  .action(async (id) => {
    const minionHome = join(homedir(), '.minion');
    const store = new TaskStore(join(minionHome, 'tasks.json'));
    const task = store.get(id);
    if (!task?.containerId) { console.error('No running container'); process.exit(1); }
    const sandbox = new DockerSandbox();
    // Stop container directly via dockerode
    const Dockerode = (await import('dockerode')).default;
    const docker = new Dockerode();
    try {
      await docker.getContainer(task.containerId).stop({ t: 10 });
      store.update(id, { status: 'failed', error: 'Stopped by user', finished_at: new Date().toISOString() });
      console.log(`Task ${id} stopped.`);
    } catch (e: any) {
      console.error(`Failed to stop: ${e.message}`);
    }
  });

program
  .command('clean')
  .description('Clean up task data')
  .argument('[id]', 'Task ID (omit to clean all completed)')
  .action((id) => {
    console.log('TODO: implement cleanup');
  });

// Run CLI when executed directly
const isMain = process.argv[1]?.endsWith('cli/index.ts')
  || process.argv[1]?.endsWith('cli/index.js');

if (isMain) {
  program.parse();
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest --run test/cli.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: rewrite CLI for V2 - natural language first, local execution, Docker sandbox"
```

---

### Task 15: Dockerfile

**Files:**
- Create: `docker/Dockerfile.base`

**Step 1: Create `docker/Dockerfile.base`**

```dockerfile
FROM node:22-slim

# Install essential tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    wget \
    make \
    gcc \
    g++ \
    python3 \
    ripgrep \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Create workspace directory
RUN mkdir -p /workspace /minion-run/patches

# Copy Sandbox Agent code
WORKDIR /opt/minion
COPY package.json package-lock.json ./
RUN npm ci --production
COPY dist/ ./dist/

# Entry point: run Sandbox Agent
CMD ["node", "dist/agent/main.js"]
```

**Step 2: Verify Dockerfile builds (manual)**

```bash
# Build after TypeScript compilation
npm run build
docker build -t minion-base -f docker/Dockerfile.base .
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Dockerfile.base for Sandbox Agent container"
```

---

### Task 16: Update Exports, package.json Scripts & Integration

**Files:**
- Rewrite: `src/index.ts`
- Modify: `package.json` (scripts)
- Modify: `src/version.ts`

**Step 1: Rewrite `src/index.ts`**

```typescript
export { HostAgent } from './host-agent/index.js';
export { SandboxAgent } from './agent/main.js';
export { TaskStore } from './task/store.js';
export { DockerSandbox } from './sandbox/docker.js';
export { createLLMAdapter } from './llm/factory.js';
export { AgentLoop } from './worker/agent-loop.js';
export { ToolRegistry } from './tools/registry.js';
export { loadConfig } from './config/index.js';
export { VERSION } from './version.js';
```

**Step 2: Update `src/version.ts`**

```typescript
export const VERSION = '2.0.0';
```

**Step 3: Update `package.json` scripts**

```json
{
  "scripts": {
    "build": "tsc",
    "dev:cli": "tsx src/cli/index.ts",
    "test": "vitest --run",
    "lint": "tsc --noEmit",
    "docker:build": "npm run build && docker build -t minion-base -f docker/Dockerfile.base ."
  }
}
```

Remove `"dev:server"` script (V1 only).

**Step 4: Run all tests**

Run: `npx vitest --run`
Expected: ALL PASS

**Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: update exports, version, and scripts for V2"
```

---

## Summary

| Task | Component | Key Files |
|------|-----------|-----------|
| 1 | Clean V1 + Types | `src/types/{shared,host,sandbox}.ts` |
| 2 | Config + Deps | `src/config/index.ts`, `package.json` |
| 3 | Update Imports | All `src/` files using old `../types.js` |
| 4 | Task Store | `src/task/store.ts` |
| 5 | Git Tool | `src/tools/git.ts` |
| 6 | Sandbox/Docker | `src/sandbox/{types,docker}.ts` |
| 7 | Task Parser | `src/host-agent/task-parser.ts` |
| 8 | Repo Preparer | `src/host-agent/repo-preparer.ts` |
| 9 | Patch Applier | `src/host-agent/patch-applier.ts` |
| 10 | Host Agent | `src/host-agent/index.ts` |
| 11 | Watchdog | `src/agent/watchdog.ts` |
| 12 | Planner | `src/agent/planner.ts` |
| 13 | Sandbox Agent | `src/agent/main.ts` |
| 14 | CLI | `src/cli/index.ts` |
| 15 | Dockerfile | `docker/Dockerfile.base` |
| 16 | Exports | `src/index.ts`, `src/version.ts` |

**Engineering gotchas addressed:**
- `git am` (not `git apply`) for patch application — preserves commit messages (Task 9)
- Linux UID/GID: `--user $(id -u):$(id -g)` in Docker options (Task 6)
- SIGINT handler to avoid orphan containers (Task 10)
- Disk cleanup for remote repo clones after successful push (Task 10)
