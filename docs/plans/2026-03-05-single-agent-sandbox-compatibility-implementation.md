# Single Agent README Compatibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement README instruction compatibility for the single-agent rootless sandbox design with three native host tools (`docker`, `git`, `tar`), a shared policy engine, and host-side-only delivery.

**Architecture:** Build a host-side strategy parser (keywords + `KEY=VALUE` env passthrough), then route all host actions through three shell-style tools guarded by one shared policy engine (allowlist + denylist + arg/path checks). Use `docker` as the single container tool surface with internal backend selection (`podman` first, `docker` second). Keep container execution unrestricted via `exec ... bash -lc`, but enforce delivery generation/apply on host only.

**Tech Stack:** TypeScript, Vitest, Dockerode/Podman runtime adapter, existing HostAgent + Sandbox agent pipeline

---

### Task 1: Add strategy and prompt-env parsing primitives

**Files:**
- Create: `src/host-agent/strategy-parser.ts`
- Create: `test/strategy-parser.test.ts`
- Modify: `src/types/shared.ts`

**Step 1: Write the failing tests**

```ts
// test/strategy-parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseExecutionStrategy, extractPromptEnvPairs } from '../src/host-agent/strategy-parser.js'

describe('strategy parser', () => {
  it('parses preserve/retry/parallel/auto-apply keywords', () => {
    const s = parseExecutionStrategy('retry if failed, run 3 times in parallel, auto-apply patches, preserve container')
    expect(s.preserveOnFailure).toBe(true)
    expect(s.retryEnabled).toBe(true)
    expect(s.parallelRuns).toBe(3)
    expect(s.autoApply).toBe(true)
  })

  it('parses resource hints', () => {
    const s = parseExecutionStrategy('use 8g memory and 4 cores')
    expect(s.memory).toBe('8g')
    expect(s.cpus).toBe(4)
  })

  it('extracts arbitrary env assignments from prompt', () => {
    const envs = extractPromptEnvPairs('set JAVA_HOME=/opt/jdk and TZ=Asia/Shanghai')
    expect(envs.JAVA_HOME).toBe('/opt/jdk')
    expect(envs.TZ).toBe('Asia/Shanghai')
  })

  it('uses last-write-wins for duplicated env key', () => {
    const envs = extractPromptEnvPairs('TZ=UTC TZ=Asia/Shanghai')
    expect(envs.TZ).toBe('Asia/Shanghai')
  })
})
```

**Step 2: Run tests to verify failure**

Run: `npx vitest --run test/strategy-parser.test.ts`
Expected: FAIL with module-not-found

**Step 3: Implement parser module**

```ts
// src/host-agent/strategy-parser.ts
export interface ExecutionStrategy {
  preserveOnFailure: boolean
  snapshotMode?: 'on_failure' | 'always'
  retryEnabled: boolean
  retryMax?: number
  parallelRuns: number
  autoApply: boolean
  memory?: string
  cpus?: number
}

export function parseExecutionStrategy(prompt: string): ExecutionStrategy {
  // Implement keyword + numeric extraction only
}

export function extractPromptEnvPairs(prompt: string): Record<string, string> {
  // Implement KEY=VALUE extraction with last-write-wins
}
```

**Step 4: Extend shared status/context types**

Add fields in `src/types/shared.ts` for:
- effective strategy summary
- forwarded env map
- compatibility observability fields (`parallelRuns`, `retryCount`, `applyMode`, `imageSelection`, `snapshotId`, `snapshotError`)

**Step 5: Re-run tests**

Run: `npx vitest --run test/strategy-parser.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/host-agent/strategy-parser.ts src/types/shared.ts test/strategy-parser.test.ts
git commit -m "feat(host-agent): add strategy and prompt env parsing"
```

---

### Task 2: Implement shared policy engine for native tools

**Files:**
- Create: `src/host-agent/policy-engine.ts`
- Create: `test/policy-engine.test.ts`

**Step 1: Write failing policy tests**

```ts
// test/policy-engine.test.ts
import { describe, it, expect } from 'vitest'
import { validateHostCommand } from '../src/host-agent/policy-engine.js'

describe('policy engine', () => {
  it('allows docker run with safe args', () => {
    const result = validateHostCommand('docker', ['run', '--rm', 'minion-base'])
    expect(result.allowed).toBe(true)
  })

  it('denies dangerous run flags', () => {
    const result = validateHostCommand('docker', ['run', '--privileged', 'minion-base'])
    expect(result.allowed).toBe(false)
    expect(result.deniedReason).toContain('privileged')
  })

  it('allows exec with arbitrary bash payload', () => {
    const result = validateHostCommand('docker', ['exec', '-i', 'cid', 'bash', '-lc', 'apt-get update && npm test'])
    expect(result.allowed).toBe(true)
  })
})
```

**Step 2: Run test to verify failure**

Run: `npx vitest --run test/policy-engine.test.ts`
Expected: FAIL with module-not-found

**Step 3: Implement policy engine**

In `src/host-agent/policy-engine.ts`:
- allowlist for programs: `docker|git|tar`
- allowlist for subcommands
- denylist for high-risk flags
- host path checks
- return shape: `{ allowed: boolean, deniedReason?: string }`

**Step 4: Re-run policy test**

Run: `npx vitest --run test/policy-engine.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/host-agent/policy-engine.ts test/policy-engine.test.ts
git commit -m "feat(host-agent): add shared command policy engine"
```

---

### Task 3: Add three native host tools (shell-style)

**Files:**
- Modify: `src/host-agent/host-agent.ts`
- Create: `src/host-agent/tools/native-tools.ts`
- Create: `test/native-tools.test.ts`

**Step 1: Write failing tests**

```ts
// test/native-tools.test.ts
import { describe, it, expect } from 'vitest'
import { dockerTool, gitTool, tarTool } from '../src/host-agent/tools/native-tools.js'

describe('native tools', () => {
  it('exposes shell-style tool names', () => {
    expect(dockerTool.name).toBe('docker')
    expect(gitTool.name).toBe('git')
    expect(tarTool.name).toBe('tar')
  })
})
```

**Step 2: Run test to verify failure**

Run: `npx vitest --run test/native-tools.test.ts`
Expected: FAIL due to missing module

**Step 3: Implement native tools with shared policy**

In `src/host-agent/tools/native-tools.ts`:
- create `docker`, `git`, `tar` tools with common parameter schema:
  - `args: string[]`
  - `cwd?: string`
  - `env?: Record<string, string>`
  - `timeoutMs?: number`
  - `runId?: string`
- each tool validates command through `validateHostCommand(...)`
- run command with `execFile` and return `{ exitCode, stdout, stderr, deniedReason? }`

In `src/host-agent/host-agent.ts`:
- register only these three host tools
- remove single-entry wrapper assumptions

**Step 4: Re-run tests**

Run: `npx vitest --run test/native-tools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/host-agent/tools/native-tools.ts src/host-agent/host-agent.ts test/native-tools.test.ts
git commit -m "feat(host-agent): add three native shell-style host tools"
```

---

### Task 4: Wire runtime/env forwarding and docker backend fallback

**Files:**
- Modify: `src/host-agent/tools/native-tools.ts`
- Modify: `src/host-agent/host-agent.ts`
- Create: `test/host-agent-runtime-env.test.ts`

**Step 1: Write failing runtime/env test**

In `test/host-agent-runtime-env.test.ts`, assert:
- prompt env pairs are passed to sandbox runtime env
- strategy-derived env is present
- `docker` tool podman backend failure triggers docker backend fallback

**Step 2: Run targeted test**

Run: `npx vitest --run test/host-agent-runtime-env.test.ts`
Expected: FAIL on new assertions

**Step 3: Implement env forwarding path**

- Keep tool surface as `docker`.
- In `src/host-agent/tools/native-tools.ts`, implement backend resolver:
1. try `podman` binary first
2. fallback to `docker` binary
- Forward merged env into container runtime call.
- In `src/host-agent/host-agent.ts`, parse and merge envs by precedence:
1. CLI explicit
2. prompt `KEY=VALUE`
3. strategy-derived env
4. defaults

**Step 4: Re-run targeted test**

Run: `npx vitest --run test/host-agent-runtime-env.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/host-agent/tools/native-tools.ts src/host-agent/host-agent.ts test/host-agent-runtime-env.test.ts
git commit -m "feat(runtime): add docker backend resolver and env forwarding"
```

---

### Task 5: Enforce host-side-only delivery

**Files:**
- Modify: `src/host-agent/host-agent.ts`
- Modify: `src/host-agent/patch-applier.ts`
- Create: `test/host-side-delivery.test.ts`

**Step 1: Write failing delivery tests**

```ts
// test/host-side-delivery.test.ts
import { describe, it, expect } from 'vitest'

describe('host-side-only delivery', () => {
  it('generates and applies delivery on host for git repos', () => {
    // verify host runs git packaging/apply path
  })

  it('uses host tar packaging/apply path for non-git dirs', () => {
    // verify non-git delivery path
  })
})
```

**Step 2: Run test to verify failure**

Run: `npx vitest --run test/host-side-delivery.test.ts`
Expected: FAIL

**Step 3: Implement host-side delivery flow**

- Ensure container flow only produces verified workspace changes.
- Host performs final packaging and apply:
  - git mode: host `git format-patch` and `git am/apply`
  - non-git mode: host `tar` package/apply
- Remove container-side delivery authority assumptions.

**Step 4: Re-run test**

Run: `npx vitest --run test/host-side-delivery.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/host-agent/host-agent.ts src/host-agent/patch-applier.ts test/host-side-delivery.test.ts
git commit -m "feat(delivery): enforce host-side-only delivery flow"
```

---

### Task 6: Add compatibility matrix acceptance tests and observability

**Files:**
- Create: `test/readme-compat-matrix.test.ts`
- Create: `test/compat-observability.test.ts`
- Modify: `README.md`
- Modify: `docs/plans/2026-03-04-single-agent-sandbox-design.md`

**Step 1: Write matrix-driven failing tests**

Create `test/readme-compat-matrix.test.ts` with one test per matrix row:
- preserve keyword path
- snapshot keyword path
- parallel keyword path
- retry keyword path
- auto-apply keyword path
- resource hint path
- `MINION_AI_MODE=true` pass-through path
- image analysis selection path
- arbitrary prompt env pass-through path
- in-container unrestricted exec path
- host-side-only delivery path

**Step 2: Run test to confirm failure**

Run: `npx vitest --run test/readme-compat-matrix.test.ts test/compat-observability.test.ts`
Expected: FAIL

**Step 3: Implement missing behavior and docs alignment**

- Fill any missing parser/runtime behavior surfaced by Task 1-4 tests.
- Update README examples if behavior tokens differ.
- Keep design matrix and behavior in sync.

**Step 4: Re-run matrix test**

Run: `npx vitest --run test/readme-compat-matrix.test.ts test/compat-observability.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add test/readme-compat-matrix.test.ts test/compat-observability.test.ts README.md docs/plans/2026-03-04-single-agent-sandbox-design.md
git commit -m "test(compat): enforce README instruction compatibility matrix"
```

---

### Task 7: Final verification before completion

**Files:**
- Modify: `docs/plans/2026-03-05-single-agent-sandbox-compatibility-implementation.md` (optional checkboxes/log only)

**Step 1: Run targeted suite**

Run: `npx vitest --run test/strategy-parser.test.ts test/policy-engine.test.ts test/native-tools.test.ts test/host-agent-runtime-env.test.ts test/host-side-delivery.test.ts test/compat-observability.test.ts test/readme-compat-matrix.test.ts`
Expected: PASS

**Step 2: Run project validation**

Run: `npm run lint`
Expected: PASS

Run: `npm run build`
Expected: PASS

**Step 3: Optional full test**

Run: `npm test`
Expected: PASS or document unrelated failures

**Step 4: Final commit (if verification fixes were required)**

```bash
git add <files changed by verification fixes>
git commit -m "chore: finalize README compatibility implementation"
```

---

**Implementation notes**

- Keep changes DRY and minimal. Do not hardwire PR workflow into system prompt.
- Keep parser and policy engine deterministic and test-first (`@superpowers/test-driven-development`).
- Do not claim completion until commands pass with evidence (`@superpowers/verification-before-completion`).

**Plan complete and saved to `docs/plans/2026-03-05-single-agent-sandbox-compatibility-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
