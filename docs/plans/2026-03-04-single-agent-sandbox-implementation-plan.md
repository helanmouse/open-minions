# Single Agent + Rootless Sandbox Implementation Plan

> **Status:** Superseded by `docs/plans/2026-03-05-single-agent-sandbox-compatibility-implementation.md` (four native tools + host-side-only delivery).

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement single-host-agent orchestration with per-task sandbox clones, patch delivery for git repos, and artifact delivery for non-git directories, preferring rootless Docker/Podman runtimes.

**Architecture:** Host agent detects repo mode (git vs non-git), writes delivery mode into context/env, and starts a rootless sandbox. The sandbox clones/copies into `/workspace`, runs the agent, then delivers either patches or an artifact bundle. Host applies results by patch or by artifact sync. Runtime selection prefers rootless Podman/Docker via a sandbox factory.

**Tech Stack:** TypeScript, vitest, Dockerode, Podman/Docker CLI, bash bootstrap

---

## Task 1: Add repo mode + delivery mode detection

**Files:**
- Create: `src/host-agent/repo-resolver.ts`
- Create: `test/repo-resolver.test.ts`
- Modify: `src/types/shared.ts`

**Step 1: Write failing tests for repo detection**

```ts
// test/repo-resolver.test.ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { detectRepoMode, decideDeliveryMode } from '../src/host-agent/repo-resolver.js'

describe('repo resolver', () => {
  it('detects git when .git exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'repo-'))
    mkdirSync(join(dir, '.git'))
    expect(detectRepoMode(dir)).toBe('git')
  })

  it('detects plain when .git missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'repo-'))
    expect(detectRepoMode(dir)).toBe('plain')
  })

  it('maps delivery mode from repo mode', () => {
    expect(decideDeliveryMode('git')).toBe('patch')
    expect(decideDeliveryMode('plain')).toBe('artifact')
  })
})
```

**Step 2: Run tests to confirm failure**

Run: `npx vitest --run test/repo-resolver.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement repo resolver and shared types**

```ts
// src/host-agent/repo-resolver.ts
import { existsSync } from 'fs'
import { join } from 'path'

export type RepoMode = 'git' | 'plain'
export type DeliveryMode = 'patch' | 'artifact'

export function detectRepoMode(repoPath: string): RepoMode {
  return existsSync(join(repoPath, '.git')) ? 'git' : 'plain'
}

export function decideDeliveryMode(repoMode: RepoMode): DeliveryMode {
  return repoMode === 'git' ? 'patch' : 'artifact'
}
```

```ts
// src/types/shared.ts (additions)
export type RepoMode = 'git' | 'plain'
export type DeliveryMode = 'patch' | 'artifact'

export interface TaskContext {
  // existing fields...
  repoMode: RepoMode
  deliveryMode: DeliveryMode
}
```

**Step 4: Re-run tests**

Run: `npx vitest --run test/repo-resolver.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/host-agent/repo-resolver.ts src/types/shared.ts test/repo-resolver.test.ts
git commit -m "feat(host-agent): add repo and delivery mode detection"
```

---

## Task 2: Build task context + sandbox env in host agent

**Files:**
- Create: `src/host-agent/task-context.ts`
- Create: `test/task-context.test.ts`
- Modify: `src/host-agent/host-agent.ts`
- Modify: `src/types/shared.ts`

**Step 1: Write failing tests for context/env builder**

```ts
// test/task-context.test.ts
import { describe, it, expect } from 'vitest'
import { buildTaskContext, buildSandboxEnv } from '../src/host-agent/task-context.js'

describe('task context builder', () => {
  it('sets repoMode and deliveryMode based on repo path', () => {
    const ctx = buildTaskContext({
      taskId: 't1',
      description: 'test',
      repoPath: '/tmp/non-git',
      maxIterations: 10,
      timeout: 5,
      projectAnalysis: {}
    }, false)
    expect(ctx.repoMode).toBe('plain')
    expect(ctx.deliveryMode).toBe('artifact')
  })

  it('writes sandbox env lines with delivery info', () => {
    const lines = buildSandboxEnv({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'key',
      baseUrl: ''
    }, { repoMode: 'git', deliveryMode: 'patch' })
    expect(lines).toContain('MINION_REPO_MODE=git')
    expect(lines).toContain('MINION_DELIVERY_MODE=patch')
  })
})
```

**Step 2: Run tests to confirm failure**

Run: `npx vitest --run test/task-context.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement task context + env helpers**

```ts
// src/host-agent/task-context.ts
import type { TaskContext } from '../types/shared.js'
import { detectRepoMode, decideDeliveryMode } from './repo-resolver.js'

export function buildTaskContext(input: {
  taskId: string
  description: string
  repoPath: string
  maxIterations: number
  timeout: number
  projectAnalysis: Record<string, unknown>
}, repoIsGitOverride?: boolean): TaskContext {
  const repoMode = repoIsGitOverride ? 'git' : detectRepoMode(input.repoPath)
  const deliveryMode = decideDeliveryMode(repoMode)
  return {
    taskId: input.taskId,
    description: input.description,
    repoType: 'local',
    branch: `minion/${input.taskId}`,
    baseBranch: 'main',
    projectAnalysis: input.projectAnalysis,
    rules: [],
    maxIterations: input.maxIterations,
    timeout: input.timeout,
    repoMode,
    deliveryMode
  }
}

export function buildSandboxEnv(llm: {
  provider: string
  model: string
  apiKey: string
  baseUrl: string
}, delivery: { repoMode: string; deliveryMode: string }): string[] {
  return [
    `LLM_PROVIDER=${llm.provider}`,
    `LLM_MODEL=${llm.model}`,
    `LLM_API_KEY=${llm.apiKey}`,
    `LLM_BASE_URL=${llm.baseUrl}`,
    `MINION_REPO_MODE=${delivery.repoMode}`,
    `MINION_DELIVERY_MODE=${delivery.deliveryMode}`
  ]
}
```

**Step 4: Wire helpers into HostAgent**

Update `src/host-agent/host-agent.ts` to use `buildTaskContext` and `buildSandboxEnv` when writing `context.json` and `.env`, and to set `currentRepoPath` using the resolved repo path (CLI `--repo` or `process.cwd()`).

**Step 5: Re-run tests**

Run: `npx vitest --run test/task-context.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/host-agent/task-context.ts src/host-agent/host-agent.ts test/task-context.test.ts
git commit -m "feat(host-agent): build task context and sandbox env"
```

---

## Task 3: Sandbox clone/copy + artifact delivery

**Files:**
- Modify: `docker/bootstrap.sh`
- Modify: `src/sandbox/main.ts`
- Modify: `src/sandbox/prompts.ts`
- Modify: `src/sandbox/context-manager.ts`
- Create: `src/sandbox/tools/deliver-artifact.ts`
- Modify: `src/types/shared.ts`
- Modify: `test/context-manager.test.ts`
- Create: `test/sandbox-prompt.test.ts`

**Step 1: Add SANDBOX_PATHS for artifacts**

```ts
// src/types/shared.ts (additions)
export const SANDBOX_PATHS = {
  // existing...
  ARTIFACTS: '/minion-run/artifacts'
} as const
```

**Step 2: Update bootstrap to clone for git, copy for non-git**

```bash
# docker/bootstrap.sh (replace prepare_workspace)
prepare_workspace() {
  if [ ! -d /host-repo ]; then
    err "/host-repo not mounted"
    exit 1
  fi

  local mode="${MINION_REPO_MODE:-}"
  if [ -z "$mode" ]; then
    if [ -d /host-repo/.git ]; then
      mode="git"
    else
      mode="plain"
    fi
  fi

  if [ "$mode" = "git" ]; then
    log "Cloning host repo into /workspace..."
    git clone /host-repo /workspace
  else
    log "Copying host directory into /workspace..."
    cp -a /host-repo /workspace
  fi
  log "Workspace ready: /workspace"
}
```

**Step 3: Add deliver_artifact tool**

```ts
// src/sandbox/tools/deliver-artifact.ts
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import { Type, type Static } from '@sinclair/typebox'
import { execFileSync } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
import { SANDBOX_PATHS } from '../../types/shared.js'

const DeliverArtifactSchema = Type.Object({
  summary: Type.String({ description: '任务完成摘要' })
})

export function createDeliverArtifactTool(workdir: string): AgentTool<typeof DeliverArtifactSchema> {
  return {
    name: 'deliver_artifact',
    label: 'Deliver Artifact',
    description: '将工作目录打包并交付到 /minion-run/artifacts/',
    parameters: DeliverArtifactSchema,
    execute: async (_id: string, params: Static<typeof DeliverArtifactSchema>): Promise<AgentToolResult<{ artifact: string }>> => {
      mkdirSync(SANDBOX_PATHS.ARTIFACTS, { recursive: true })
      const outFile = `${SANDBOX_PATHS.ARTIFACTS}/workspace.tar.gz`
      execFileSync('tar', ['-czf', outFile, '-C', workdir, '.'])
      writeFileSync(SANDBOX_PATHS.STATUS, JSON.stringify({
        phase: 'done',
        summary: params.summary,
        artifact: outFile
      }, null, 2))
      return {
        content: [{ type: 'text', text: `Generated artifact: ${outFile}` }],
        details: { artifact: outFile }
      }
    }
  }
}
```

**Step 4: Select delivery tool in sandbox**

Update `src/sandbox/main.ts` to choose between `createDeliverPatchTool` and `createDeliverArtifactTool` based on `ctx.deliveryMode`.

**Step 5: Update prompt text for delivery mode**

Add conditional sections in `src/sandbox/prompts.ts`:
- `deliveryMode === 'patch'` → mention `/minion-run/patches/` + `deliver_patch`
- `deliveryMode === 'artifact'` → mention `/minion-run/artifacts/` + `deliver_artifact`

**Step 6: Update ContextManager steering message**

Add an optional constructor param `deliverToolName` and use it in `getSteeringMessage()` so the message instructs `deliver_artifact` when appropriate.

**Step 7: Add tests**

```ts
// test/sandbox-prompt.test.ts
import { describe, it, expect } from 'vitest'
import { buildSandboxSystemPrompt } from '../src/sandbox/prompts.js'

const baseCtx = {
  taskId: 't1',
  description: 'test',
  repoType: 'local',
  branch: 'minion/t1',
  baseBranch: 'main',
  projectAnalysis: {},
  rules: [],
  maxIterations: 10,
  timeout: 5,
  repoMode: 'plain',
  deliveryMode: 'artifact'
}

describe('sandbox prompt', () => {
  it('mentions deliver_artifact in artifact mode', () => {
    const prompt = buildSandboxSystemPrompt(baseCtx as any)
    expect(prompt).toContain('deliver_artifact')
    expect(prompt).toContain('/minion-run/artifacts/')
  })

  it('mentions deliver_patch in patch mode', () => {
    const prompt = buildSandboxSystemPrompt({ ...baseCtx, repoMode: 'git', deliveryMode: 'patch' } as any)
    expect(prompt).toContain('deliver_patch')
    expect(prompt).toContain('/minion-run/patches/')
  })
})
```

Update `test/context-manager.test.ts` to assert `getSteeringMessage()` includes `deliver_artifact` when configured.

**Step 8: Run tests**

Run: `npx vitest --run test/sandbox-prompt.test.ts test/context-manager.test.ts`
Expected: PASS

**Step 9: Commit**

```bash
git add docker/bootstrap.sh src/sandbox/main.ts src/sandbox/prompts.ts src/sandbox/context-manager.ts src/sandbox/tools/deliver-artifact.ts src/types/shared.ts test/sandbox-prompt.test.ts test/context-manager.test.ts
git commit -m "feat(sandbox): add artifact delivery and clone/copy bootstrap"
```

---

## Task 4: Host-side artifact tools + prompt updates

**Files:**
- Create: `src/host-agent/tools/artifact-tools.ts`
- Modify: `src/host-agent/host-agent.ts`
- Modify: `src/host-agent/prompts.ts`
- Create: `test/artifact-tools.test.ts`

**Step 1: Write failing tests for artifact tools**

```ts
// test/artifact-tools.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createListArtifactsTool, createApplyArtifactsTool } from '../src/host-agent/tools/artifact-tools.js'
import type { ContainerRegistry } from '../src/container/registry.js'

describe('artifact tools', () => {
  it('lists artifacts from runDir', async () => {
    const registry = {
      get: () => ({ metadata: { runDir: '/tmp/run' } })
    } as unknown as ContainerRegistry
    const { readdirSync } = await import('fs')
    vi.spyOn(readdirSync, 'apply' as any).mockReturnValue(['workspace.tar.gz'])

    const tool = createListArtifactsTool(registry)
    const result = await tool.execute('id', { containerId: 'c1' })
    expect(result.details.artifacts.length).toBe(1)
  })
})
```

**Step 2: Implement artifact tools**

```ts
// src/host-agent/tools/artifact-tools.ts
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import { Type, type Static } from '@sinclair/typebox'
import { readdirSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'
import type { ContainerRegistry } from '../../container/registry.js'
import { tmpdir } from 'os'

const ListArtifactsSchema = Type.Object({
  containerId: Type.String({ description: 'Container ID' })
})

const ApplyArtifactsSchema = Type.Object({
  artifact: Type.String({ description: 'Artifact tar.gz path' }),
  targetDir: Type.String({ description: 'Target directory to apply' })
})

export function createListArtifactsTool(registry: ContainerRegistry): AgentTool<typeof ListArtifactsSchema> {
  return {
    name: 'list_artifacts',
    label: 'list_artifacts',
    description: 'List artifact bundles generated by container',
    parameters: ListArtifactsSchema,
    execute: async (_id, args): Promise<AgentToolResult<{ artifacts: string[] }>> => {
      const container = registry.get(args.containerId)
      const runDir = container?.metadata.runDir
      const artifactsDir = runDir ? join(runDir, 'artifacts') : null
      const artifacts = artifactsDir ? readdirSync(artifactsDir).map(f => join(artifactsDir, f)) : []
      return { content: [{ type: 'text', text: JSON.stringify({ artifacts }) }], details: { artifacts } }
    }
  }
}

export function createApplyArtifactsTool(): AgentTool<typeof ApplyArtifactsSchema> {
  return {
    name: 'apply_artifacts',
    label: 'apply_artifacts',
    description: 'Apply artifact bundle to target directory',
    parameters: ApplyArtifactsSchema,
    execute: async (_id, args): Promise<AgentToolResult<{ applied: boolean }>> => {
      const tempDir = mkdtempSync(join(tmpdir(), 'minion-artifact-'))
      execFileSync('tar', ['-xzf', args.artifact, '-C', tempDir])
      execFileSync('cp', ['-a', `${tempDir}/.`, args.targetDir])
      return { content: [{ type: 'text', text: JSON.stringify({ applied: true }) }], details: { applied: true } }
    }
  }
}
```

**Step 3: Wire tools and update prompt**

- Add `createListArtifactsTool` and `createApplyArtifactsTool` to the HostAgent tool list in `src/host-agent/host-agent.ts`.
- Update `src/host-agent/prompts.ts` workflow to include:
  - If patches are empty or delivery mode is artifact → `list_artifacts` → `apply_artifacts`

**Step 4: Run tests**

Run: `npx vitest --run test/artifact-tools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/host-agent/tools/artifact-tools.ts src/host-agent/host-agent.ts src/host-agent/prompts.ts test/artifact-tools.test.ts
git commit -m "feat(host-agent): add artifact listing and apply tools"
```

---

## Task 5: Rootless runtime selection (Podman/Docker)

**Files:**
- Create: `src/sandbox/podman.ts`
- Create: `src/sandbox/factory.ts`
- Modify: `src/sandbox/types.ts`
- Modify: `src/host-agent/types.ts`
- Modify: `src/host-agent/tools/container-tools.ts`
- Modify: `src/host-agent/tools/container-tools.test.ts`
- Modify: `src/host-agent/config.ts`
- Modify: `src/host-agent/config.test.ts`
- Modify: `src/config/index.ts`
- Modify: `src/cli/index.ts`

**Step 1: Add sandbox runtime to config**

Update `MinionsExtraConfig` in `src/host-agent/config.ts` to include:

```ts
sandbox: {
  runtime?: 'docker' | 'podman'
  memory: string
  cpus: number
  network: string
  image?: string
}
```

Add tests in `src/host-agent/config.test.ts` to verify runtime read/write.

**Step 2: Create Podman sandbox implementation**

```ts
// src/sandbox/podman.ts
import { execFileSync, spawn } from 'child_process'
import type { Sandbox, SandboxConfig, SandboxHandle } from './types.js'

export class PodmanSandbox implements Sandbox {
  async pull(image: string): Promise<void> {
    execFileSync('podman', ['pull', image], { stdio: 'inherit' })
  }

  buildContainerOptions(config: SandboxConfig): Record<string, any> {
    return config
  }

  async start(config: SandboxConfig): Promise<SandboxHandle> {
    const args = [
      'run', '--detach',
      '--rm',
      '-v', `${config.repoPath}:/host-repo:ro`,
      '-v', `${config.runDir}:/minion-run`,
      '--network', config.network,
      '--memory', config.memory,
      '--cpus', String(config.cpus),
      config.image
    ]
    const containerId = execFileSync('podman', args, { encoding: 'utf-8' }).trim()
    return {
      containerId,
      async *logs() {
        const proc = spawn('podman', ['logs', '-f', containerId])
        for await (const chunk of proc.stdout) {
          yield chunk.toString('utf-8')
        }
      },
      async wait() {
        const exitCode = Number(execFileSync('podman', ['wait', containerId], { encoding: 'utf-8' }).trim())
        return { exitCode }
      },
      async stop() {
        try { execFileSync('podman', ['stop', containerId]) } catch {}
      }
    }
  }
}
```

**Step 3: Add sandbox factory**

```ts
// src/sandbox/factory.ts
import { DockerSandbox } from './docker.js'
import { PodmanSandbox } from './podman.js'
import type { Sandbox } from './types.js'

export function createSandbox(runtime: 'docker' | 'podman', minionHome: string): Sandbox {
  return runtime === 'podman' ? new PodmanSandbox() : new DockerSandbox(minionHome)
}
```

**Step 4: Wire runtime into CLI**

Update `src/cli/index.ts` to read runtime from config and use `createSandbox`.

**Step 5: Update host-agent types to accept Sandbox interface**

Replace `DockerSandbox` types with `Sandbox` in:
- `src/host-agent/types.ts`
- `src/host-agent/tools/container-tools.ts`
- `src/host-agent/tools/container-tools.test.ts`

**Step 6: Run focused tests**

Run: `npx vitest --run src/host-agent/config.test.ts src/host-agent/tools/container-tools.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/sandbox/podman.ts src/sandbox/factory.ts src/sandbox/types.ts src/host-agent/types.ts src/host-agent/tools/container-tools.ts src/host-agent/tools/container-tools.test.ts src/host-agent/config.ts src/host-agent/config.test.ts src/config/index.ts src/cli/index.ts
git commit -m "feat(sandbox): add podman runtime and sandbox factory"
```

---

**Plan complete and saved to `docs/plans/2026-03-04-single-agent-sandbox-implementation-plan.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
