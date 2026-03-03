# Host Agent Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add real-time logging to HostAgent so users can see tool calls, agent progress, and execution flow during task execution.

**Architecture:** Add event subscription in HostAgent.run() that logs to console.error() with [host:...] prefixes, matching Sandbox Agent's logging pattern. Extract key parameters from tool calls for medium-detail visibility.

**Tech Stack:** TypeScript, pi-agent-core Agent events, console.error()

---

## Task 1: Create parameter extraction helper function

**Files:**
- Modify: `src/host-agent/host-agent.ts`

**Step 1: Add extractKeyParams helper function**

Add this function inside the HostAgent class (as a private method):

```typescript
private extractKeyParams(toolName: string, args: any): string {
  try {
    switch (toolName) {
      case 'start_container':
        return `image=${args.image || 'unknown'}`
      case 'get_container_status':
      case 'get_container_journal':
        return `containerId=${args.containerId || 'unknown'}`
      case 'list_patches':
        return `containerId=${args.containerId || 'unknown'}`
      case 'apply_patches':
        return `patches=${args.patches?.length || 0}`
      case 'create_branch':
        return `branchName=${args.branchName || 'unknown'}`
      case 'push_changes':
        return `branch=${args.branch || 'unknown'}`
      default:
        return ''
    }
  } catch {
    return ''
  }
}
```

**Step 2: Build to check for TypeScript errors**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git add src/host-agent/host-agent.ts
git commit -m "feat(host-agent): add parameter extraction helper for logging"
```

---

## Task 2: Add startup logging

**Files:**
- Modify: `src/host-agent/host-agent.ts`

**Step 1: Add startup log after taskId generation**

In the `run()` method, after line 56 (`const taskId = this.generateTaskId()`), add:

```typescript
// Log task start
console.error(`[host] Starting task: ${taskId}`)
```

**Step 2: Build to check for errors**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/host-agent/host-agent.ts
git commit -m "feat(host-agent): add startup logging"
```

---

## Task 3: Add tool execution logging

**Files:**
- Modify: `src/host-agent/host-agent.ts`

**Step 1: Add tool_execution_start and tool_execution_end logging**

In the `run()` method, find the existing event subscription (around line 108). Replace the entire subscription with:

```typescript
// Phase 4: Subscribe to agent events to track LLM usage and log execution
this.agent.subscribe((event: any) => {
  try {
    if (event.type === 'tool_execution_start') {
      const toolName = event.toolName || 'unknown'
      const args = event.args || event.input || {}
      const keyParams = this.extractKeyParams(toolName, args)
      const paramsStr = keyParams ? ` ${keyParams}` : ''
      console.error(`[host:tool] ${toolName}${paramsStr}`)
    } else if (event.type === 'tool_execution_end') {
      const toolName = event.toolName || 'unknown'
      const hasError = event.isError || false
      console.error(`[host:tool_done] ${toolName} error=${hasError}`)
    } else if (event.type === 'message_end') {
      llmCalls++
      if (event.message?.usage) {
        tokensUsed += (event.message.usage.input_tokens || 0) + (event.message.usage.output_tokens || 0)
      }
      // Add message logging
      const msg = event.message
      const types = msg?.content?.map((c: any) => c.type).join(',') || ''
      console.error(`[host:msg] stopReason=${msg?.stopReason} types=${types}`)
    } else if (event.type === 'agent_end') {
      // Check for errors in last message
      const last = event.messages?.[event.messages.length - 1]
      if (last?.errorMessage) {
        console.error(`[host:error] ${last.errorMessage}`)
      }
      console.error(`[host:event] agent_end`)
    }
  } catch (e) {
    // Never let logging crash the agent
  }
})
```

**Step 2: Build to check for errors**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/host-agent/host-agent.ts
git commit -m "feat(host-agent): add comprehensive event logging"
```

---

## Task 4: Test logging with unit tests

**Files:**
- Modify: `src/host-agent/host-agent.test.ts`

**Step 1: Add test to verify logging is called**

Add a new test after the existing tests:

```typescript
it('should log execution events', async () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  await agent.run('test task')

  // Verify startup log
  expect(consoleErrorSpy).toHaveBeenCalledWith(
    expect.stringMatching(/\[host\] Starting task: /)
  )

  // Verify agent end log
  expect(consoleErrorSpy).toHaveBeenCalledWith('[host:event] agent_end')

  consoleErrorSpy.mockRestore()
})
```

**Step 2: Run the test**

Run: `npm test src/host-agent/host-agent.test.ts`
Expected: All tests pass including the new logging test

**Step 3: Commit**

```bash
git add src/host-agent/host-agent.test.ts
git commit -m "test(host-agent): add logging verification test"
```

---

## Task 5: Manual integration test

**Files:**
- Test: Manual CLI execution

**Step 1: Build the project**

Run: `npm run build`
Expected: Build succeeds

**Step 2: Create a test directory**

```bash
cd /tmp
mkdir -p test-host-logging
cd test-host-logging
git init
echo "# Test" > README.md
git add .
git commit -m "Initial commit"
```

**Step 3: Run a simple task and observe logs**

Run: `node /Users/helanmouse/project/minions/dist/cli/index.js run "create hello.txt with 'Hello World'" --yes`

Expected output should include:
```
🤖 Using HostAgent
[host] Starting task: {uuid}
[host:tool] start_container image=minion-base
[host:tool_done] start_container error=false
[host:msg] stopReason=tool_use types=tool_use
...
[host:event] agent_end
```

**Step 4: Document test results**

If logs appear correctly, the implementation is working. If not, debug and fix issues.

**Step 5: Clean up test directory**

```bash
cd /tmp
rm -rf test-host-logging
```

---

## Task 6: Update documentation

**Files:**
- Modify: `README.md`

**Step 1: Add logging section to README**

Find the section about running tasks and add a note about logging:

```markdown
### Execution Logs

During execution, you'll see detailed logs showing:
- `[host] Starting task:` - Task initialization
- `[host:tool] {tool} {params}` - Tool calls with key parameters
- `[host:tool_done] {tool} error={bool}` - Tool completion status
- `[host:msg] stopReason={reason}` - LLM response completion
- `[host:event] agent_end` - Agent completion

These logs help you understand what the agent is doing in real-time.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document Host Agent logging output"
```

---

## Summary

This plan implements logging for HostAgent in 6 tasks:

1. **Task 1**: Create parameter extraction helper (5 min)
2. **Task 2**: Add startup logging (3 min)
3. **Task 3**: Add comprehensive event logging (10 min)
4. **Task 4**: Add unit test for logging (5 min)
5. **Task 5**: Manual integration test (10 min)
6. **Task 6**: Update documentation (5 min)

**Total estimated time**: 40 minutes

**Key principles followed**:
- DRY: Single helper function for parameter extraction
- YAGNI: Only log what's needed for visibility and debugging
- TDD: Add test to verify logging works
- Frequent commits: 6 commits for 6 logical changes

**Testing strategy**:
- Unit test verifies logging is called
- Manual integration test verifies logs appear correctly in real execution
- No mocking of actual agent behavior - test the logging layer only
