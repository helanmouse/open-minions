# AI Orchestrator Host Agent Design

**Date:** 2026-03-02
**Status:** Design Approved
**Author:** Claude (with user collaboration)

## Executive Summary

This design transforms the Minions Host Agent from a simple script executor into an AI-powered orchestrator that understands natural language, makes intelligent decisions, and manages complex container lifecycles. The goal is to give users full control through prompts while maintaining backward compatibility.

## Background

### Current Problems

1. **Patch application failures** - Simple `git am` fails on conflicts or existing files
2. **Limited error handling** - No recovery strategies, just abort and fail
3. **Poor user experience** - Cryptic git errors, no guidance on next steps
4. **No container lifecycle management** - Containers are always cleaned up, can't preserve for debugging
5. **Rigid execution model** - No support for parallel runs, retries, or custom strategies

### Design Principles

1. **Prompt-driven control** - Users specify behavior in natural language, not config files
2. **Full autonomy** - Host agent makes ALL decisions except LLM setup parameters
3. **User experience first** - Priority: UX > Conflict handling > Error recovery
4. **Backward compatible** - Existing commands continue to work
5. **YAGNI** - Only implement what's needed, avoid over-engineering

## Architecture

### Overall Design

```
User Prompt → AI Host Agent → Decision Making → Actions
                    ↓
    ┌───────────────┼───────────────┐
    ↓               ↓               ↓
Container      Container       Container
Management     Lifecycle       Result
(start/stop)   (preserve)      (patch/merge)
```

### Three-Layer Architecture

**Layer 1: Task Parser (enhanced)**
- Parse user prompt
- Extract task description
- Extract execution strategy from natural language
- Output: `TaskRequest` + `ExecutionStrategy`

**Layer 2: AI Orchestrator (new core)**
- LLM-powered decision maker
- Orchestrates container lifecycle
- Handles errors and recovery
- Interacts with users when needed

**Layer 3: Tool Layer (refactored)**
- Container Management Tools
- Patch Application Tools
- Analysis Tools
- User Interaction Tools

## Component Design

### 1. Tool Set

#### Container Management Tools

```typescript
interface ContainerTools {
  start_container(config: ContainerConfig): ContainerHandle
  stop_container(containerId: string): void
  preserve_container(containerId: string, reason: string): PreservedContainer
  snapshot_container(containerId: string, name: string): ImageId
  list_containers(filter?: ContainerFilter): Container[]
  inspect_container(containerId: string): ContainerInfo
}
```

**Key features:**
- Agent decides container configuration (memory, CPUs) based on task complexity
- Support for custom images
- Container preservation for debugging
- Snapshot creation for environment reuse

#### Patch Application Tools

```typescript
interface PatchTools {
  analyze_patches(patchDir: string): PatchAnalysis
  apply_patches(config: ApplyConfig): PatchResult
  resolve_conflict(conflict: Conflict, resolution: Resolution): void
  rollback_patches(repoPath: string): void
}

interface PatchAnalysis {
  totalPatches: number
  filesAffected: string[]
  potentialConflicts: Conflict[]
  riskLevel: 'low' | 'medium' | 'high'
}
```

**Key features:**
- Pre-analyze patches before applying
- Support multiple strategies: auto, manual, ask
- Intelligent conflict resolution
- Rollback capability

#### Analysis & Monitoring Tools

```typescript
interface AnalysisTools {
  read_journal(containerId: string): Journal
  analyze_failure(containerId: string): FailureAnalysis
  monitor_container(containerId: string): AsyncIterator<ContainerEvent>
  compare_results(containerIds: string[]): ComparisonReport
}

interface FailureAnalysis {
  category: 'environment' | 'code' | 'timeout' | 'resource' | 'unknown'
  rootCause: string
  suggestions: string[]
  canRetry: boolean
  needsUserInput: boolean
}
```

**Key features:**
- Read sandbox agent's journal for context
- Categorize failures for appropriate handling
- Real-time monitoring
- Compare results from parallel runs

#### User Interaction Tools

```typescript
interface UserTools {
  ask_user(question: string, options?: string[]): Promise<string>
  report_progress(status: string, details?: any): void
  show_results(results: TaskResult): void
  confirm(message: string): Promise<boolean>
}
```

**Key features:**
- Ask questions when decisions needed
- Report progress at key milestones
- Beautiful result presentation
- Confirmation for risky operations

### 2. Execution Strategy

Users control execution through natural language:

```typescript
interface ExecutionStrategy {
  // Container management
  preserveOnFailure: boolean      // "preserve container if failed"
  preserveOnSuccess: boolean      // "keep container after success"
  snapshotAfter: boolean          // "create snapshot when done"
  customImage?: string            // "use image my-custom:latest"

  // Parallel execution
  parallelRuns: number            // "try 3 times in parallel"
  pickBest: boolean               // "pick the best result"

  // Patch strategy
  patchStrategy: 'auto' | 'manual' | 'ask'  // "auto-apply patches"

  // Resource configuration
  memory: string                  // "use 8g memory"
  cpus: number                    // "use 4 cores"
  timeout: number                 // "timeout after 30 minutes"

  // Retry strategy
  retryOnFailure: boolean         // "retry if failed"
  maxRetries: number              // "retry up to 3 times"
}
```

**Examples:**
- "Run this task, preserve container if failed" → `{preserveOnFailure: true}`
- "Try 3 times in parallel, pick best" → `{parallelRuns: 3, pickBest: true}`
- "Auto-apply patches" → `{patchStrategy: 'auto'}`

### 3. System Prompt Design

The AI Host Agent uses a comprehensive system prompt:

```markdown
You are the Minions Host Agent, an AI orchestrator that manages
containerized coding tasks.

## Your Role
1. Understand user intent from natural language prompts
2. Make intelligent decisions about execution strategy
3. Manage container lifecycle (start, monitor, preserve, snapshot)
4. Handle patch application with conflict resolution
5. Interact with users when decisions are needed

## Decision-Making Principles
1. Parse user intent and extract execution strategy
2. Use defaults when user doesn't specify
3. Analyze failures and suggest recovery
4. Preserve containers for debugging when appropriate
5. Prioritize user experience - clear messages, actionable errors

## Default Behaviors
- Clean up containers on success
- Ask user on patch conflicts
- Single container execution
- Standard resources (4g memory, 2 CPUs)
```

### 4. Error Handling & Recovery

#### Error Categories

```typescript
type ErrorCategory =
  | 'environment_missing'    // Missing dependencies
  | 'resource_exhausted'     // Out of memory/disk
  | 'timeout'                // Execution timeout
  | 'patch_conflict'         // Patch conflicts
  | 'network_failure'        // Network issues
  | 'llm_failure'            // LLM API failures
  | 'code_error'             // Generated code issues
  | 'unknown'                // Unknown errors
```

#### Recovery Strategies

**Patch Conflicts:**
- Auto-resolve simple conflicts if strategy is 'auto'
- Preserve container for manual merge if strategy is 'manual'
- Ask user for decision if strategy is 'ask' (default)

**Environment Issues:**
- Install missing packages
- Create snapshot for future reuse
- Retry with enhanced environment

**Resource Exhaustion:**
- Automatically increase memory/timeout
- Retry with new configuration
- Report to user if limits reached

**Retry with Backoff:**
```typescript
async function retryWithBackoff(
  task: TaskRequest,
  strategy: ExecutionStrategy,
  attempt: number = 1
): Promise<TaskResult> {
  try {
    return await executeTask(task, strategy)
  } catch (error) {
    if (canRecover(error) && attempt < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000)
      await sleep(delay)
      return retryWithBackoff(task, newStrategy, attempt + 1)
    }
    throw error
  }
}
```

### 5. Container Preservation Policy

**When to preserve:**
- User explicitly requested (`preserveOnFailure: true`)
- Unknown errors (for debugging)
- Patch conflicts (for manual merge)

**Retention periods:**
- User-requested: 24 hours
- Unknown errors: 12 hours
- Default: 6 hours

**Cleanup:**
- Automatic cleanup of old preserved containers
- User can manually delete with `minion cleanup`

### 6. Parallel Execution

When user requests parallel runs:

```typescript
async function parallelExecution(
  task: TaskRequest,
  count: number
): Promise<TaskResult> {
  // 1. Start multiple containers
  const containers = await Promise.all(
    Array(count).fill(0).map(() => start_container({...}))
  )

  // 2. Wait for all to complete
  const results = await Promise.all(
    containers.map(c => waitForCompletion(c))
  )

  // 3. Compare and select best
  const best = selectBest(results)

  // 4. Apply best result's patches
  await apply_patches(best.patchDir, task.repo)

  // 5. Cleanup other containers
  await cleanupOthers(containers, best.containerId)

  return best.result
}
```

**Selection criteria:**
- Test pass rate
- Code quality metrics
- Execution time
- Journal completeness
- Or ask user to choose

## Data Models

### Core Structures

```typescript
interface TaskRequest {
  id: string
  description: string              // Original user prompt
  parsedTask: string               // Extracted task description
  strategy: ExecutionStrategy      // Extracted execution strategy
  repo: string
  repoType: 'local' | 'remote'
  branch: string
  baseBranch: string
  created_at: string
}

interface ContainerHandle {
  id: string
  taskId: string
  image: string
  config: ContainerConfig
  status: ContainerStatus
  metadata: {
    attempt: number
    parallelIndex?: number
    preserveReason?: string
    snapshotId?: string
  }
}

interface TaskResult {
  taskId: string
  status: 'completed' | 'failed' | 'partial'
  containers: ContainerInfo[]
  patches: PatchInfo
  changes: CodeChanges
  stats: ExecutionStats
  journal: string
  summary: string
  error?: string
}
```

### Storage

**TaskStore (enhanced):**
- Store execution strategy
- Track associated containers
- Record execution logs

**ContainerRegistry (new):**
- Track all containers
- Query by task, status, age
- Support preservation and cleanup

**SnapshotStore (new):**
- Manage container snapshots
- Track metadata (packages, description)
- Support reuse and cleanup

## Implementation Plan

### Phase 1: Foundation (2-3 weeks)

**Goals:**
- Refactor existing code into tools
- Extend data models
- Create container registry

**Deliverables:**
- `ContainerManagementTools` class
- `PatchApplicationTools` class
- Extended `TaskStore` with strategy support
- `ContainerRegistry` implementation

### Phase 2: AI Agent Core (3-4 weeks)

**Goals:**
- Implement AI Host Agent
- Prompt parsing and strategy extraction
- Basic orchestration logic

**Deliverables:**
- `AIHostAgent` class
- System prompts
- Prompt parser
- Tool execution framework

### Phase 3: Advanced Features (2-3 weeks)

**Goals:**
- Parallel execution
- Snapshot management
- Intelligent conflict resolution

**Deliverables:**
- `ParallelExecutor` class
- `SnapshotManager` class
- `ConflictResolver` class

### Phase 4: UX Polish (1-2 weeks)

**Goals:**
- Beautiful progress reporting
- Interactive UI
- Helpful error messages

**Deliverables:**
- `ProgressReporter` class
- `InteractiveUI` class
- `ErrorReporter` class

## Backward Compatibility

### Existing Commands Continue to Work

```bash
# Old way (still works)
minion run "create hello.py"

# New way (AI mode auto-detected)
minion run "create hello.py, preserve container if failed"
```

### AI Mode Detection

AI mode is enabled when:
1. Prompt contains AI keywords (preserve, parallel, retry, etc.)
2. Environment variable `MINION_AI_MODE=true`
3. Config file sets `aiMode.enabled: true`

### Migration Path

Users can gradually adopt new features:
- Start with basic commands (no change)
- Add preservation when debugging
- Use parallel runs for complex tasks
- Fully leverage AI orchestration over time

## Testing Strategy

### Unit Tests
- Tool implementations
- Prompt parsing
- Strategy extraction
- Error categorization

### Integration Tests
- End-to-end task execution
- Container preservation
- Patch application
- Parallel execution

### Regression Tests
- Ensure backward compatibility
- Verify existing commands work
- Check performance hasn't degraded

## Performance Considerations

### LLM Call Optimization
- Cache prompt parsing results
- Batch independent tool calls
- Use streaming for long operations

### Resource Management
- Limit concurrent containers (default: 5)
- Queue tasks when limit reached
- Monitor system resources

### Container Cleanup
- Automatic cleanup of old containers
- Configurable retention periods
- Manual cleanup command

## Success Metrics

### User Experience
- Reduced time to resolve failures
- Fewer support requests about patch errors
- Positive user feedback on natural language control

### Technical
- 90%+ patch application success rate
- <5% increase in LLM API costs
- No performance regression for basic commands

### Adoption
- 50%+ of users try AI features within 3 months
- 25%+ regularly use advanced features (parallel, preserve)

## Risks & Mitigation

### Risk: LLM misunderstands user intent
**Mitigation:**
- Comprehensive prompt engineering
- Fallback to asking user for clarification
- Log misunderstandings for improvement

### Risk: Increased complexity
**Mitigation:**
- Maintain backward compatibility
- Gradual rollout with feature flags
- Comprehensive documentation

### Risk: Higher costs (LLM calls)
**Mitigation:**
- Cache parsing results
- Use smaller models for simple tasks
- Make AI mode opt-in initially

## Future Enhancements

### Not in Scope (but possible later)
- Multi-agent collaboration (host + sandbox coordination)
- Learning from past executions
- Automatic performance optimization
- Integration with CI/CD pipelines

## Conclusion

This design transforms the Minions Host Agent into a true AI orchestrator while maintaining simplicity and backward compatibility. Users gain powerful new capabilities through natural language, and the system becomes more resilient and user-friendly.

The phased implementation approach ensures we can deliver value incrementally while managing risk. The focus on user experience and error handling addresses the core pain points identified in the current system.

---

**Next Steps:**
1. Review and approve this design
2. Create detailed implementation plan using `writing-plans` skill
3. Begin Phase 1 implementation
