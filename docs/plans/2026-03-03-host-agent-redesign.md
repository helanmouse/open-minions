# Host Agent Redesign: True AI Orchestrator

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Date:** 2026-03-03

**Goal:** Transform AIHostAgent from a "smart parser + fixed workflow" into a true AI Agent that understands natural language instructions and autonomously orchestrates task execution.

**Architecture:** Host Agent uses pi-agent-core's Agent class with a comprehensive tool set (12+ tools) to handle project analysis, container management, git operations, patch handling, and PR creation. Users can control the entire execution flow using natural language.

**Tech Stack:** pi-agent-core, pi-ai, TypeScript, Docker, Git

---

## Current Problem

### What's Wrong

The current AIHostAgent architecture has a fundamental design flaw:

**Current Flow:**
```
User: "修复 bug，失败时保留容器"
  ↓
PromptParser: 用 LLM 解析 → {task: "修复bug", strategy: {preserveOnFailure: true}}
  ↓
AIHostAgent: 按固定流程执行 (start → wait → apply patches)
```

**Problems:**
1. **Not a true Agent**: Only uses LLM to parse predefined strategy fields
2. **Fixed workflow**: Execution flow is hardcoded, cannot adapt to user instructions
3. **Limited flexibility**: Users cannot use natural language to control the entire process
4. **Inconsistent architecture**: Sandbox Agent uses pi-agent-core (true Agent), but Host Agent doesn't

### What Users Want

Users should be able to say:
- "分析项目，选择合适的镜像，启动容器修复 bug，如果成功就创建 PR"
- "先创建快照，然后尝试修复，如果失败就回滚快照"
- "并行启动 3 个容器，选最快完成的那个"

The AI Agent should **understand these instructions and autonomously orchestrate execution**, not just recognize predefined keywords.

---

## Design Goals

1. **True AI Agent**: Use pi-agent-core's Agent class, same as Sandbox Agent
2. **Natural language control**: Users can describe execution flow in any natural way
3. **Comprehensive tool set**: 12+ tools covering all orchestration needs
4. **Architectural consistency**: Host Agent and Sandbox Agent use the same framework
5. **Flexible and extensible**: Easy to add new tools and capabilities

---

## Architecture Design

### Overall Architecture

```
User Command
  ↓
CLI (src/cli/index.ts)
  ↓
Host Agent (pi-agent-core Agent)
  - System Prompt: Defines role and responsibilities
  - Tool Set: 12+ tools
  - Autonomous Decision: Understands user instructions, orchestrates execution
  ↓
Calls tools to execute tasks
  ├─ Project Analysis Tools
  ├─ Container Management Tools
  ├─ Git Operation Tools
  └─ Patch Handling Tools
  ↓
Sandbox Agent (in container)
  - Executes coding tasks
  - Returns patches
  ↓
Host Agent applies results
  - Apply patches
  - Handle conflicts
  - Push/Create PR
```

### Key Changes

**Remove:**
- `PromptParser` class (no longer need pre-parsing)
- `ExecutionStrategy` type (strategy decided by Agent)
- Fixed execution workflow

**Add:**
- `HostAgent` class (based on pi-agent-core)
- Complete tool set (12+ tools)
- System prompt (defines Host Agent's role)

**Keep:**
- `ContainerRegistry` (container registry)
- `DockerSandbox` (container management)
- `TaskStore` (task persistence)

---

## Host Agent Design

### Class Structure

```typescript
export class HostAgent {
  private agent: Agent  // pi-agent-core Agent
  private sandbox: DockerSandbox
  private registry: ContainerRegistry
  private store: TaskStore
  private minionHome: string

  constructor(options: HostAgentOptions) {
    // Create pi-agent-core Agent
    const model = getModel(provider, modelId)
    const tools = this.createTools()
    const systemPrompt = this.buildSystemPrompt()

    this.agent = new Agent({
      initialState: {
        systemPrompt,
        model,
        tools
      }
    })
  }

  async run(userPrompt: string): Promise<TaskResult> {
    // Pass user instruction directly to Agent
    await this.agent.prompt(userPrompt)
    // Agent autonomously calls tools to complete task
  }
}
```

### Agent Configuration

- **Model Selection**: Supports different models (default: same as Sandbox, but can use cheaper models like GPT-4o-mini)
- **Tool Set**: 12+ tools (detailed below)
- **Event Subscription**: Listen to tool calls, errors, etc. for logging and status updates

---

## Tool Set Design

### 1. Project Analysis Tools

**analyze_project**
```typescript
{
  name: 'analyze_project',
  description: 'Analyze project structure, tech stack, and dependencies',
  parameters: {
    path: string  // Project path
  },
  returns: {
    techStack: string[]      // ['Node.js', 'TypeScript', 'React']
    packageManager: string   // 'npm' | 'yarn' | 'pnpm'
    hasTests: boolean
    testFramework?: string
    buildTool?: string
  }
}
```

### 2. Container Management Tools

**start_container**
```typescript
{
  name: 'start_container',
  description: 'Start a Docker container to execute the task',
  parameters: {
    image: string           // Docker image name
    memory?: string         // Memory limit '4g'
    cpus?: number          // CPU cores
    taskDescription: string // Task description for Sandbox Agent
  },
  returns: {
    containerId: string
    status: 'running'
  }
}
```

**get_container_status**
```typescript
{
  name: 'get_container_status',
  description: 'Check container execution status',
  parameters: {
    containerId: string
  },
  returns: {
    status: 'running' | 'completed' | 'failed'
    exitCode?: number
  }
}
```

**get_container_logs**
```typescript
{
  name: 'get_container_logs',
  description: 'Get container execution logs',
  parameters: {
    containerId: string
    tail?: number  // Last N lines
  },
  returns: {
    logs: string
  }
}
```

**get_container_journal**
```typescript
{
  name: 'get_container_journal',
  description: 'Get the journal (execution log) from sandbox agent',
  parameters: {
    containerId: string
  },
  returns: {
    journal: string  // journal.md content
  }
}
```

**get_container_artifacts**
```typescript
{
  name: 'get_container_artifacts',
  description: 'Get all artifacts from container (journal, status, patches)',
  parameters: {
    containerId: string
  },
  returns: {
    journal: string           // /minion-run/journal.md
    status: object           // /minion-run/status.json
    patches: string[]        // /minion-run/patches/*.patch
    summary?: string         // /minion-run/summary.txt
  }
}
```

**preserve_container**
```typescript
{
  name: 'preserve_container',
  description: 'Preserve container for debugging (do not remove)',
  parameters: {
    containerId: string
    reason: string
  }
}
```

### 3. Git Operation Tools

**create_branch**
```typescript
{
  name: 'create_branch',
  description: 'Create a new git branch for the task',
  parameters: {
    branchName: string
    baseBranch?: string  // Default 'main'
  }
}
```

**push_changes**
```typescript
{
  name: 'push_changes',
  description: 'Push changes to remote repository',
  parameters: {
    branch: string
    force?: boolean
  }
}
```

### 4. Patch Handling Tools

**list_patches**
```typescript
{
  name: 'list_patches',
  description: 'List patches generated by container',
  parameters: {
    containerId: string
  },
  returns: {
    patches: string[]  // Patch file paths
  }
}
```

**apply_patches**
```typescript
{
  name: 'apply_patches',
  description: 'Apply patches to local repository',
  parameters: {
    patches: string[]
  },
  returns: {
    applied: number
    failed: number
    conflicts: string[]
  }
}
```

**resolve_conflicts**
```typescript
{
  name: 'resolve_conflicts',
  description: 'Attempt to resolve merge conflicts',
  parameters: {
    files: string[]
    strategy: 'ours' | 'theirs' | 'manual'
  }
}
```

### 5. PR/Task Management Tools

**create_pr**
```typescript
{
  name: 'create_pr',
  description: 'Create a pull request',
  parameters: {
    title: string
    body: string
    branch: string
    baseBranch: string
  },
  returns: {
    prUrl: string
    prNumber: number
  }
}
```

**update_task_status**
```typescript
{
  name: 'update_task_status',
  description: 'Update task status in task store',
  parameters: {
    taskId: string
    status: 'running' | 'completed' | 'failed'
    metadata?: Record<string, any>
  }
}
```

---

## System Prompt Design

### System Prompt Structure

```markdown
# Role
You are the Minions Host Agent, responsible for orchestrating coding tasks.

# Tools Available
[12 tools listed with brief descriptions]

# Decision Rules
- **When to analyze_project**: When task involves "select image", "analyze project", or tech stack is uncertain
- **When to preserve_container**: User explicitly requests OR task fails and debugging is needed
- **When to create_pr**: User explicitly requests OR task description includes "create PR"
- **Always read journal first**: After container completes, read journal before making any decisions

# Workflow Pattern
1. Understand user instructions, identify key requirements (need analysis? preserve container? create PR?)
2. If needed, analyze_project first
3. create_branch
4. start_container (select image based on analysis)
5. After completion, **MUST read get_container_journal first**
6. Decide next steps based on journal content
7. Handle results (apply_patches / preserve_container)
8. Report to user (based on journal content)

# Examples
[3 complete examples below]

# Critical Guidelines
- ALWAYS read journal before making decisions
- ALWAYS preserve container if user explicitly requests it
- ALWAYS explain failures based on journal content
- Tool call order matters: journal → patches → apply
```

### Few-Shot Examples

**Example 1: Simple Bug Fix (Success)**

```markdown
User: "修复 login.ts 中的类型错误"

Agent reasoning: Simple fix task, no need to analyze project

Tool calls:
1. create_branch(branchName="fix/login-type-error")
2. start_container(
     image="minion-base",
     taskDescription="修复 login.ts 中的类型错误"
   )
3. get_container_status(containerId="xxx")
   → returns: {status: "completed", exitCode: 0}
4. get_container_journal(containerId="xxx")
   → returns: "Fixed type error in login.ts, tests passing"
5. list_patches(containerId="xxx")
   → returns: ["0001-fix-login-type-error.patch"]
6. apply_patches(patches=["0001-fix-login-type-error.patch"])
   → returns: {applied: 1, failed: 0, conflicts: []}
7. push_changes(branch="fix/login-type-error")

Response to user: "✓ 成功修复类型错误，已推送到分支 fix/login-type-error"
```

**Example 2: Task Failure (Preserve Container)**

```markdown
User: "添加用户认证功能，如果失败保留容器"

Agent reasoning: Complex task, user explicitly requests container preservation on failure

Tool calls:
1. analyze_project(path=".")
   → returns: {techStack: ["Node.js", "Express"], hasTests: true}
2. create_branch(branchName="feat/user-auth")
3. start_container(
     image="minion-base",
     taskDescription="添加用户认证功能"
   )
4. get_container_status(containerId="xxx")
   → returns: {status: "failed", exitCode: 1}
5. get_container_journal(containerId="xxx")
   → returns: "Tests failed: authentication middleware not handling edge cases"
6. preserve_container(
     containerId="xxx",
     reason="测试失败，保留用于调试"
   )

Response to user: "✗ 任务失败。原因：认证中间件未处理边缘情况，测试未通过。容器已保留（ID: xxx），你可以进入容器调试。"
```

**Example 3: Complex Orchestration (Conditional Logic)**

```markdown
User: "分析项目，选择合适的镜像，修复所有 lint 错误，测试通过后创建 PR"

Agent reasoning: Multi-step task, need analysis then select image, create PR on success

Tool calls:
1. analyze_project(path=".")
   → returns: {techStack: ["Python", "Django"], testFramework: "pytest"}
2. create_branch(branchName="fix/lint-errors")
3. start_container(
     image="minion-python",  # Based on analysis
     taskDescription="修复所有 lint 错误并确保测试通过"
   )
4. get_container_status(containerId="xxx")
   → returns: {status: "completed", exitCode: 0}
5. get_container_journal(containerId="xxx")
   → returns: "Fixed 23 lint errors, all tests passing (45/45)"
6. list_patches(containerId="xxx")
7. apply_patches(patches=[...])
8. push_changes(branch="fix/lint-errors")
9. create_pr(
     title="Fix: 修复所有 lint 错误",
     body="修复了 23 个 lint 错误，所有测试通过 (45/45)",
     branch="fix/lint-errors",
     baseBranch="main"
   )

Response to user: "✓ 已修复 23 个 lint 错误，所有测试通过。PR 已创建：[PR URL]"
```

---

## Data Flow Design

### Complete Task Execution Flow

**User Command:**
```bash
minion run "修复登录页面的 bug，如果测试失败保留容器用于调试"
```

**Data Flow:**

```
1. CLI receives command
   ↓
   userPrompt = "修复登录页面的 bug，如果测试失败保留容器用于调试"

2. CLI calls HostAgent.run(userPrompt)
   ↓

3. Host Agent (pi-agent-core) processes
   ↓
   Agent understands instruction:
   - Task: Fix login page bug
   - Condition: Test fails → preserve container

4. Agent starts tool call sequence
   ↓

   4.1 create_branch("fix/login-bug")
       → Git creates branch

   4.2 start_container({
         image: "minion-base",
         taskDescription: "修复登录页面的 bug，确保测试通过"
       })
       → Docker starts container
       → Returns {containerId: "abc123"}

   4.3 Monitor container status (poll or wait)
       get_container_status("abc123")
       → {status: "running"}
       → Continue waiting...
       → {status: "completed", exitCode: 1}  # Failed

   4.4 Read execution log
       get_container_journal("abc123")
       → Returns journal content:
       ```
       ## Phase: Testing
       - Fixed login validation logic
       - Tests failed: 2/10 tests failing
       - Error: Expected redirect to /dashboard, got /home
       ```

   4.5 Agent analyzes journal, finds test failure
       Based on user instruction "如果测试失败保留容器"

   4.6 preserve_container("abc123", "测试失败，保留用于调试")
       → Container marked as preserved
       → Won't be auto-deleted

   4.7 update_task_status(taskId, "failed", {
         containerId: "abc123",
         reason: "Tests failed: 2/10 tests failing"
       })

5. Agent returns result to CLI
   ↓

6. CLI displays to user
   ↓

   Output:
   ```
   ✗ 任务失败

   原因：测试失败 (2/10 tests failing)
   - 预期重定向到 /dashboard，实际重定向到 /home

   容器已保留用于调试：
   - Container ID: abc123
   - 进入容器：docker exec -it abc123 /bin/bash
   - 查看日志：minion logs abc123
   ```
```

### Key Data Structures

**TaskRequest (stored in TaskStore)**
```typescript
{
  id: "task_xyz",
  description: "修复登录页面的 bug，如果测试失败保留容器用于调试",
  status: "failed",
  containerId: "abc123",
  branch: "fix/login-bug",
  created_at: "2024-01-01T10:00:00Z",
  finished_at: "2024-01-01T10:05:00Z",
  metadata: {
    reason: "Tests failed: 2/10 tests failing",
    preserved: true
  }
}
```

**ContainerHandle (stored in ContainerRegistry)**
```typescript
{
  id: "abc123",
  taskId: "task_xyz",
  status: "preserved",
  createdAt: 1704103200000,
  updatedAt: 1704103500000,
  metadata: {
    preserveReason: "测试失败，保留用于调试",
    journal: "/minion-run/journal.md",
    patches: []
  }
}
```

---

## Error Handling Design

### Error Classification and Handling Strategies

### 1. Container Start Failure

**Scenario:** Docker image not found, insufficient resources

**Handling:**
```typescript
try {
  await start_container({image: "minion-base", ...})
} catch (error) {
  // Agent analyzes error
  if (error.message.includes("image not found")) {
    // Try pulling image or use fallback
    await start_container({image: "minion-fallback", ...})
  } else if (error.message.includes("insufficient resources")) {
    // Reduce resource requirements
    await start_container({memory: "2g", cpus: 1, ...})
  } else {
    // Cannot recover, report to user
    return "容器启动失败：" + error.message
  }
}
```

**System Prompt Guidance:**
```markdown
If start_container fails:
- Check error message
- Try fallback strategies (different image, lower resources)
- If all attempts fail, report to user with clear error message
```

### 2. Container Execution Failure

**Scenario:** Sandbox Agent task fails (tests not passing, compilation errors, etc.)

**Handling:**
```typescript
const status = await get_container_status(containerId)
if (status.exitCode !== 0) {
  // MUST read journal first to understand failure reason
  const journal = await get_container_journal(containerId)

  // Decide whether to preserve container based on user instruction
  if (userRequestedPreserve) {
    await preserve_container(containerId, "任务失败，保留用于调试")
  }

  // Report detailed reason to user (extracted from journal)
  return `任务失败：${extractFailureReason(journal)}`
}
```

**System Prompt Guidance:**
```markdown
If container execution fails (exitCode !== 0):
1. MUST read journal first to understand why
2. Check if user requested preservation ("preserve", "keep", "保留")
3. If yes, call preserve_container
4. Extract failure reason from journal
5. Report to user with actionable information
```

### 3. Patch Application Failure

**Scenario:** Merge conflicts, file not found

**Handling:**
```typescript
const result = await apply_patches(patches)
if (result.conflicts.length > 0) {
  // Has conflicts, try to resolve
  const resolved = await resolve_conflicts({
    files: result.conflicts,
    strategy: "manual"  // Or choose strategy based on situation
  })

  if (!resolved.success) {
    // Cannot auto-resolve, report to user
    return `补丁应用失败，存在冲突：${result.conflicts.join(", ")}`
  }
}
```

**System Prompt Guidance:**
```markdown
If apply_patches returns conflicts:
1. Try resolve_conflicts with appropriate strategy
2. If conflicts cannot be resolved automatically:
   - List conflicting files
   - Explain what needs manual intervention
   - Provide commands for user to resolve manually
```

### 4. LLM Call Failure

**Scenario:** API timeout, rate limit, context overflow

**Handling:**
```typescript
// Handled internally by pi-agent-core
// At Host Agent level:
agent.subscribe((event) => {
  if (event.type === 'error') {
    if (event.error.includes('rate_limit')) {
      // Wait and retry
      await sleep(60000)
      agent.retry()
    } else if (event.error.includes('context_length')) {
      // Simplify input or batch process
      // Less common for Host Agent
    }
  }
})
```

### 5. Network/Git Operation Failure

**Scenario:** Push fails, PR creation fails

**Handling:**
```typescript
try {
  await push_changes(branch)
} catch (error) {
  if (error.message.includes("rejected")) {
    // Remote has new commits, need to pull first
    return "推送失败：远程分支有新提交，请先同步"
  } else if (error.message.includes("permission denied")) {
    return "推送失败：没有权限，请检查 Git 凭证"
  }
}
```

### Error Recovery Flow

```
Error occurs
  ↓
Agent catches error
  ↓
Analyze error type
  ↓
  ├─ Recoverable?
  │   ├─ Yes → Execute recovery strategy → Retry
  │   └─ No → Report to user
  ↓
Read relevant logs/status
  ↓
Extract error reason
  ↓
Generate user-friendly error message
  ↓
Provide actionable suggestions
```

### Error Handling in System Prompt

```markdown
# Error Handling Guidelines

## General Principles
1. Always read relevant logs/journals when errors occur
2. Try automatic recovery when possible
3. Provide clear, actionable error messages to users
4. Preserve debugging information (containers, logs)

## Specific Error Types

### Container Failures
- Read journal to understand root cause
- Preserve container if user requested or if needed for debugging
- Extract specific error from journal, don't just say "failed"

### Patch Conflicts
- Try automatic resolution first
- If manual intervention needed, list conflicting files
- Provide git commands for user to resolve

### Resource Issues
- Try with reduced resources
- Suggest alternatives (different image, different approach)

## Error Message Format
Bad: "Task failed"
Good: "Task failed: Tests not passing (2/10 failed). Error in login validation: expected redirect to /dashboard, got /home. Container preserved (ID: abc123) for debugging."
```

---

## Migration Path

### Current vs New Architecture Comparison

**To Remove:**
```
src/parser/prompt-parser.ts          # No longer need pre-parsing
src/parser/prompt-parser.test.ts
src/types/strategy.ts                # ExecutionStrategy type
src/host-agent/ai-host-agent.ts      # Current AIHostAgent
src/host-agent/ai-host-agent.test.ts
```

**To Create:**
```
src/host-agent/host-agent.ts         # New HostAgent (based on pi-agent-core)
src/host-agent/host-agent.test.ts
src/host-agent/tools/                # Tool set directory
  ├── project-tools.ts               # analyze_project
  ├── container-tools.ts             # start_container, get_status, etc.
  ├── git-tools.ts                   # create_branch, push_changes
  ├── patch-tools.ts                 # list_patches, apply_patches
  └── pr-tools.ts                    # create_pr
src/host-agent/prompts.ts            # System prompt + few-shot examples
src/host-agent/types.ts              # HostAgent related types
```

**To Reuse:**
```
src/container/registry.ts            # ContainerRegistry unchanged
src/sandbox/docker.ts                # DockerSandbox unchanged
src/task/store.ts                    # TaskStore unchanged
src/tools/container-tools.ts         # Some logic can be reused in new tools
```

### Migration Steps

**Phase 1: Create New HostAgent Framework**
1. Create `src/host-agent/host-agent.ts`
2. Implement basic Agent initialization (using pi-agent-core)
3. Write system prompt (including few-shot examples)
4. Create empty tool set framework

**Phase 2: Implement Tool Set (by priority)**
1. **Core Tools** (required):
   - start_container
   - get_container_status
   - get_container_journal
   - list_patches
   - apply_patches

2. **Git Tools** (required):
   - create_branch
   - push_changes

3. **Advanced Tools** (optional, add later):
   - analyze_project
   - preserve_container
   - resolve_conflicts
   - create_pr

**Phase 3: Integrate into CLI**
1. Modify `src/cli/index.ts`
2. Remove PromptParser related code
3. Call new HostAgent directly
4. Update error handling and output format

**Phase 4: Testing and Validation**
1. Unit tests (each tool)
2. Integration tests (complete flow)
3. Validate using examples/ directory
4. Performance tests (LLM call count, execution time)

**Phase 5: Cleanup and Documentation**
1. Delete old code (PromptParser, old AIHostAgent)
2. Update README.md
3. Update CLAUDE.md (if exists)
4. Add migration guide

### Backward Compatibility

**Breaking Changes:**
- CLI command line arguments remain the same
- But internal implementation completely rewritten
- User experience should be better (more flexible natural language control)

**Configuration Compatibility:**
- LLM configuration unchanged (provider, model, apiKey)
- Can add new configuration items:
  ```json
  {
    "llm": {
      "provider": "openai",
      "model": "gpt-4o",
      "apiKey": "..."
    },
    "hostAgent": {
      "model": "gpt-4o-mini",  // Optional: Host Agent uses cheaper model
      "maxRetries": 3
    }
  }
  ```

### Testing Strategy

**Unit Tests:**
```typescript
describe('HostAgent Tools', () => {
  it('start_container should start container and return ID', async () => {
    const tool = createStartContainerTool(sandbox, registry)
    const result = await tool.execute({
      image: 'minion-base',
      taskDescription: 'test task'
    })
    expect(result.containerId).toBeDefined()
  })

  it('get_container_journal should return journal content', async () => {
    const tool = createGetContainerJournalTool(sandbox)
    const result = await tool.execute({containerId: 'abc123'})
    expect(result.journal).toContain('Phase:')
  })
})
```

**Integration Tests:**
```typescript
describe('HostAgent E2E', () => {
  it('should handle simple task successfully', async () => {
    const agent = new HostAgent({...})
    const result = await agent.run('修复 login.ts 中的类型错误')
    expect(result.status).toBe('completed')
    expect(result.patches.applied).toBeGreaterThan(0)
  })

  it('should preserve container on failure when requested', async () => {
    const agent = new HostAgent({...})
    const result = await agent.run('添加功能，失败时保留容器')
    if (result.status === 'failed') {
      expect(result.containerPreserved).toBe(true)
    }
  })
})
```

### Risks and Mitigation

**Risk 1: Increased LLM call cost**
- Mitigation: Host Agent uses cheaper model (GPT-4o-mini)
- Mitigation: Optimize system prompt, reduce unnecessary tool calls

**Risk 2: Unstable Agent decisions**
- Mitigation: Provide detailed few-shot examples
- Mitigation: Clarify decision rules in system prompt
- Mitigation: Thorough testing and iteration

**Risk 3: Large migration workload**
- Mitigation: Implement in phases, start with core functionality
- Mitigation: Reuse existing code (ContainerRegistry, DockerSandbox)
- Mitigation: Keep CLI interface unchanged, reduce user impact

### Time Estimation

- Phase 1 (Framework): 1-2 days
- Phase 2 (Core Tools): 2-3 days
- Phase 3 (CLI Integration): 1 day
- Phase 4 (Testing): 2-3 days
- Phase 5 (Cleanup & Docs): 1 day

**Total: 7-10 days**

---

## Summary

This redesign transforms the Host Agent from a "smart parser + fixed workflow" into a true AI Agent that:

1. **Understands natural language**: Users can describe execution flow in any natural way
2. **Autonomously orchestrates**: Agent decides which tools to call and in what order
3. **Handles complexity**: Supports conditional logic, error recovery, and multi-step workflows
4. **Consistent architecture**: Same framework as Sandbox Agent (pi-agent-core)
5. **Extensible**: Easy to add new tools and capabilities

The key insight is: **Don't use LLM just to parse predefined fields - use it to understand and orchestrate the entire execution flow.**
