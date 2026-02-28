# Sandbox Agent Enhancements Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the sandbox agent with search tools, fuzzy edit matching, journal-based context management, and retry/token/iteration controls — all cherry-picked from pi-mono's coding-agent patterns, with zero new dependencies.

**Architecture:** Extend the existing sandbox agent (pi-agent-core Agent class) with inlined search tools, improved edit robustness, a novel journal-based context reset mechanism (replacing traditional LLM-summarized compaction), and a unified ContextManager that handles retry, token tracking, iteration enforcement, and context resets.

**Tech Stack:** TypeScript, @mariozechner/pi-agent-core (Agent class), @sinclair/typebox (tool schemas), Node.js fs/child_process APIs.

---

## Section 1: Search Tools (grep / find / ls)

New file `src/sandbox/tools/search.ts` containing three AgentTool definitions.

### grep

Pattern search respecting `.gitignore`.

- **Parameters:** `pattern` (regex string), `path` (optional directory, default `/workspace`), `include` (optional glob filter), `context` (context lines, default 2)
- **Implementation:** Spawn `git grep -n -C{context} {pattern} -- {path}` inside a git repo; fallback to `grep -rn --include={include}` outside git repos. Exclude `.git`, `node_modules` by default.
- **Output truncation:** Max 200 matching lines. If exceeded, append: `"... truncated ({total} matches). Refine your pattern or narrow the path."`

### find

Glob-based file discovery.

- **Parameters:** `pattern` (glob, e.g. `"**/*.ts"`), `path` (optional start directory, default `/workspace`)
- **Implementation:** Spawn `find {path}` + filter with glob matching, or use Node.js `glob` library. Exclude `.git`, `node_modules`.
- **Output truncation:** Max 500 file paths. If exceeded, append truncation notice.

### ls

Directory listing with metadata.

- **Parameters:** `path` (directory path)
- **Implementation:** `fs.readdir` + `fs.stat`. Return `name type size` per entry, sorted alphabetically.
- **Output:** Tabular format: `filename  type  size`

### Registration

- All three tools use AgentTool + TypeBox schema
- Register in `src/sandbox/main.ts` tools array
- Add `sandbox/tools/search.js` to `scripts/copy-sandbox.js`

---

## Section 2: Edit Fuzzy Matching

Enhance the existing `edit` tool in `src/sandbox/tools/coding.ts`.

### Fuzzy Match Strategy

When `old_string` exact match fails:

1. **Whitespace normalization:** Strip leading/trailing whitespace per line, retry match
2. **Blank line tolerance:** Collapse consecutive blank lines, retry match
3. **Line-level Levenshtein:** Compare line-by-line with Levenshtein distance; accept if total difference ratio < 20%

### Match Resolution

- **Unique fuzzy match found:** Execute replacement. Return result with warning: `"Fuzzy match applied. Matched text differed in whitespace/minor edits."`
- **Multiple fuzzy matches:** Fail. Return all candidate locations (line numbers) so LLM can specify precisely.
- **Zero matches:** Fail with current error behavior (show nearby context).

### Diff Output

After successful replacement (exact or fuzzy), return a unified diff (3 lines context) showing the change. Implement inline diff generation (compare old/new file content line by line) — no external dependency needed.

### Unchanged

- `read`, `write`, `bash` tools remain as-is
- `edit` parameter schema unchanged: `path`, `old_string`, `new_string`

---

## Section 3: Journal-based Context Management

A novel approach to context window management. Instead of LLM-generated summaries (traditional compaction), leverage the agent's own mandatory journal as persistent memory. When context fills up, rotate the journal file and reset the conversation, re-injecting the journal content to restore context.

### Token Tracking

- Subscribe to Agent `message_end` events, accumulate `usage.input` tokens per turn
- Model context window size from environment variable `LLM_CONTEXT_WINDOW` or default 128K
- Threshold: 80% of context window triggers proactive reset

### Context Reset Flow

```
Turn ends → check cumulative input tokens > 80% context window
    ↓ yes
1. Rename /minion-run/journal.md → /minion-run/journal-{N}.md (N = 001, 002, ...)
2. Create fresh /minion-run/journal.md with empty template
3. Call agent.clearMessages()
4. Call agent.prompt() with recovery message:
   "Continue the task. Your previous execution journal:\n\n" + contents of journal-{N}.md
    ↓
Agent resumes from journal context
```

### Overflow Fallback

If LLM returns context overflow error before proactive reset triggers:
- Catch the error in the event handler
- Execute the same reset flow above
- Retry the failed turn

### Journal File Rotation

- Naming: `journal.md` → `journal-001.md` → `journal-002.md` → ...
- On reset, only read the most recent rotated journal (not older ones)
- All journal files preserved in `/minion-run/` for post-mortem diagnostics

### Dense Journal Format

Replace the current loose journal template with a compressed, fact-dense format optimized for context recovery:

```markdown
## Journal Entry {N}

### State
- Phase: [planning|coding|testing|debugging|delivering]
- Files modified: [path list]
- Files read: [path list]
- Tests: [pass|fail|not-run]
- Commits: [hash list]
- Tokens used: {input}/{output}

### Key Decisions
[One line per decision: "Decision: reason"]

### Current Progress
[Concrete changes completed, specific to files and functions]

### Remaining Work
[Specific steps not yet done]

### Errors & Blockers
[Key error lines and resolution, or unresolved blockers]
```

### Journal Writing Rules (in system prompt, English)

- Update journal after every tool call batch
- No narrative text — facts only
- Use full file paths
- Keep only key error lines (no full stack traces)
- Update State section on every phase transition
- Mark completed items explicitly

### Implementation Files

- New: `src/sandbox/context-manager.ts` — ContextManager class
  - `trackUsage(event)` — accumulate tokens from message_end events
  - `shouldReset()` — check threshold
  - `performReset(agent)` — journal rotation + agent.clearMessages() + re-prompt
- Modify: `src/sandbox/main.ts` — integrate ContextManager into agent event loop
- Modify: `src/sandbox/journal.ts` — new dense journal template
- Modify: `src/sandbox/prompts.ts` — updated journal writing rules

---

## Section 4: Retry + Token Tracking + Iteration Enforcement

Unified control layer wrapping the Agent execution loop.

### Retry Mechanism

- Catch LLM API errors: rate limit (429), server errors (5xx), transient network failures
- Exponential backoff: 2s → 4s → 8s, capped at 60s, max 3 retries
- Context overflow errors route to Section 3 reset flow (not simple retry)
- Implementation: wrap Agent event subscription, intercept errors before they propagate

### Token Tracking

- Accumulate input/output tokens from every `message_end` event
- Write to journal State section: `Tokens used: {input}/{output}`
- Write to `/minion-run/status.json` for host agent visibility
- Feed into context reset threshold check (Section 3)

### Iteration Enforcement

Current `maxIterations` is advisory only (mentioned in system prompt). Change to hard enforcement:

- Count turns via `turn_end` events
- At `maxIterations` limit: inject steering message via `agent.steer()`:
  `"You have reached the maximum iteration limit. Call deliver_patch now with your current progress."`
- If agent exceeds limit by 2 additional turns without delivering: force terminate, write `status.json` with `phase: "timeout"`, exit with dedicated exit code

### Implementation

All three concerns (retry, token tracking, iteration enforcement) live in `src/sandbox/context-manager.ts` as a single ContextManager class:

```typescript
class ContextManager {
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private turnCount = 0;
  private resetCount = 0;
  private maxIterations: number;
  private contextWindow: number;

  trackUsage(event: AgentEvent): void;
  shouldReset(): boolean;
  async performReset(agent: Agent): Promise<void>;
  shouldEnforceLimit(): boolean;
  getSteeringMessage(): string;
  getTokenSummary(): { input: number; output: number };
}
```

---

## File Change Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/sandbox/tools/search.ts` | Create | grep, find, ls tools |
| `src/sandbox/tools/coding.ts` | Modify | Add fuzzy matching + diff output to edit tool |
| `src/sandbox/context-manager.ts` | Create | Token tracking, context reset, retry, iteration enforcement |
| `src/sandbox/main.ts` | Modify | Register search tools, integrate ContextManager |
| `src/sandbox/journal.ts` | Modify | Dense journal template |
| `src/sandbox/prompts.ts` | Modify | Journal writing rules, search tool descriptions |
| `scripts/copy-sandbox.js` | Modify | Add search.js, context-manager.js to copy list |

## Key Design Decisions

1. **Cherry-pick over dependency** — Inline code from coding-agent rather than re-adding the dependency
2. **Journal over compaction** — Use agent's own execution journal as context recovery mechanism instead of LLM-generated summaries
3. **File rotation over single file** — Rotate journal files on context reset for clean separation and diagnostics
4. **Steering over termination** — Give agent a chance to deliver before force-terminating on iteration limit
5. **Unified ContextManager** — Single class handles retry, tokens, iterations, and context resets to avoid scattered logic

## Dependencies

No new npm dependencies. All implementations use:
- Node.js built-ins (`fs`, `child_process`, `path`)
- Existing pi-agent-core Agent API (`clearMessages`, `prompt`, `steer`, `subscribe`)
- Existing TypeBox for tool schemas
