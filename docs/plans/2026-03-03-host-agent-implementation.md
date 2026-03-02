# Host Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform AIHostAgent into a true AI Agent using pi-agent-core with comprehensive tool set for autonomous task orchestration.

**Architecture:** Replace PromptParser + fixed workflow with pi-agent-core Agent that has 12+ tools and system prompt with few-shot examples. Agent autonomously decides which tools to call based on natural language instructions.

**Tech Stack:** pi-agent-core, pi-ai, TypeScript, Docker, Git

---

## Phase 1: Create HostAgent Framework

### Task 1: Create HostAgent types file

**Files:**
- Create: `src/host-agent/types.ts`

**Step 1: Create types file with interfaces**

```typescript
export interface HostAgentOptions {
  llm: LLMAdapter
  sandbox: DockerSandbox
  registry: ContainerRegistry
  store: TaskStore
  minionHome: string
}

export interface TaskResult {
  taskId: string
  status: 'completed' | 'failed' | 'partial'
  containers: Array<{ id: string; preserved?: boolean }>
  patches: { applied: number; failed: number; conflicts: string[] }
  changes: { branch: string; commits: number; filesChanged: string[] }
  stats: { duration: number; llmCalls: number; tokensUsed: number }
  journal: string
  summary: string
  error?: string
}
```

**Step 2: Commit**

```bash
git add src/host-agent/types.ts
git commit -m "feat(host-agent): add HostAgent types"
```

### Task 2: Create system prompt file

**Files:**
- Create: `src/host-agent/prompts.ts`

**Step 1: Create prompts file with system prompt**

```typescript
export function buildHostAgentSystemPrompt(): string {
  return `# Role
You are the Minions Host Agent, responsible for orchestrating coding tasks.

# Tools Available
- analyze_project: Analyze project structure and tech stack
- start_container: Start Docker container to execute task
- get_container_status: Check container execution status
- get_container_logs: Get container logs
- get_container_journal: Get sandbox agent's execution journal
- get_container_artifacts: Get all artifacts (journal, status, patches)
- preserve_container: Preserve container for debugging
- create_branch: Create git branch
- push_changes: Push changes to remote
- list_patches: List patches from container
- apply_patches: Apply patches to local repo
- resolve_conflicts: Resolve merge conflicts
- create_pr: Create pull request
- update_task_status: Update task status

# Decision Rules
- **When to analyze_project**: Task involves "select image", "analyze project", or tech stack uncertain
- **When to preserve_container**: User explicitly requests OR task fails and debugging needed
- **When to create_pr**: User explicitly requests OR task description includes "create PR"
- **Always read journal first**: After container completes, read journal before any decisions

# Workflow Pattern
1. Understand user instructions, identify key requirements
2. If needed, analyze_project first
3. create_branch
4. start_container (select image based on analysis)
5. After completion, **MUST read get_container_journal first**
6. Decide next steps based on journal content
7. Handle results (apply_patches / preserve_container)
8. Report to user (based on journal content)

# Examples

## Example 1: Simple Bug Fix

User: "修复 login.ts 中的类型错误"

Agent reasoning: Simple fix, no need to analyze

Tool calls:
1. create_branch(branchName="fix/login-type-error")
2. start_container(image="minion-base", taskDescription="修复 login.ts 中的类型错误")
3. get_container_status(containerId="xxx") → {status: "completed", exitCode: 0}
4. get_container_journal(containerId="xxx") → "Fixed type error, tests passing"
5. list_patches(containerId="xxx") → ["0001-fix-login-type-error.patch"]
6. apply_patches(patches=["0001-fix-login-type-error.patch"]) → {applied: 1, failed: 0}
7. push_changes(branch="fix/login-type-error")

Response: "✓ 成功修复类型错误，已推送到分支 fix/login-type-error"

## Example 2: Task Failure with Preservation

User: "添加用户认证功能，如果失败保留容器"

Agent reasoning: Complex task, user requests preservation on failure

Tool calls:
1. analyze_project(path=".") → {techStack: ["Node.js", "Express"], hasTests: true}
2. create_branch(branchName="feat/user-auth")
3. start_container(image="minion-base", taskDescription="添加用户认证功能")
4. get_container_status(containerId="xxx") → {status: "failed", exitCode: 1}
5. get_container_journal(containerId="xxx") → "Tests failed: auth middleware edge cases"
6. preserve_container(containerId="xxx", reason="测试失败，保留用于调试")

Response: "✗ 任务失败。原因：认证中间件未处理边缘情况。容器已保留（ID: xxx）"

## Example 3: Complex Orchestration

User: "分析项目，选择合适的镜像，修复所有 lint 错误，测试通过后创建 PR"

Agent reasoning: Multi-step, need analysis, create PR on success

Tool calls:
1. analyze_project(path=".") → {techStack: ["Python", "Django"], testFramework: "pytest"}
2. create_branch(branchName="fix/lint-errors")
3. start_container(image="minion-python", taskDescription="修复所有 lint 错误并确保测试通过")
4. get_container_status(containerId="xxx") → {status: "completed", exitCode: 0}
5. get_container_journal(containerId="xxx") → "Fixed 23 lint errors, all tests passing"
6. list_patches(containerId="xxx")
7. apply_patches(patches=[...])
8. push_changes(branch="fix/lint-errors")
9. create_pr(title="Fix: 修复所有 lint 错误", body="修复了 23 个 lint 错误", branch="fix/lint-errors", baseBranch="main")

Response: "✓ 已修复 23 个 lint 错误。PR 已创建：[PR URL]"

# Critical Guidelines
- ALWAYS read journal before making decisions
- ALWAYS preserve container if user explicitly requests it
- ALWAYS explain failures based on journal content
- Tool call order matters: journal → patches → apply
`
}
```

**Step 2: Commit**

```bash
git add src/host-agent/prompts.ts
git commit -m "feat(host-agent): add system prompt with few-shot examples"
```

### Task 3: Create empty HostAgent class

**Files:**
- Create: `src/host-agent/host-agent.ts`

**Step 1: Create HostAgent class skeleton**

```typescript
import { Agent } from '@mariozechner/pi-agent-core'
import { getModel } from '@mariozechner/pi-ai'
import type { HostAgentOptions, TaskResult } from './types.js'
import { buildHostAgentSystemPrompt } from './prompts.js'

export class HostAgent {
  private agent: Agent
  private sandbox: DockerSandbox
  private registry: ContainerRegistry
  private store: TaskStore
  private minionHome: string

  constructor(options: HostAgentOptions) {
    this.sandbox = options.sandbox
    this.registry = options.registry
    this.store = options.store
    this.minionHome = options.minionHome

    // TODO: Create tools
    const tools: any[] = []

    // Build system prompt
    const systemPrompt = buildHostAgentSystemPrompt()

    // Create Agent
    this.agent = new Agent({
      initialState: {
        systemPrompt,
        model: options.llm,
        tools
      }
    })
  }

  async run(userPrompt: string): Promise<TaskResult> {
    const startTime = Date.now()
    const taskId = this.generateTaskId()

    // TODO: Implement agent execution
    await this.agent.prompt(userPrompt)

    return {
      taskId,
      status: 'completed',
      containers: [],
      patches: { applied: 0, failed: 0, conflicts: [] },
      changes: { branch: '', commits: 0, filesChanged: [] },
      stats: { duration: Date.now() - startTime, llmCalls: 0, tokensUsed: 0 },
      journal: '',
      summary: 'Not implemented yet'
    }
  }

  private generateTaskId(): string {
    return Math.random().toString(36).substring(2, 15)
  }
}
```

**Step 2: Commit**

```bash
git add src/host-agent/host-agent.ts
git commit -m "feat(host-agent): create HostAgent class skeleton"
```

## Phase 2: Implement Core Tools

### Task 4: Create container tools directory

**Files:**
- Create: `src/host-agent/tools/container-tools.ts`

**Step 1: Create start_container tool**

```typescript
import type { DockerSandbox } from '../../sandbox/docker.js'
import type { ContainerRegistry } from '../../container/registry.js'

export function createStartContainerTool(
  sandbox: DockerSandbox,
  registry: ContainerRegistry
) {
  return {
    name: 'start_container',
    description: 'Start a Docker container to execute the task',
    parameters: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          description: 'Docker image name (e.g., "minion-base", "minion-python")'
        },
        memory: {
          type: 'string',
          description: 'Memory limit (e.g., "4g", "2g")'
        },
        cpus: {
          type: 'number',
          description: 'Number of CPU cores'
        },
        taskDescription: {
          type: 'string',
          description: 'Task description to pass to sandbox agent'
        }
      },
      required: ['image', 'taskDescription']
    },
    execute: async (args: any) => {
      const config = {
        image: args.image,
        repoPath: process.cwd(),
        runDir: `/tmp/minion-run-${Date.now()}`,
        memory: args.memory || '4g',
        cpus: args.cpus || 2,
        env: {
          TASK_DESCRIPTION: args.taskDescription
        }
      }

      const handle = await sandbox.start(config)

      registry.register({
        id: handle.containerId,
        taskId: '',
        status: 'running',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {}
      })

      return {
        containerId: handle.containerId,
        status: 'running'
      }
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/host-agent/tools/container-tools.ts
git commit -m "feat(host-agent): add start_container tool"
```

### Task 5: Add get_container_status tool

**Files:**
- Modify: `src/host-agent/tools/container-tools.ts`

**Step 1: Add get_container_status tool**

```typescript
export function createGetContainerStatusTool(
  sandbox: DockerSandbox,
  registry: ContainerRegistry
) {
  return {
    name: 'get_container_status',
    description: 'Check container execution status',
    parameters: {
      type: 'object',
      properties: {
        containerId: {
          type: 'string',
          description: 'Container ID'
        }
      },
      required: ['containerId']
    },
    execute: async (args: any) => {
      const container = registry.get(args.containerId)
      if (!container) {
        throw new Error(`Container ${args.containerId} not found`)
      }

      // TODO: Check actual container status from Docker
      // For now, return registry status
      return {
        status: container.status,
        exitCode: container.metadata.exitCode
      }
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/host-agent/tools/container-tools.ts
git commit -m "feat(host-agent): add get_container_status tool"
```

### Task 6: Add get_container_journal tool

**Files:**
- Modify: `src/host-agent/tools/container-tools.ts`

**Step 1: Add get_container_journal tool**

```typescript
import { readFileSync } from 'fs'
import { join } from 'path'

export function createGetContainerJournalTool(
  sandbox: DockerSandbox,
  registry: ContainerRegistry
) {
  return {
    name: 'get_container_journal',
    description: 'Get the journal (execution log) from sandbox agent. CRITICAL: Always read this after container completes to understand what happened.',
    parameters: {
      type: 'object',
      properties: {
        containerId: {
          type: 'string',
          description: 'Container ID'
        }
      },
      required: ['containerId']
    },
    execute: async (args: any) => {
      const container = registry.get(args.containerId)
      if (!container) {
        throw new Error(`Container ${args.containerId} not found`)
      }

      // Read journal from container's run directory
      const runDir = container.metadata.runDir
      if (!runDir) {
        throw new Error('Container run directory not found')
      }

      try {
        const journalPath = join(runDir, 'journal.md')
        const journal = readFileSync(journalPath, 'utf-8')
        return { journal }
      } catch (error: any) {
        return { journal: `Error reading journal: ${error.message}` }
      }
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/host-agent/tools/container-tools.ts
git commit -m "feat(host-agent): add get_container_journal tool"
```

### Task 7: Add list_patches and apply_patches tools

**Files:**
- Create: `src/host-agent/tools/patch-tools.ts`

**Step 1: Create patch tools**

```typescript
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

export function createListPatchesTool(registry: ContainerRegistry) {
  return {
    name: 'list_patches',
    description: 'List patches generated by container',
    parameters: {
      type: 'object',
      properties: {
        containerId: {
          type: 'string',
          description: 'Container ID'
        }
      },
      required: ['containerId']
    },
    execute: async (args: any) => {
      const container = registry.get(args.containerId)
      if (!container) {
        throw new Error(`Container ${args.containerId} not found`)
      }

      const runDir = container.metadata.runDir
      const patchesDir = join(runDir, 'patches')

      try {
        const files = readdirSync(patchesDir)
        const patches = files
          .filter(f => f.endsWith('.patch'))
          .map(f => join(patchesDir, f))
        return { patches }
      } catch (error: any) {
        return { patches: [] }
      }
    }
  }
}

export function createApplyPatchesTool() {
  return {
    name: 'apply_patches',
    description: 'Apply patches to local repository',
    parameters: {
      type: 'object',
      properties: {
        patches: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of patch file paths'
        }
      },
      required: ['patches']
    },
    execute: async (args: any) => {
      let applied = 0
      let failed = 0
      const conflicts: string[] = []

      for (const patch of args.patches) {
        try {
          execSync(`git am ${patch}`, { stdio: 'pipe' })
          applied++
        } catch (error: any) {
          failed++
          if (error.message.includes('conflict')) {
            conflicts.push(patch)
          }
        }
      }

      return { applied, failed, conflicts }
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/host-agent/tools/patch-tools.ts
git commit -m "feat(host-agent): add patch tools (list and apply)"
```

### Task 8: Add git tools

**Files:**
- Create: `src/host-agent/tools/git-tools.ts`

**Step 1: Create git tools**

```typescript
import { execSync } from 'child_process'

export function createCreateBranchTool() {
  return {
    name: 'create_branch',
    description: 'Create a new git branch for the task',
    parameters: {
      type: 'object',
      properties: {
        branchName: {
          type: 'string',
          description: 'Branch name (e.g., "fix/login-bug")'
        },
        baseBranch: {
          type: 'string',
          description: 'Base branch (default: "main")'
        }
      },
      required: ['branchName']
    },
    execute: async (args: any) => {
      const baseBranch = args.baseBranch || 'main'

      try {
        execSync(`git checkout ${baseBranch}`, { stdio: 'pipe' })
        execSync(`git checkout -b ${args.branchName}`, { stdio: 'pipe' })
        return { success: true, branch: args.branchName }
      } catch (error: any) {
        throw new Error(`Failed to create branch: ${error.message}`)
      }
    }
  }
}

export function createPushChangesTool() {
  return {
    name: 'push_changes',
    description: 'Push changes to remote repository',
    parameters: {
      type: 'object',
      properties: {
        branch: {
          type: 'string',
          description: 'Branch name to push'
        },
        force: {
          type: 'boolean',
          description: 'Force push (default: false)'
        }
      },
      required: ['branch']
    },
    execute: async (args: any) => {
      const forceFlag = args.force ? '--force' : ''

      try {
        execSync(`git push origin ${args.branch} ${forceFlag}`, { stdio: 'pipe' })
        return { success: true }
      } catch (error: any) {
        throw new Error(`Failed to push: ${error.message}`)
      }
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/host-agent/tools/git-tools.ts
git commit -m "feat(host-agent): add git tools (create branch and push)"
```

### Task 9: Wire tools into HostAgent

**Files:**
- Modify: `src/host-agent/host-agent.ts`

**Step 1: Import and create tools**

```typescript
import { createStartContainerTool, createGetContainerStatusTool, createGetContainerJournalTool } from './tools/container-tools.js'
import { createListPatchesTool, createApplyPatchesTool } from './tools/patch-tools.js'
import { createCreateBranchTool, createPushChangesTool } from './tools/git-tools.js'

// In constructor, replace TODO with:
const tools = [
  createStartContainerTool(this.sandbox, this.registry),
  createGetContainerStatusTool(this.sandbox, this.registry),
  createGetContainerJournalTool(this.sandbox, this.registry),
  createListPatchesTool(this.registry),
  createApplyPatchesTool(),
  createCreateBranchTool(),
  createPushChangesTool()
]
```

**Step 2: Commit**

```bash
git add src/host-agent/host-agent.ts
git commit -m "feat(host-agent): wire tools into HostAgent"
```

## Phase 3: Integrate into CLI

### Task 10: Update CLI to use new HostAgent

**Files:**
- Modify: `src/cli/index.ts`

**Step 1: Remove old imports and add new**

Replace:
```typescript
import { AIHostAgent } from '../host-agent/ai-host-agent.js'
```

With:
```typescript
import { HostAgent } from '../host-agent/host-agent.js'
```

**Step 2: Update run command**

Replace the AIHostAgent usage with:
```typescript
const hostAgent = new HostAgent({
  llm,
  sandbox,
  store,
  registry: new ContainerRegistry(),
  minionHome
})

const result = await hostAgent.run(description)
```

**Step 3: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat(cli): integrate new HostAgent"
```

### Task 11: Remove old code

**Files:**
- Delete: `src/parser/prompt-parser.ts`
- Delete: `src/parser/prompt-parser.test.ts`
- Delete: `src/host-agent/ai-host-agent.ts`
- Delete: `src/host-agent/ai-host-agent.test.ts`
- Delete: `src/types/strategy.ts`
- Delete: `src/types/strategy.test.ts`

**Step 1: Delete old files**

```bash
git rm src/parser/prompt-parser.ts
git rm src/parser/prompt-parser.test.ts
git rm src/host-agent/ai-host-agent.ts
git rm src/host-agent/ai-host-agent.test.ts
git rm src/types/strategy.ts
git rm src/types/strategy.test.ts
```

**Step 2: Commit**

```bash
git commit -m "refactor: remove old PromptParser and AIHostAgent code"
```

## Phase 4: Testing

### Task 12: Create HostAgent unit tests

**Files:**
- Create: `src/host-agent/host-agent.test.ts`

**Step 1: Write basic tests**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HostAgent } from './host-agent.js'

describe('HostAgent', () => {
  let agent: HostAgent
  let mockLLM: any
  let mockSandbox: any
  let mockRegistry: any
  let mockStore: any

  beforeEach(() => {
    mockLLM = { chat: vi.fn() }
    mockSandbox = { start: vi.fn(), stop: vi.fn() }
    mockRegistry = { register: vi.fn(), get: vi.fn(), update: vi.fn() }
    mockStore = { create: vi.fn(), get: vi.fn(), update: vi.fn() }

    agent = new HostAgent({
      llm: mockLLM,
      sandbox: mockSandbox,
      registry: mockRegistry,
      store: mockStore,
      minionHome: '/tmp/minion'
    })
  })

  it('should create HostAgent instance', () => {
    expect(agent).toBeDefined()
  })

  it('should handle simple task', async () => {
    mockSandbox.start.mockResolvedValue({ containerId: 'test123' })

    const result = await agent.run('修复 bug')

    expect(result.taskId).toBeDefined()
    expect(result.status).toBe('completed')
  })
})
```

**Step 2: Run tests**

```bash
npm test src/host-agent/host-agent.test.ts
```

Expected: Tests pass

**Step 3: Commit**

```bash
git add src/host-agent/host-agent.test.ts
git commit -m "test(host-agent): add basic unit tests"
```

### Task 13: Create tool tests

**Files:**
- Create: `src/host-agent/tools/container-tools.test.ts`

**Step 1: Write tool tests**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createStartContainerTool } from './container-tools.js'

describe('Container Tools', () => {
  it('start_container should start container and return ID', async () => {
    const mockSandbox = {
      start: vi.fn().mockResolvedValue({ containerId: 'abc123' })
    }
    const mockRegistry = {
      register: vi.fn()
    }

    const tool = createStartContainerTool(mockSandbox as any, mockRegistry as any)
    const result = await tool.execute({
      image: 'minion-base',
      taskDescription: 'test task'
    })

    expect(result.containerId).toBe('abc123')
    expect(mockRegistry.register).toHaveBeenCalled()
  })
})
```

**Step 2: Run tests**

```bash
npm test src/host-agent/tools/
```

Expected: Tests pass

**Step 3: Commit**

```bash
git add src/host-agent/tools/container-tools.test.ts
git commit -m "test(host-agent): add tool tests"
```

### Task 14: Integration test with example

**Files:**
- Test: `examples/01-hello-world/`

**Step 1: Run example**

```bash
npm run build
minion run "create hello.py that prints 'Hello from Minion!'"
```

Expected: Task completes successfully, hello.py created

**Step 2: Verify output**

```bash
cat hello.py
```

Expected: File contains print statement

**Step 3: Document success**

If test passes, this validates the integration.

## Phase 5: Documentation

### Task 15: Update README

**Files:**
- Modify: `README.md`

**Step 1: Update architecture section**

Update the architecture diagram to show:
- Host Agent uses pi-agent-core
- No more PromptParser
- Tool-based orchestration

**Step 2: Update usage examples**

Add examples showing natural language control:
```markdown
## Advanced Usage

The Host Agent understands natural language instructions:

```bash
# Analyze project and select appropriate image
minion run "分析项目，选择合适的镜像，修复 bug"

# Preserve container on failure
minion run "添加功能，如果失败保留容器用于调试"

# Create PR after success
minion run "修复 lint 错误，测试通过后创建 PR"
```
```

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README with new Host Agent architecture"
```

### Task 16: Create migration guide

**Files:**
- Create: `docs/MIGRATION.md`

**Step 1: Write migration guide**

```markdown
# Migration Guide: Host Agent v2 to v3

## What Changed

- **Removed**: PromptParser, ExecutionStrategy, old AIHostAgent
- **Added**: New HostAgent based on pi-agent-core with tool set
- **Benefit**: True natural language control over execution flow

## For Users

No changes needed! CLI interface remains the same:

```bash
minion run "your task description"
```

But now you have more flexibility:
- Describe complex workflows in natural language
- Agent autonomously decides execution strategy
- Better error handling and reporting

## For Developers

If you extended the old AIHostAgent:
1. Tools are now in `src/host-agent/tools/`
2. Add new tools following the pi-agent-core format
3. Update system prompt in `src/host-agent/prompts.ts`

See design doc: `docs/plans/2026-03-03-host-agent-redesign.md`
```

**Step 2: Commit**

```bash
git add docs/MIGRATION.md
git commit -m "docs: add migration guide for Host Agent v3"
```

---

## Summary

This plan implements the Host Agent redesign in 16 bite-sized tasks:

**Phase 1 (Tasks 1-3)**: Framework setup
**Phase 2 (Tasks 4-9)**: Core tools implementation
**Phase 3 (Tasks 10-11)**: CLI integration and cleanup
**Phase 4 (Tasks 12-14)**: Testing and validation
**Phase 5 (Tasks 15-16)**: Documentation

Each task is 2-5 minutes of focused work. Follow TDD where applicable. Commit frequently.

**Key Principles:**
- DRY: Reuse existing ContainerRegistry, DockerSandbox, TaskStore
- YAGNI: Implement core tools first, advanced tools later
- TDD: Write tests for tools and integration

**Estimated Time:** 7-10 days total
