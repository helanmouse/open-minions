# Single Agent + Rootless Sandbox Design

**Date:** 2026-03-04
**Last Updated:** 2026-03-05
**Status:** Design Approved (Revised)
**Author:** Codex (with user collaboration)

## Executive Summary

This design simplifies Minions to a single host agent that orchestrates rootless containers with per-task isolated clones. It preserves journal/logging, orchestration behavior, multi-provider support, and TUI configuration, while adding an explicit compatibility contract for README user instructions.

When git exists, delivery is `git format-patch` and host-side apply. When git is absent, delivery is artifact-based file sync. User prompt directives are mapped into runtime strategy and container environment variables.

## Goals

1. Single host agent with maximal model autonomy.
2. Strong task isolation using per-task sandboxes and per-task repo clones.
3. Preserve existing features: journal/logs, orchestration behavior, multi-provider support, and TUI setup.
4. Support concurrent tasks without shared `.git` contention.
5. Provide a non-git fallback delivery path.
6. Define README instruction compatibility as explicit, testable acceptance criteria.

## Non-Goals

1. Kernel-level isolation guarantees (kernel CVEs are out of scope).
2. Network or path restriction inside the sandbox (sandbox has broad freedom).
3. Worktree-based concurrency.
4. Special system-prompt workflow for PR creation.

## Assumptions

1. Host agent runs as non-root.
2. Sandboxes run with rootless Docker or Podman (prefer rootless when available).
3. The sandbox can access the network and the full task workspace.
4. If a directory is not a git repository, the system still returns usable file changes.
5. User prompt may include arbitrary container env vars in `KEY=VALUE` format.

## Architecture

```
User Prompt
   ↓
Host Agent (single)
   ↓
Instruction Strategy Parser + Env Extractor
   ↓
Rootless Sandbox Container (per task)
   ↓
Patch/Artifact → Host Apply
```

## Components

1. **Host Agent**
   - Parses user intent, derives runtime strategy, and forwards env vars.
   - Launches and monitors rootless containers.
   - Collects artifacts and applies them to the target directory.

2. **Instruction Strategy Parser**
   - Extracts orchestration directives from prompt text (`preserve`, `snapshot`, `parallel`, `retry`, `auto-apply`, resource hints).
   - Produces host runtime strategy and optional strategy env vars.

3. **Prompt Env Extractor**
   - Extracts explicit `KEY=VALUE` declarations from user prompt.
   - Forwards arbitrary env vars to container without whitelist.

4. **Repo Resolver**
   - Detects whether the target directory is a git repository.
   - Chooses delivery strategy:
     - git repo → patch workflow
     - non-git → packaged file workflow

5. **Sandbox Runner**
   - Starts containers (Docker/Podman, rootless preferred).
   - Executes the task and produces delivery artifacts.

6. **Artifact Collector**
   - Retrieves patch or file package from the sandbox.

7. **Applier**
   - git repo: `git am` (fallback to `git apply`).
   - non-git: unpack and sync files to the target directory.

## Single-Agent System Prompt Contract

The single host agent prompt must enforce these rules:

1. **Host-side control**
   - Host actions are allowed only through four native tools: `podman`, `docker`, `git`, `tar`.
   - Host generic shell is forbidden.
   - Runtime preference is `podman` first, then `docker` fallback.

2. **Container-side autonomy**
   - After container start, agent may execute arbitrary commands inside container via `podman/docker exec`.
   - In-container commands are not limited by host command allowlist semantics.
   - Agent can install dependencies, run tests/build/lint, and perform any required task actions inside container.

3. **Execution discipline**
   - Always report effective strategy, effective env vars, runtime chosen, delivery mode, and final apply result.
   - On denied host command, adapt to policy-compliant call or fallback path.

4. **Few-shot requirement**
   - Prompt must include concrete tool-call examples for:
     - parallel + retry + env passthrough
     - `podman` failure fallback to `docker`
     - non-git artifact delivery
     - in-container unrestricted execution using `exec ... bash -lc "<command>"`

## In-Container Agent Responsibilities (Unrestricted Mode)

When a sandbox container is running, the agent is expected to use full in-container autonomy and take all reasonable actions needed to achieve the user goal.

1. **Plan and execute**
   - Break down the user goal into concrete steps and execute until completion or hard blocker.
   - Prefer direct execution over speculative analysis.

2. **Environment setup**
   - Install required system packages and language dependencies.
   - Configure runtime tools needed for build, test, lint, and debug.

3. **Code and verification loop**
   - Inspect, modify, and create files as needed.
   - Run build, lint, typecheck, and test commands.
   - Iterate on failures until passing or until blocked by external constraints.

4. **Debugging and recovery**
   - Collect error output, isolate root cause, and apply targeted fixes.
   - Use retries and alternative approaches when first attempt fails.
   - Continue with best-effort completion instead of stopping early.

5. **Research and dependency discovery**
   - Use network access in container to consult docs and fetch dependencies when needed.
   - Prefer authoritative sources and minimal dependency changes.

6. **Progress tracking**
   - Keep status/journal data updated with factual progress, blockers, and decisions.
   - Do not claim completion when verification still fails.

7. **Delivery**
   - Produce required delivery output (`patch` for git mode, artifact for non-git mode).
   - If full completion is impossible, deliver the best valid intermediate result plus explicit blocker details.

## Minimal Tool Contract (Four Native Tools + Shared Policy Engine)

The host agent uses exactly four host tools:

- `podman({ args, cwd, env, timeoutMs, runId }) -> { exitCode, stdout, stderr, deniedReason? }`
- `docker({ args, cwd, env, timeoutMs, runId }) -> { exitCode, stdout, stderr, deniedReason? }`
- `git({ args, cwd, env, timeoutMs, runId }) -> { exitCode, stdout, stderr, deniedReason? }`
- `tar({ args, cwd, env, timeoutMs, runId }) -> { exitCode, stdout, stderr, deniedReason? }`

Each tool call is intentionally close to native CLI usage so agent command construction remains intuitive.

### Tool invocation style (shell-like)

Agent should call tools directly by tool name, not wrapper method names.

- `tool=podman, args=["run", ...]`
- `tool=docker, args=["exec", ...]`
- `tool=git, args=["am", ...]`
- `tool=tar, args=["-xzf", ...]`

### Allowed subcommands

- `podman|docker`: `pull`, `run`, `exec`, `logs`, `wait`, `stop`, `rm`, `cp`, `inspect`, `commit`
- `git`: `clone`, `status`, `add`, `commit`, `format-patch`, `am`, `apply`, `am --abort`, `rev-parse`
- `tar`: `-czf`, `-xzf`

### Shared policy engine

All four tools must use one shared policy engine in code to avoid rule drift:

1. **Allowlist first**: command/subcommand must be explicitly allowed.
2. **Denylist second**: explicitly blocked flags/patterns are always rejected.
3. **Argument validation**: reject unsafe combinations even when subcommand is allowed.
4. **Path validation**: host file paths restricted to run directories + target working directory.
5. **Consistent denial output**: every rejection returns machine-readable `deniedReason`.

### Host safety rules

1. Apply safety checks to host-impacting container lifecycle operations (`run`, `commit`, `cp`, mounts/network flags).
2. Deny high-risk launch flags such as `--privileged`, `--pid=host`, `--ipc=host`, `--device`, unsafe capability grants, and dangerous host root mounts.
3. Keep host generic shell disabled at all times.
4. For `exec`, allow arbitrary in-container shell payload (`bash -lc "<any command>"`) after container start.

## Data Flow

1. Host Agent receives task and target path.
2. Strategy Parser extracts orchestration directives from prompt.
3. Prompt Env Extractor collects `KEY=VALUE` declarations from prompt.
4. Repo Resolver checks for `.git`.
5. Host Agent merges runtime options and env vars using precedence rules.
6. Host Agent creates rootless sandbox container with merged env vars.
7. Sandbox executes:
   - git repo: `git clone` → modify → `git format-patch`
   - non-git: copy → modify → package (`tar` or `zip`)
   - agent can run unrestricted in-container commands via `exec ... bash -lc "<command>"`
8. Artifact Collector returns output to host.
9. Host Applier applies results to target directory.
10. Host Agent reports outcome, logs, and strategy/status fields.

## Artifact Strategies

### Git Repo (Default)

- Clone inside sandbox to ensure isolation.
- Produce `git format-patch` for deterministic application.
- Host applies via `git am`; on failure, fallback to `git apply` and report conflicts.

### Non-Git Repo (Fallback)

- Copy directory to sandbox workspace.
- Produce a package of changed files (`tar` or `zip`).
- Host applies by unpacking and synchronizing files into the target directory.

## README Instruction Compatibility Matrix

This matrix is a required acceptance artifact.

| README instruction / keyword | Env mapping | Trigger | Execution path | Fallback | Observability |
| --- | --- | --- | --- | --- | --- |
| `preserve`, `keep container`, `保留` | `MINION_PRESERVE_ON_FAILURE=true` | Prompt keyword or explicit env | Host keeps failed container and records container ID | If keep fails, preserve run artifacts/logs | `status.preserved`, host logs include preserve action |
| `snapshot`, `快照` | `MINION_SNAPSHOT_MODE=on_failure` (or `always` when explicitly requested) | Prompt keyword or explicit env | Host snapshots container at configured lifecycle point | Snapshot failure does not fail main task | `status.snapshotId` or `status.snapshotError` |
| `parallel`, `并行` | `MINION_PARALLEL_RUNS=<N>` | Prompt includes parallel count | Host launches N isolated clone+sandbox runs | Partial-success merge policy; all-failed summary | `status.parallelRuns`, per-run statuses |
| `retry`, `重试` | `MINION_RETRY_MAX=<N>`, `MINION_RETRY_BACKOFF_MS=<ms>` | Prompt keyword or explicit env | Host retries failed run with backoff | Stop on retry max, surface last error | `status.retryCount`, `status.lastError` |
| `auto-apply`, `自动应用` | `MINION_AUTO_APPLY=true` | Prompt keyword or explicit env | Host applies patches/artifacts without confirmation | On apply failure, switch to manual conflict path | `status.applyMode=auto|manual` |
| Resource hints (`8g memory`, `4 cores`) | `SANDBOX_MEMORY=<mem>`, `SANDBOX_CPUS=<n>` | Prompt parse or explicit env | Host overrides sandbox resource config | Invalid value falls back to defaults | `status.runtimeConfig.memory/cpus` |
| `MINION_AI_MODE=true` | `MINION_AI_MODE=true` | Explicit env in prompt/config | Host forwards env var to sandbox container | None | startup logs include effective env |
| "Analyze project, select image" | `MINION_IMAGE_STRATEGY=analyze` (or `MINION_IMAGE=<name>` when explicit) | Prompt asks for analysis/selection | Host performs analysis and chooses image unless explicitly overridden | Use default base image on analysis failure | `status.imageSelection.source=analysis|override|default` |
| Arbitrary env vars (e.g., `JAVA_HOME`, `TZ`) | Pass-through as provided (`KEY=VALUE`) | Prompt includes env assignment | Host forwards env vars directly into container | Parse error on malformed pair | startup logs include forwarded env pairs |
| In-container unrestricted execution | N/A | Task needs arbitrary build/test/debug/install commands | Agent runs `podman/docker exec ... bash -lc "<command>"` | If exec denied/failed, retry/fallback runtime then continue | logs include exec command summary and exit code |
| PR request (e.g., "create PR") | None required | Prompt asks for PR | Handled by agent natural-language capability if repo context supports it | If remote context missing, report actionable failure | task summary includes PR action result |

## Environment Variable Passthrough Policy

1. Prompt-declared env vars in `KEY=VALUE` are forwarded to the container.
2. Any key is allowed (no whitelist).
3. Values are not masked in logs or status output.
4. If the same key appears multiple times, the last value wins and overwrite is logged.

### Effective value precedence

1. CLI explicit options.
2. Prompt-declared env vars (`KEY=VALUE`).
3. Prompt keyword-derived strategy variables.
4. Config defaults.

## Error Handling

1. **Container start failure**
   - Retry and/or switch runtime (Docker ↔ Podman).
2. **Patch apply failure**
   - Attempt `git am --abort`, then fallback to `git apply`.
   - If still failing, emit conflict report and require user confirmation.
3. **Artifact retrieval failure**
   - Preserve artifact for manual inspection.
4. **Sandbox task failure**
   - Preserve container when configured and emit logs.
5. **Prompt env parse failure**
   - Reject malformed env token and continue with valid tokens.
6. **Strategy/env conflict**
   - Resolve by precedence and record effective values in status/logs.
7. **Host policy denial**
   - Return `deniedReason`, adapt command or switch fallback path.

## Concurrency

- Each task runs in a separate container with a separate repo clone.
- No shared `.git` state across concurrent tasks.
- Host coordinates artifact application to avoid simultaneous writes to the same target directory.
- Parallel runs use independent run directories and isolated artifact channels.

## Security Posture

- Rootless runtime avoids host root escalation through container control.
- Host agent runs as non-root.
- No in-sandbox path/network restrictions by design.
- Kernel-level isolation guarantees are out of scope.

## Acceptance Criteria

1. Design includes a `README Instruction Compatibility Matrix` section.
2. Each matrix row defines instruction, env mapping, trigger, execution path, fallback, and observability.
3. Matrix covers at least:
   - preserve
   - snapshot
   - parallel
   - retry
   - auto-apply
   - resource hints
   - `MINION_AI_MODE`
   - analyze/select image
4. Arbitrary prompt env var pass-through is specified and non-whitelisted.
5. Precedence rules are defined and testable.
6. PR-style requests are explicitly treated as natural-language capabilities, not system-prompt hardwired flow.
7. Prompt contract explicitly allows unrestricted in-container execution via `exec`.
8. Four-tool contract is documented with allowed subcommands and denied behavior.
9. All tool filtering is centralized in one shared policy engine (allowlist + denylist + arg/path checks).
10. In-container responsibilities explicitly require a full plan→execute→verify→debug→deliver loop with best-effort completion.

## Open Questions

1. Default package format for non-git fallback: `tar` vs `zip`.
2. Default max cap for `MINION_PARALLEL_RUNS`.
