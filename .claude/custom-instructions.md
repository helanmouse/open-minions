# Open Minions - Custom Instructions for Claude

## Project Overview

Open Minions is an autonomous AI coding agent system inspired by Stripe's Minions. It uses a dual-layer architecture with Docker sandbox isolation to safely execute code changes and deliver them via Git patches.

## When Working on This Project

### Understanding the Architecture

Always keep in mind the dual-agent pattern:

1. **Host Agent** - Runs on the user's machine with limited permissions. It:
   - Parses natural language task descriptions
   - Analyzes target repositories
   - Prepares git repositories
   - Launches and monitors Docker containers
   - Applies patches using `git am`
   - Pushes changes to remote repositories

2. **Sandbox Agent** - Runs inside a Docker container with full autonomy. It:
   - Clones the repository from the host-repo mount
   - Plans the approach based on task context
   - Executes code changes using available tools
   - Runs tests and linters
   - Commits changes with proper messages
   - Generates patches via `git format-patch`

### Key File Locations

| Component | Location | Purpose |
|-----------|----------|---------|
| CLI Entry | `src/cli/index.ts` | Commander.js CLI interface |
| Host Agent | `src/host-agent/index.ts` | Main host orchestration |
| Sandbox Agent | `src/agent/main.ts` | Container entry point |
| Agent Loop | `src/worker/agent-loop.ts` | Tool-based iteration |
| Tool Registry | `src/tools/registry.ts` | Tool management |
| LLM Factory | `src/llm/factory.ts` | Adapter creation |
| Config | `src/config/index.ts` | Zod-based config loading |

### Coding Conventions

1. **ES Module Imports**: Use `.js` extensions in all imports (Node ESM convention)
   ```typescript
   import { loadConfig } from '../config/index.js';
   ```

2. **Type Safety**: Use Zod for runtime validation of configs and inputs
   ```typescript
   const ConfigSchema = z.object({
     llm: z.object({ /* ... */ }),
     sandbox: z.object({ /* ... */ }),
   });
   ```

3. **Error Handling**: Never swallow errors silently. Propagate with context.

4. **Tool Interface**: All tools must implement `AgentTool`:
   ```typescript
   interface AgentTool {
     name: string;
     description: string;
     parameters: Record<string, unknown>;
     execute(params: Record<string, any>, ctx: ToolContext): Promise<ToolResult>;
   }
   ```

### Docker Integration Details

When working on Docker-related code:
- Host repo is mounted at `/host-repo` (read-only)
- Work directory is `/minion-run`
- Workspace (writable clone) is `/minion-run/workspace`
- Patches go to `/minion-run/patches/`
- Status is written to `/minion-run/status.json`

### Adding New Tools

To add a new tool:

1. Create file in `src/tools/` (e.g., `src/tools/my-tool.ts`)
2. Implement `AgentTool` interface
3. Export as `myTool` constant
4. Register in `src/agent/main.ts`:
   ```typescript
   import { myTool } from '../tools/my-tool.js';
   // ... in constructor:
   [bashTool, readTool, /* ... */, myTool].forEach(t => registry.register(t));
   ```

### Adding LLM Providers

To add a new LLM provider:

1. Create file in `src/llm/` (e.g., `src/llm/myprovider.ts`)
2. Implement `LLMAdapter` interface
3. Add to factory in `src/llm/factory.ts`
4. Update Zod schema in `src/config/index.ts` to include provider option

### Project Status

- **Version**: 2.0.0 (architecture rewrite)
- **Tests**: Not yet implemented
- **Build**: Run `npm run build` to compile TypeScript
- **Docker Image**: Run `npm run docker:build` to build sandbox image

### Common Commands

```bash
npm run build      # Compile TypeScript to dist/
npm run lint       # Type check only (tsc --noEmit)
npm test           # Run tests (Vitest)
npm run dev:cli    # Run CLI directly with tsx
npm run docker:build  # Build Docker sandbox image
```

### Important Notes

- The agent uses `git format-patch` NOT `git diff` for delivery
- Git commits in the container use "Minion Agent <minion@localhost>" as the author
- The watchdog circuit breaker prevents runaway costs via iteration limits
- Configuration is exclusively through environment variables (`.env` file support)
