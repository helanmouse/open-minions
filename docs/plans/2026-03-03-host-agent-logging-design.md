# Host Agent Logging Design

**Date:** 2026-03-03

**Goal:** Add real-time logging to HostAgent so users can see what the agent is doing during execution, matching the visibility provided by Sandbox Agent.

**Problem:** Currently HostAgent only prints "🤖 Using HostAgent" and then goes silent. Users can't see tool calls, agent thinking, or progress - they don't know if it's working or stuck.

**Solution:** Add event subscription logging in HostAgent.run() that mirrors Sandbox Agent's logging pattern.

---

## Design Requirements

1. **User Visibility** - Show real-time progress during execution
2. **Debugging** - Provide detailed information when things fail
3. **Consistency** - Match Sandbox Agent's `[sandbox:...]` format with `[host:...]` prefixes
4. **Medium Detail** - Show tool names + key parameters (not full verbose args)

---

## Architecture

### Event Subscription Location

Add logging in `HostAgent.run()` method after Phase 3 (writing .env file), before Phase 5 (executing agent).

### Events to Subscribe To

```typescript
this.agent.subscribe((event: any) => {
  if (event.type === 'tool_execution_start') {
    // Log tool call with key parameters
  } else if (event.type === 'tool_execution_end') {
    // Log tool completion with error status
  } else if (event.type === 'message_end') {
    // Log message completion + track stats (already exists)
  } else if (event.type === 'agent_end') {
    // Log agent completion
  }
})
```

### Log Output

All logs use `console.error()` to avoid mixing with stdout (like Sandbox Agent).

---

## Logging Specifications

### 1. Startup Log

**When:** Beginning of `run()` method
**Format:** `[host] Starting task: {taskId}`
**Example:** `[host] Starting task: e4a4c204-2c9b-4564-ab80-c06a1e3c9079`

### 2. Tool Execution Start

**Event:** `tool_execution_start`
**Format:** `[host:tool] {toolName} {keyParams}`

**Key parameters by tool:**
- `start_container`: `image={image}`
- `get_container_status`: `containerId={containerId}`
- `get_container_journal`: `containerId={containerId}`
- `list_patches`: `containerId={containerId}`
- `apply_patches`: `patches={count}` (count of patch files)
- `create_branch`: `branchName={branchName}`
- `push_changes`: `branch={branch}`

**Examples:**
```
[host:tool] start_container image=minion-base
[host:tool] get_container_status containerId=abc123
[host:tool] apply_patches patches=2
[host:tool] create_branch branchName=fix/login-bug
```

**Implementation notes:**
- Extract key params from `event.args` or `event.input`
- Truncate long values (e.g., taskDescription) to keep logs readable
- Use try-catch to prevent logging errors from crashing the agent

### 3. Tool Execution End

**Event:** `tool_execution_end`
**Format:** `[host:tool_done] {toolName} error={true/false}`

**Examples:**
```
[host:tool_done] start_container error=false
[host:tool_done] apply_patches error=true
```

### 4. Message End

**Event:** `message_end`
**Format:** `[host:msg] stopReason={stopReason} types={contentTypes}`

**Examples:**
```
[host:msg] stopReason=tool_use types=tool_use
[host:msg] stopReason=end_turn types=text
[host:msg] stopReason=max_tokens types=text
```

**Implementation notes:**
- Extract `stopReason` from `event.message?.stopReason`
- Extract content types from `event.message?.content?.map(c => c.type).join(',')`
- Keep existing stats tracking (llmCalls, tokensUsed) in same handler

### 5. Agent End

**Event:** `agent_end`
**Format:** `[host:event] agent_end`

**With errors:**
```
[host:error] {errorMessage}
[host:event] agent_end
```

**Implementation notes:**
- Check `event.messages?.[event.messages.length - 1]?.errorMessage`
- Log error before agent_end if present

---

## Example Full Execution Flow

```
🤖 Using HostAgent
[host] Starting task: e4a4c204-2c9b-4564-ab80-c06a1e3c9079
[host:tool] start_container image=minion-base
[host:tool_done] start_container error=false
[host:msg] stopReason=tool_use types=tool_use
[host:tool] get_container_status containerId=abc123
[host:tool_done] get_container_status error=false
[host:msg] stopReason=tool_use types=tool_use
[host:tool] get_container_journal containerId=abc123
[host:tool_done] get_container_journal error=false
[host:msg] stopReason=tool_use types=tool_use
[host:tool] list_patches containerId=abc123
[host:tool_done] list_patches error=false
[host:msg] stopReason=tool_use types=tool_use
[host:tool] apply_patches patches=1
[host:tool_done] apply_patches error=false
[host:msg] stopReason=end_turn types=text
[host:event] agent_end

✓ Task completed: Task completed - Agent orchestrated execution via tools
```

---

## Implementation Details

### Error Handling

Wrap all logging in try-catch to prevent logging errors from crashing the agent:

```typescript
this.agent.subscribe((event: any) => {
  try {
    // Logging logic here
  } catch (e) {
    // Never let logging crash the agent
  }
})
```

### Parameter Extraction Helper

Create a helper function to extract key parameters:

```typescript
function extractKeyParams(toolName: string, args: any): string {
  switch (toolName) {
    case 'start_container':
      return `image=${args.image}`
    case 'get_container_status':
    case 'get_container_journal':
      return `containerId=${args.containerId}`
    case 'list_patches':
      return `containerId=${args.containerId}`
    case 'apply_patches':
      return `patches=${args.patches?.length || 0}`
    case 'create_branch':
      return `branchName=${args.branchName}`
    case 'push_changes':
      return `branch=${args.branch}`
    default:
      return ''
  }
}
```

### Stats Tracking Integration

The existing `message_end` handler tracks stats. Combine logging with stats:

```typescript
if (event.type === 'message_end') {
  llmCalls++
  if (event.message?.usage) {
    tokensUsed += (event.message.usage.input_tokens || 0) +
                  (event.message.usage.output_tokens || 0)
  }

  // Add logging
  const msg = event.message
  const types = msg?.content?.map((c: any) => c.type).join(',') || ''
  console.error(`[host:msg] stopReason=${msg?.stopReason} types=${types}`)
}
```

---

## Testing Strategy

### Manual Testing

1. Run a simple task: `minion run "create hello.txt"`
2. Verify logs appear in real-time
3. Check that all tool calls are logged
4. Verify error cases show error=true

### Integration Testing

1. Test with actual container execution
2. Verify logs match Sandbox Agent format
3. Check that logs don't interfere with stdout
4. Verify stats tracking still works

---

## Benefits

1. **User Visibility** - Users can see what HostAgent is doing in real-time
2. **Debugging** - Detailed logs help diagnose failures
3. **Consistency** - Matches Sandbox Agent's proven logging pattern
4. **Simple** - Direct console logging, no complex infrastructure
5. **Maintainable** - Easy to add/modify log messages

---

## Future Enhancements

If logging needs become more complex, consider:

1. **Log Levels** - Add debug/info/error levels with filtering
2. **Structured Logging** - JSON format for machine parsing
3. **Log Files** - Write logs to files in addition to console
4. **Logger Class** - Extract logging into separate class for testing

For now, direct console logging is sufficient and matches the existing pattern.
