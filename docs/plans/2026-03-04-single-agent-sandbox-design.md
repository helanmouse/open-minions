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

## Open Questions

1. Default package format for non-git fallback: `tar` vs `zip`.
2. Default max cap for `MINION_PARALLEL_RUNS`.
