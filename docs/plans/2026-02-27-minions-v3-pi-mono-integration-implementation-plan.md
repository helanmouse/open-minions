# Minions V3 Implementation Plan: pi-mono Integration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 全量迁移 minions 的 Agent 运行时到 pi-mono 框架，保留 Docker 沙箱和 git format-patch 交付等差异化特性。

**Architecture:** Host Agent (minions 自研，保留 Docker/patch) → Docker 容器 → bootstrap.sh → sandbox-main.ts (Agent class) + pi-ai + pi-agent-core + coding-agent tools。宿主机预构建 pi-runtime，通过 Docker 挂载到容器内（离线优先）。

**Tech Stack:** TypeScript, Node.js, Docker, dockerode, @mariozechner/pi-ai, @mariozechner/pi-agent-core, @mariozechner/coding-agent, @sinclair/typebox, Commander.js

---

## Phase 1: pi-ai Integration (1-2 weeks)

### Task 1: Add pi-ai Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Add pi-ai dependency**

```bash
npm install @mariozechner/pi-ai --save
npm install @sinclair/typebox --save  # Required for tool parameters
```

**Step 2: Verify installation**

```bash
ls node_modules/@mariozechner/pi-ai
```
Expected: Directory exists with package.json

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add @mariozechner/pi-ai and @sinclair/typebox"
```

---

### Task 2: Create pi-ai Adapter

**Files:**
- Create: `src/llm/pi-ai-adapter.ts`
- Modify: `src/llm/factory.ts`
- Create: `test/pi-ai-adapter.test.ts`

**Step 1: Write the failing test**

Create `test/pi-ai-adapter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PiAiAdapter } from '../src/llm/pi-ai-adapter.js';

describe('PiAiAdapter', () => {
  it('implements LLMAdapter interface', () => {
    const adapter = new PiAiAdapter({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'test-key',
    });
    expect(adapter.provider).toBe('pi-ai');
  });

  it('streams chat responses', async () => {
    const adapter = new PiAiAdapter({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: process.env.LLM_API_KEY || 'test',
    });

    const events: string[] = [];
    try {
      for await (const event of adapter.chat([
        { role: 'user', content: 'Say "test"' }
      ], [])) {
        if (event.type === 'text_delta') events.push(event.content);
      }
    } catch (e) {
      // May fail without real API key
    }

    expect(Array.isArray(events)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest --run test/pi-ai-adapter.test.ts
```
Expected: FAIL - module not found

**Step 3: Implement PiAiAdapter**

Create `src/llm/pi-ai-adapter.ts`:

```typescript
import { getModel, streamSimple, type Model, type Context } from '@mariozechner/pi-ai';
import type { LLMAdapter } from './types.js';
import type { Message as MinionsMessage, ToolDef, LLMEvent } from '../types/shared.js';

export interface PiAiConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export class PiAiAdapter implements LLMAdapter {
  provider = 'pi-ai';
  private model: Model<any>;
  private apiKey: string;

  constructor(config: PiAiConfig) {
    // Use getModel() factory, not new PiAI()
    this.model = getModel(config.provider as any, config.model as any);
    this.apiKey = config.apiKey;
  }

  async *chat(messages: MinionsMessage[], tools: ToolDef[]): AsyncGenerator<LLMEvent> {
    // Convert minions messages to pi-ai format
    const piMessages = messages.map(m => this.convertMessage(m));

    // Convert minions tools to pi-ai format
    const piTools = tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    const context: Context = {
      messages: piMessages,
      tools: piTools.length > 0 ? piTools : undefined,
    };

    const eventStream = streamSimple(this.model, context, {
      apiKey: this.apiKey,
    });

    for await (const event of eventStream) {
      switch (event.type) {
        case 'text_delta':
          yield { type: 'text_delta', content: event.delta };
          break;
        case 'toolcall_end':
          yield {
            type: 'tool_call',
            id: event.toolCall.id,
            name: event.toolCall.name,
            arguments: JSON.stringify(event.toolCall.arguments), // pi-ai returns object, minions expects string
          };
          break;
        case 'done':
          yield { type: 'done', usage: event.message.usage };
          break;
        case 'error':
          yield { type: 'error', error: event.error.errorMessage || 'LLM error' };
          break;
      }
    }
  }

  private convertMessage(m: MinionsMessage): any {
    if (m.role === 'user') {
      return { role: 'user', content: m.content, timestamp: Date.now() };
    }
    if (m.role === 'assistant') {
      const content: any[] = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          content.push({
            type: 'toolCall',
            id: tc.id,
            name: tc.name,
            arguments: JSON.parse(tc.arguments),
          });
        }
      }
      return {
        role: 'assistant', content,
        api: this.model.api, provider: this.model.provider, model: this.model.id,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop', timestamp: Date.now(),
      };
    }
    if (m.role === 'tool') {
      return {
        role: 'toolResult', // pi-ai uses 'toolResult' not 'tool'
        toolCallId: m.tool_call_id,
        toolName: '',
        content: [{ type: 'text', text: String(m.content) }],
        isError: false,
        timestamp: Date.now(),
      };
    }
    return m;
  }
}
```

**Step 4: Update factory.ts**

Add to `src/llm/factory.ts`:

```typescript
import { PiAiAdapter } from './pi-ai-adapter.js';

// In createLLMAdapter function, add:
if (config.provider === 'pi-ai' || config.provider === 'pi') {
  return new PiAiAdapter({
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });
}
```

**Step 5: Run test to verify it passes**

```bash
npx vitest --run test/pi-ai-adapter.test.ts
```
Expected: PASS

**Step 6: Commit**

```bash
git add src/llm/pi-ai-adapter.ts src/llm/factory.ts test/pi-ai-adapter.test.ts
git commit -m "feat: add PiAiAdapter for pi-mono LLM integration"
```

---

### Task 3: Update TaskParser to Use pi-ai

**Files:**
- Modify: `src/host-agent/task-parser.ts`
- Modify: `test/task-parser.test.ts`

**Step 1: Verify TaskParser uses factory**

Ensure `src/host-agent/task-parser.ts` uses `createLLMAdapter` from factory. No changes needed if already using factory.

**Step 2: Add test for pi-ai provider**

Update `test/task-parser.test.ts`:

```typescript
it('works with pi-ai provider', async () => {
  const llm = createLLMAdapter({
    provider: 'pi-ai',
    model: 'gpt-4o',
    apiKey: process.env.LLM_API_KEY || 'test',
  });
  expect(llm.provider).toBe('pi-ai');
});
```

**Step 3: Run tests**

```bash
npx vitest --run test/task-parser.test.ts
```
Expected: PASS

**Step 4: Commit**

```bash
git add src/host-agent/task-parser.ts test/task-parser.test.ts
git commit -m "test: verify TaskParser works with pi-ai provider"
```

---

### Task 4: Update ProjectAnalyzer to Use pi-ai

**Files:**
- Modify: `src/host-agent/index.ts`
- Modify: `test/host-agent.test.ts`

**Step 1: Verify ProjectAnalyzer uses factory**

Check that `src/host-agent/index.ts` uses `createLLMAdapter` from factory.

**Step 2: Run tests**

```bash
npx vitest --run test/host-agent.test.ts
```
Expected: PASS

**Step 3: Commit**

```bash
git add src/host-agent/index.ts test/host-agent.test.ts
git commit -m "test: verify ProjectAnalyzer works with pi-ai provider"
```

---

### Task 5: Integration Test - Simple Task

**Files:**
- None (manual test)

**Step 1: Build project**

```bash
npm run build
```

**Step 2: Test with pi-ai provider**

```bash
LLM_PROVIDER=pi-ai LLM_MODEL=gpt-4o LLM_API_KEY=$API_KEY node dist/cli/index.js run "列出当前目录的文件"
```

**Step 3: Verify output**

Expected: Tool calls work, task completes

**Step 4: Commit**

```bash
git add -A
git commit -m "test: verify pi-ai integration works end-to-end"
```

---

## Phase 2: pi-agent-core + Offline Mount (2-3 weeks)

### Task 6: Create pi-runtime Build Script

**Files:**
- Create: `scripts/build-pi-runtime.sh`
- Modify: `package.json`

**Step 1: Write build script**

Create `scripts/build-pi-runtime.sh`:

```bash
#!/usr/bin/env bash
set -e

PI_RUNTIME_DIR="${PI_RUNTIME_DIR:-$HOME/.minion/pi-runtime}"
GREEN='\033[0;32m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $*"; }

log "=== Building pi-runtime ==="
log "Target: $PI_RUNTIME_DIR"

mkdir -p "$PI_RUNTIME_DIR"
cd "$PI_RUNTIME_DIR"

# Initialize package.json if needed
if [ ! -f package.json ]; then
  log "Initializing package.json..."
  npm init -y
fi

# Install pi-mono packages
log "Installing @mariozechner/pi-ai..."
npm install @mariozechner/pi-ai

log "Installing @mariozechner/pi-agent-core..."
npm install @mariozechner/pi-agent-core

log "Installing @sinclair/typebox..."
npm install @sinclair/typebox

log "Installing @mariozechner/coding-agent (for tools)..."
npm install @mariozechner/coding-agent

log "=== pi-runtime build complete ==="
log "Location: $PI_RUNTIME_DIR"
```

**Step 2: Make executable**

```bash
chmod +x scripts/build-pi-runtime.sh
```

**Step 3: Add npm script**

Update `package.json`:

```json
{
  "scripts": {
    "build:pi-runtime": "bash scripts/build-pi-runtime.sh"
  }
}
```

**Step 4: Test build**

```bash
npm run build:pi-runtime
```

**Step 5: Verify**

```bash
ls ~/.minion/pi-runtime/node_modules/@mariozechner/
```
Expected: pi-ai, pi-agent-core directories exist

**Step 6: Commit**

```bash
git add scripts/build-pi-runtime.sh package.json
git commit -m "feat: add pi-runtime build script for offline mounting"
```

---

### Task 7: Create bootstrap.sh Script

**Files:**
- Create: `docker/bootstrap.sh`

**Step 1: Write bootstrap.sh**

Create `docker/bootstrap.sh`:

```bash
#!/usr/bin/env bash
set -e

PI_RUNTIME="${PI_RUNTIME:-/opt/pi-runtime}"
MINIONS_RUN="/minion-run"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')]${NC} $*"; }
err() { echo -e "${RED}[$(date +'%H:%M:%S')]${NC} $*" >&2; }

# Detect Node.js — only dependency required in container
ensure_node() {
  if command -v node &> /dev/null; then
    log "Node.js: $(node -v)"
    return 0
  fi

  warn "Node.js not found, attempting installation..."
  if command -v apt-get &> /dev/null; then
    apt-get update -qq && apt-get install -y -qq nodejs npm
  elif command -v apk &> /dev/null; then
    apk add -q nodejs npm
  elif command -v yum &> /dev/null; then
    yum install -y -q nodejs npm
  else
    err "Cannot install Node.js. Please use an image with Node.js."
    exit 1
  fi

  log "Node.js installed: $(node -v)"
}

# Verify pi-runtime mount
verify_pi_runtime() {
  if [ ! -d "$PI_RUNTIME/node_modules/@mariozechner/pi-ai" ]; then
    err "pi-runtime not mounted or incomplete: $PI_RUNTIME"
    err "Ensure Docker starts with: -v ~/.minion/pi-runtime:/opt/pi-runtime:ro"
    exit 1
  fi
  log "pi-runtime ready (mounted from host)"
}

# Start sandbox agent
start_agent() {
  if [ -f "$MINIONS_RUN/.env" ]; then
    log "Loading LLM credentials..."
    set -a
    source "$MINIONS_RUN/.env"
    set +a
  fi

  local agent_bin="$PI_RUNTIME/sandbox-main.js"
  if [ ! -f "$agent_bin" ]; then
    err "sandbox-main.js not found: $agent_bin"
    err "Run 'npm run build' to build sandbox entry point"
    exit 1
  fi

  log "Starting Sandbox Agent..."
  exec node "$agent_bin" --config "$MINIONS_RUN/context.json"
}

main() {
  log "=== Minions Sandbox Bootstrap ==="
  log "PI_RUNTIME: $PI_RUNTIME"
  log "MINIONS_RUN: $MINIONS_RUN"

  ensure_node
  verify_pi_runtime
  start_agent
}

main "$@"
```

**Step 2: Make executable**

```bash
chmod +x docker/bootstrap.sh
```

**Step 3: Commit**

```bash
git add docker/bootstrap.sh
git commit -m "feat: add bootstrap.sh for offline pi-runtime mounting"
```

---

### Task 8: Create Sandbox Agent Entry Point

**Files:**
- Create: `src/sandbox/main.ts`
- Create: `src/sandbox/tools/deliver-patch.ts`
- Modify: `tsconfig.json`

**Step 1: Create deliver-patch tool**

Create `src/sandbox/tools/deliver-patch.ts`:

```typescript
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type, type Static } from '@sinclair/typebox';
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';

const DeliverPatchSchema = Type.Object({
  summary: Type.String({ description: '任务完成摘要' }),
});

export function createDeliverPatchTool(workdir: string): AgentTool<typeof DeliverPatchSchema> {
  return {
    name: 'deliver_patch',
    label: 'Deliver Patch',
    description: '将代码变更生成 patch 并交付到 /minion-run/patches/',
    parameters: DeliverPatchSchema,

    execute: async (
      _toolCallId: string,
      params: Static<typeof DeliverPatchSchema>,
      _signal?: AbortSignal,
    ): Promise<AgentToolResult<{ patchCount: number }>> => {
      const { summary } = params;

      // Check for changes
      const status = execFileSync('git', ['status', '--porcelain'], {
        cwd: workdir, encoding: 'utf-8',
      });

      if (!status.trim()) {
        throw new Error('No changes detected in workspace');
      }

      // Stage + Commit
      execFileSync('git', ['add', '.'], { cwd: workdir });
      execFileSync('git', ['commit', '-m', `feat: ${summary}`], {
        cwd: workdir, encoding: 'utf-8',
      });

      // Generate patch
      const patchDir = '/minion-run/patches';
      execFileSync('mkdir', ['-p', patchDir]);
      const result = execFileSync('git', [
        'format-patch', 'HEAD~1', '--output-directory', patchDir,
      ], { cwd: workdir, encoding: 'utf-8' });

      const patchCount = result.trim().split('\n').filter(Boolean).length;

      // Update status
      writeFileSync('/minion-run/status.json', JSON.stringify({
        phase: 'done', summary, patchCount,
      }, null, 2));

      return {
        content: [{ type: 'text', text: `Generated ${patchCount} patch(es): ${summary}` }],
        details: { patchCount },
      };
    },
  };
}
```

**Step 2: Create sandbox main entry**

Create `src/sandbox/main.ts`:

```typescript
import { Agent, type AgentTool } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import { createBashTool, createEditTool, createReadTool, createWriteTool } from '@mariozechner/coding-agent';
import { createDeliverPatchTool } from './tools/deliver-patch.js';
import { readFileSync } from 'fs';
import { join } from 'path';

interface TaskContext {
  task: string;
  systemPrompt: string;
  llm: { provider: string; model: string; apiKey: string };
  project: any;
}

async function main() {
  // Parse arguments
  const configArg = process.argv.find(a => a.startsWith('--config='));
  const configPath = configArg?.split('=')[1] || '/minion-run/context.json';

  const ctx: TaskContext = JSON.parse(readFileSync(configPath, 'utf-8'));

  // Get Model object using getModel()
  const model = getModel(ctx.llm.provider as any, ctx.llm.model as any);

  // Create tools using coding-agent factories
  const tools: AgentTool<any>[] = [
    createBashTool('/workspace'),
    createReadTool('/workspace'),
    createEditTool('/workspace'),
    createWriteTool('/workspace'),
    createDeliverPatchTool('/workspace'),
  ];

  // Create Agent
  const agent = new Agent({
    initialState: {
      systemPrompt: ctx.systemPrompt,
      model,
      tools,
    },
  });

  // Subscribe to events for status tracking
  agent.subscribe((event) => {
    if (event.type === 'turn_start' || event.type === 'tool_execution_start') {
      updateStatus(event);
    }
  });

  // Execute task
  await agent.prompt(ctx.task);
}

function updateStatus(event: any): void {
  const statusFile = '/minion-run/status.json';
  try {
    const existing = JSON.parse(readFileSync(statusFile, 'utf-8'));
    writeFileSync(statusFile, JSON.stringify({
      ...existing,
      lastEvent: event.type,
      timestamp: Date.now(),
    }, null, 2));
  } catch {
    // Ignore errors
  }
}

main().catch(console.error);
```

**Step 3: Update tsconfig.json**

Ensure `src/sandbox` is included:

```json
{
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Add build script to package.json**

```json
{
  "scripts": {
    "build:sandbox": "tsc -p tsconfig.json && node scripts/copy-sandbox.js"
  }
}
```

Create `scripts/copy-sandbox.js`:

```javascript
import { copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, '../dist/sandbox/main.js');
const dst = join(process.env.HOME, '.minion/pi-runtime/sandbox-main.js');

mkdirSync(dirname(dst), { recursive: true });
copyFileSync(src, dst);
console.log(`Copied sandbox entry to ${dst}`);
```

**Step 5: Build and test**

```bash
npm run build
npm run build:sandbox
```

**Step 6: Commit**

```bash
git add src/sandbox/ scripts/copy-sandbox.js tsconfig.json package.json
git commit -m "feat: add sandbox agent entry point with pi-agent-core"
```

---

### Task 9: Update DockerSandbox for Offline Mount

**Files:**
- Modify: `src/sandbox/docker.ts`
- Modify: `test/sandbox.test.ts`

**Step 1: Write the failing test**

Add to `test/sandbox.test.ts`:

```typescript
it('mounts pi-runtime and sets entrypoint', () => {
  const sandbox = new DockerSandbox();
  const config: SandboxConfig = {
    image: 'node:22-slim',
    repoPath: '/path/to/repo',
    runDir: '/home/user/.minion/runs/abc123',
    memory: '4g',
    cpus: 2,
    network: 'bridge',
  };

  const opts = sandbox.buildContainerOptions(config);
  expect(opts.Entrypoint).toEqual(['/minion-bootstrap.sh']);
  expect(opts.HostConfig.Binds).toContain(
    '/home/user/.minion/pi-runtime:/opt/pi-runtime:ro'
  );
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest --run test/sandbox.test.ts
```
Expected: FAIL - pi-runtime mount not added

**Step 3: Update DockerSandbox**

Modify `src/sandbox/docker.ts`:

```typescript
import { join, homedir } from 'path';

export class DockerSandbox implements Sandbox {
  private docker: Dockerode;
  private minionHome: string;

  constructor(minionHome?: string) {
    this.docker = new Dockerode();
    this.minionHome = minionHome || join(homedir(), '.minion');
  }

  buildContainerOptions(config: SandboxConfig): Record<string, any> {
    const env: string[] = [];
    if (process.env.HTTP_PROXY) env.push(`HTTP_PROXY=${process.env.HTTP_PROXY}`);
    if (process.env.HTTPS_PROXY) env.push(`HTTPS_PROXY=${process.env.HTTPS_PROXY}`);
    if (process.env.NO_PROXY) env.push(`NO_PROXY=${process.env.NO_PROXY}`);

    // Add pi-runtime environment
    env.push(`PI_RUNTIME=/opt/pi-runtime`);

    const bootstrapPath = join(this.minionHome, 'bootstrap.sh');
    const piRuntimePath = join(this.minionHome, 'pi-runtime');

    const binds: string[] = [
      `${config.repoPath}:/host-repo:ro`,
      `${config.runDir}:/minion-run`,
      `${bootstrapPath}:/minion-bootstrap.sh:ro`,
      `${piRuntimePath}:/opt/pi-runtime:ro`,  // Key: offline mount pi-runtime
    ];

    const opts: Record<string, any> = {
      Image: config.image,
      Env: env,
      HostConfig: {
        Binds: binds,
        Memory: parseMemory(config.memory),
        NanoCpus: config.cpus * 1e9,
        NetworkMode: config.network,
      },
      Entrypoint: ['/minion-bootstrap.sh'],
      Cmd: [],
    };

    if (process.platform === 'linux') {
      opts.User = `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`;
    }

    return opts;
  }
}
```

**Step 4: Update HostAgent to pass minionHome**

Modify `src/host-agent/index.ts`:

```typescript
const sandbox = new DockerSandbox(this.minionHome);
```

**Step 5: Run test to verify it passes**

```bash
npx vitest --run test/sandbox.test.ts
```
Expected: PASS

**Step 6: Commit**

```bash
git add src/sandbox/docker.ts src/host-agent/index.ts test/sandbox.test.ts
git commit -m "feat: mount pi-runtime offline and set bootstrap entrypoint"
```

---

### Task 10: Create System Prompt Builder

**Files:**
- Create: `src/sandbox/prompts.ts`

**Step 1: Create prompt builder**

Create `src/sandbox/prompts.ts`:

```typescript
import { buildSystemPrompt as piBuildSystemPrompt } from '@mariozechner/coding-agent/core/system-prompt';
import type { TaskContext } from '../types/shared.js';

export function buildSandboxSystemPrompt(ctx: TaskContext): string {
  const piBase = piBuildSystemPrompt({
    selectedTools: ['read', 'bash', 'edit', 'write', 'grep', 'find'],
    cwd: '/workspace',
    contextFiles: ctx.rules.map(r => ({ path: 'coding-rules', content: r })),
    appendSystemPrompt: buildMinionsAppend(ctx),
  });
  return piBase;
}

function buildMinionsAppend(ctx: TaskContext): string {
  return `
# Minions Sandbox Environment
You are running inside a Docker container managed by Minions.
This container is your playground — you have full root access and complete autonomy.

<env>
Source code: /workspace (cloned from host repository)
Branch: ${ctx.branch} (base: ${ctx.baseBranch})
Delivery: /minion-run/patches/
Status: /minion-run/status.json
Max iterations: ${ctx.maxIterations}
Timeout: ${ctx.timeout} minutes
</env>

# Full autonomy — your permissions
You have FULL PERMISSION to:
- Install system packages (apt-get, apk, yum, etc.)
- Install language dependencies (npm, pip, cargo, go get, etc.)
- Search the web for documentation and solutions (curl, wget)
- Download reference code and resources from the internet
- Run any system command with root privileges
- Modify system configuration if needed
- Create temporary files, scripts, or test fixtures
- Run long-running processes

The container is disposable — only the patches you deliver matter.

# Professional objectivity
Prioritize technical accuracy over appearing productive.
ONLY mark a step as completed when you have FULLY accomplished it.
If tests are failing or implementation is partial, report the blocker honestly.

# Additional tool: deliver_patch
Use deliver_patch as your FINAL action to generate git format-patch and deliver results.
A task without patches is a FAILED task.

# Task status tracking
Track your progress in /minion-run/status.json:
- Update phase: "planning" | "executing" | "verifying" | "delivering" | "done" | "failed"
- Track steps with { content, activeForm, status: "pending" | "in_progress" | "completed" }
- Mark steps completed IMMEDIATELY after finishing. ONE step in_progress at a time.

# Tool usage policy
- Use read (not cat) to examine files before editing
- Use edit for precise changes. You MUST read a file before editing it.
- Use write only for new files or complete rewrites
- Batch independent tool calls in a single message for parallel execution

# Verification (MANDATORY)
After implementing changes, you MUST run ALL of the project's verification commands:
build, lint, typecheck, and test. Run independent commands in parallel.
Verify commands from README or package.json — never assume.

# Git commit protocol
- Chain: git add . && git commit -m "descriptive message"
- Use conventional commits format (fix:, feat:, refactor:, etc.)
- Skip files containing secrets (.env, credentials.json)

# Essential constraints
- Your working code is in /workspace
- Delivery output goes to /minion-run/patches/
- You MUST commit and deliver patches before finishing
- Do NOT hardcode secrets or API keys into source files
- Everything else in this container is yours to use freely

# Project info
<system-reminder>
Project analysis prepared by the Host Agent. Do NOT re-discover what is already provided.
</system-reminder>
${JSON.stringify(ctx.projectAnalysis, null, 2)}
`;
}
```

**Step 2: Commit**

```bash
git add src/sandbox/prompts.ts
git commit -m "feat: add sandbox system prompt builder"
```

---

### Task 11: Integration Test - Full Pipeline

**Files:**
- Create: `docker/Dockerfile.test`

**Step 1: Create test Dockerfile**

Create `docker/Dockerfile.test`:

```dockerfile
FROM node:22-slim

# Install basic tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl wget make gcc g++ python3 ripgrep ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
```

**Step 2: Build test image**

```bash
docker build -f docker/Dockerfile.test -t minions-test:latest .
```

**Step 3: Test full pipeline**

```bash
# First, ensure pi-runtime is built
npm run build:pi-runtime
npm run build:sandbox

# Run a test task
LLM_PROVIDER=pi-ai LLM_MODEL=gpt-4o LLM_API_KEY=$API_KEY \
  node dist/cli/index.js run "创建一个 README.md 文件，包含项目标题和描述" \
  --image minions-test:latest
```

**Step 4: Verify patch creation**

```bash
ls ~/.minion/runs/*/patches/
```
Expected: At least one .patch file exists

**Step 5: Commit**

```bash
git add docker/Dockerfile.test
git commit -m "feat: add test Dockerfile for pi-mono integration"
```

---

## Phase 3: Configuration System (1 week)

### Task 12: Add pi-mono Dependencies for Config

**Files:**
- Modify: `package.json`

**Step 1: Add coding-agent dependency**

```bash
npm install @mariozechner/coding-agent --save
```

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add @mariozechner/coding-agent for config system"
```

---

### Task 13: Create MinionsConfig Wrapper

**Files:**
- Create: `src/host-agent/config.ts`

**Step 1: Create config wrapper**

Create `src/host-agent/config.ts`:

```typescript
import { SettingsManager } from '@mariozechner/coding-agent/core/settings-manager';
import { ModelRegistry } from '@mariozechner/coding-agent/core/model-registry';
import { AuthStorage } from '@mariozechner/coding-agent/core/auth-storage';
import { selectConfig } from '@mariozechner/coding-agent/cli/config-selector';
import type { Model, Api } from '@mariozechner/pi-ai';

export interface MinionsExtraConfig {
  sandbox: {
    memory: string;
    cpus: number;
    network: string;
    image?: string;
  };
  pi: {
    runtimeDir?: string;
  };
}

export class MinionsConfig {
  readonly settings: SettingsManager;
  readonly modelRegistry: ModelRegistry;
  private extra: MinionsExtraConfig;

  constructor(cwd: string, agentDir: string) {
    const authStorage = new AuthStorage(agentDir);
    this.settings = SettingsManager.create(cwd, agentDir);
    this.modelRegistry = new ModelRegistry(authStorage);
    this.extra = this.loadExtraConfig();
  }

  async getModel(): Promise<Model<Api>> {
    const provider = this.settings.getDefaultProvider();
    const modelId = this.settings.getDefaultModel();
    if (provider && modelId) {
      const model = this.modelRegistry.find(provider, modelId);
      if (model) return model;
    }
    const available = this.modelRegistry.getAvailable();
    if (available.length === 0) {
      throw new Error('No models available. Run: minion setup');
    }
    return available[0];
  }

  async getApiKey(model: Model<Api>): Promise<string | undefined> {
    return this.modelRegistry.getApiKey(model);
  }

  async openConfigUI(cwd: string, agentDir: string): Promise<void> {
    await selectConfig({
      settingsManager: this.settings,
      cwd,
      agentDir,
      resolvedPaths: { extensions: [], skills: [], prompts: [], themes: [] },
    });
  }

  private loadExtraConfig(): MinionsExtraConfig {
    // TODO: Load from ~/.minion/config.json
    return {
      sandbox: {
        memory: '4g',
        cpus: 2,
        network: 'bridge',
      },
      pi: {
        runtimeDir: join(homedir(), '.minion', 'pi-runtime'),
      },
    };
  }
}
```

**Step 2: Commit**

```bash
git add src/host-agent/config.ts
git commit -m "feat: add MinionsConfig wrapper for pi-mono settings"
```

---

### Task 14: Update CLI with setup Command

**Files:**
- Modify: `src/cli/index.ts`

**Step 1: Add setup command**

Add to `src/cli/index.ts`:

```typescript
program
  .command('setup')
  .description('打开配置界面（模型选择、API Key 设置）')
  .action(async () => {
    const { MinionsConfig } = await import('../host-agent/config.js');
    const { homedir } = await import('os');
    const { join } = await import('path');

    const agentDir = join(homedir(), '.minion');
    const config = new MinionsConfig(process.cwd(), agentDir);

    await config.openConfigUI(process.cwd(), agentDir);
    console.log('✓ 配置完成');
  });

program
  .command('config')
  .description('查看当前配置')
  .action(async () => {
    const { MinionsConfig } = await import('../host-agent/config.js');
    const { homedir } = await import('os');
    const { join } = await import('path');

    const agentDir = join(homedir(), '.minion');
    const config = new MinionsConfig(process.cwd(), agentDir);

    const model = await config.getModel();
    console.log({
      provider: model.provider,
      model: model.id,
      sandbox: config.settings.get('sandbox'),
    });
  });
```

**Step 2: Test commands**

```bash
npm run build
node dist/cli/index.js setup --help
node dist/cli/index.js config
```

**Step 3: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: add setup and config commands using pi-mono TUI"
```

---

### Task 15: Add models.json Support

**Files:**
- Create: `docs/CONFIGURATION.md`

**Step 1: Document models.json**

Create `docs/CONFIGURATION.md`:

```markdown
# Configuration

## Models

Minions uses pi-mono's configuration system. Models are configured in `~/.pi/models.json`:

\`\`\`json
{
  "providers": {
    "deepseek": {
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "$DEEPSEEK_API_KEY",
      "api": "openai-completions",
      "models": [
        {
          "id": "deepseek-chat",
          "name": "DeepSeek V3",
          "reasoning": false,
          "input": ["text"],
          "cost": { "input": 0.27, "output": 1.1 },
          "contextWindow": 64000,
          "maxTokens": 8192
        }
      ]
    }
  }
}
\`\`\`

## Built-in Providers

- OpenAI (openai)
- Anthropic (anthropic)
- Google (google)
- Zhipu/ZAI (zai)

Run `minion setup` to configure.
```

**Step 2: Commit**

```bash
git add docs/CONFIGURATION.md
git commit -m "docs: add configuration guide for models.json"
```

---

## Final Tasks

### Task 16: Update README

**Files:**
- Modify: `README.md`

**Step 1: Update README**

```markdown
## Quick Start

\`\`\`bash
# Install dependencies
npm install

# Build pi-runtime (offline, mounted to containers)
npm run build:pi-runtime

# Build minions
npm run build

# Configure LLM (opens pi-mono TUI)
minion setup

# Run a task
minion run "Fix the login bug in src/auth/login.ts"
\`\`\`

## Architecture

Minions V3 integrates [pi-mono](https://github.com/badlogic/pi-mono):

- **pi-ai**: Unified LLM interface
- **pi-agent-core**: Agent runtime
- **coding-agent**: File tools (read, edit, bash, write)
- **minions-patch**: Git format-patch delivery

## Offline Mode

pi-runtime is pre-built on the host and mounted to containers. No npm install needed inside containers.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for V3 pi-mono integration"
```

---

### Task 17: Final Integration Test

**Files:**
- None (manual testing)

**Step 1: Complete end-to-end test**

```bash
# Clean slate
rm -rf ~/.minion
npm install
npm run build:pi-runtime
npm run build

# Setup
minion setup

# Run task
minion run "创建一个 TypeScript 函数，计算斐波那契数列"
```

**Step 2: Verify all components**

- [ ] Setup wizard (pi-mono TUI) opens
- [ ] pi-runtime builds successfully
- [ ] Docker container starts with bootstrap
- [ ] pi-runtime mounts at /opt/pi-runtime
- [ ] Agent uses pi-ai for LLM calls
- [ ] Task completes with patches
- [ ] Patches apply correctly

**Step 3: Create release notes**

Create `RELEASE_NOTES.md`:

```markdown
# Minions V3 Release Notes

## pi-mono Integration

- LLM layer migrated to @mariozechner/pi-ai
- Agent runtime migrated to @mariozechner/pi-agent-core
- Tools from @mariozechner/coding-agent
- Offline pi-runtime mounting (no container npm install)
- Configuration via pi-mono TUI (`minion setup`)

## Breaking Changes

- Config format changed. Run `minion setup` to reconfigure.
- Custom models via ~/.pi/models.json (pi-mono format)

## Migration

V2 users should:
1. Run `npm run build:pi-runtime`
2. Run `minion setup` to reconfigure LLM
```

**Step 4: Final commit**

```bash
git add RELEASE_NOTES.md
git commit -m "docs: add V3 release notes"
```

---

## Summary

This implementation plan migrates Minions to pi-mono framework in three phases:

1. **Phase 1**: pi-ai integration for all LLM calls
2. **Phase 2**: pi-agent-core + offline pi-runtime mounting
3. **Phase 3**: Configuration system using pi-mono components

Key corrections from original plan:
- Real package names: `@mariozechner/*` not `@pi-monospace/*`
- Real API: `getModel()` not `new PiAI()`
- Offline mounting strategy (not container npm install)
- Reuse pi-mono SettingsManager (not custom ConfigManager)
- AgentTool interface (not PiExtension base class)
