# Single Agent + Rootless Sandbox Design

**Date:** 2026-03-04
**Status:** Design Approved
**Author:** Codex (with user collaboration)

## Executive Summary

This design simplifies the Minions architecture to a single host agent that orchestrates rootless containers. Each task runs in its own sandbox with a full clone of the target repository (when git is present), and returns results as patches. For non-git directories, the sandbox produces a file package that the host applies. The design prioritizes isolation, concurrency, and minimal orchestration complexity while preserving logs, multi-provider support, and the existing TUI setup.

## Goals

1. Single host agent with maximal model autonomy.
2. Strong task isolation using per-task sandboxes and per-task repo clones.
3. Preserve existing features: journal/logs, AI orchestration behaviors, multi-provider support, TUI configuration.
4. Support concurrent tasks without shared `.git` contention.
5. Provide a non-git fallback delivery path.

## Non-Goals

1. Kernel-level isolation guarantees (kernel CVEs are out of scope).
2. Network or path restriction inside the sandbox (sandbox has broad freedom).
3. Worktree-based concurrency.

## Assumptions

1. Host agent runs as non-root.
2. Sandboxes run with rootless Docker or Podman (prefer rootless when available).
3. The sandbox can access the network and the full task workspace.
4. If a directory is not a git repository, the system should still return usable file changes.

## Architecture

```
User Prompt
   ↓
Host Agent (single)
   ↓
Rootless Sandbox Container (per task)
   ↓
Artifacts → Host Apply
```

## Components

1. **Host Agent**
   - Parses user intent and selects delivery mode.
   - Launches and monitors rootless containers.
   - Collects artifacts and applies them to the target directory.

2. **Repo Resolver**
   - Detects whether the target directory is a git repository.
   - Chooses delivery strategy:
     - git repo → patch workflow
     - non-git → packaged file workflow

3. **Sandbox Runner**
   - Starts containers (Docker/Podman, rootless preferred).
   - Executes the task, produces artifacts.

4. **Artifact Collector**
   - Retrieves patch or file package from the sandbox.

5. **Applier**
   - git repo: `git am` (fallback to `git apply`).
   - non-git: unpack and sync files to the target directory.

## Data Flow

1. Host Agent receives the task and target path.
2. Repo Resolver checks for `.git`.
3. Host Agent creates a rootless sandbox container.
4. Sandbox executes:
   - git repo: `git clone` → modify → `git format-patch`
   - non-git: copy → modify → package (`tar` or `zip`)
5. Artifact Collector returns output to host.
6. Host Applier applies results to target directory.
7. Host Agent reports outcome and logs.

## Artifact Strategies

### Git Repo (Default)

- Clone inside sandbox to ensure isolation.
- Produce `git format-patch` for deterministic application.
- Host applies via `git am`; on failure, fallback to `git apply` and report conflicts.

### Non-Git Repo (Fallback)

- Copy directory to sandbox workspace.
- Produce a package of changed files (tar/zip).
- Host applies by unpacking and synchronizing files into the target directory.

## Error Handling

1. **Container start failure**
   - Retry and/or switch runtime (Docker ↔ Podman).
2. **Patch apply failure**
   - Attempt `git am --abort`, then fallback to `git apply`.
   - If still failing, emit a conflict report and require user confirmation.
3. **Artifact retrieval failure**
   - Preserve artifact for manual inspection.
4. **Sandbox task failure**
   - Preserve container when configured and emit logs.

## Concurrency

- Each task runs in a separate container with a separate repo clone.
- No shared `.git` state across concurrent tasks.
- Host agent coordinates artifact application to avoid simultaneous writes to the same target directory.

## Security Posture

- Rootless runtime avoids host root escalation through container control.
- Host agent runs as non-root.
- No in-sandbox path/network restrictions by design.
- Kernel-level isolation guarantees are out of scope.

## Open Questions

1. Default package format for non-git fallback: `tar` vs `zip`.
2. Whether to keep automatic delivery selection strictly based on repo detection or also on prompt hints.
