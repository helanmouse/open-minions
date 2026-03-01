# Open Minions - Custom Instructions for Claude

## Project Overview

Open Minions is an autonomous AI coding agent system inspired by Stripe's Minions. It uses a dual-layer architecture with Docker sandbox isolation to safely execute code changes and deliver them via Git patches. V3 integrates pi-mono for unified LLM and agent runtime.

## When Working on This Project

### Understanding the Architecture

Always keep in mind the dual-agent pattern:

1. **Host Agent** - Runs on the user's machine with limited permissions. It:
   - Parses natural language task descriptions
   - Analyzes target repositories (LLM-powered project scan)
   - Prepares git repositories
   - Writes `.env` with LLM credentials and container presets
   - Launches and monitors Docker containers
   - Applies patches using `git am`
   - Pushes changes to remote repositories

2. **Sandbox Agent** - Runs inside a Docker container with full autonomy. It:
   - Works in `/workspace` (copied from host-repo mount)
   - Plans the approach based on task context
   - Maintains a mandatory journal at `/minion-run/journal.md`
   - Executes code changes using inlined coding tools (bash, read, edit, write)
   - Runs tests and linters
   - Commits changes and delivers patches via `deliver_patch` tool
   - Generates patches via `git format-patch` (supports multi-commit)

### Key File Locations

| Component | Location | Purpose |
|-----------|----------|---------|
| CLI Entry | `src/cli/index.ts` | Commander.js CLI interface |
| CLI Setup | `src/cli/setup/tui-setup.ts` | Interactive TUI setup workflow |
| Setup Sources | `src/cli/setup/sources.ts` | Provider sources configuration (18 providers) |
| Host Agent | `src/host-agent/index.ts` | Main host orchestration |
| Host Config | `src/host-agent/config.ts` | Config loading (~/.minion/) |
| Sandbox Agent | `src/sandbox/main.ts` | Container entry point |
| Sandbox Prompts | `src/sandbox/prompts.ts` | System prompt for sandbox agent |
| Sandbox Tools | `src/sandbox/tools/coding.ts` | Inlined bash/read/edit/write tools |
| Deliver Patch | `src/sandbox/tools/deliver-patch.ts` | Patch generation tool |
| Container Presets | `src/sandbox/presets.ts` | Git identity, TZ, locale presets |
| Journal | `src/sandbox/journal.ts` | Agent execution journal |
| Provider Aliases | `src/llm/provider-aliases.ts` | Multi-region provider alias resolution |
| LLM Types | `src/llm/types.ts` | LLM adapter interface |
| Shared Types | `src/types/shared.ts` | Shared constants and types |
| Bootstrap | `docker/bootstrap.sh` | Container startup script |
| Copy Script | `scripts/copy-sandbox.js` | Copies sandbox JS to pi-runtime |

### Coding Conventions

1. **ES Module Imports**: Use `.js` extensions in all imports (Node ESM convention)
   ```typescript
   import { resolvePresets } from '../sandbox/presets.js';
   ```

2. **Type Safety**: Use TypeBox for tool parameter schemas, TypeScript interfaces for internal types
   ```typescript
   const Schema = Type.Object({
     path: Type.String({ description: 'File path' }),
   });
   ```

3. **Error Handling**: Never swallow errors silently. Propagate with context.

4. **Tool Interface**: Sandbox tools use `@mariozechner/pi-agent-core` AgentTool:
   ```typescript
   import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
   import { Type, type Static } from '@sinclair/typebox';
   ```

### Docker Integration Details

When working on Docker-related code:
- Host repo is mounted at `/host-repo` (read-only)
- Run directory is `/minion-run` (context.json, .env, patches/, status.json, journal.md)
- Workspace (writable copy) is `/workspace`
- Patches go to `/minion-run/patches/`
- Status is written to `/minion-run/status.json`
- Journal is at `/minion-run/journal.md`
- pi-runtime is mounted at `/opt/pi-runtime` (read-only)
- `bootstrap.sh` flow: ensure_node → verify_pi_runtime → prepare_workspace → configure_git → start_agent

### Container Presets

The preset system (`src/sandbox/presets.ts`) provides configurable container parameters:
- Git identity (GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL) — prevents git commit failures
- Timezone (TZ) and locale (LANG)
- Defaults are applied automatically; users override via `~/.minion/config.json`:
  ```json
  { "presets": { "git.userName": "Your Name", "timezone": "Asia/Shanghai" } }
  ```
- Host agent writes presets to `.env`, `bootstrap.sh` applies git config

### Interactive Setup System

The setup system (`src/cli/setup/`) provides a TUI-based configuration workflow:
- **Provider Selection**: 18 curated providers defined in `DISPLAY_PROVIDERS` constant
- **Source Selection**: Multi-region support (e.g., China/International sources for Zhipu AI, Kimi, MiniMax, Qwen)
- **Model Selection**: Models displayed in reverse order (newest first)
- **API Key Input**: TUI-based input with masked display for security
- **Provider Unification**: Some providers (e.g., MiniMax) use `actualProvider` field to map sources to different backend providers
- Configuration saved to `~/.minion/.pi/models.json` and `~/.minion/.pi/config.json`

### Dense Journal System

The journal system (`src/sandbox/journal.ts`) provides mandatory execution tracking:
- **Template**: Structured format with State, Key Decisions, Current Progress, Remaining Work, Errors & Blockers
- **Rotation**: When journal grows too large, `rotateJournal()` archives to `journal-001.md`, `journal-002.md`, etc.
- **Mandatory Updates**: Sandbox agent must update journal at each phase — failure to do so is a task failure
- **Location**: `/minion-run/journal.md` in container
- **Purpose**: Better failure diagnostics and context management

### Adding New Sandbox Tools

1. Create or edit in `src/sandbox/tools/`
2. Use `@mariozechner/pi-agent-core` AgentTool type with TypeBox schema
3. Register in `src/sandbox/main.ts` tools array
4. Add compiled `.js` to `scripts/copy-sandbox.js` if it's a new file

### Adding LLM Providers to Setup

To add a new provider to the setup UI:
1. Add provider ID to `DISPLAY_PROVIDERS` array in `src/cli/setup/sources.ts`
2. Add provider configuration to `PROVIDER_SOURCES` object with:
   - `provider`: pi-ai provider ID
   - `displayName`: Human-readable name
   - `description`: Brief description for UI
   - `sources`: Array of source configurations (official, regional, custom)
3. For multi-region providers, use `actualProvider` field in source to map to different backend provider
4. Example: MiniMax uses `actualProvider: 'minimax-cn'` for China source

### Project Status

- **Version**: 3.0.0 (pi-mono integration)
- **Build**: `npm run build` (TypeScript) + `npm run build:sandbox` (copy to pi-runtime)
- **Docker Image**: `npm run docker:build`

### Common Commands

```bash
npm run build           # Compile TypeScript to dist/
npm run build:pi-runtime # Build pi-mono offline runtime
npm run build:sandbox   # Copy sandbox JS to ~/.minion/pi-runtime
npm run lint            # Type check only (tsc --noEmit)
npm test                # Run tests (Vitest)
npm run docker:build    # Build Docker sandbox image
```

### Important Notes

- The agent uses `git format-patch` NOT `git diff` for delivery (supports multi-commit)
- Git identity is pre-configured via container presets (default: "Minion Agent <minion@localhost>")
- The sandbox agent must update `/minion-run/journal.md` at each phase — failure to do so is a task failure
- Journal rotation: When journal grows large, it's archived to `journal-001.md`, `journal-002.md`, etc.
- Configuration: `~/.minion/.pi/models.json` (LLM), `~/.minion/.pi/config.json` (current selection), `~/.minion/config.json` (presets, sandbox settings)
- Setup UI: 18 curated providers with multi-region source selection
- Provider unification: Some providers (e.g., MiniMax) map different sources to different backend providers via `actualProvider` field
