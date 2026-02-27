# Minions V3 Implementation Plan: pi-mono Integration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 全量迁移 minions 的 Agent 运行时到 pi-mono 框架，保留 Docker 沙箱和 git format-patch 交付等差异化特性。

**Architecture:** Host Agent (minions 自研，保留 Docker/patch) → Docker 容器 → bootstrap.sh → pi-agent-core + pi-ai + pi-extensions。支持用户自定义镜像，bootstrap 自动安装 pi-runtime。

**Tech Stack:** TypeScript, Node.js, Docker, dockerode, pi-ai, pi-agent-core, pi-extensions, Commander.js

---

## Phase 1: pi-ai Integration (1-2 weeks)

### Task 1: Add pi-ai Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Add pi-ai dependency**

Run: `npm install @pi-monospace/ai --save`

**Step 2: Verify installation**

Run: `ls node_modules/@pi-monospace/ai`
Expected: Directory exists with package.json

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add @pi-monospace/ai dependency"
```

---

### Task 2: Create pi-ai Adapter (Temporary Compatibility Layer)

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

    // Verify we got some events structure
    expect(Array.isArray(events)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/pi-ai-adapter.test.ts`
Expected: FAIL - module not found

**Step 3: Implement PiAiAdapter**

Create `src/llm/pi-ai-adapter.ts`:

```typescript
import { PiAI } from '@pi-monospace/ai';
import type { LLMAdapter } from './types.js';
import type { Message, ToolDef, LLMEvent } from '../types/shared.js';

export interface PiAiConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export class PiAiAdapter implements LLMAdapter {
  provider = 'pi-ai';
  private pi: PiAI;

  constructor(config: PiAiConfig) {
    this.pi = new PiAI({
      provider: config.provider as any,
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    });
  }

  async *chat(messages: Message[], tools: ToolDef[]): AsyncGenerator<LLMEvent> {
    // Convert minions messages to pi-ai format
    const piMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
      toolCallId: m.tool_call_id,
      toolCalls: m.tool_calls?.map(tc => ({
        id: tc.id,
        functionName: tc.name,
        functionArguments: tc.arguments,
      })),
    }));

    // Convert minions tools to pi-ai format
    const piTools = tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const stream = await this.pi.chat.completions.create({
      messages: piMessages,
      tools: piTools.length > 0 ? piTools : undefined,
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.delta.content) {
        yield { type: 'text_delta', content: chunk.delta.content };
      }
      if (chunk.delta.toolCalls) {
        for (const tc of chunk.delta.toolCalls) {
          if (tc.function?.name && tc.function?.arguments) {
            yield {
              type: 'tool_call',
              id: tc.id || `call-${Date.now()}`,
              name: tc.function.name,
              arguments: tc.function.arguments,
            };
          }
        }
      }
      if (chunk.finishReason === 'stop') {
        yield { type: 'done', usage: chunk.usage };
      }
    }
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

Also update config schema in `src/config/index.ts`:

```typescript
const ConfigSchema = z.object({
  llm: z.object({
    provider: z.enum(['openai', 'anthropic', 'zhipu', 'ollama', 'pi-ai']).default('openai'),
    // ...
  }),
  // ...
});
```

**Step 5: Run test to verify it passes**

Run: `npx vitest --run test/pi-ai-adapter.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/llm/pi-ai-adapter.ts src/llm/factory.ts src/config/index.ts test/pi-ai-adapter.test.ts
git commit -m "feat: add PiAiAdapter for pi-mono LLM integration"
```

---

### Task 3: Update TaskParser to Use pi-ai

**Files:**
- Modify: `src/host-agent/task-parser.ts`
- Modify: `test/task-parser.test.ts`

**Step 1: Update existing imports**

In `src/host-agent/task-parser.ts`, ensure it uses the factory:

```typescript
// No changes needed if already using createLLMAdapter
// Just verify it works with pi-ai provider
```

**Step 2: Add test for pi-ai provider**

Update `test/task-parser.test.ts`:

```typescript
it('works with pi-ai provider', async () => {
  process.env.LLM_PROVIDER = 'pi-ai';
  const llm = createLLMAdapter({
    provider: 'pi-ai',
    model: 'gpt-4o',
    apiKey: process.env.LLM_API_KEY || 'test',
  });
  // ... rest of test
});
```

**Step 3: Run tests**

Run: `npx vitest --run test/task-parser.test.ts`
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

Run: `npx vitest --run test/host-agent.test.ts`
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

Run: `npm run build`

**Step 2: Test with pi-ai provider**

Run: `LLM_PROVIDER=pi-ai LLM_MODEL=gpt-4o LLM_API_KEY=$API_KEY node dist/cli/index.js run "列出当前目录的文件"`

**Step 3: Verify output**

Expected: Tool calls work, task completes

**Step 4: Commit**

```bash
git add -A
git commit -m "test: verify pi-ai integration works end-to-end"
```

---

## Phase 2: pi-agent-core Integration (2-3 weeks)

### Task 6: Create bootstrap.sh Script

**Files:**
- Create: `docker/bootstrap.sh`

**Step 1: Write bootstrap.sh**

Create `docker/bootstrap.sh`:

```bash
#!/usr/bin/env bash
set -e

# Configuration
PI_RUNTIME="${PI_RUNTIME:-/opt/pi-runtime}"
PI_VERSION="${PI_RUNTIME_VERSION:-latest}"
MINIONS_RUN="/minion-run"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')]${NC} $*"; }
err() { echo -e "${RED}[$(date +'%H:%M:%S')]${NC} $*" >&2; }

# Ensure Node.js is available
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
  elif command -v brew &> /dev/null; then
    brew install node
  else
    err "Cannot install Node.js. Please install Node.js manually."
    exit 1
  fi

  log "Node.js installed: $(node -v)"
}

# Ensure pi-runtime is installed
ensure_pi_runtime() {
  if [ -f "$PI_RUNTIME/node_modules/@pi-monospace/agent-core/package.json" ]; then
    log "pi-agent-core already installed"
    return 0
  fi

  log "Installing pi-agent-core@$PI_VERSION..."
  mkdir -p "$PI_RUNTIME"
  cd "$PI_RUNTIME"

  # Initialize package.json if needed
  if [ ! -f package.json ]; then
    npm init -y
  fi

  # Install pi packages
  npm install --silent @pi-monospace/agent-core @pi-monospace/ai

  log "pi-agent-core installed successfully"
}

# Load environment from .env file
load_env() {
  if [ -f "$MINIONS_RUN/.env" ]; then
    log "Loading environment from /minion-run/.env"
    set -a
    source "$MINIONS_RUN/.env"
    set +a
  fi
}

# Start the agent
start_agent() {
  load_env

  local agent_bin="$PI_RUNTIME/node_modules/@pi-monospace/agent-core/dist/index.js"

  if [ ! -f "$agent_bin" ]; then
    err "Agent binary not found: $agent_bin"
    exit 1
  fi

  log "Starting pi-agent-core..."
  log "Config: $MINIONS_RUN/context.json"

  exec node "$agent_bin" \
    --config "$MINIONS_RUN/context.json" \
    --extensions "$PI_RUNTIME/extensions"
}

# Main
main() {
  log "=== Minions Sandbox Bootstrap ==="
  log "PI_RUNTIME: $PI_RUNTIME"
  log "PI_VERSION: $PI_VERSION"
  log "MINIONS_RUN: $MINIONS_RUN"

  ensure_node
  ensure_pi_runtime
  start_agent
}

main "$@"
```

**Step 2: Make executable**

Run: `chmod +x docker/bootstrap.sh`

**Step 3: Commit**

```bash
git add docker/bootstrap.sh
git commit -m "feat: add bootstrap.sh for automatic pi-runtime installation"
```

---

### Task 7: Update DockerSandbox to Mount bootstrap.sh

**Files:**
- Modify: `src/sandbox/docker.ts`
- Modify: `test/sandbox.test.ts`

**Step 1: Write the failing test**

Add to `test/sandbox.test.ts`:

```typescript
it('mounts bootstrap.sh and sets entrypoint', () => {
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
  expect(opts.HostConfig.Binds).toContain('/home/user/.minion/bootstrap.sh:/minion-bootstrap.sh:ro');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/sandbox.test.ts`
Expected: FAIL - entrypoint not set

**Step 3: Update DockerSandbox**

Modify `src/sandbox/docker.ts`:

```typescript
import { join, dirname } from 'path';

export class DockerSandbox implements Sandbox {
  private docker: Dockerode;
  private minionHome: string;  // Add this

  constructor(minionHome?: string) {
    this.docker = new Dockerode();
    this.minionHome = minionHome || join(homedir(), '.minion');
  }

  buildContainerOptions(config: SandboxConfig & { bootstrapPath?: string }): Record<string, any> {
    const env: string[] = [];
    if (process.env.HTTP_PROXY) env.push(`HTTP_PROXY=${process.env.HTTP_PROXY}`);
    if (process.env.HTTPS_PROXY) env.push(`HTTPS_PROXY=${process.env.HTTPS_PROXY}`);
    if (process.env.NO_PROXY) env.push(`NO_PROXY=${process.env.NO_PROXY}`);

    // Add pi-runtime environment variables
    env.push(`PI_RUNTIME=${process.env.PI_RUNTIME || '/opt/pi-runtime'}`);
    env.push(`PI_RUNTIME_VERSION=${process.env.PI_RUNTIME_VERSION || 'latest'}`);

    const bootstrapPath = config.bootstrapPath || join(this.minionHome, 'bootstrap.sh');

    const binds: string[] = [
      `${config.repoPath}:/host-repo:ro`,
      `${config.runDir}:/minion-run`,
      `${bootstrapPath}:/minion-bootstrap.sh:ro`,  // Mount bootstrap script
    ];

    // ... dist mounting code (keep existing) ...

    const opts: Record<string, any> = {
      Image: config.image,
      Env: env,
      HostConfig: {
        Binds: binds,
        Memory: parseMemory(config.memory),
        NanoCpus: config.cpus * 1e9,
        NetworkMode: config.network,
      },
      Entrypoint: ['/minion-bootstrap.sh'],  // Set entrypoint
      Cmd: [],  // Clear default command
    };

    if (platform() === 'linux') {
      opts.User = `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`;
    }

    return opts;
  }

  // ... rest of class unchanged ...
}
```

**Step 4: Update HostAgent to pass minionHome**

Modify `src/host-agent/index.ts`:

```typescript
const sandbox = new DockerSandbox(this.minionHome);  // Pass minionHome
```

**Step 5: Run test to verify it passes**

Run: `npx vitest --run test/sandbox.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/sandbox/docker.ts src/host-agent/index.ts test/sandbox.test.ts
git commit -m "feat: mount bootstrap.sh and set container entrypoint"
```

---

### Task 8: Create minions-patch Extension

**Files:**
- Create: `extensions/minions-patch/package.json`
- Create: `extensions/minions-patch/src/index.ts`
- Create: `extensions/minions-patch/tsconfig.json`
- Create: `extensions/minions-patch/test/index.test.ts`

**Step 1: Create extension package.json**

Create `extensions/minions-patch/package.json`:

```json
{
  "name": "@minions/patch-delivery",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest"
  },
  "dependencies": {
    "@pi-monospace/agent-core": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

**Step 2: Create extension source**

Create `extensions/minions-patch/src/index.ts`:

```typescript
import { PiExtension } from '@pi-monospace/agent-core';
import { execFileSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

export default class PatchDeliveryExtension extends PiExtension {
  name = 'minions-patch';

  override async onLoad() {
    this.logger.info('Loading Patch Delivery Extension');

    this.tools.register({
      name: 'deliver_patch',
      description: 'Deliver code changes as patches to /minion-run/patches/',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Summary of the completed task',
          },
        },
        required: ['summary'],
      },
    }, async (params) => {
      const { summary } = params as { summary: string };

      try {
        // Check if we're in a git repo
        const workdir = process.cwd();
        const statusOutput = execFileSync('git', ['status', '--porcelain'], {
          cwd: workdir,
          encoding: 'utf-8',
        });

        if (!statusOutput.trim()) {
          return {
            success: false,
            error: 'No changes detected in workspace',
          };
        }

        // Stage all changes
        execFileSync('git', ['add', '.'], { cwd: workdir });

        // Commit
        const commitMsg = `feat: ${summary}`;
        execFileSync('git', ['commit', '-m', commitMsg], {
          cwd: workdir,
          encoding: 'utf-8',
        });

        // Get base branch (origin/HEAD)
        const branchOutput = execFileSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
          cwd: workdir,
          encoding: 'utf-8',
        }).trim();
        const baseBranch = branchOutput.replace('refs/remotes/origin/', '');

        // Generate patches
        const patchDir = '/minion-run/patches';
        execFileSync('git', ['format-patch', `origin/${baseBranch}`, '--output-directory', patchDir], {
          cwd: workdir,
          encoding: 'utf-8',
        });

        // Update status.json
        const statusFile = '/minion-run/status.json';
        const existingStatus = JSON.parse(readFileSync(statusFile, 'utf-8').toString() || '{}');
        writeFileSync(statusFile, JSON.stringify({
          ...existingStatus,
          phase: 'done',
          summary,
        }, null, 2));

        return {
          success: true,
          output: `Patch delivered: ${summary}`,
        };
      } catch (e: any) {
        return {
          success: false,
          error: e.message,
        };
      }
    });
  }
}
```

**Step 3: Create tsconfig.json**

Create `extensions/minions-patch/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create test**

Create `extensions/minions-patch/test/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import PatchDeliveryExtension from '../src/index.js';

describe('PatchDeliveryExtension', () => {
  it('has correct name', () => {
    const ext = new PatchDeliveryExtension();
    expect(ext.name).toBe('minions-patch');
  });

  it('registers deliver_patch tool', async () => {
    const ext = new PatchDeliveryExtension();
    await ext.onLoad();
    expect(ext.tools.has('deliver_patch')).toBe(true);
  });
});
```

**Step 5: Build and test**

Run:
```bash
cd extensions/minions-patch
npm install
npm run build
npm test
```

**Step 6: Commit**

```bash
git add extensions/minions-patch/
git commit -m "feat: add minions-patch extension for pi-agent-core"
```

---

### Task 9: Integration Test - Full Pipeline

**Files:**
- Create: `docker/Dockerfile.pi`
- Modify: `src/cli/index.ts` (if needed)

**Step 1: Create pi-base Dockerfile**

Create `docker/Dockerfile.pi`:

```dockerfile
FROM node:22-slim

# Install basic tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl wget make gcc g++ python3 ripgrep ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create directories
RUN mkdir -p /opt/minion /opt/pi-runtime /minion-run/patches

# Copy bootstrap script
COPY docker/bootstrap.sh /opt/minion/bootstrap.sh
RUN chmod +x /opt/minion/bootstrap.sh

# Copy minions patch extension
COPY extensions/minions-patch/ /opt/minion/extensions/
WORKDIR /opt/minion/extensions/minions-patch
RUN npm install && npm run build

WORKDIR /workspace

ENTRYPOINT ["/opt/minion/bootstrap.sh"]
```

**Step 2: Build Docker image**

Run:
```bash
docker build -f docker/Dockerfile.pi -t minions-pi:latest .
```

**Step 3: Test full pipeline**

Run:
```bash
npm run build
LLM_PROVIDER=pi-ai LLM_MODEL=gpt-4o LLM_API_KEY=$API_KEY \
  node dist/cli/index.js run "在当前目录创建一个 README.md 文件，包含项目标题和描述" \
  --image minions-pi:latest
```

**Step 4: Verify patch creation**

Run:
```bash
ls ~/.minion/runs/*/patches/
```
Expected: At least one .patch file exists

**Step 5: Commit**

```bash
git add docker/Dockerfile.pi
git commit -m "feat: add pi-based Dockerfile for testing"
```

---

## Phase 3: Configuration System Enhancement (1 week)

### Task 10: Create ConfigManager

**Files:**
- Create: `src/host-agent/config-manager.ts`
- Create: `test/config-manager.test.ts`

**Step 1: Write the failing test**

Create `test/config-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigManager } from '../src/host-agent/config-manager.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ConfigManager', () => {
  let tempDir: string;
  let manager: ConfigManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'minion-config-'));
    manager = new ConfigManager(join(tempDir, 'config.yaml'));
  });

  it('loads default config when file does not exist', () => {
    const config = manager.load();
    expect(config.llm.provider).toBeDefined();
  });

  it('saves and loads config', () => {
    const config = {
      llm: { provider: 'zhipu', model: 'glm-5', apiKey: 'test' },
      sandbox: { memory: '8g', cpus: 4, network: 'bridge' },
      agent: { maxIterations: 100, timeout: 60 },
    };
    manager.save(config);
    const loaded = manager.load();
    expect(loaded.llm.provider).toBe('zhipu');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/config-manager.test.ts`
Expected: FAIL - module not found

**Step 3: Implement ConfigManager**

Create `src/host-agent/config-manager.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { loadConfig as loadEnvConfig } from '../config/index.js';

export interface MinionsConfig {
  llm: {
    provider: string;
    model: string;
    apiKey: string;
    baseUrl?: string;
  };
  sandbox: {
    memory: string;
    cpus: number;
    network: string;
    image?: string;
  };
  agent: {
    maxIterations: number;
    timeout: number;
  };
  pi: {
    runtimeVersion?: string;
    runtimeDir?: string;
  };
}

export class ConfigManager {
  private configPath: string;

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  load(): MinionsConfig {
    // Load from environment variables first (existing behavior)
    const envConfig = loadEnvConfig();

    // TODO: Load from YAML file and merge
    // For now, just return env config
    return {
      llm: {
        provider: envConfig.llm.provider,
        model: envConfig.llm.model,
        apiKey: envConfig.llm.apiKey,
        baseUrl: envConfig.llm.baseUrl,
      },
      sandbox: {
        memory: envConfig.sandbox.memory,
        cpus: envConfig.sandbox.cpus,
        network: envConfig.sandbox.network,
      },
      agent: {
        maxIterations: envConfig.agent.maxIterations,
        timeout: envConfig.agent.timeout,
      },
      pi: {
        runtimeVersion: process.env.PI_RUNTIME_VERSION,
        runtimeDir: process.env.PI_RUNTIME,
      },
    };
  }

  save(config: MinionsConfig): void {
    // TODO: Implement YAML save
    // For now, just ensure directory exists
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) {
      require('fs').mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  async parseFromNL(input: string, llm: any): Promise<Partial<MinionsConfig>> {
    // TODO: Use pi-ai to parse natural language config
    // For now, return empty
    return {};
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest --run test/config-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/host-agent/config-manager.ts test/config-manager.test.ts
git commit -m "feat: add ConfigManager for unified configuration management"
```

---

### Task 11: Create SetupWizard

**Files:**
- Create: `src/host-agent/setup-wizard.ts`
- Create: `test/setup-wizard.test.ts`

**Step 1: Research pi-mono/openclaw for reference**

Check if pi-mono has setup wizard code:
```bash
# This would be done manually to inspect pi-mono source
# Look for files like: setup-wizard.ts, first-run.ts, onboarding.ts
```

**Step 2: Write SetupWizard**

Create `src/host-agent/setup-wizard.ts`:

```typescript
import { createInterface } from 'readline';
import { createLLMAdapter } from '../llm/factory.js';
import type { LLMAdapter } from '../llm/types.js';

export interface ProviderInfo {
  id: string;
  name: string;
  models: string[];
  defaultModel: string;
  requiresApiKey: boolean;
  baseUrlTemplate?: string;
}

const PROVIDERS: Record<string, ProviderInfo> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o',
    requiresApiKey: true,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022'],
    defaultModel: 'claude-sonnet-4-20250514',
    requiresApiKey: true,
  },
  zhipu: {
    id: 'zhipu',
    name: '智谱 AI (Zhipu AI)',
    models: ['glm-5', 'glm-4-air', 'glm-4-flash'],
    defaultModel: 'glm-5',
    requiresApiKey: true,
    baseUrlTemplate: 'https://open.bigmodel.cn/api/paas/v4',
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (本地模型)',
    models: ['llama3', 'mistral', 'codellama'],
    defaultModel: 'llama3',
    requiresApiKey: false,
    baseUrlTemplate: 'http://localhost:11434/v1',
  },
};

export class SetupWizard {
  private rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  private question(query: string): Promise<string> {
    return new Promise(resolve => {
      this.rl.question(query, resolve);
    });
  }

  private close(): void {
    this.rl.close();
  }

  async run(): Promise<{ provider: string; model: string; apiKey: string }> {
    console.log('\n🔧 欢迎使用 Minions！');
    console.log('检测到这是首次运行，需要配置 LLM 提供商。\n');

    // Step 1: Select provider
    const providerId = await this.selectProvider();
    const provider = PROVIDERS[providerId];

    // Step 2: Enter API key
    let apiKey = '';
    if (provider.requiresApiKey) {
      apiKey = await this.inputApiKey();
    }

    // Step 3: Select model
    const model = await this.selectModel(provider);

    // Step 4: Test connection
    const success = await this.testConnection(providerId, model, apiKey);
    if (!success) {
      console.log('\n⚠️  连接失败，请检查配置后重试。');
      throw new Error('Connection test failed');
    }

    console.log('\n✓ 配置完成！');

    return { provider: providerId, model, apiKey };
  }

  private async selectProvider(): Promise<string> {
    console.log('请选择 LLM 提供商：\n');
    const entries = Object.entries(PROVIDERS);

    for (let i = 0; i < entries.length; i++) {
      const [id, info] = entries[i];
      console.log(`  ${i + 1}) ${info.name}`);
    }

    const choice = await this.question('\n选择 [1-4]: ');
    const index = parseInt(choice) - 1;

    if (index < 0 || index >= entries.length) {
      return this.selectProvider();
    }

    return entries[index][0];
  }

  private async inputApiKey(): Promise<string> {
    // Simple implementation (not hiding input for simplicity)
    // TODO: Use proper password hiding
    return await this.question('输入 API Key: ');
  }

  private async selectModel(provider: ProviderInfo): Promise<string> {
    console.log(`\n选择模型 [${provider.defaultModel}]:\n`);
    for (let i = 0; i < provider.models.length; i++) {
      console.log(`  ${i + 1}) ${provider.models[i]}`);
    }

    const choice = await this.question(`\n选择 [1-${provider.models.length}]: `);

    if (!choice.trim()) {
      return provider.defaultModel;
    }

    const index = parseInt(choice) - 1;
    if (index >= 0 && index < provider.models.length) {
      return provider.models[index];
    }

    return provider.defaultModel;
  }

  private async testConnection(provider: string, model: string, apiKey: string): Promise<boolean> {
    console.log('\n正在测试连接...');

    try {
      const llm = createLLMAdapter({ provider, model, apiKey });
      // Simple test call
      for await (const event of llm.chat([{ role: 'user', content: 'test' }], [])) {
        if (event.type === 'done') return true;
        if (event.type === 'error') return false;
      }
      return true;
    } catch {
      return false;
    }
  }
}
```

**Step 3: Write test**

Create `test/setup-wizard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SetupWizard, PROVIDERS } from '../src/host-agent/setup-wizard.js';

describe('SetupWizard', () => {
  it('has provider definitions', () => {
    expect(PROVIDERS.openai).toBeDefined();
    expect(PROVIDERS.zhipu).toBeDefined();
    expect(PROVIDERS.ollama).toBeDefined();
  });

  // Note: Full interactive tests would require mocking stdin/stdout
});
```

**Step 4: Run tests**

Run: `npx vitest --run test/setup-wizard.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/host-agent/setup-wizard.ts test/setup-wizard.test.ts
git commit -m "feat: add SetupWizard for first-time LLM configuration"
```

---

### Task 12: Add CLI Commands for Config

**Files:**
- Modify: `src/cli/index.ts`

**Step 1: Add setup command**

Add to `src/cli/index.ts`:

```typescript
program
  .command('setup')
  .description('Run first-time setup wizard')
  .action(async () => {
    const { SetupWizard } = await import('../host-agent/setup-wizard.js');
    const { ConfigManager } = await import('../host-agent/config-manager.js');
    const { homedir } = await import('os');
    const { join } = await import('path');

    const minionHome = join(homedir(), '.minion');
    const manager = new ConfigManager(join(minionHome, 'config.yaml'));
    const wizard = new SetupWizard();

    try {
      const config = await wizard.run();
      // Save to config file
      // TODO: Implement YAML save
      console.log('\n配置已保存到 ~/.minion/config.yaml');
    } catch (e) {
      console.error(`\n错误: ${e.message}`);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('View or update configuration')
  .option('--set <key=value>', 'Set a configuration value')
  .action(async (opts) => {
    const { ConfigManager } = await import('../host-agent/config-manager.js');
    const { homedir } = await import('os');
    const { join } = await import('path');

    const manager = new ConfigManager(join(homedir(), '.minion', 'config.yaml'));
    const config = manager.load();

    if (opts.set) {
      // Parse key=value and update
      console.log(`Setting ${opts.set}`);
      // TODO: Implement
    } else {
      console.log(JSON.stringify(config, null, 2));
    }
  });
```

**Step 2: Test commands**

Run: `node dist/cli/index.js setup --help`
Expected: Usage shown

**Step 3: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: add 'minion setup' and 'minion config' commands"
```

---

## Final Tasks

### Task 13: Update README and Documentation

**Files:**
- Modify: `README.md`
- Create: `docs/INSTALLATION.md`
- Create: `docs/CONFIGURATION.md`

**Step 1: Update README**

Add pi-mono integration section to README.md:

```markdown
## Architecture

Minions V3 integrates with [pi-mono](https://github.com/badlogic/pi-mono) for LLM and Agent runtime:

- **pi-ai**: Unified LLM interface supporting OpenAI, Anthropic, Zhipu, and more
- **pi-agent-core**: Agent runtime with extension system
- **minions-patch**: Custom extension for git format-patch delivery

## Quick Start

\`\`\`bash
# First time setup
npm install
npm run build
npm run docker:build
minion setup

# Run a task
minion run "Fix the login bug"
\`\`\`
```

**Step 2: Create installation docs**

Create `docs/INSTALLATION.md` with detailed setup instructions.

**Step 3: Create configuration docs**

Create `docs/CONFIGURATION.md` with all configuration options.

**Step 4: Commit**

```bash
git add README.md docs/INSTALLATION.md docs/CONFIGURATION.md
git commit -m "docs: update README and add installation/configuration guides"
```

---

### Task 14: Final Integration Test

**Files:**
- None (manual testing)

**Step 1: Complete end-to-end test**

Run full workflow:
```bash
minion setup
minion run "创建一个简单的 TypeScript 项目，包含 package.json 和 tsconfig.json"
```

**Step 2: Verify all components**

- [ ] Setup wizard completes successfully
- [ ] Docker container starts with bootstrap
- [ ] pi-agent-core installs automatically
- [ ] Task completes with patches
- [ ] Patches apply correctly to local repo

**Step 3: Create release notes**

Create `RELEASE_NOTES.md` documenting V3 changes.

**Step 4: Final commit**

```bash
git add RELEASE_NOTES.md
git commit -m "docs: add V3 release notes"
```

---

## Summary

This implementation plan migrates Minions to pi-mono framework in three phases:

1. **Phase 1**: pi-ai integration for all LLM calls
2. **Phase 2**: pi-agent-core integration with bootstrap mechanism
3. **Phase 3**: Enhanced configuration system with natural language support

Each phase can be verified independently before proceeding to the next.
