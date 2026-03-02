# AI Orchestrator Host Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Minions Host Agent from a script executor into an AI-powered orchestrator that understands natural language and manages complex container lifecycles.

**Architecture:** Refactor existing host agent into a three-layer architecture: (1) Task Parser extracts strategy from prompts, (2) AI Orchestrator makes decisions using LLM and tools, (3) Tool Layer encapsulates container/patch operations. Maintain backward compatibility by detecting AI mode from prompt keywords.

**Tech Stack:** TypeScript, pi-ai (LLM), Docker SDK, existing minions infrastructure

---

## Phase 1: Foundation (Tool Layer & Data Models)

### Task 1: Create ExecutionStrategy Type

**Files:**
- Create: `src/types/strategy.ts`
- Test: `src/types/strategy.test.ts`

**Step 1: Write the failing test**

```typescript
// src/types/strategy.test.ts
import { ExecutionStrategy, getDefaultStrategy } from './strategy'

describe('ExecutionStrategy', () => {
  it('should provide default strategy', () => {
    const strategy = getDefaultStrategy()
    expect(strategy.preserveOnFailure).toBe(false)
    expect(strategy.patchStrategy).toBe('ask')
    expect(strategy.parallelRuns).toBe(1)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- strategy.test.ts`
Expected: FAIL with "Cannot find module './strategy'"

**Step 3: Write minimal implementation**

```typescript
// src/types/strategy.ts
export interface ExecutionStrategy {
  // Container management
  preserveOnFailure: boolean
  preserveOnSuccess: boolean
  snapshotAfter: boolean
  customImage?: string

  // Parallel execution
  parallelRuns: number
  pickBest: boolean

  // Patch strategy
  patchStrategy: 'auto' | 'manual' | 'ask'

  // Resource configuration
  memory: string
  cpus: number
  timeout: number

  // Retry strategy
  retryOnFailure: boolean
  maxRetries: number

  // Other
  verbose: boolean
  dryRun: boolean
}

export function getDefaultStrategy(): ExecutionStrategy {
  return {
    preserveOnFailure: false,
    preserveOnSuccess: false,
    snapshotAfter: false,
    parallelRuns: 1,
    pickBest: false,
    patchStrategy: 'ask',
    memory: '4g',
    cpus: 2,
    timeout: 30,
    retryOnFailure: false,
    maxRetries: 3,
    verbose: false,
    dryRun: false
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- strategy.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types/strategy.ts src/types/strategy.test.ts
git commit -m "feat: add ExecutionStrategy type and defaults"
```

---

### Task 2: Extend TaskRequest with Strategy

**Files:**
- Modify: `src/types/shared.ts`
- Modify: `src/task/store.ts`
- Test: `src/task/store.test.ts`

**Step 1: Write the failing test**

```typescript
// src/task/store.test.ts (add to existing tests)
import { getDefaultStrategy } from '../types/strategy'

it('should store task with execution strategy', () => {
  const store = new TaskStore(testDbPath)
  const request: TaskRequest = {
    id: 'test-123',
    description: 'test task, preserve on failure',
    parsedTask: 'test task',
    strategy: { ...getDefaultStrategy(), preserveOnFailure: true },
    // ... other fields
  }

  store.create(request)
  const task = store.get('test-123')

  expect(task?.request.strategy?.preserveOnFailure).toBe(true)
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- store.test.ts`
Expected: FAIL with "Property 'strategy' does not exist"

**Step 3: Update TaskRequest interface**

```typescript
// src/types/shared.ts
import { ExecutionStrategy } from './strategy'

export interface TaskRequest {
  id: string
  description: string
  parsedTask?: string              // NEW: extracted task
  strategy?: ExecutionStrategy     // NEW: execution strategy
  repo: string
  repoType: 'local' | 'remote'
  branch: string
  baseBranch: string
  image?: string
  fromUrl?: string
  push: boolean
  maxIterations: number
  timeout: number
  created_at: string
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types/shared.ts src/types/strategy.ts src/task/store.test.ts
git commit -m "feat: extend TaskRequest with ExecutionStrategy"
```

---

### Task 3: Create ContainerRegistry

**Files:**
- Create: `src/container/registry.ts`
- Test: `src/container/registry.test.ts`

**Step 1: Write the failing test**

```typescript
// src/container/registry.test.ts
import { ContainerRegistry } from './registry'

describe('ContainerRegistry', () => {
  let registry: ContainerRegistry

  beforeEach(() => {
    registry = new ContainerRegistry()
  })

  it('should register and retrieve container', () => {
    const container = {
      id: 'container-123',
      taskId: 'task-456',
      status: 'running' as const,
      metadata: { attempt: 1 }
    }

    registry.register(container)
    const retrieved = registry.get('container-123')

    expect(retrieved?.id).toBe('container-123')
    expect(retrieved?.taskId).toBe('task-456')
  })

  it('should find containers by task', () => {
    registry.register({ id: 'c1', taskId: 't1', status: 'running', metadata: {} })
    registry.register({ id: 'c2', taskId: 't1', status: 'done', metadata: {} })
    registry.register({ id: 'c3', taskId: 't2', status: 'running', metadata: {} })

    const containers = registry.findByTask('t1')
    expect(containers).toHaveLength(2)
  })

  it('should find preserved containers', () => {
    registry.register({
      id: 'c1',
      taskId: 't1',
      status: 'preserved',
      metadata: { preserveReason: 'user requested' }
    })
    registry.register({ id: 'c2', taskId: 't2', status: 'done', metadata: {} })

    const preserved = registry.findPreserved()
    expect(preserved).toHaveLength(1)
    expect(preserved[0].id).toBe('c1')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- registry.test.ts`
Expected: FAIL with "Cannot find module './registry'"

**Step 3: Write minimal implementation**

```typescript
// src/container/registry.ts
export interface ContainerHandle {
  id: string
  taskId: string
  status: 'running' | 'done' | 'failed' | 'preserved'
  metadata: {
    attempt?: number
    parallelIndex?: number
    preserveReason?: string
    snapshotId?: string
  }
}

export class ContainerRegistry {
  private containers = new Map<string, ContainerHandle>()

  register(container: ContainerHandle): void {
    this.containers.set(container.id, container)
  }

  unregister(containerId: string): void {
    this.containers.delete(containerId)
  }

  get(containerId: string): ContainerHandle | null {
    return this.containers.get(containerId) || null
  }

  list(): ContainerHandle[] {
    return Array.from(this.containers.values())
  }

  findByTask(taskId: string): ContainerHandle[] {
    return this.list().filter(c => c.taskId === taskId)
  }

  findPreserved(): ContainerHandle[] {
    return this.list().filter(c => c.status === 'preserved')
  }

  findOlderThan(hours: number): ContainerHandle[] {
    // TODO: implement when we add timestamps
    return []
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- registry.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/container/registry.ts src/container/registry.test.ts
git commit -m "feat: add ContainerRegistry for tracking containers"
```

---

### Task 4: Create Container Management Tools

**Files:**
- Create: `src/tools/container-tools.ts`
- Test: `src/tools/container-tools.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/container-tools.test.ts
import { ContainerManagementTools } from './container-tools'
import { ContainerRegistry } from '../container/registry'

describe('ContainerManagementTools', () => {
  let tools: ContainerManagementTools
  let registry: ContainerRegistry

  beforeEach(() => {
    registry = new ContainerRegistry()
    tools = new ContainerManagementTools(mockSandbox, registry)
  })

  it('should start container and register it', async () => {
    const handle = await tools.start_container({
      image: 'minion-base',
      memory: '4g',
      cpus: 2
    })

    expect(handle.id).toBeDefined()
    expect(registry.get(handle.id)).toBeTruthy()
  })

  it('should preserve container with reason', async () => {
    const handle = await tools.start_container({ image: 'minion-base' })
    await tools.preserve_container(handle.id, 'test failure')

    const container = registry.get(handle.id)
    expect(container?.status).toBe('preserved')
    expect(container?.metadata.preserveReason).toBe('test failure')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- container-tools.test.ts`
Expected: FAIL with "Cannot find module './container-tools'"

**Step 3: Write minimal implementation**

```typescript
// src/tools/container-tools.ts
import type { Sandbox } from '../sandbox/types'
import { ContainerRegistry, ContainerHandle } from '../container/registry'

export interface ContainerConfig {
  image: string
  memory?: string
  cpus?: number
  env?: Record<string, string>
}

export class ContainerManagementTools {
  constructor(
    private sandbox: Sandbox,
    private registry: ContainerRegistry
  ) {}

  async start_container(config: ContainerConfig): Promise<ContainerHandle> {
    const handle = await this.sandbox.start({
      image: config.image,
      memory: config.memory || '4g',
      cpus: config.cpus || 2,
      // ... other config
    })

    const container: ContainerHandle = {
      id: handle.containerId,
      taskId: '', // Will be set by orchestrator
      status: 'running',
      metadata: {}
    }

    this.registry.register(container)
    return container
  }

  async stop_container(containerId: string): Promise<void> {
    // Stop via sandbox
    // Update registry
    const container = this.registry.get(containerId)
    if (container) {
      container.status = 'done'
      this.registry.register(container)
    }
  }

  async preserve_container(containerId: string, reason: string): Promise<void> {
    const container = this.registry.get(containerId)
    if (container) {
      container.status = 'preserved'
      container.metadata.preserveReason = reason
      this.registry.register(container)
    }
  }

  list_containers(): ContainerHandle[] {
    return this.registry.list()
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- container-tools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/container-tools.ts src/tools/container-tools.test.ts
git commit -m "feat: add ContainerManagementTools"
```

---

## Phase 2: Prompt Parsing & Strategy Extraction

### Task 5: Create Prompt Parser

**Files:**
- Create: `src/parser/prompt-parser.ts`
- Test: `src/parser/prompt-parser.test.ts`

**Step 1: Write the failing test**

```typescript
// src/parser/prompt-parser.test.ts
import { PromptParser } from './prompt-parser'
import { getDefaultStrategy } from '../types/strategy'

describe('PromptParser', () => {
  let parser: PromptParser

  beforeEach(() => {
    parser = new PromptParser(mockLLM)
  })

  it('should extract preserve on failure', async () => {
    const result = await parser.parse(
      'create hello.py, preserve container if failed'
    )

    expect(result.parsedTask).toContain('create hello.py')
    expect(result.strategy.preserveOnFailure).toBe(true)
  })

  it('should extract parallel runs', async () => {
    const result = await parser.parse(
      'try this task 3 times in parallel'
    )

    expect(result.strategy.parallelRuns).toBe(3)
    expect(result.strategy.pickBest).toBe(true)
  })

  it('should extract patch strategy', async () => {
    const result = await parser.parse(
      'create hello.py, auto-apply patches'
    )

    expect(result.strategy.patchStrategy).toBe('auto')
  })

  it('should use defaults when no strategy specified', async () => {
    const result = await parser.parse('create hello.py')

    expect(result.strategy).toEqual(getDefaultStrategy())
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- prompt-parser.test.ts`
Expected: FAIL with "Cannot find module './prompt-parser'"

**Step 3: Write minimal implementation**

```typescript
// src/parser/prompt-parser.ts
import type { LLMAdapter } from '../llm/types'
import { ExecutionStrategy, getDefaultStrategy } from '../types/strategy'

export interface ParsedPrompt {
  parsedTask: string
  strategy: ExecutionStrategy
}

const PARSER_SYSTEM_PROMPT = `
Parse user prompt and extract:
1. Task description (what to build/fix)
2. Execution strategy (how to execute)

Return JSON:
{
  "task": "create hello.py...",
  "strategy": {
    "preserveOnFailure": true,
    "patchStrategy": "auto",
    ...
  }
}

Strategy keywords:
- "preserve container" / "keep container" / "保留容器" → preserveOnFailure: true
- "auto-apply patches" / "自动应用" → patchStrategy: "auto"
- "N times in parallel" / "并行N个" → parallelRuns: N, pickBest: true
- "retry" / "重试" → retryOnFailure: true
- "use Xg memory" / "使用Xg内存" → memory: "Xg"

If no strategy keywords found, use defaults.
`

export class PromptParser {
  constructor(private llm: LLMAdapter) {}

  async parse(userPrompt: string): Promise<ParsedPrompt> {
    // Use LLM to parse prompt
    const messages = [
      { role: 'system' as const, content: PARSER_SYSTEM_PROMPT },
      { role: 'user' as const, content: userPrompt }
    ]

    const response = await this.llm.chat(messages, [])

    // Extract JSON from response
    let parsed: any
    try {
      // Find JSON in response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found in response')
      }
    } catch (e) {
      // Fallback: no strategy extraction
      return {
        parsedTask: userPrompt,
        strategy: getDefaultStrategy()
      }
    }

    return {
      parsedTask: parsed.task || userPrompt,
      strategy: {
        ...getDefaultStrategy(),
        ...parsed.strategy
      }
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- prompt-parser.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/parser/prompt-parser.ts src/parser/prompt-parser.test.ts
git commit -m "feat: add PromptParser for strategy extraction"
```

---

## Phase 3: AI Orchestrator Core

### Task 6: Create AIHostAgent Skeleton

**Files:**
- Create: `src/host-agent/ai-host-agent.ts`
- Test: `src/host-agent/ai-host-agent.test.ts`

**Step 1: Write the failing test**

```typescript
// src/host-agent/ai-host-agent.test.ts
import { AIHostAgent } from './ai-host-agent'

describe('AIHostAgent', () => {
  let agent: AIHostAgent

  beforeEach(() => {
    agent = new AIHostAgent({
      llm: mockLLM,
      sandbox: mockSandbox,
      store: mockStore,
      minionHome: '/tmp/test'
    })
  })

  it('should parse prompt and execute task', async () => {
    const result = await agent.run('create hello.py')

    expect(result.status).toBe('completed')
  })

  it('should preserve container on failure when requested', async () => {
    const result = await agent.run(
      'create invalid code, preserve container if failed'
    )

    expect(result.containers[0].preserved).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- ai-host-agent.test.ts`
Expected: FAIL with "Cannot find module './ai-host-agent'"

**Step 3: Write minimal implementation**

```typescript
// src/host-agent/ai-host-agent.ts
import type { LLMAdapter } from '../llm/types'
import type { Sandbox } from '../sandbox/types'
import { TaskStore } from '../task/store'
import { PromptParser } from '../parser/prompt-parser'
import { ContainerRegistry } from '../container/registry'
import { ContainerManagementTools } from '../tools/container-tools'
import type { TaskResult } from '../types/shared'

export interface AIHostAgentOptions {
  llm: LLMAdapter
  sandbox: Sandbox
  store: TaskStore
  minionHome: string
}

export class AIHostAgent {
  private parser: PromptParser
  private registry: ContainerRegistry
  private containerTools: ContainerManagementTools

  constructor(private options: AIHostAgentOptions) {
    this.parser = new PromptParser(options.llm)
    this.registry = new ContainerRegistry()
    this.containerTools = new ContainerManagementTools(
      options.sandbox,
      this.registry
    )
  }

  async run(userPrompt: string): Promise<TaskResult> {
    // 1. Parse prompt
    const { parsedTask, strategy } = await this.parser.parse(userPrompt)

    // 2. Create task request
    const taskId = this.generateTaskId()
    const request = {
      id: taskId,
      description: userPrompt,
      parsedTask,
      strategy,
      repo: process.cwd(),
      repoType: 'local' as const,
      branch: `minion/${taskId}`,
      baseBranch: 'main',
      push: false,
      maxIterations: 50,
      timeout: strategy.timeout,
      created_at: new Date().toISOString()
    }

    this.options.store.create(request)

    // 3. Execute (simplified for now)
    try {
      const container = await this.containerTools.start_container({
        image: strategy.customImage || 'minion-base',
        memory: strategy.memory,
        cpus: strategy.cpus
      })

      // TODO: Wait for container, handle results

      return {
        taskId,
        status: 'completed',
        containers: [],
        patches: { applied: 0, failed: 0, conflicts: [] },
        changes: { branch: request.branch, commits: 0, filesChanged: [] },
        stats: { duration: 0, llmCalls: 0, tokensUsed: 0, retries: 0 },
        journal: '',
        summary: ''
      }
    } catch (error: any) {
      if (strategy.preserveOnFailure) {
        // Preserve container logic
      }

      return {
        taskId,
        status: 'failed',
        containers: [],
        patches: { applied: 0, failed: 0, conflicts: [] },
        changes: { branch: request.branch, commits: 0, filesChanged: [] },
        stats: { duration: 0, llmCalls: 0, tokensUsed: 0, retries: 0 },
        journal: '',
        summary: '',
        error: error.message
      }
    }
  }

  private generateTaskId(): string {
    return Math.random().toString(36).substring(2, 15)
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- ai-host-agent.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/host-agent/ai-host-agent.ts src/host-agent/ai-host-agent.test.ts
git commit -m "feat: add AIHostAgent skeleton"
```

---

## Phase 4: CLI Integration

### Task 7: Add AI Mode Detection to CLI

**Files:**
- Modify: `src/cli/index.ts`
- Test: Manual testing

**Step 1: Add AI mode detection function**

```typescript
// src/cli/index.ts (add before program.command)
function shouldUseAIMode(description: string): boolean {
  const aiKeywords = [
    'preserve', 'snapshot', 'parallel', 'retry',
    '保留', '快照', '并行', '重试',
    'auto-apply', 'auto apply',
    'times in parallel', 'keep container'
  ]

  const lowerDesc = description.toLowerCase()
  const hasAIKeyword = aiKeywords.some(kw => lowerDesc.includes(kw))

  const forceAI = process.env.MINION_AI_MODE === 'true'

  return hasAIKeyword || forceAI
}
```

**Step 2: Modify run command to use AI mode**

```typescript
// src/cli/index.ts (modify existing .action)
.action(async (descParts: string[], opts) => {
  const description = descParts.join(' ')
  const minionHome = join(homedir(), '.minion')
  const config = loadConfig()
  const minionConfig = new MinionsConfig(process.cwd(), minionHome)
  const llm = createLLMAdapter(config.llm)
  const sandbox = new DockerSandbox(minionHome)
  const store = new TaskStore(join(minionHome, 'tasks.json'))

  // Check if AI mode should be used
  const useAI = shouldUseAIMode(description)

  if (useAI) {
    // New path: AI Orchestrator
    const { AIHostAgent } = await import('../host-agent/ai-host-agent.js')
    const aiAgent = new AIHostAgent({ llm, sandbox, store, minionHome })

    console.log('[AI Mode] Using AI Orchestrator')
    const result = await aiAgent.run(description)

    if (result.status === 'completed') {
      console.log(`✓ Task completed: ${result.summary}`)
    } else {
      console.error(`✗ Task failed: ${result.error}`)
      process.exit(1)
    }
  } else {
    // Old path: Legacy agent (keep existing code)
    const agent = new HostAgent({ llm, sandbox, store, minionHome, config: minionConfig })
    // ... existing code ...
  }
})
```

**Step 3: Test manually**

Run: `minion run "create hello.py, preserve container if failed"`
Expected: See "[AI Mode] Using AI Orchestrator" message

Run: `minion run "create hello.py"`
Expected: Use legacy path (no AI mode message)

**Step 4: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: add AI mode detection to CLI"
```

---

## Summary

This implementation plan covers Phase 1 (Foundation) and the beginning of Phase 2-4. The plan follows TDD principles with:

- ✅ Failing tests first
- ✅ Minimal implementation
- ✅ Verification steps
- ✅ Frequent commits
- ✅ Exact file paths and code

**Remaining work** (to be planned in follow-up):
- Complete Phase 2: Full orchestration logic
- Phase 3: Patch tools, parallel execution, snapshots
- Phase 4: Error handling, UX polish

**Testing strategy:**
- Unit tests for each component
- Integration tests for end-to-end flows
- Manual testing for CLI integration

**Next steps:**
1. Execute this plan task-by-task
2. Create follow-up plan for remaining phases
3. Add integration tests after core functionality works
