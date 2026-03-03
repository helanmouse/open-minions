# Container Status Monitoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix infinite loop bug by adding background monitoring that updates container registry status when containers complete.

**Architecture:** Add Promise-based background monitoring in `start_container` tool that calls `handle.wait()` asynchronously and updates registry on completion. Update system prompt with explicit polling limits (50 attempts, 10 second intervals).

**Tech Stack:** TypeScript, Dockerode, pi-agent-core, Vitest

---

## Task 1: Add background monitoring to start_container tool

**Files:**
- Modify: `src/host-agent/tools/container-tools.ts:48-94`
- Test: `src/host-agent/tools/container-tools.test.ts`

**Step 1: Read current implementation**

Run: `cat src/host-agent/tools/container-tools.ts | grep -A 50 "execute: async"`
Expected: See current implementation that registers container but doesn't monitor completion

**Step 2: Add background monitoring after registry.register()**

In `src/host-agent/tools/container-tools.ts`, after line 81 (after `registry.register(...)`), add:

```typescript
// Background monitoring (non-blocking)
handle.wait()
  .then(({ exitCode }) => {
    registry.update(handle.containerId, {
      status: exitCode === 0 ? 'done' : 'failed',
      metadata: { exitCode, runDir }
    })
  })
  .catch((error) => {
    // Handle unexpected errors (container killed, Docker daemon crash, etc.)
    registry.update(handle.containerId, {
      status: 'failed',
      metadata: {
        exitCode: -1,
        runDir,
        error: error instanceof Error ? error.message : String(error)
      }
    })
  })
```

**Step 3: Update return message**

Change the return statement (around line 83-90) to:

```typescript
const result = {
  containerId: handle.containerId,
  status: 'running' as const,
  message: 'Container started. Use get_container_status to monitor progress.'
}
return {
  content: [{ type: 'text', text: JSON.stringify(result) }],
  details: result
}
```

**Step 4: Build to check for TypeScript errors**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 5: Commit**

```bash
git add src/host-agent/tools/container-tools.ts
git commit -m "feat(host-agent): add background monitoring to update container status"
```

---

## Task 2: Add test for background monitoring

**Files:**
- Modify: `src/host-agent/tools/container-tools.test.ts`

**Step 1: Add test for successful completion**

Add this test after existing tests in `container-tools.test.ts`:

```typescript
it('should update registry when container completes successfully', async () => {
  // Create a Promise that we can resolve manually
  let resolveWait: (value: { exitCode: number }) => void
  const waitPromise = new Promise<{ exitCode: number }>((resolve) => {
    resolveWait = resolve
  })

  const mockHandle = {
    containerId: 'test-container-123',
    logs: vi.fn(),
    wait: vi.fn().mockReturnValue(waitPromise),
    stop: vi.fn()
  }

  mockSandbox.start = vi.fn().mockResolvedValue(mockHandle)

  const tool = createStartContainerTool(
    mockSandbox,
    mockRegistry,
    () => '/test/run',
    () => '/test/repo'
  )

  // Start container
  await tool.execute('test-id', {
    image: 'minion-base',
    taskDescription: 'test task'
  })

  // Verify initial status is 'running'
  expect(mockRegistry.register).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'running' })
  )

  // Simulate container completion
  resolveWait!({ exitCode: 0 })

  // Wait for background Promise to resolve
  await new Promise(resolve => setTimeout(resolve, 10))

  // Verify registry was updated to 'done'
  expect(mockRegistry.update).toHaveBeenCalledWith(
    'test-container-123',
    expect.objectContaining({
      status: 'done',
      metadata: expect.objectContaining({ exitCode: 0 })
    })
  )
})
```

**Step 2: Run test to verify it passes**

Run: `npm test src/host-agent/tools/container-tools.test.ts`
Expected: New test passes

**Step 3: Add test for failure case**

Add this test:

```typescript
it('should update registry when container fails', async () => {
  let resolveWait: (value: { exitCode: number }) => void
  const waitPromise = new Promise<{ exitCode: number }>((resolve) => {
    resolveWait = resolve
  })

  const mockHandle = {
    containerId: 'test-container-456',
    logs: vi.fn(),
    wait: vi.fn().mockReturnValue(waitPromise),
    stop: vi.fn()
  }

  mockSandbox.start = vi.fn().mockResolvedValue(mockHandle)

  const tool = createStartContainerTool(
    mockSandbox,
    mockRegistry,
    () => '/test/run',
    () => '/test/repo'
  )

  await tool.execute('test-id', {
    image: 'minion-base',
    taskDescription: 'test task'
  })

  // Simulate container failure
  resolveWait!({ exitCode: 1 })

  await new Promise(resolve => setTimeout(resolve, 10))

  // Verify registry was updated to 'failed'
  expect(mockRegistry.update).toHaveBeenCalledWith(
    'test-container-456',
    expect.objectContaining({
      status: 'failed',
      metadata: expect.objectContaining({ exitCode: 1 })
    })
  )
})
```

**Step 4: Run test to verify it passes**

Run: `npm test src/host-agent/tools/container-tools.test.ts`
Expected: Both new tests pass

**Step 5: Add test for error handling**

Add this test:

```typescript
it('should handle errors in background monitoring', async () => {
  const waitPromise = Promise.reject(new Error('Docker daemon crashed'))

  const mockHandle = {
    containerId: 'test-container-789',
    logs: vi.fn(),
    wait: vi.fn().mockReturnValue(waitPromise),
    stop: vi.fn()
  }

  mockSandbox.start = vi.fn().mockResolvedValue(mockHandle)

  const tool = createStartContainerTool(
    mockSandbox,
    mockRegistry,
    () => '/test/run',
    () => '/test/repo'
  )

  await tool.execute('test-id', {
    image: 'minion-base',
    taskDescription: 'test task'
  })

  await new Promise(resolve => setTimeout(resolve, 10))

  // Verify registry was updated to 'failed' with error
  expect(mockRegistry.update).toHaveBeenCalledWith(
    'test-container-789',
    expect.objectContaining({
      status: 'failed',
      metadata: expect.objectContaining({
        exitCode: -1,
        error: 'Docker daemon crashed'
      })
    })
  )
})
```

**Step 6: Run all tests**

Run: `npm test src/host-agent/tools/container-tools.test.ts`
Expected: All tests pass (including 3 new tests)

**Step 7: Commit**

```bash
git add src/host-agent/tools/container-tools.test.ts
git commit -m "test(host-agent): add tests for background container monitoring"
```

---

## Task 3: Update system prompt with polling guidelines

**Files:**
- Modify: `src/host-agent/prompts.ts:45`
- Modify: `src/host-agent/prompts.ts:123` (add new section)

**Step 1: Update line 45 with polling instructions**

In `src/host-agent/prompts.ts`, replace line 45:

```typescript
// OLD
5. **Monitor**: Wait for container to complete (poll get_container_status if needed)

// NEW
5. **Monitor**: Poll get_container_status every 10 seconds until status changes to 'done' or 'failed'
   - Maximum 50 polling attempts (timeout after ~8 minutes)
   - If timeout occurs, read journal anyway to see what happened
   - Status will be: 'running' → 'done' (success) or 'failed' (error)
```

**Step 2: Add Container Monitoring Guidelines section**

After line 123 (after "Remember: You are an orchestrator..."), add:

```typescript
## Container Monitoring Guidelines

When monitoring container execution:

1. **Polling Interval**: Wait 10 seconds between get_container_status calls
2. **Timeout Limit**: Stop polling after 50 attempts (~8 minutes total)
3. **Status Values**:
   - \`'running'\` - Container is still executing
   - \`'done'\` - Container completed successfully (exitCode: 0)
   - \`'failed'\` - Container failed (exitCode: non-zero)
4. **On Timeout**: If still 'running' after 50 attempts, call get_container_journal to see progress
5. **Always Read Journal**: After status changes to 'done' or 'failed', ALWAYS read journal first

Example monitoring pattern:
\`\`\`
let attempts = 0
while (attempts < 50) {
  status = get_container_status(containerId)
  if (status === 'done' || status === 'failed') break
  wait 10 seconds
  attempts++
}
get_container_journal(containerId)  // Always read journal
\`\`\`
```

**Step 3: Build to check for errors**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/host-agent/prompts.ts
git commit -m "feat(host-agent): add polling guidelines to system prompt"
```

---

## Task 4: Update get_container_status to include runtime

**Files:**
- Modify: `src/host-agent/tools/container-tools.ts:98-124`

**Step 1: Add runtime calculation to get_container_status**

In `src/host-agent/tools/container-tools.ts`, update the `createGetContainerStatusTool` execute function (around line 107-123):

```typescript
execute: async (_id: string, args: Static<typeof GetContainerStatusSchema>): Promise<AgentToolResult<GetContainerStatusResult>> => {
  const container = registry.get(args.containerId)
  if (!container) {
    throw new Error(`Container ${args.containerId} not found`)
  }

  const runtime = Date.now() - container.createdAt

  const result = {
    status: container.status,
    exitCode: container.metadata.exitCode ?? undefined,
    runtime
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    details: result
  }
}
```

**Step 2: Update GetContainerStatusResult interface**

At the top of the file (around line 13-16), update the interface:

```typescript
interface GetContainerStatusResult {
  status: string
  exitCode?: number
  runtime?: number
}
```

**Step 3: Build to check for errors**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/host-agent/tools/container-tools.ts
git commit -m "feat(host-agent): add runtime to container status response"
```

---

## Task 5: Integration test with real container

**Files:**
- Test: Manual testing with CLI

**Step 1: Build the project**

Run: `npm run build`
Expected: Build succeeds

**Step 2: Run hello-world example that previously caused infinite loop**

Run: `cd /Users/helanmouse/project/minions && node dist/cli/index.js run "create hello.txt with 'Hello World'" --yes`

Expected output should include:
```
🤖 Using HostAgent
[host] Starting task: {uuid}
[host:tool] create_branch branchName=...
[host:tool_done] create_branch error=false
[host:tool] start_container image=minion-base
[host:tool_done] start_container error=false
[host:tool] get_container_status containerId=...
[host:tool_done] get_container_status error=false
... (repeated polling, but NOT infinite)
[host:tool] get_container_journal containerId=...
[host:tool_done] get_container_journal error=false
[host:event] agent_end

✓ Task completed
```

**Step 3: Verify no infinite loop**

Check that:
- Agent stops polling after container completes (status changes to 'done')
- Total polling attempts < 50
- No API quota exhaustion error
- Task completes successfully

**Step 4: Check logs for status transition**

The logs should show container status changing from 'running' to 'done' after a few polls, not staying 'running' forever.

---

## Task 6: Update host-agent tests for async status updates

**Files:**
- Modify: `src/host-agent/host-agent.test.ts`

**Step 1: Update mock registry to support async updates**

In `src/host-agent/host-agent.test.ts`, ensure mockRegistry.update is properly mocked:

```typescript
mockRegistry = {
  register: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockReturnValue({ id: 'test123', status: 'running' }),
  update: vi.fn().mockReturnValue(true),  // Returns boolean, not Promise
  list: vi.fn().mockReturnValue([]),
  remove: vi.fn().mockResolvedValue(undefined)
} as any
```

**Step 2: Run existing tests**

Run: `npm test src/host-agent/host-agent.test.ts`
Expected: All existing tests still pass

**Step 3: Commit if changes were needed**

```bash
git add src/host-agent/host-agent.test.ts
git commit -m "test(host-agent): update mocks for async status updates"
```

---

## Summary

This plan implements background container monitoring in 6 tasks:

1. **Task 1**: Add background monitoring to start_container tool (10 min)
2. **Task 2**: Add comprehensive unit tests (15 min)
3. **Task 3**: Update system prompt with polling guidelines (5 min)
4. **Task 4**: Add runtime to status response (5 min)
5. **Task 5**: Integration test with real container (10 min)
6. **Task 6**: Update existing tests for compatibility (5 min)

**Key principles followed**:
- DRY: Single background monitoring pattern
- YAGNI: Only add what's needed to fix the bug
- TDD: Tests added for all new functionality
- Frequent commits: 6 commits for 6 logical changes

**Testing strategy**:
- Unit tests verify background monitoring updates registry
- Unit tests verify error handling
- Integration test verifies no infinite loop with real container
- Existing tests updated to remain compatible
