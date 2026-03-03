# Container Status Monitoring Design

**Date:** 2026-03-04

**Goal:** Fix infinite loop bug where Agent polls `get_container_status` forever because container status never updates from `'running'` to `'done'`/`'failed'`.

**Problem:** Currently, `start_container` registers containers with status `'running'` but never updates the registry when containers complete. The `get_container_status` tool always returns `'running'`, causing Agent to poll infinitely until API quota is exhausted.

**Solution:** Add background monitoring that updates registry when containers complete, following Claude Code's non-blocking tool pattern.

---

## Architecture Overview

**Key Components:**

1. **start_container tool** - Launches container, registers with status `'running'`, starts background monitor
2. **Background monitor** - Calls `handle.wait()` asynchronously, updates registry on completion
3. **get_container_status tool** - Reads current registry status (now dynamically updated)
4. **System prompt** - Add polling limits (max 50 attempts, 10 second intervals, timeout handling)

**Data Flow:**

```
Agent calls start_container
  ↓
Tool starts container → Registry: status='running'
  ↓
Tool returns immediately (non-blocking)
  ↓
Background: handle.wait() → Container completes
  ↓
Background: registry.update() → status='done'/'failed'
  ↓
Agent polls get_container_status → Reads updated status
  ↓
Agent reads journal and proceeds
```

**Design Principle:** Tools return immediately (non-blocking), background monitoring updates shared state (registry), agent polls with explicit limits.

---

## Background Monitoring Implementation

**Location:** `src/host-agent/tools/container-tools.ts` in `createStartContainerTool()`

**Implementation:**

```typescript
// After starting container and registering
const handle = await sandbox.start(config)

registry.register({
  id: handle.containerId,
  taskId: handle.containerId,
  status: 'running',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  metadata: { runDir }
})

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
        error: error.message
      }
    })
  })

// Return immediately
return {
  content: [{
    type: 'text',
    text: JSON.stringify({
      containerId: handle.containerId,
      status: 'running',
      message: 'Container started. Use get_container_status to monitor progress.'
    })
  }]
}
```

**Key Points:**
- `handle.wait()` is NOT awaited - runs in background
- `.then()` updates registry when container completes successfully
- `.catch()` handles unexpected errors (Docker crashes, etc.)
- Tool returns immediately with `status='running'`
- Registry becomes source of truth for current status

---

## System Prompt Updates

**Location:** `src/host-agent/prompts.ts` in `buildHostAgentSystemPrompt()`

**Change 1: Update line 45**

```markdown
// OLD
5. **Monitor**: Wait for container to complete (poll get_container_status if needed)

// NEW
5. **Monitor**: Poll get_container_status every 10 seconds until status changes to 'done' or 'failed'
   - Maximum 50 polling attempts (timeout after ~8 minutes)
   - If timeout occurs, read journal anyway to see what happened
   - Status will be: 'running' → 'done' (success) or 'failed' (error)
```

**Change 2: Add new section after line 123**

```markdown
## Container Monitoring Guidelines

When monitoring container execution:

1. **Polling Interval**: Wait 10 seconds between get_container_status calls
2. **Timeout Limit**: Stop polling after 50 attempts (~8 minutes total)
3. **Status Values**:
   - `'running'` - Container is still executing
   - `'done'` - Container completed successfully (exitCode: 0)
   - `'failed'` - Container failed (exitCode: non-zero)
4. **On Timeout**: If still 'running' after 50 attempts, call get_container_journal to see progress
5. **Always Read Journal**: After status changes to 'done' or 'failed', ALWAYS read journal first

Example monitoring pattern:
```
let attempts = 0
while (attempts < 50) {
  status = get_container_status(containerId)
  if (status === 'done' || status === 'failed') break
  wait 10 seconds
  attempts++
}
get_container_journal(containerId)  // Always read journal
```
```

**Rationale:**
- Explicit polling limits prevent infinite loops
- 10 second interval balances responsiveness vs API calls
- 50 attempts = ~8 minutes timeout (reasonable for most tasks)
- Clear instructions on what to do when timeout occurs

---

## Error Handling & Edge Cases

**Edge Cases:**

1. **Container completes before first poll**
   - Background monitor updates registry immediately
   - First `get_container_status` call returns `'done'`/`'failed'`
   - ✅ Works correctly - no special handling needed

2. **Docker daemon crashes**
   - `handle.wait()` Promise rejects
   - `.catch()` updates registry to `'failed'` with error message
   - Agent sees `'failed'` status and reads journal
   - ✅ Handled by catch block

3. **HostAgent process crashes mid-execution**
   - Background monitoring stops
   - Container keeps running in Docker
   - On restart, container is orphaned (not in registry)
   - ❌ **Limitation:** No recovery mechanism (acceptable for v1)

4. **Agent hits timeout (50 attempts)**
   - System prompt instructs: read journal anyway
   - Journal may show partial progress
   - Agent reports timeout to user with journal content
   - ✅ Handled by system prompt

5. **Multiple containers started**
   - Each gets its own background monitor
   - Registry tracks all independently
   - Agent can poll each separately
   - ✅ Works correctly - registry handles multiple entries

**Error Messages:**

When `get_container_status` is called:
- Container not found → Return error: `"Container {id} not found in registry"`
- Container running → Return: `{ status: 'running', runtime: <ms> }`
- Container done → Return: `{ status: 'done', exitCode: 0, runtime: <ms> }`
- Container failed → Return: `{ status: 'failed', exitCode: <code>, runtime: <ms> }`

**Acceptable Limitations:**
- No persistence across HostAgent restarts (containers become orphaned)
- No progress updates during execution (only final status)
- No cancellation mechanism (would require additional tool)

These are acceptable for the current use case. Future enhancements could add persistence or progress streaming.

---

## Testing Strategy

**Unit Tests:**

1. **Test background monitoring updates registry**
   - Mock `handle.wait()` to resolve after delay
   - Verify registry status changes from `'running'` to `'done'`
   - Verify exitCode is stored in metadata

2. **Test error handling in background monitor**
   - Mock `handle.wait()` to reject with error
   - Verify registry status changes to `'failed'`
   - Verify error message is stored in metadata

3. **Test get_container_status returns updated status**
   - Register container with status `'done'`
   - Call `get_container_status`
   - Verify it returns `'done'` (not hardcoded `'running'`)

**Integration Tests:**

1. **Test full workflow with real container**
   - Start container with simple task
   - Poll `get_container_status` until completion
   - Verify status changes to `'done'`
   - Verify journal is readable

2. **Test timeout scenario**
   - Start container with long-running task (or mock slow container)
   - Poll 50 times
   - Verify agent stops polling and reads journal

**Manual Testing:**

1. Run the hello-world example that previously caused infinite loop
2. Observe logs showing status transitions
3. Verify agent stops polling after completion
4. Verify no API quota exhaustion

**Test Files to Modify:**
- `src/host-agent/tools/container-tools.test.ts` - Add background monitoring tests
- `src/host-agent/host-agent.test.ts` - Update existing tests to handle async status updates

---

## Implementation Summary

**Files to Modify:**

1. `src/host-agent/tools/container-tools.ts`
   - Add background monitoring in `createStartContainerTool()`
   - Update return message to mention monitoring

2. `src/host-agent/prompts.ts`
   - Update line 45 with polling instructions
   - Add "Container Monitoring Guidelines" section

3. `src/host-agent/tools/container-tools.test.ts`
   - Add tests for background monitoring
   - Add tests for error handling

4. `src/host-agent/host-agent.test.ts`
   - Update existing tests to handle async status updates

**Benefits:**

- ✅ Fixes infinite loop bug
- ✅ Minimal code changes (~10 lines)
- ✅ No new dependencies
- ✅ Maintains agent-driven architecture
- ✅ Follows Claude Code's non-blocking tool pattern
- ✅ Clear error handling and timeout behavior

**Trade-offs:**

- ⚠️ No persistence across restarts (acceptable for v1)
- ⚠️ No progress updates during execution (only final status)
- ⚠️ Requires agent to implement polling logic (guided by system prompt)
