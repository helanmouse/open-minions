# Minions MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a CLI + Gateway + Agent Worker system that takes a task description, uses an LLM to write code, runs lint, pushes a branch, and creates a GitLab Merge Request.

**Architecture:** Three-layer system — CLI client submits tasks via HTTP to a Fastify Gateway, which queues them in BullMQ. Agent Workers pick up tasks, execute YAML-defined Blueprints mixing deterministic steps (git, lint, push) with LLM-driven agent steps (coding, fixing).

**Tech Stack:** TypeScript, Node.js, Fastify, BullMQ, Redis, Commander.js, @gitbeaker/rest, js-yaml, Vitest

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/index.ts`

**Step 1: Initialize package.json**

```bash
cd /Users/helanmouse/project/minions
npm init -y
```

**Step 2: Install core dependencies**

```bash
npm install typescript fastify bullmq commander js-yaml @gitbeaker/rest zod dotenv
npm install -D @types/node @types/js-yaml vitest tsx
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "resolveJsonModule": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "test"]
}
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
.env
*.log
```

**Step 5: Create placeholder entry point**

Create `src/index.ts`:
```typescript
export const VERSION = '0.1.0';
```

**Step 6: Add scripts to package.json**

Add to `package.json` scripts:
```json
{
  "scripts": {
    "build": "tsc",
    "dev:server": "tsx src/server/index.ts",
    "dev:cli": "tsx src/cli/index.ts",
    "test": "vitest --run",
    "lint": "tsc --noEmit"
  }
}
```

**Step 7: Verify build works**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 8: Commit**

```bash
git add package.json tsconfig.json .gitignore src/index.ts
git commit -m "chore: scaffold project with TypeScript, Fastify, BullMQ"
```

---

### Task 2: Core Types & Config

**Files:**
- Create: `src/types.ts`
- Create: `src/config/index.ts`
- Create: `test/config.test.ts`

**Step 1: Write the failing test**

Create `test/config.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config/index.js';

describe('loadConfig', () => {
  it('returns default config when no env vars set', () => {
    const config = loadConfig();
    expect(config.server.port).toBe(3000);
    expect(config.server.host).toBe('127.0.0.1');
    expect(config.redis.url).toBe('redis://localhost:6379');
    expect(config.llm.provider).toBe('openai');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/config.test.ts`
Expected: FAIL — module not found

**Step 3: Create core types**

Create `src/types.ts`:
```typescript
export type TaskStatus =
  | 'queued' | 'running' | 'lint_pass'
  | 'ci_running' | 'ci_pass' | 'mr_created'
  | 'done' | 'needs_human' | 'failed';

export interface TaskRequest {
  id: string;
  repo_url: string;
  description: string;
  issue_id?: string;
  title?: string;
  blueprint: string;           // e.g. "fix-issue"
  created_at: string;
}

export interface TaskState {
  id: string;
  status: TaskStatus;
  request: TaskRequest;
  steps_completed: string[];
  error?: string;
  mr_url?: string;
  started_at?: string;
  finished_at?: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface ToolContext {
  workdir: string;
  task: TaskRequest;
  stepResults: Record<string, unknown>;
}

export type LLMEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call'; id: string; name: string; arguments: string }
  | { type: 'done'; usage?: { input_tokens: number; output_tokens: number } }
  | { type: 'error'; error: string };
```

**Step 4: Write config loader**

Create `src/config/index.ts`:
```typescript
import { z } from 'zod';

const ConfigSchema = z.object({
  server: z.object({
    port: z.number().default(3000),
    host: z.string().default('127.0.0.1'),
  }),
  redis: z.object({
    url: z.string().default('redis://localhost:6379'),
  }),
  llm: z.object({
    provider: z.enum(['openai', 'anthropic', 'ollama']).default('openai'),
    model: z.string().default('gpt-4o'),
    apiKey: z.string().default(''),
    baseUrl: z.string().optional(),
  }),
  gitlab: z.object({
    url: z.string().default('https://gitlab.com'),
    token: z.string().default(''),
  }),
  agent: z.object({
    maxIterations: z.number().default(20),
    maxCiRetries: z.number().default(2),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  return ConfigSchema.parse({
    server: {
      port: Number(process.env.MINION_PORT) || undefined,
      host: process.env.MINION_HOST || undefined,
    },
    redis: {
      url: process.env.REDIS_URL || undefined,
    },
    llm: {
      provider: process.env.LLM_PROVIDER || undefined,
      model: process.env.LLM_MODEL || undefined,
      apiKey: process.env.LLM_API_KEY || undefined,
      baseUrl: process.env.LLM_BASE_URL || undefined,
    },
    gitlab: {
      url: process.env.GITLAB_URL || undefined,
      token: process.env.GITLAB_TOKEN || undefined,
    },
    agent: {
      maxIterations: Number(process.env.AGENT_MAX_ITERATIONS) || undefined,
      maxCiRetries: Number(process.env.AGENT_MAX_CI_RETRIES) || undefined,
    },
  });
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest --run test/config.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/types.ts src/config/index.ts test/config.test.ts
git commit -m "feat: add core types and config loader with Zod validation"
```

---

### Task 3: Tool System (AgentTool Interface + File/Bash Tools)

**Files:**
- Create: `src/tools/types.ts`
- Create: `src/tools/file-ops.ts`
- Create: `src/tools/bash.ts`
- Create: `src/tools/search.ts`
- Create: `src/tools/registry.ts`
- Create: `test/tools.test.ts`

**Step 1: Write the failing test**

Create `test/tools.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../src/tools/registry.js';
import { readTool, writeTool, editTool, listFilesTool } from '../src/tools/file-ops.js';
import { bashTool } from '../src/tools/bash.js';
import { searchCodeTool } from '../src/tools/search.js';
import type { ToolContext } from '../src/types.js';
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const makeCtx = (workdir: string): ToolContext => ({
  workdir,
  task: { id: '1', repo_url: '', description: '', blueprint: 'test', created_at: '' },
  stepResults: {},
});

describe('ToolRegistry', () => {
  it('registers and retrieves tools', () => {
    const registry = new ToolRegistry();
    registry.register(readTool);
    expect(registry.get('read')).toBe(readTool);
    expect(registry.getToolDefs()).toHaveLength(1);
  });

  it('filters tools by subset', () => {
    const registry = new ToolRegistry();
    registry.register(readTool);
    registry.register(bashTool);
    const subset = registry.getToolDefs(['read']);
    expect(subset).toHaveLength(1);
    expect(subset[0].name).toBe('read');
  });
});

describe('file-ops tools', () => {
  it('read tool reads a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-test-'));
    writeFileSync(join(dir, 'hello.txt'), 'world');
    const ctx = makeCtx(dir);
    const result = await readTool.execute({ path: 'hello.txt' }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('world');
  });

  it('write tool creates a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-test-'));
    const ctx = makeCtx(dir);
    const result = await writeTool.execute({ path: 'new.txt', content: 'hello' }, ctx);
    expect(result.success).toBe(true);
    expect(readFileSync(join(dir, 'new.txt'), 'utf-8')).toBe('hello');
  });
});

describe('bash tool', () => {
  it('executes a command and returns output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-test-'));
    const ctx = makeCtx(dir);
    const result = await bashTool.execute({ command: 'echo hello' }, ctx);
    expect(result.success).toBe(true);
    expect(result.output.trim()).toBe('hello');
  });

  it('blocks dangerous commands', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-test-'));
    const ctx = makeCtx(dir);
    const result = await bashTool.execute({ command: 'rm -rf /' }, ctx);
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/tools.test.ts`
Expected: FAIL — modules not found

**Step 3: Implement tool types and registry**

Create `src/tools/types.ts`:
```typescript
import type { ToolContext, ToolDef, ToolResult } from '../types.js';

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(params: Record<string, any>, ctx: ToolContext): Promise<ToolResult>;
}
```

Create `src/tools/registry.ts`:
```typescript
import type { AgentTool } from './types.js';
import type { ToolDef } from '../types.js';

export class ToolRegistry {
  private tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  getToolDefs(subset?: string[]): ToolDef[] {
    const entries = subset
      ? [...this.tools.values()].filter(t => subset.includes(t.name))
      : [...this.tools.values()];
    return entries.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }
}
```

**Step 4: Implement file-ops tools**

Create `src/tools/file-ops.ts`:
```typescript
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import type { AgentTool } from './types.js';

function safePath(workdir: string, path: string): string {
  const resolved = resolve(workdir, path);
  if (!resolved.startsWith(resolve(workdir))) {
    throw new Error('Path traversal blocked');
  }
  return resolved;
}

export const readTool: AgentTool = {
  name: 'read',
  description: 'Read file contents',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Relative file path' } },
    required: ['path'],
  },
  async execute(params, ctx) {
    try {
      const full = safePath(ctx.workdir, params.path);
      return { success: true, output: readFileSync(full, 'utf-8') };
    } catch (e: any) {
      return { success: false, output: '', error: e.message };
    }
  },
};

export const writeTool: AgentTool = {
  name: 'write',
  description: 'Write content to a file, creating directories as needed',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative file path' },
      content: { type: 'string', description: 'File content' },
    },
    required: ['path', 'content'],
  },
  async execute(params, ctx) {
    try {
      const full = safePath(ctx.workdir, params.path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, params.content);
      return { success: true, output: `Wrote ${params.path}` };
    } catch (e: any) {
      return { success: false, output: '', error: e.message };
    }
  },
};

export const editTool: AgentTool = {
  name: 'edit',
  description: 'Replace a string in a file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      old_string: { type: 'string' },
      new_string: { type: 'string' },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  async execute(params, ctx) {
    try {
      const full = safePath(ctx.workdir, params.path);
      const content = readFileSync(full, 'utf-8');
      if (!content.includes(params.old_string)) {
        return { success: false, output: '', error: 'old_string not found in file' };
      }
      writeFileSync(full, content.replace(params.old_string, params.new_string));
      return { success: true, output: `Edited ${params.path}` };
    } catch (e: any) {
      return { success: false, output: '', error: e.message };
    }
  },
};

export const listFilesTool: AgentTool = {
  name: 'list_files',
  description: 'List files in a directory',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Relative directory path' } },
    required: ['path'],
  },
  async execute(params, ctx) {
    try {
      const full = safePath(ctx.workdir, params.path);
      const entries = readdirSync(full, { withFileTypes: true });
      const lines = entries.map(e => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`);
      return { success: true, output: lines.join('\n') };
    } catch (e: any) {
      return { success: false, output: '', error: e.message };
    }
  },
};
```

**Step 5: Implement bash and search tools**

Create `src/tools/bash.ts`:
```typescript
import { execSync } from 'child_process';
import type { AgentTool } from './types.js';

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,
  /mkfs/,
  /dd\s+if=/,
  /:(){ :\|:& };:/,
  />\s*\/dev\/sd/,
];

export const bashTool: AgentTool = {
  name: 'bash',
  description: 'Execute a shell command in the working directory',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
    },
    required: ['command'],
  },
  async execute(params, ctx) {
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(params.command)) {
        return { success: false, output: '', error: 'Blocked: dangerous command' };
      }
    }
    try {
      const output = execSync(params.command, {
        cwd: ctx.workdir,
        encoding: 'utf-8',
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
      });
      return { success: true, output };
    } catch (e: any) {
      return {
        success: false,
        output: e.stdout || '',
        error: e.stderr || e.message,
      };
    }
  },
};
```

Create `src/tools/search.ts`:
```typescript
import { execSync } from 'child_process';
import type { AgentTool } from './types.js';

export const searchCodeTool: AgentTool = {
  name: 'search_code',
  description: 'Search code using ripgrep. Falls back to grep if rg not available.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Search pattern (regex)' },
      glob: { type: 'string', description: 'File glob filter, e.g. "*.ts"' },
    },
    required: ['pattern'],
  },
  async execute(params, ctx) {
    const globArg = params.glob ? `--glob '${params.glob}'` : '';
    try {
      const output = execSync(
        `rg --line-number --no-heading ${globArg} '${params.pattern}' .`,
        { cwd: ctx.workdir, encoding: 'utf-8', timeout: 30_000, maxBuffer: 1024 * 1024 }
      );
      return { success: true, output };
    } catch (e: any) {
      if (e.status === 1) return { success: true, output: 'No matches found' };
      // Fallback to grep
      try {
        const output = execSync(
          `grep -rn '${params.pattern}' .`,
          { cwd: ctx.workdir, encoding: 'utf-8', timeout: 30_000 }
        );
        return { success: true, output };
      } catch {
        return { success: false, output: '', error: 'Search failed' };
      }
    }
  },
};
```

**Step 6: Run tests to verify they pass**

Run: `npx vitest --run test/tools.test.ts`
Expected: All PASS

**Step 7: Commit**

```bash
git add src/tools/ test/tools.test.ts
git commit -m "feat: add tool system with file-ops, bash, search, and registry"
```

---

### Task 4: LLM Adapter Layer

**Files:**
- Create: `src/llm/types.ts`
- Create: `src/llm/openai.ts`
- Create: `src/llm/anthropic.ts`
- Create: `src/llm/ollama.ts`
- Create: `src/llm/factory.ts`
- Create: `test/llm.test.ts`

**Step 1: Write the failing test**

Create `test/llm.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createLLMAdapter } from '../src/llm/factory.js';

describe('LLM factory', () => {
  it('creates openai adapter', () => {
    const adapter = createLLMAdapter({
      provider: 'openai', model: 'gpt-4o', apiKey: 'test', baseUrl: undefined,
    });
    expect(adapter).toBeDefined();
    expect(adapter.provider).toBe('openai');
  });

  it('creates anthropic adapter', () => {
    const adapter = createLLMAdapter({
      provider: 'anthropic', model: 'claude-sonnet-4-20250514', apiKey: 'test', baseUrl: undefined,
    });
    expect(adapter).toBeDefined();
    expect(adapter.provider).toBe('anthropic');
  });

  it('throws on unknown provider', () => {
    expect(() => createLLMAdapter({
      provider: 'unknown' as any, model: '', apiKey: '', baseUrl: undefined,
    })).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/llm.test.ts`
Expected: FAIL — modules not found

**Step 3: Implement LLM types**

Create `src/llm/types.ts`:
```typescript
import type { Message, ToolDef, LLMEvent } from '../types.js';

export interface LLMAdapter {
  provider: string;
  chat(messages: Message[], tools: ToolDef[]): AsyncIterable<LLMEvent>;
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'ollama';
  model: string;
  apiKey: string;
  baseUrl?: string;
}
```

**Step 4: Implement OpenAI adapter**

Create `src/llm/openai.ts`:
```typescript
import type { LLMAdapter, LLMConfig } from './types.js';
import type { Message, ToolDef, LLMEvent } from '../types.js';

export class OpenAIAdapter implements LLMAdapter {
  provider = 'openai';
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async *chat(messages: Message[], tools: ToolDef[]): AsyncIterable<LLMEvent> {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      })),
    };
    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      yield { type: 'error', error: `OpenAI API error: ${res.status} ${await res.text()}` };
      return;
    }

    const data = await res.json() as any;
    const choice = data.choices?.[0];
    if (!choice) {
      yield { type: 'error', error: 'No choices in response' };
      return;
    }

    if (choice.message.content) {
      yield { type: 'text_delta', content: choice.message.content };
    }
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        yield {
          type: 'tool_call',
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        };
      }
    }
    yield { type: 'done', usage: data.usage };
  }
}
```

**Step 5: Implement Anthropic adapter**

Create `src/llm/anthropic.ts`:
```typescript
import type { LLMAdapter, LLMConfig } from './types.js';
import type { Message, ToolDef, LLMEvent } from '../types.js';

export class AnthropicAdapter implements LLMAdapter {
  provider = 'anthropic';
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async *chat(messages: Message[], tools: ToolDef[]): AsyncIterable<LLMEvent> {
    const baseUrl = this.config.baseUrl || 'https://api.anthropic.com/v1';
    const systemMsg = messages.find(m => m.role === 'system');
    const nonSystemMsgs = messages.filter(m => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: 8192,
      messages: nonSystemMsgs.map(m => ({ role: m.role, content: m.content })),
    };
    if (systemMsg) body.system = systemMsg.content;
    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const res = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      yield { type: 'error', error: `Anthropic API error: ${res.status} ${await res.text()}` };
      return;
    }

    const data = await res.json() as any;
    for (const block of data.content || []) {
      if (block.type === 'text') {
        yield { type: 'text_delta', content: block.text };
      } else if (block.type === 'tool_use') {
        yield {
          type: 'tool_call',
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input),
        };
      }
    }
    yield { type: 'done', usage: data.usage };
  }
}
```

**Step 6: Implement Ollama adapter**

Create `src/llm/ollama.ts`:
```typescript
import type { LLMAdapter, LLMConfig } from './types.js';
import type { Message, ToolDef, LLMEvent } from '../types.js';

export class OllamaAdapter implements LLMAdapter {
  provider = 'ollama';
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async *chat(messages: Message[], tools: ToolDef[]): AsyncIterable<LLMEvent> {
    const baseUrl = this.config.baseUrl || 'http://localhost:11434';
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: false,
    };
    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      yield { type: 'error', error: `Ollama error: ${res.status} ${await res.text()}` };
      return;
    }

    const data = await res.json() as any;
    if (data.message?.content) {
      yield { type: 'text_delta', content: data.message.content };
    }
    if (data.message?.tool_calls) {
      for (const tc of data.message.tool_calls) {
        yield {
          type: 'tool_call',
          id: `ollama-${Date.now()}`,
          name: tc.function.name,
          arguments: JSON.stringify(tc.function.arguments),
        };
      }
    }
    yield { type: 'done' };
  }
}
```

**Step 7: Implement factory**

Create `src/llm/factory.ts`:
```typescript
import type { LLMAdapter, LLMConfig } from './types.js';
import { OpenAIAdapter } from './openai.js';
import { AnthropicAdapter } from './anthropic.js';
import { OllamaAdapter } from './ollama.js';

export function createLLMAdapter(config: LLMConfig): LLMAdapter {
  switch (config.provider) {
    case 'openai': return new OpenAIAdapter(config);
    case 'anthropic': return new AnthropicAdapter(config);
    case 'ollama': return new OllamaAdapter(config);
    default: throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}
```

**Step 8: Run tests to verify they pass**

Run: `npx vitest --run test/llm.test.ts`
Expected: All PASS

**Step 9: Commit**

```bash
git add src/llm/ test/llm.test.ts
git commit -m "feat: add pluggable LLM adapter layer (OpenAI, Anthropic, Ollama)"
```

---

### Task 5: Agent Loop

**Files:**
- Create: `src/worker/agent-loop.ts`
- Create: `test/agent-loop.test.ts`

**Step 1: Write the failing test**

Create `test/agent-loop.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { AgentLoop } from '../src/worker/agent-loop.js';
import { ToolRegistry } from '../src/tools/registry.js';
import type { LLMAdapter } from '../src/llm/types.js';
import type { Message, ToolDef, LLMEvent } from '../src/types.js';

function makeMockLLM(responses: LLMEvent[][]): LLMAdapter {
  let callIndex = 0;
  return {
    provider: 'mock',
    async *chat(_msgs: Message[], _tools: ToolDef[]) {
      const events = responses[callIndex++] || [{ type: 'done' as const }];
      for (const e of events) yield e;
    },
  };
}

describe('AgentLoop', () => {
  it('returns text response when no tool calls', async () => {
    const llm = makeMockLLM([
      [{ type: 'text_delta', content: 'Done!' }, { type: 'done' }],
    ]);
    const registry = new ToolRegistry();
    const loop = new AgentLoop(llm, registry, { maxIterations: 5 });
    const result = await loop.run('Say hello', []);
    expect(result.output).toContain('Done!');
    expect(result.iterations).toBe(1);
  });

  it('executes tool calls and feeds results back', async () => {
    const llm = makeMockLLM([
      [
        { type: 'tool_call', id: 'tc1', name: 'echo', arguments: '{"text":"hi"}' },
        { type: 'done' },
      ],
      [{ type: 'text_delta', content: 'Finished' }, { type: 'done' }],
    ]);
    const registry = new ToolRegistry();
    registry.register({
      name: 'echo',
      description: 'Echo text',
      parameters: { type: 'object', properties: { text: { type: 'string' } } },
      async execute(params) {
        return { success: true, output: `echo: ${params.text}` };
      },
    });
    const loop = new AgentLoop(llm, registry, { maxIterations: 5 });
    const result = await loop.run('Use echo tool', ['echo']);
    expect(result.iterations).toBe(2);
    expect(result.output).toContain('Finished');
  });

  it('stops at max iterations', async () => {
    const llm = makeMockLLM(
      Array(10).fill([
        { type: 'tool_call', id: 'tc', name: 'echo', arguments: '{}' },
        { type: 'done' },
      ])
    );
    const registry = new ToolRegistry();
    registry.register({
      name: 'echo', description: '', parameters: {},
      async execute() { return { success: true, output: 'ok' }; },
    });
    const loop = new AgentLoop(llm, registry, { maxIterations: 3 });
    const result = await loop.run('Loop forever', ['echo']);
    expect(result.iterations).toBe(3);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/agent-loop.test.ts`
Expected: FAIL — module not found

**Step 3: Implement Agent Loop**

Create `src/worker/agent-loop.ts`:
```typescript
import type { LLMAdapter } from '../llm/types.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { Message, LLMEvent } from '../types.js';
import type { ToolContext } from '../types.js';

export interface AgentLoopOptions {
  maxIterations: number;
}

export interface AgentLoopResult {
  output: string;
  iterations: number;
  messages: Message[];
}

export class AgentLoop {
  constructor(
    private llm: LLMAdapter,
    private registry: ToolRegistry,
    private options: AgentLoopOptions,
  ) {}

  async run(
    prompt: string,
    toolNames: string[],
    systemPrompt?: string,
    ctx?: ToolContext,
  ): Promise<AgentLoopResult> {
    const messages: Message[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const toolDefs = this.registry.getToolDefs(toolNames);
    let output = '';
    let iterations = 0;

    while (iterations < this.options.maxIterations) {
      iterations++;
      const pendingToolCalls: LLMEvent[] = [];
      let textContent = '';

      for await (const event of this.llm.chat(messages, toolDefs)) {
        if (event.type === 'text_delta') {
          textContent += event.content;
        } else if (event.type === 'tool_call') {
          pendingToolCalls.push(event);
        } else if (event.type === 'error') {
          return { output: `Error: ${event.error}`, iterations, messages };
        }
      }

      // No tool calls — LLM is done
      if (pendingToolCalls.length === 0) {
        output = textContent;
        messages.push({ role: 'assistant', content: textContent });
        break;
      }

      // Record assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: textContent,
        tool_calls: pendingToolCalls.map(tc => {
          if (tc.type !== 'tool_call') throw new Error('unexpected');
          return { id: tc.id, name: tc.name, arguments: tc.arguments };
        }),
      });

      // Execute each tool call
      for (const tc of pendingToolCalls) {
        if (tc.type !== 'tool_call') continue;
        const tool = this.registry.get(tc.name);
        let resultText: string;
        if (!tool) {
          resultText = `Error: unknown tool "${tc.name}"`;
        } else {
          try {
            const params = JSON.parse(tc.arguments);
            const result = await tool.execute(params, ctx!);
            resultText = result.success
              ? result.output
              : `Error: ${result.error}`;
          } catch (e: any) {
            resultText = `Error: ${e.message}`;
          }
        }
        messages.push({
          role: 'tool',
          content: resultText,
          tool_call_id: tc.id,
        });
      }
    }

    return { output, iterations, messages };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest --run test/agent-loop.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/worker/agent-loop.ts test/agent-loop.test.ts
git commit -m "feat: add agent loop with tool execution and iteration limits"
```

---

### Task 6: Blueprint Engine

**Files:**
- Create: `src/worker/blueprint-engine.ts`
- Create: `src/worker/actions.ts`
- Create: `blueprints/fix-issue.yaml`
- Create: `test/blueprint-engine.test.ts`

**Step 1: Write the failing test**

Create `test/blueprint-engine.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { BlueprintEngine, Blueprint } from '../src/worker/blueprint-engine.js';

const testBlueprint: Blueprint = {
  name: 'test-bp',
  steps: [
    {
      id: 'step1',
      type: 'deterministic',
      action: 'test_action',
      params: { value: '{{task.description}}' },
    },
    {
      id: 'step2',
      type: 'agent',
      tools: ['echo'],
      prompt: 'Do something with {{steps.step1.output}}',
      max_iterations: 3,
    },
    {
      id: 'step3',
      type: 'deterministic',
      action: 'test_action',
      condition: '{{steps.step1.exit_code != 0}}',
      params: {},
    },
  ],
};

describe('BlueprintEngine', () => {
  it('parses template variables', () => {
    const engine = new BlueprintEngine();
    const result = engine.interpolate(
      'Hello {{task.description}}',
      { task: { description: 'world' }, steps: {}, context: {} }
    );
    expect(result).toBe('Hello world');
  });

  it('evaluates conditions', () => {
    const engine = new BlueprintEngine();
    expect(engine.evaluateCondition(
      '{{steps.lint.exit_code != 0}}',
      { task: {}, steps: { lint: { exit_code: 1 } }, context: {} }
    )).toBe(true);
    expect(engine.evaluateCondition(
      '{{steps.lint.exit_code != 0}}',
      { task: {}, steps: { lint: { exit_code: 0 } }, context: {} }
    )).toBe(false);
  });

  it('skips steps when condition is false', () => {
    const engine = new BlueprintEngine();
    const step = testBlueprint.steps[2]; // step3 with condition
    const shouldRun = engine.evaluateCondition(
      step.condition!,
      { task: {}, steps: { step1: { exit_code: 0 } }, context: {} }
    );
    expect(shouldRun).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/blueprint-engine.test.ts`
Expected: FAIL — module not found

**Step 3: Implement Blueprint Engine**

Create `src/worker/blueprint-engine.ts`:
```typescript
import { readFileSync } from 'fs';
import { load as loadYaml } from 'js-yaml';
import type { AgentLoop } from './agent-loop.js';
import type { ToolContext } from '../types.js';

export interface BlueprintStep {
  id: string;
  type: 'deterministic' | 'agent';
  action?: string;
  tools?: string[];
  prompt?: string;
  params?: Record<string, string>;
  condition?: string;
  max_iterations?: number;
}

export interface Blueprint {
  name: string;
  steps: BlueprintStep[];
}

export interface BlueprintContext {
  task: Record<string, any>;
  steps: Record<string, any>;
  context: Record<string, any>;
}

export type DeterministicAction = (
  params: Record<string, any>,
  bpCtx: BlueprintContext,
  toolCtx: ToolContext,
) => Promise<{ exit_code: number; output: string; error?: string }>;

export class BlueprintEngine {
  private actions = new Map<string, DeterministicAction>();

  registerAction(name: string, action: DeterministicAction): void {
    this.actions.set(name, action);
  }

  loadBlueprint(path: string): Blueprint {
    const raw = readFileSync(path, 'utf-8');
    return loadYaml(raw) as Blueprint;
  }

  interpolate(template: string, ctx: BlueprintContext): string {
    return template.replace(/\{\{(.+?)\}\}/g, (_match, expr: string) => {
      const parts = expr.trim().split('.');
      let value: any = ctx;
      for (const part of parts) {
        value = value?.[part];
      }
      return value !== undefined ? String(value) : '';
    });
  }

  evaluateCondition(condition: string, ctx: BlueprintContext): boolean {
    const expr = condition.replace(/\{\{(.+?)\}\}/g, (_match, inner: string) => {
      return inner.trim();
    });
    // Parse simple "a != b" or "a == b" expressions
    const neqMatch = expr.match(/^(.+?)\s*!=\s*(.+)$/);
    if (neqMatch) {
      const left = this.resolveValue(neqMatch[1].trim(), ctx);
      const right = this.resolveValue(neqMatch[2].trim(), ctx);
      return left != right;
    }
    const eqMatch = expr.match(/^(.+?)\s*==\s*(.+)$/);
    if (eqMatch) {
      const left = this.resolveValue(eqMatch[1].trim(), ctx);
      const right = this.resolveValue(eqMatch[2].trim(), ctx);
      return left == right;
    }
    return true;
  }

  private resolveValue(expr: string, ctx: BlueprintContext): any {
    // If it's a number literal
    if (/^\d+$/.test(expr)) return Number(expr);
    // Otherwise resolve as path
    const parts = expr.split('.');
    let value: any = ctx;
    for (const part of parts) {
      value = value?.[part];
    }
    return value;
  }

  async execute(
    blueprint: Blueprint,
    bpCtx: BlueprintContext,
    agentLoop: AgentLoop,
    toolCtx: ToolContext,
  ): Promise<BlueprintContext> {
    for (const step of blueprint.steps) {
      // Check condition
      if (step.condition) {
        if (!this.evaluateCondition(step.condition, bpCtx)) {
          bpCtx.steps[step.id] = { skipped: true };
          continue;
        }
      }

      if (step.type === 'deterministic') {
        const action = this.actions.get(step.action!);
        if (!action) throw new Error(`Unknown action: ${step.action}`);
        const interpolatedParams: Record<string, any> = {};
        for (const [k, v] of Object.entries(step.params || {})) {
          interpolatedParams[k] = this.interpolate(String(v), bpCtx);
        }
        const result = await action(interpolatedParams, bpCtx, toolCtx);
        bpCtx.steps[step.id] = result;
      } else if (step.type === 'agent') {
        const prompt = this.interpolate(step.prompt || '', bpCtx);
        const result = await agentLoop.run(
          prompt,
          step.tools || [],
          undefined,
          toolCtx,
        );
        bpCtx.steps[step.id] = {
          exit_code: 0,
          output: result.output,
          summary: result.output.slice(0, 500),
          iterations: result.iterations,
        };
      }
    }
    return bpCtx;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest --run test/blueprint-engine.test.ts`
Expected: All PASS

**Step 5: Create fix-issue blueprint**

Create `blueprints/fix-issue.yaml`:
```yaml
name: fix-issue
steps:
  - id: clone
    type: deterministic
    action: git_clone
    params:
      repo: "{{task.repo_url}}"
      branch: "fix/{{task.issue_id}}"

  - id: load_context
    type: deterministic
    action: load_context
    params:
      issue_id: "{{task.issue_id}}"

  - id: implement
    type: agent
    tools: [read, write, edit, bash, search_code, list_files]
    prompt: |
      Fix the following issue:
      {{context.issue_description}}

      Follow project rules:
      {{context.rules}}
    max_iterations: 20

  - id: lint
    type: deterministic
    action: run_lint

  - id: fix_lint
    type: agent
    condition: "{{steps.lint.exit_code != 0}}"
    tools: [read, edit]
    prompt: "Fix these lint errors:\n{{steps.lint.error}}"
    max_iterations: 5

  - id: push
    type: deterministic
    action: git_push

  - id: create_mr
    type: deterministic
    action: create_merge_request
    params:
      title: "Fix #{{task.issue_id}}: {{task.title}}"
      description: "{{steps.implement.summary}}"
```

**Step 6: Commit**

```bash
git add src/worker/blueprint-engine.ts blueprints/fix-issue.yaml test/blueprint-engine.test.ts
git commit -m "feat: add blueprint engine with YAML parsing, interpolation, and conditional execution"
```

---

### Task 7: Deterministic Actions (Git, Lint, GitLab MR)

**Files:**
- Create: `src/worker/actions.ts`
- Create: `src/context/loader.ts`
- Create: `test/actions.test.ts`

**Step 1: Write the failing test**

Create `test/actions.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createActions } from '../src/worker/actions.js';
import type { BlueprintContext } from '../src/worker/blueprint-engine.js';
import type { ToolContext } from '../src/types.js';

const makeBpCtx = (): BlueprintContext => ({
  task: {}, steps: {}, context: {},
});

const makeToolCtx = (workdir: string): ToolContext => ({
  workdir,
  task: { id: '1', repo_url: '', description: '', blueprint: 'test', created_at: '' },
  stepResults: {},
});

describe('actions', () => {
  it('run_lint executes configured lint command', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-action-'));
    // Create a .minion/config.yaml with lint command
    mkdirSync(join(dir, '.minion'), { recursive: true });
    writeFileSync(join(dir, '.minion', 'config.yaml'), 'lint_command: "echo lint-ok"');
    const actions = createActions({ url: '', token: '' });
    const result = await actions.run_lint({}, makeBpCtx(), makeToolCtx(dir));
    expect(result.exit_code).toBe(0);
    expect(result.output).toContain('lint-ok');
  });

  it('run_lint returns exit_code 1 on failure', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-action-'));
    mkdirSync(join(dir, '.minion'), { recursive: true });
    writeFileSync(join(dir, '.minion', 'config.yaml'), 'lint_command: "exit 1"');
    const actions = createActions({ url: '', token: '' });
    const result = await actions.run_lint({}, makeBpCtx(), makeToolCtx(dir));
    expect(result.exit_code).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/actions.test.ts`
Expected: FAIL — module not found

**Step 3: Implement context loader**

Create `src/context/loader.ts`:
```typescript
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { load as loadYaml } from 'js-yaml';

export interface ProjectConfig {
  lint_command?: string;
  test_command?: string;
  language?: string;
}

export function loadProjectConfig(workdir: string): ProjectConfig {
  const configPath = join(workdir, '.minion', 'config.yaml');
  if (!existsSync(configPath)) return {};
  const raw = readFileSync(configPath, 'utf-8');
  return (loadYaml(raw) as ProjectConfig) || {};
}

export function loadRulesForPath(workdir: string, filePath: string): string {
  const rules: string[] = [];
  // Load global rules
  const globalRules = join(workdir, '.minion', 'rules', 'global.md');
  if (existsSync(globalRules)) {
    rules.push(readFileSync(globalRules, 'utf-8'));
  }
  // Walk up from filePath loading .minion-rules.md
  const parts = filePath.split('/').filter(Boolean);
  let current = workdir;
  for (const part of parts) {
    current = join(current, part);
    const rulesFile = join(current, '.minion-rules.md');
    if (existsSync(rulesFile)) {
      rules.push(readFileSync(rulesFile, 'utf-8'));
    }
  }
  return rules.join('\n\n---\n\n');
}
```

**Step 4: Implement deterministic actions**

Create `src/worker/actions.ts`:
```typescript
import { execSync } from 'child_process';
import { loadProjectConfig } from '../context/loader.js';
import type { BlueprintContext, DeterministicAction } from './blueprint-engine.js';
import type { ToolContext } from '../types.js';

interface GitLabConfig {
  url: string;
  token: string;
}

export function createActions(gitlab: GitLabConfig) {
  const git_clone: DeterministicAction = async (params, _bpCtx, toolCtx) => {
    try {
      execSync(`git clone ${params.repo} .`, {
        cwd: toolCtx.workdir, encoding: 'utf-8', timeout: 120_000,
      });
      execSync(`git checkout -b ${params.branch}`, {
        cwd: toolCtx.workdir, encoding: 'utf-8',
      });
      return { exit_code: 0, output: `Cloned and checked out ${params.branch}` };
    } catch (e: any) {
      return { exit_code: 1, output: '', error: e.message };
    }
  };

  const load_context: DeterministicAction = async (params, bpCtx, toolCtx) => {
    const config = loadProjectConfig(toolCtx.workdir);
    bpCtx.context.config = config;
    // If issue_id provided, fetch from GitLab
    if (params.issue_id && gitlab.token) {
      try {
        const res = await fetch(
          `${gitlab.url}/api/v4/projects/${encodeURIComponent(params.project_id || '')}/issues/${params.issue_id}`,
          { headers: { 'PRIVATE-TOKEN': gitlab.token } }
        );
        if (res.ok) {
          const issue = await res.json() as any;
          bpCtx.context.issue_description = issue.description || '';
          bpCtx.context.issue_title = issue.title || '';
        }
      } catch { /* offline mode — skip */ }
    }
    bpCtx.context.rules = '';
    return { exit_code: 0, output: 'Context loaded' };
  };

  const run_lint: DeterministicAction = async (_params, _bpCtx, toolCtx) => {
    const config = loadProjectConfig(toolCtx.workdir);
    const cmd = config.lint_command || 'echo "No lint command configured"';
    try {
      const output = execSync(cmd, {
        cwd: toolCtx.workdir, encoding: 'utf-8', timeout: 60_000,
      });
      return { exit_code: 0, output };
    } catch (e: any) {
      return { exit_code: 1, output: e.stdout || '', error: e.stderr || e.message };
    }
  };

  const run_test: DeterministicAction = async (_params, _bpCtx, toolCtx) => {
    const config = loadProjectConfig(toolCtx.workdir);
    const cmd = config.test_command || 'echo "No test command configured"';
    try {
      const output = execSync(cmd, {
        cwd: toolCtx.workdir, encoding: 'utf-8', timeout: 300_000,
      });
      return { exit_code: 0, output };
    } catch (e: any) {
      return { exit_code: 1, output: e.stdout || '', error: e.stderr || e.message };
    }
  };

  const git_push: DeterministicAction = async (_params, _bpCtx, toolCtx) => {
    try {
      execSync('git add -A && git commit -m "chore: minion auto-commit" --allow-empty', {
        cwd: toolCtx.workdir, encoding: 'utf-8',
      });
      execSync('git push -u origin HEAD', {
        cwd: toolCtx.workdir, encoding: 'utf-8', timeout: 60_000,
      });
      return { exit_code: 0, output: 'Pushed' };
    } catch (e: any) {
      return { exit_code: 1, output: '', error: e.message };
    }
  };

  const create_merge_request: DeterministicAction = async (params, _bpCtx, toolCtx) => {
    if (!gitlab.token) {
      return { exit_code: 1, output: '', error: 'No GitLab token configured' };
    }
    try {
      // Get current branch name
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: toolCtx.workdir, encoding: 'utf-8',
      }).trim();
      const res = await fetch(
        `${gitlab.url}/api/v4/projects/${encodeURIComponent(params.project_id || '')}/merge_requests`,
        {
          method: 'POST',
          headers: {
            'PRIVATE-TOKEN': gitlab.token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            source_branch: branch,
            target_branch: 'main',
            title: params.title || 'Minion MR',
            description: params.description || '',
          }),
        }
      );
      const data = await res.json() as any;
      return { exit_code: 0, output: data.web_url || 'MR created' };
    } catch (e: any) {
      return { exit_code: 1, output: '', error: e.message };
    }
  };

  return { git_clone, load_context, run_lint, run_test, git_push, create_merge_request };
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest --run test/actions.test.ts`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/worker/actions.ts src/context/loader.ts test/actions.test.ts
git commit -m "feat: add deterministic actions (git, lint, test, MR) and context loader"
```

---

### Task 8: Gateway Server (Fastify + BullMQ)

**Files:**
- Create: `src/server/index.ts`
- Create: `src/server/routes/tasks.ts`
- Create: `src/server/routes/webhook.ts`
- Create: `src/server/queue.ts`
- Create: `test/server.test.ts`

**Step 1: Write the failing test**

Create `test/server.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server/index.js';

describe('Gateway Server', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer({ skipQueue: true });
  });

  afterAll(async () => {
    await server.close();
  });

  it('GET /health returns ok', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('POST /api/tasks validates input', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/tasks accepts valid task', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        repo_url: 'https://gitlab.com/test/repo.git',
        description: 'Fix the login bug',
        blueprint: 'fix-issue',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBeDefined();
    expect(res.json().status).toBe('queued');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/server.test.ts`
Expected: FAIL — module not found

**Step 3: Implement task queue**

Create `src/server/queue.ts`:
```typescript
import type { TaskRequest, TaskState } from '../types.js';

// In-memory store for MVP. Replace with BullMQ + Redis in production.
const tasks = new Map<string, TaskState>();

export function enqueueTask(request: TaskRequest): TaskState {
  const state: TaskState = {
    id: request.id,
    status: 'queued',
    request,
    steps_completed: [],
    started_at: undefined,
    finished_at: undefined,
  };
  tasks.set(request.id, state);
  return state;
}

export function getTask(id: string): TaskState | undefined {
  return tasks.get(id);
}

export function listTasks(): TaskState[] {
  return [...tasks.values()];
}

export function updateTask(id: string, update: Partial<TaskState>): TaskState | undefined {
  const task = tasks.get(id);
  if (!task) return undefined;
  Object.assign(task, update);
  return task;
}
```

**Step 4: Implement task routes**

Create `src/server/routes/tasks.ts`:
```typescript
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { enqueueTask, getTask, listTasks } from '../queue.js';
import type { TaskRequest } from '../../types.js';

export async function taskRoutes(app: FastifyInstance) {
  app.post('/api/tasks', {
    schema: {
      body: {
        type: 'object',
        required: ['repo_url', 'description', 'blueprint'],
        properties: {
          repo_url: { type: 'string' },
          description: { type: 'string' },
          blueprint: { type: 'string' },
          issue_id: { type: 'string' },
          title: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const body = req.body as Record<string, string>;
    const request: TaskRequest = {
      id: randomUUID(),
      repo_url: body.repo_url,
      description: body.description,
      blueprint: body.blueprint,
      issue_id: body.issue_id,
      title: body.title,
      created_at: new Date().toISOString(),
    };
    const state = enqueueTask(request);
    // TODO: dispatch to worker via BullMQ
    reply.status(201).send(state);
  });

  app.get('/api/tasks', async () => {
    return listTasks();
  });

  app.get('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = getTask(id);
    if (!task) return reply.status(404).send({ error: 'Not found' });
    return task;
  });
}
```

**Step 5: Implement webhook routes**

Create `src/server/routes/webhook.ts`:
```typescript
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { enqueueTask } from '../queue.js';
import type { TaskRequest } from '../../types.js';

export async function webhookRoutes(app: FastifyInstance) {
  // GitLab Issue webhook: triggers minion when issue is labeled "minion"
  app.post('/api/webhook/gitlab', async (req, reply) => {
    const body = req.body as Record<string, any>;
    const event = req.headers['x-gitlab-event'];

    if (event === 'Issue Hook') {
      const labels = (body.labels || []).map((l: any) => l.title);
      if (!labels.includes('minion')) {
        return reply.status(200).send({ skipped: true });
      }
      const request: TaskRequest = {
        id: randomUUID(),
        repo_url: body.project?.git_http_url || '',
        description: body.object_attributes?.description || '',
        issue_id: String(body.object_attributes?.iid || ''),
        title: body.object_attributes?.title || '',
        blueprint: 'fix-issue',
        created_at: new Date().toISOString(),
      };
      const state = enqueueTask(request);
      return reply.status(201).send(state);
    }

    return reply.status(200).send({ skipped: true, reason: 'unhandled event' });
  });
}
```

**Step 6: Implement server entry point**

Create `src/server/index.ts`:
```typescript
import Fastify from 'fastify';
import { taskRoutes } from './routes/tasks.js';
import { webhookRoutes } from './routes/webhook.js';
import { loadConfig } from '../config/index.js';

export async function buildServer(opts?: { skipQueue?: boolean }) {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(taskRoutes);
  await app.register(webhookRoutes);

  return app;
}

// Start server when run directly
const isMain = process.argv[1]?.endsWith('server/index.ts')
  || process.argv[1]?.endsWith('server/index.js');

if (isMain) {
  const config = loadConfig();
  const server = await buildServer();
  await server.listen({ port: config.server.port, host: config.server.host });
}
```

**Step 7: Run tests to verify they pass**

Run: `npx vitest --run test/server.test.ts`
Expected: All PASS

**Step 8: Commit**

```bash
git add src/server/ test/server.test.ts
git commit -m "feat: add Gateway server with task API, webhook, and in-memory queue"
```

---

### Task 9: CLI Client

**Files:**
- Create: `src/cli/index.ts`
- Create: `test/cli.test.ts`

**Step 1: Write the failing test**

Create `test/cli.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseRunArgs } from '../src/cli/index.js';

describe('CLI arg parsing', () => {
  it('parses run command args', () => {
    const result = parseRunArgs({
      repo: 'https://gitlab.com/test/repo.git',
      description: 'Fix login bug',
      blueprint: 'fix-issue',
      issue: '42',
    });
    expect(result.repo_url).toBe('https://gitlab.com/test/repo.git');
    expect(result.description).toBe('Fix login bug');
    expect(result.blueprint).toBe('fix-issue');
    expect(result.issue_id).toBe('42');
  });

  it('defaults blueprint to fix-issue', () => {
    const result = parseRunArgs({
      repo: 'https://gitlab.com/test/repo.git',
      description: 'Fix something',
    });
    expect(result.blueprint).toBe('fix-issue');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/cli.test.ts`
Expected: FAIL — module not found

**Step 3: Implement CLI**

Create `src/cli/index.ts`:
```typescript
import { Command } from 'commander';

const program = new Command();

export interface RunArgs {
  repo: string;
  description: string;
  blueprint?: string;
  issue?: string;
}

export function parseRunArgs(opts: Record<string, any>) {
  return {
    repo_url: opts.repo,
    description: opts.description,
    blueprint: opts.blueprint || 'fix-issue',
    issue_id: opts.issue,
  };
}

program
  .name('minion')
  .description('Minions — AI coding agents for GitLab')
  .version('0.1.0');

program
  .command('run')
  .description('Submit a task to the Minion server')
  .requiredOption('-r, --repo <url>', 'GitLab repo URL')
  .requiredOption('-d, --description <text>', 'Task description')
  .option('-b, --blueprint <name>', 'Blueprint to use', 'fix-issue')
  .option('-i, --issue <id>', 'GitLab issue ID')
  .option('-s, --server <url>', 'Minion server URL', 'http://127.0.0.1:3000')
  .action(async (opts) => {
    const task = parseRunArgs(opts);
    const serverUrl = opts.server;
    try {
      const res = await fetch(`${serverUrl}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`Task created: ${data.id}`);
        console.log(`Status: ${data.status}`);
      } else {
        console.error('Failed:', data);
        process.exit(1);
      }
    } catch (e: any) {
      console.error(`Cannot reach server at ${serverUrl}: ${e.message}`);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check task status')
  .argument('<id>', 'Task ID')
  .option('-s, --server <url>', 'Minion server URL', 'http://127.0.0.1:3000')
  .action(async (id, opts) => {
    try {
      const res = await fetch(`${opts.server}/api/tasks/${id}`);
      const data = await res.json();
      console.log(JSON.stringify(data, null, 2));
    } catch (e: any) {
      console.error(`Cannot reach server: ${e.message}`);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all tasks')
  .option('-s, --server <url>', 'Minion server URL', 'http://127.0.0.1:3000')
  .action(async (opts) => {
    try {
      const res = await fetch(`${opts.server}/api/tasks`);
      const data = await res.json();
      for (const task of data as any[]) {
        console.log(`${task.id}  ${task.status}  ${task.request.description.slice(0, 60)}`);
      }
    } catch (e: any) {
      console.error(`Cannot reach server: ${e.message}`);
      process.exit(1);
    }
  });

// Run CLI when executed directly
const isMain = process.argv[1]?.endsWith('cli/index.ts')
  || process.argv[1]?.endsWith('cli/index.js');

if (isMain) {
  program.parse();
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest --run test/cli.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/cli/ test/cli.test.ts
git commit -m "feat: add CLI client with run, status, and list commands"
```

---

### Task 10: Worker Entry Point (Wire Everything Together)

**Files:**
- Create: `src/worker/index.ts`
- Create: `test/worker.test.ts`

**Step 1: Write the failing test**

Create `test/worker.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createWorker } from '../src/worker/index.js';

describe('Worker', () => {
  it('creates a worker with all components wired', () => {
    const worker = createWorker({
      llm: { provider: 'openai', model: 'gpt-4o', apiKey: 'test' },
      gitlab: { url: 'https://gitlab.com', token: '' },
      blueprintsDir: './blueprints',
      maxIterations: 20,
    });
    expect(worker).toBeDefined();
    expect(worker.blueprintEngine).toBeDefined();
    expect(worker.agentLoop).toBeDefined();
    expect(worker.toolRegistry).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest --run test/worker.test.ts`
Expected: FAIL — module not found

**Step 3: Implement worker entry point**

Create `src/worker/index.ts`:
```typescript
import { BlueprintEngine } from './blueprint-engine.js';
import { AgentLoop } from './agent-loop.js';
import { ToolRegistry } from '../tools/registry.js';
import { readTool, writeTool, editTool, listFilesTool } from '../tools/file-ops.js';
import { bashTool } from '../tools/bash.js';
import { searchCodeTool } from '../tools/search.js';
import { createActions } from './actions.js';
import { createLLMAdapter } from '../llm/factory.js';
import type { LLMConfig } from '../llm/types.js';
import type { TaskRequest, ToolContext } from '../types.js';
import type { BlueprintContext } from './blueprint-engine.js';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

interface WorkerConfig {
  llm: LLMConfig;
  gitlab: { url: string; token: string };
  blueprintsDir: string;
  maxIterations: number;
}

export function createWorker(config: WorkerConfig) {
  const llmAdapter = createLLMAdapter(config.llm);

  const toolRegistry = new ToolRegistry();
  toolRegistry.register(readTool);
  toolRegistry.register(writeTool);
  toolRegistry.register(editTool);
  toolRegistry.register(listFilesTool);
  toolRegistry.register(bashTool);
  toolRegistry.register(searchCodeTool);

  const agentLoop = new AgentLoop(llmAdapter, toolRegistry, {
    maxIterations: config.maxIterations,
  });

  const blueprintEngine = new BlueprintEngine();
  const actions = createActions(config.gitlab);

  // Register all deterministic actions
  for (const [name, action] of Object.entries(actions)) {
    blueprintEngine.registerAction(name, action);
  }

  async function executeTask(task: TaskRequest): Promise<BlueprintContext> {
    // Create isolated temp directory as workdir
    const workdir = mkdtempSync(join(tmpdir(), `minion-${task.id}-`));

    const toolCtx: ToolContext = {
      workdir,
      task,
      stepResults: {},
    };

    const bpCtx: BlueprintContext = {
      task: { ...task },
      steps: {},
      context: {},
    };

    const blueprint = blueprintEngine.loadBlueprint(
      join(config.blueprintsDir, `${task.blueprint}.yaml`)
    );

    return blueprintEngine.execute(blueprint, bpCtx, agentLoop, toolCtx);
  }

  return { blueprintEngine, agentLoop, toolRegistry, executeTask };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest --run test/worker.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/worker/index.ts test/worker.test.ts
git commit -m "feat: add worker entry point wiring blueprint engine, agent loop, and tools"
```

---

### Task 11: Integration Test (End-to-End Smoke Test)

**Files:**
- Create: `test/integration.test.ts`
- Create: `blueprints/echo-test.yaml`

**Step 1: Create a test blueprint**

Create `blueprints/echo-test.yaml`:
```yaml
name: echo-test
steps:
  - id: setup
    type: deterministic
    action: test_action
    params:
      value: "{{task.description}}"

  - id: implement
    type: agent
    tools: [read, write]
    prompt: "Create a file called output.txt with content: {{task.description}}"
    max_iterations: 3
```

**Step 2: Write integration test**

Create `test/integration.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server/index.js';

describe('Integration: API → Queue', () => {
  it('submits a task via API and gets queued status', async () => {
    const server = await buildServer({ skipQueue: true });

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        repo_url: 'https://gitlab.com/test/repo.git',
        description: 'Write hello world',
        blueprint: 'echo-test',
        issue_id: '1',
        title: 'Test task',
      },
    });

    expect(res.statusCode).toBe(201);
    const task = res.json();
    expect(task.status).toBe('queued');
    expect(task.request.blueprint).toBe('echo-test');

    // Verify task is retrievable
    const getRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}`,
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().id).toBe(task.id);

    // Verify task appears in list
    const listRes = await server.inject({
      method: 'GET',
      url: '/api/tasks',
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().length).toBeGreaterThan(0);

    await server.close();
  });

  it('handles GitLab webhook with minion label', async () => {
    const server = await buildServer({ skipQueue: true });

    const res = await server.inject({
      method: 'POST',
      url: '/api/webhook/gitlab',
      headers: { 'x-gitlab-event': 'Issue Hook' },
      payload: {
        labels: [{ title: 'minion' }],
        project: { git_http_url: 'https://gitlab.com/test/repo.git' },
        object_attributes: {
          iid: 42,
          title: 'Fix login',
          description: 'Login page crashes on submit',
        },
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().request.issue_id).toBe('42');

    await server.close();
  });

  it('skips GitLab webhook without minion label', async () => {
    const server = await buildServer({ skipQueue: true });

    const res = await server.inject({
      method: 'POST',
      url: '/api/webhook/gitlab',
      headers: { 'x-gitlab-event': 'Issue Hook' },
      payload: {
        labels: [{ title: 'bug' }],
        object_attributes: { iid: 1, title: 'Bug', description: 'A bug' },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().skipped).toBe(true);

    await server.close();
  });
});
```

**Step 3: Run integration tests**

Run: `npx vitest --run test/integration.test.ts`
Expected: All PASS

**Step 4: Run all tests**

Run: `npx vitest --run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add test/integration.test.ts blueprints/echo-test.yaml
git commit -m "test: add integration tests for API, webhook, and task lifecycle"
```

---

### Task 12: Final Wiring & Documentation

**Files:**
- Modify: `package.json` — add bin entry
- Modify: `src/index.ts` — re-export public API

**Step 1: Update package.json bin entry**

Add to `package.json`:
```json
{
  "bin": {
    "minion": "./dist/cli/index.js"
  }
}
```

**Step 2: Update src/index.ts with public exports**

```typescript
export { buildServer } from './server/index.js';
export { createWorker } from './worker/index.js';
export { createLLMAdapter } from './llm/factory.js';
export { BlueprintEngine } from './worker/blueprint-engine.js';
export { ToolRegistry } from './tools/registry.js';
export { AgentLoop } from './worker/agent-loop.js';
export { loadConfig } from './config/index.js';
export { VERSION } from './version.js';
```

Create `src/version.ts`:
```typescript
export const VERSION = '0.1.0';
```

**Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Run all tests one final time**

Run: `npx vitest --run`
Expected: All PASS

**Step 5: Commit**

```bash
git add package.json src/index.ts src/version.ts
git commit -m "chore: add bin entry, public exports, and finalize MVP scaffold"
```

---

## Summary

| Task | Component | Key Deliverable |
|------|-----------|-----------------|
| 1 | Project Scaffolding | package.json, tsconfig, .gitignore |
| 2 | Core Types & Config | types.ts, Zod config loader |
| 3 | Tool System | AgentTool interface, file/bash/search tools, registry |
| 4 | LLM Adapters | OpenAI, Anthropic, Ollama adapters + factory |
| 5 | Agent Loop | LLM ↔ tool execution loop with iteration limits |
| 6 | Blueprint Engine | YAML parsing, interpolation, conditional execution |
| 7 | Deterministic Actions | git clone/push, lint, test, MR creation, context loader |
| 8 | Gateway Server | Fastify API, task routes, webhook, in-memory queue |
| 9 | CLI Client | run/status/list commands via Commander.js |
| 10 | Worker Entry | Wire all components together |
| 11 | Integration Tests | End-to-end smoke tests |
| 12 | Final Wiring | Exports, bin entry, build verification |
