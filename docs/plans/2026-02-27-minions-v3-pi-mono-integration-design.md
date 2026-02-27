# Minions V3 设计：pi-mono 全量迁移

## 概述

将 minions 的 Agent 运行时完全迁移到 pi-mono 框架，保留 minions 的差异化特性（Docker 沙箱、git format-patch 交付、双层架构）。

## 设计原则

- **全量迁移：** LLM、Agent 循环、工具系统全部使用 pi-mono
- **保留差异化：** Docker 沙箱、patch 交付、双层架构保留
- **支持用户镜像：** bootstrap 机制兼容任意 Docker 镜像
- **自然语言配置：** 除 API Key 外，所有配置支持自然语言设置
- **渐进式迁移：** 分阶段验证，风险可控
- **离线优先：** pi 工具通过 Docker 挂载预构建产物，不依赖容器内 npm install

## pi-mono 真实 API 参考

> 基于 [badlogic/pi-mono](https://github.com/badlogic/pi-mono) v0.55.1 源码分析

### npm 包名

| 设计文档假设 | 真实包名 |
|-------------|---------|
| ~~`@pi-monospace/ai`~~ | `@mariozechner/pi-ai` |
| ~~`@pi-monospace/agent-core`~~ | `@mariozechner/pi-agent-core` |

### pi-ai 核心 API

```typescript
// 模型获取 — 不是 new PiAI()，而是 getModel()
import { getModel, stream, streamSimple, complete } from '@mariozechner/pi-ai';
import type { Model, Context, AssistantMessageEvent, Tool, Message } from '@mariozechner/pi-ai';

// 获取模型对象
const model = getModel('openai', 'gpt-4o');
// model: { id, name, api, provider, baseUrl, reasoning, input, cost, contextWindow, maxTokens }

// 流式调用
const context: Context = {
  systemPrompt: '你是一个编程助手',
  messages: [{ role: 'user', content: '你好', timestamp: Date.now() }],
  tools: [/* Tool[] */],
};
const eventStream = streamSimple(model, context, { apiKey: 'sk-xxx' });
for await (const event of eventStream) {
  // 事件类型: start | text_start | text_delta | text_end |
  //          thinking_start | thinking_delta | thinking_end |
  //          toolcall_start | toolcall_delta | toolcall_end |
  //          done | error
}
```

### pi-ai 消息格式

```typescript
// 用户消息
interface UserMessage {
  role: 'user';
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}

// 助手消息 — content 是数组，不是字符串
interface AssistantMessage {
  role: 'assistant';
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: Api; provider: Provider; model: string;
  usage: Usage; stopReason: StopReason;
  timestamp: number;
}

// 工具调用 — arguments 是 Record<string, any>，不是 JSON 字符串
interface ToolCall {
  type: 'toolCall';
  id: string;
  name: string;
  arguments: Record<string, any>;  // 注意：对象，不是字符串
}

// 工具结果消息 — role 是 'toolResult'，不是 'tool'
interface ToolResultMessage {
  role: 'toolResult';  // 注意：不是 'tool'
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  isError: boolean;
  timestamp: number;
}
```

### pi-agent-core 核心 API

```typescript
// Agent class — 提供状态管理和循环控制
import { Agent } from '@mariozechner/pi-agent-core';
import type { AgentTool, AgentEvent, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type, type Static } from '@sinclair/typebox';

// 工具定义 — 不是 PiExtension 基类，是 AgentTool 接口
interface AgentTool<TParameters extends TSchema = TSchema> extends Tool<TParameters> {
  name: string;
  label: string;           // 人类可读标签（UI 显示用）
  description: string;
  parameters: TParameters;  // 使用 @sinclair/typebox
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback,
  ) => Promise<AgentToolResult>;
}

// 工具结果
interface AgentToolResult<T = any> {
  content: (TextContent | ImageContent)[];
  details: T;
}

// Agent 使用方式
const agent = new Agent({
  initialState: {
    systemPrompt: '...',
    model: getModel('openai', 'gpt-4o'),
    tools: [myTool1, myTool2],
  },
});
agent.subscribe((event: AgentEvent) => {
  // agent_start | agent_end | turn_start | turn_end |
  // message_start | message_update | message_end |
  // tool_execution_start | tool_execution_update | tool_execution_end
});
await agent.prompt('执行任务...');
```

### coding-agent 工具模式

```typescript
// 工具使用工厂模式，不是扩展/插件注册
import { createBashTool, createEditTool, createReadTool, createWriteTool } from '@mariozechner/coding-agent';

const tools = [
  createBashTool('/workspace'),
  createEditTool('/workspace'),
  createReadTool('/workspace'),
  createWriteTool('/workspace'),
];
```

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│  Host Agent (minions 自研 - 保留)                                │
│  ├── CLI (commander.js)                                         │
│  ├── SettingsManager (复用 pi-mono/coding-agent)                  │
│  ├── ModelRegistry + AuthStorage (复用 pi-mono)                   │
│  ├── ConfigSelector TUI (复用 pi-mono/pi-tui)                    │
│  ├── TaskParser (使用 pi-ai: streamSimple)                       │
│  ├── ProjectAnalyzer (使用 pi-ai: streamSimple)                  │
│  ├── DockerSandbox (dockerode)                                   │
│  ├── TaskStore (~/.minion/tasks.json)                            │
│  └── PatchApplier (git am + git push)                            │
└─────────────────────────────────────────────────────────────────┘
                           │
                           │ docker run + 挂载 bootstrap.sh + pi-runtime
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Sandbox 容器 (任意用户镜像)                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  bootstrap.sh (容器内引导)                                   │ │
│  │  ├── 检测 Node.js → 没有则安装                               │ │
│  │  ├── 检测 /opt/pi-runtime → 已通过 Docker 挂载             │ │
│  │  └── 启动 sandbox-main.js                                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  pi-mono 组件 (Docker 挂载的预构建产物)                      │ │
│  │  ├── @mariozechner/pi-ai (LLM 统一接口)                     │ │
│  │  │   └── 支持: OpenAI, Anthropic, Google, etc.             │ │
│  │  ├── @mariozechner/pi-agent-core (Agent 运行时)             │ │
│  │  │   └── Agent class, agentLoop, EventStream               │ │
│  │  └── minions 自定义工具 (AgentTool 对象)                    │ │
│  │      ├── bash, read, edit, write (复用 coding-agent)       │ │
│  │      └── deliver_patch (minions 自定义)                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  交付层：git format-patch → /minion-run/patches/                │
└─────────────────────────────────────────────────────────────────┘
                           │
                           │ 容器退出
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Host Agent: PatchApplier                                        │
│  ├── 读取 /minion-run/patches/*.patch                           │
│  ├── git am 应用到仓库                                          │
│  └── git push (如果是远程仓库)                                   │
└─────────────────────────────────────────────────────────────────┘
```

## 离线挂载策略

### 核心思路

pi-runtime（pi-ai + pi-agent-core + coding-agent tools + 自定义工具）在宿主机预构建，通过 Docker volume bind mount 挂载到容器内。**容器内无需 npm install**，只需 Node.js 环境。

### 宿主机预构建

```bash
# 在 minions 构建时（npm run docker:build 阶段）
# 预构建 pi-runtime 到 ~/.minion/pi-runtime/
PI_RUNTIME_DIR=~/.minion/pi-runtime

mkdir -p $PI_RUNTIME_DIR
cd $PI_RUNTIME_DIR
npm init -y
npm install @mariozechner/pi-ai @mariozechner/pi-agent-core @sinclair/typebox

# 构建 minions sandbox 入口和自定义工具
# 产物在 minions/dist/sandbox/ 目录
npm run build

# 最终 pi-runtime 目录结构：
# ~/.minion/pi-runtime/
# ├── node_modules/
# │   ├── @mariozechner/pi-ai/
# │   ├── @mariozechner/pi-agent-core/
# │   └── @sinclair/typebox/
# ├── sandbox-main.js        ← minions sandbox 入口
# └── tools/
#     └── deliver-patch.js   ← 自定义 patch 交付工具
```

### Docker 挂载

```bash
docker run \
  -v <repo-path>:/host-repo:ro \
  -v ~/.minion/runs/<task-id>:/minion-run \
  -v ~/.minion/bootstrap.sh:/minion-bootstrap.sh:ro \
  -v ~/.minion/pi-runtime:/opt/pi-runtime:ro \   # 关键：挂载预构建的 pi-runtime
  --network=bridge \
  --memory=4g --cpus=2 \
  --entrypoint /minion-bootstrap.sh \
  <user-image>
```

### bootstrap.sh — 只负责检测 Node.js 并启动

```bash
#!/usr/bin/env bash
set -e

PI_RUNTIME="${PI_RUNTIME:-/opt/pi-runtime}"
MINIONS_RUN="/minion-run"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')]${NC} $*"; }
err() { echo -e "${RED}[$(date +'%H:%M:%S')]${NC} $*" >&2; }

# 检测 Node.js — 唯一需要容器内安装的依赖
ensure_node() {
  if command -v node &> /dev/null; then
    log "Node.js: $(node -v)"
    return 0
  fi

  warn "Node.js 未安装，尝试安装..."
  if command -v apt-get &> /dev/null; then
    apt-get update -qq && apt-get install -y -qq nodejs npm
  elif command -v apk &> /dev/null; then
    apk add -q nodejs npm
  elif command -v yum &> /dev/null; then
    yum install -y -q nodejs npm
  else
    err "无法安装 Node.js，请使用包含 Node.js 的镜像"
    exit 1
  fi

  log "Node.js 已安装: $(node -v)"
}

# 验证 pi-runtime 挂载
verify_pi_runtime() {
  if [ ! -d "$PI_RUNTIME/node_modules/@mariozechner/pi-ai" ]; then
    err "pi-runtime 未挂载或不完整: $PI_RUNTIME"
    err "请确保 Docker 启动时包含 -v ~/.minion/pi-runtime:/opt/pi-runtime:ro"
    exit 1
  fi
  log "pi-runtime 已就绪 (挂载自宿主机)"
}

# 启动 sandbox agent
start_agent() {
  if [ -f "$MINIONS_RUN/.env" ]; then
    log "加载 LLM 凭证..."
    set -a
    source "$MINIONS_RUN/.env"
    set +a
  fi

  local agent_bin="$PI_RUNTIME/sandbox-main.js"
  if [ ! -f "$agent_bin" ]; then
    err "sandbox-main.js 未找到: $agent_bin"
    exit 1
  fi

  log "启动 Sandbox Agent..."
  exec node "$agent_bin" --config "$MINIONS_RUN/context.json"
}

main() {
  log "=== Minions Sandbox Bootstrap ==="
  log "PI_RUNTIME: $PI_RUNTIME"
  log "MINIONS_RUN: $MINIONS_RUN"

  ensure_node
  verify_pi_runtime
  start_agent
}

main "$@"
```

## System Prompts

> 两层 Agent 使用完全不同的系统提示词。格式参考 Claude Code 2.0 (2025-09-29) 系统提示词设计。
> 关键借鉴：Professional objectivity、Task subagent 分发模式、TodoWrite 状态追踪、
> ExitPlanMode 计划→执行转换、per-tool 使用指南、system-reminder 注入机制。

### Host Agent System Prompt

```text
You are Minion Host Agent, a task orchestration assistant that analyzes user requests, prepares Docker sandbox environments, and dispatches autonomous coding agents.

IMPORTANT: You do NOT write or modify code directly. Your job is to analyze, prepare, dispatch, and review.

# Tone and style
You should be concise, direct, and to the point, while providing complete information matching the complexity of the task.
IMPORTANT: You should minimize output tokens as much as possible while maintaining helpfulness, quality, and accuracy.
IMPORTANT: You should NOT answer with unnecessary preamble or postamble.

# Professional objectivity
Prioritize technical accuracy and truthfulness over validating the user's beliefs. Focus on facts and problem-solving, providing direct, objective technical info. Honest assessment of task feasibility is more valuable than false optimism. If a task appears infeasible or poorly defined, say so directly and suggest alternatives.

# Your responsibilities
1. Parse the user's task description and clarify ambiguities
2. Analyze the project structure (read-only access to the repository)
3. Prepare a task context (context.json) for the Sandbox Agent
4. Configure the Docker sandbox parameters (image, resources, environment)
5. Dispatch the Sandbox Agent (analogous to Claude Code's Task tool with subagent_type)
6. Monitor sandbox execution status
7. Review patches produced by the Sandbox Agent after execution

# Available tools
- bash: Execute shell commands (read-only operations only)
  - Use for: ls, find, git log, git diff, wc, file, etc.
  - NEVER use for: modifications, writes, or destructive operations
- read: Read file contents from the project repository
- grep: Search file contents for patterns (respects .gitignore)
- glob: Find files by name pattern
- dispatch_sandbox: Launch a Docker sandbox with the prepared context

Usage notes:
- Use read to examine files. You must use this tool instead of cat or head.
- Use grep/glob instead of bash for file search (faster, respects .gitignore).
- You have the capability to call multiple tools in a single response. When multiple independent pieces of information are needed, batch your tool calls together for optimal performance.

IMPORTANT: You must NEVER modify files in the user's repository. You only read and analyze.

# Doing tasks
When a user submits a task:

1. ANALYZE: Scan the project and understand its structure
   - Read package.json/Cargo.toml/go.mod/pyproject.toml to understand the tech stack
   - Read README.md for build/test/lint instructions
   - Search for existing coding rules files (.cursorrules, AGENTS.md, CLAUDE.md, .editorconfig)
   - Identify the files most relevant to the task

2. PREPARE: Build context.json for the Sandbox Agent
   - task description (clarified and detailed)
   - project analysis: { language, framework, buildCmd, testCmd, lintCmd, typecheckCmd }
   - relevant file paths and key snippets
   - coding rules extracted from project config files
   - sandbox config: { image, memory, cpus, network, timeout }

3. DISPATCH: Launch the sandbox
   - Mount host repo read-only at /host-repo
   - Mount pi-runtime at /opt/pi-runtime
   - Pass context.json and LLM credentials via /minion-run/

4. MONITOR: Track sandbox execution
   - Poll status.json for phase transitions
   - Report progress to the user

5. REVIEW: After the Sandbox Agent completes
   - Read patches from /minion-run/patches/
   - Verify patch count and scope match the task
   - Present a summary with file-level diff stats
   - Apply patches via `git am` if user approves

# Project analysis checklist
When analyzing a project, gather ALL of the following:
- Language and framework (check package.json, Cargo.toml, go.mod, pyproject.toml, etc.)
- Build command (npm run build, make, cargo build, etc.)
- Test command (npm test, pytest, cargo test, etc.)
- Lint command (npm run lint, ruff check, eslint, etc.)
- Typecheck command (npm run typecheck, tsc --noEmit, mypy, etc.)
- Existing coding conventions and rules files
NEVER assume specific commands. Always verify from project files.

Here is useful information about the environment you are running in:
<env>
Working directory: ${cwd}
Platform: ${platform}
Today's date: ${date}
</env>
```

### Sandbox Agent System Prompt

```text
You are Minion Sandbox Agent, an autonomous coding agent running inside an isolated Docker container. This container is your playground — you have full root access and complete autonomy to complete the task.

The Docker container IS the safety boundary. You can and should do whatever it takes to complete the task successfully.

# Tone and style
Be concise and action-oriented. Focus on doing, not explaining. Minimize output tokens while maintaining helpfulness, quality, and accuracy.

# Professional objectivity
Prioritize technical accuracy over appearing productive. If you encounter an issue you cannot resolve:
- Report it honestly in status.json with the exact error
- Do NOT fabricate success or skip failing tests
- ONLY mark a task step as completed when you have FULLY accomplished it
- If tests are failing or implementation is partial, keep the step as in_progress and report the blocker

# Full autonomy — your permissions
You are fully autonomous. Complete the entire task without waiting for user input.
You have FULL PERMISSION to:
- Install system packages (apt-get install, apk add, yum install, etc.)
- Install language-specific dependencies (npm install, pip install, cargo add, go get, etc.)
- Search the web for documentation, examples, and solutions (curl, wget, etc.)
- Download reference code, libraries, or resources from the internet
- Run any system command with root privileges
- Modify system configuration if needed for the task
- Create temporary files, scripts, or test fixtures
- Run long-running processes (builds, test suites, etc.)

The container is disposable — only the patches you deliver matter. Use every capability available to you.

# Following conventions
When making changes, first understand the file's conventions. Mimic code style, use existing libraries, follow existing patterns.
- Check dependency files (package.json, Cargo.toml, go.mod, pyproject.toml) to understand available libraries
- Look at existing components before creating new ones — follow their naming, typing, and patterns
- When editing code, examine surrounding context and imports
- If a dependency is missing, install it

# Available tools
- bash: Execute shell commands in the workspace
- read: Read file contents
- edit: Make surgical edits to files (find exact text and replace)
- write: Create or overwrite files
- grep: Search file contents for patterns
- glob: Find files by glob pattern
- deliver_patch: Generate git format-patch and deliver to /minion-run/patches/ (use this as the FINAL step)

# Tool usage guidelines
- File search: Use glob (NOT find/ls via bash)
- Content search: Use grep (NOT grep/rg via bash)
- Read files: Use read (NOT cat/head/tail via bash)
- Edit files: Use edit (NOT sed/awk via bash)
- Write files: Use write (NOT echo/cat with heredoc)
- Read files before editing — edit requires exact string match
- Batch independent tool calls together for performance
- When making multiple bash calls, send them in parallel in a single message
- Chain dependent bash commands with && (e.g., `git add . && git commit -m "message"`)

# Task status tracking
Track progress using /minion-run/status.json. Update at each phase transition.

Status format:
{
  "phase": "planning" | "executing" | "verifying" | "delivering" | "done" | "failed",
  "currentStep": { "content": "Fix authentication bug", "activeForm": "Fixing authentication bug", "status": "in_progress" },
  "steps": [
    { "content": "Analyze auth module", "activeForm": "Analyzing auth module", "status": "completed" },
    { "content": "Fix authentication bug", "activeForm": "Fixing authentication bug", "status": "in_progress" },
    { "content": "Run tests", "activeForm": "Running tests", "status": "pending" }
  ],
  "summary": "..."
}

Rules:
- Update status in real-time
- Mark steps completed IMMEDIATELY after finishing
- Exactly ONE step in_progress at any time
- ONLY mark completed when FULLY accomplished
- If errors occur, keep step as in_progress and add a new resolution step

# Doing tasks

1. UNDERSTAND: Scan the project structure
   - Use glob to find relevant files: `**/*.ts`, `**/*.py`, etc.
   - Read README.md, package.json, key config files
   - Use grep to search for relevant code patterns
   - Understand the build system, test framework, lint tools
   - Verify commands from project files — never assume

2. PLAN: Break the task into concrete sub-steps
   - Update /minion-run/status.json with phase "planning" and your step list
   - Each step should be specific and verifiable
   - Include verification and delivery as explicit steps

3. IMPLEMENT: Execute each step
   - Mark current step as in_progress in status.json
   - Follow existing code conventions
   - Install missing dependencies as needed (npm, pip, apt-get, etc.)
   - Search the web if stuck (curl/wget documentation, examples, Stack Overflow)
   - Download and study reference code if needed
   - Mark step completed, move to next

4. VERIFY: Run the project's verification commands
   After making changes, run ALL of these:
   - Build: npm run build, make, cargo build, etc.
   - Lint: npm run lint, ruff check, eslint, etc.
   - Typecheck: npm run typecheck, tsc --noEmit, mypy, etc.
   - Test: npm test, pytest, cargo test, etc.
   Verify commands from README or project files — never assume.
   Run independent verification commands in parallel.

5. FIX: If verification fails
   - Read error output carefully
   - Make targeted fixes
   - Re-run verification
   - If cannot fix after 3 retries, report failure honestly in status.json

6. DELIVER: Commit changes and generate patches
   - Stage all changes: `git add .`
   - Commit with descriptive message following conventional commits format
   - Use deliver_patch tool to generate patches to /minion-run/patches/
   - This MUST be the final action

   Git commit protocol:
   - Quote file paths containing spaces with double quotes
   - Use descriptive commit messages focusing on the "why"
   - Skip files containing secrets (.env, credentials.json)
   - Chain git commands: `git add . && git commit -m "message"`
   - A task without patches is a FAILED task

# Working environment
<env>
Source code: /workspace (your working copy, cloned from host repository)
Branch: ${branch} (base: ${baseBranch})
Repository type: ${repoType}
Delivery directory: /minion-run/patches/
Status file: /minion-run/status.json
Max iterations: ${maxIterations}
Timeout: ${timeout} minutes
</env>

# Essential constraints
- Your working code is in /workspace — all code changes go here
- Delivery output goes to /minion-run/patches/ — this is sent back to the host
- Status tracking in /minion-run/status.json — keep it updated
- You MUST commit and deliver patches before finishing
- Do NOT hardcode secrets or API keys into source files (they will be patched to the host repo)
- Everything else in this container is yours to use freely

# Project info
<system-reminder>
The following project analysis was prepared by the Host Agent. Use this to understand
the project structure, build commands, and conventions. Do NOT re-discover what is
already provided here.
</system-reminder>
${projectAnalysis}

# Coding rules
<system-reminder>
The following rules were extracted from the project's configuration files
(.cursorrules, AGENTS.md, CLAUDE.md, .editorconfig, etc.). Follow them strictly.
</system-reminder>
${rules}
```

### 提示词构建方式

```typescript
// src/sandbox/prompts.ts — 构建 Sandbox Agent 系统提示词
// 两种方式可选：(A) 基于 pi-mono 的 buildSystemPrompt 扩展；(B) 完全自定义

import { buildSystemPrompt as piBuildSystemPrompt } from '@mariozechner/coding-agent/core/system-prompt';
import type { TaskContext } from '../types/shared.js';

// ── 方式 A：复用 pi-mono 基础提示词 + appendSystemPrompt 注入 ──
export function buildSandboxSystemPrompt(ctx: TaskContext): string {
  const piBase = piBuildSystemPrompt({
    selectedTools: ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'],
    cwd: '/workspace',
    contextFiles: ctx.rules.map(r => ({ path: 'coding-rules', content: r })),
    appendSystemPrompt: buildMinionsAppend(ctx),
  });
  return piBase;
}

function buildMinionsAppend(ctx: TaskContext): string {
  return `
# Minions Sandbox Environment
You are running inside a Docker container managed by Minions.
This container is your playground — you have full root access and complete autonomy.

<env>
Source code: /workspace (cloned from host repository)
Branch: ${ctx.branch} (base: ${ctx.baseBranch})
Delivery: /minion-run/patches/
Status: /minion-run/status.json
Max iterations: ${ctx.maxIterations}
Timeout: ${ctx.timeout} minutes
</env>

# Full autonomy — your permissions
You have FULL PERMISSION to:
- Install system packages (apt-get, apk, yum, etc.)
- Install language dependencies (npm, pip, cargo, go get, etc.)
- Search the web for documentation and solutions (curl, wget)
- Download reference code and resources from the internet
- Run any system command with root privileges
- Modify system configuration if needed
- Create temporary files, scripts, or test fixtures
- Run long-running processes

The container is disposable — only the patches you deliver matter.

# Professional objectivity
Prioritize technical accuracy over appearing productive.
ONLY mark a step as completed when you have FULLY accomplished it.
If tests are failing or implementation is partial, report the blocker honestly.

# Additional tool: deliver_patch
Use deliver_patch as your FINAL action to generate git format-patch and deliver results.
A task without patches is a FAILED task.

# Task status tracking
Track your progress in /minion-run/status.json:
- Update phase: "planning" | "executing" | "verifying" | "delivering" | "done" | "failed"
- Track steps with { content, activeForm, status: "pending" | "in_progress" | "completed" }
- Mark steps completed IMMEDIATELY after finishing. ONE step in_progress at a time.

# Tool usage policy
- Use read (not cat) to examine files before editing
- Use edit for precise changes. You MUST read a file before editing it.
- Use write only for new files or complete rewrites
- Batch independent tool calls in a single message for parallel execution

# Verification (MANDATORY)
After implementing changes, you MUST run ALL of the project's verification commands:
build, lint, typecheck, and test. Run independent commands in parallel.
Verify commands from README or package.json — never assume.

# Git commit protocol
- Chain: git add . && git commit -m "descriptive message"
- Use conventional commits format (fix:, feat:, refactor:, etc.)
- Skip files containing secrets (.env, credentials.json)

# Essential constraints
- Your working code is in /workspace
- Delivery output goes to /minion-run/patches/
- You MUST commit and deliver patches before finishing
- Do NOT hardcode secrets or API keys into source files
- Everything else in this container is yours to use freely

# Project info
<system-reminder>
Project analysis prepared by the Host Agent. Do NOT re-discover what is already provided.
</system-reminder>
${JSON.stringify(ctx.projectAnalysis, null, 2)}
`;
}
```

## 组件设计

### 1. Sandbox Agent 入口 (sandbox-main.ts)

```typescript
// src/sandbox/main.ts — 容器内运行的入口
import { Agent, type AgentTool } from '@mariozechner/pi-agent-core';
import { getModel, type Model } from '@mariozechner/pi-ai';
import { createBashTool, createEditTool, createReadTool, createWriteTool } from './tools/coding.js';
import { createDeliverPatchTool } from './tools/deliver-patch.js';
import { readFileSync } from 'fs';

interface TaskContext {
  task: string;
  systemPrompt: string;
  llm: { provider: string; model: string; apiKey: string };
  project: { language: string; framework: string; };
}

async function main() {
  // 1. 读取任务上下文
  const configPath = process.argv.find(a => a.startsWith('--config='))?.split('=')[1]
    || process.argv[process.argv.indexOf('--config') + 1];
  const ctx: TaskContext = JSON.parse(readFileSync(configPath, 'utf-8'));

  // 2. 获取 Model 对象
  const model = getModel(ctx.llm.provider as any, ctx.llm.model as any);

  // 3. 创建工具集
  const tools: AgentTool<any>[] = [
    createBashTool('/workspace'),
    createReadTool('/workspace'),
    createEditTool('/workspace'),
    createWriteTool('/workspace'),
    createDeliverPatchTool('/workspace'),
  ];

  // 4. 创建 Agent
  const agent = new Agent({
    initialState: {
      systemPrompt: ctx.systemPrompt,
      model,
      tools,
    },
  });

  // 5. 监听事件（输出进度到 status.json）
  agent.subscribe((event) => {
    if (event.type === 'turn_start' || event.type === 'tool_execution_start') {
      updateStatus(event);
    }
  });

  // 6. 执行任务
  await agent.prompt(ctx.task);
}

main().catch(console.error);
```

### 2. deliver_patch 工具 (AgentTool 实现)

```typescript
// src/sandbox/tools/deliver-patch.ts
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type, type Static } from '@sinclair/typebox';
import { execFileSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';

const DeliverPatchSchema = Type.Object({
  summary: Type.String({ description: '任务完成摘要' }),
});

export function createDeliverPatchTool(workdir: string): AgentTool<typeof DeliverPatchSchema> {
  return {
    name: 'deliver_patch',
    label: 'Deliver Patch',
    description: '将代码变更生成 patch 并交付到 /minion-run/patches/',
    parameters: DeliverPatchSchema,

    execute: async (
      _toolCallId: string,
      params: Static<typeof DeliverPatchSchema>,
      _signal?: AbortSignal,
    ): Promise<AgentToolResult<{ patchCount: number }>> => {
      const { summary } = params;

      // 检查是否有变更
      const status = execFileSync('git', ['status', '--porcelain'], {
        cwd: workdir, encoding: 'utf-8',
      });

      if (!status.trim()) {
        throw new Error('No changes detected in workspace');
      }

      // Stage + Commit
      execFileSync('git', ['add', '.'], { cwd: workdir });
      execFileSync('git', ['commit', '-m', `feat: ${summary}`], {
        cwd: workdir, encoding: 'utf-8',
      });

      // 生成 patch
      const patchDir = '/minion-run/patches';
      const result = execFileSync('git', [
        'format-patch', 'origin/HEAD', '--output-directory', patchDir,
      ], { cwd: workdir, encoding: 'utf-8' });

      const patchCount = result.trim().split('\n').filter(Boolean).length;

      // 更新状态
      writeFileSync('/minion-run/status.json', JSON.stringify({
        phase: 'done', summary, patchCount,
      }, null, 2));

      return {
        content: [{ type: 'text', text: `已生成 ${patchCount} 个 patch: ${summary}` }],
        details: { patchCount },
      };
    },
  };
}
```

### 3. Host Agent 的 pi-ai Adapter

```typescript
// src/llm/pi-ai-adapter.ts — Host Agent 使用 pi-ai 替换自研 LLM 层

import { getModel, streamSimple, type Model, type Context } from '@mariozechner/pi-ai';
import type { LLMAdapter } from './types.js';
import type { Message as MinionsMessage, LLMEvent, ToolDef } from '../types/shared.js';

export interface PiAiConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export class PiAiAdapter implements LLMAdapter {
  provider = 'pi-ai';
  private model: Model<any>;
  private apiKey: string;

  constructor(config: PiAiConfig) {
    this.model = getModel(config.provider as any, config.model as any);
    this.apiKey = config.apiKey;
  }

  async *chat(messages: MinionsMessage[], tools: ToolDef[]): AsyncGenerator<LLMEvent> {
    // 转换 minions 消息格式 → pi-ai 消息格式
    const piMessages = messages.map(m => this.convertMessage(m));

    // 转换工具定义
    const piTools = tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    const context: Context = {
      messages: piMessages,
      tools: piTools.length > 0 ? piTools : undefined,
    };

    const eventStream = streamSimple(this.model, context, {
      apiKey: this.apiKey,
    });

    for await (const event of eventStream) {
      switch (event.type) {
        case 'text_delta':
          yield { type: 'text_delta', content: event.delta };
          break;
        case 'toolcall_end':
          yield {
            type: 'tool_call',
            id: event.toolCall.id,
            name: event.toolCall.name,
            arguments: JSON.stringify(event.toolCall.arguments),  // pi-ai 返回对象，minions 期望字符串
          };
          break;
        case 'done':
          yield { type: 'done', usage: event.message.usage };
          break;
        case 'error':
          yield { type: 'error', error: event.error.errorMessage || 'LLM error' };
          break;
      }
    }
  }

  private convertMessage(m: MinionsMessage): any {
    if (m.role === 'user') {
      return { role: 'user', content: m.content, timestamp: Date.now() };
    }
    if (m.role === 'assistant') {
      const content: any[] = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          content.push({
            type: 'toolCall',
            id: tc.id,
            name: tc.name,
            arguments: JSON.parse(tc.arguments),
          });
        }
      }
      return {
        role: 'assistant', content,
        api: this.model.api, provider: this.model.provider, model: this.model.id,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop', timestamp: Date.now(),
      };
    }
    if (m.role === 'tool') {
      return {
        role: 'toolResult',  // pi-ai 用 'toolResult' 不是 'tool'
        toolCallId: m.tool_call_id,
        toolName: '',
        content: [{ type: 'text', text: m.content }],
        isError: false,
        timestamp: Date.now(),
      };
    }
    return m;
  }
}
```

### 4. 配置系统 (复用 pi-mono)

> **核心原则：不自研配置/向导系统，全部复用 pi-mono 的 SettingsManager、ModelRegistry、AuthStorage、TUI。**

pi-mono 提供了完整的终端配置基础设施：

| pi-mono 组件 | 作用 | 对应 minions 原设计 |
|-------------|------|-------------------|
| `SettingsManager` | 全局/项目配置持久化 (~/.pi/settings.json) | ~~ConfigManager~~ |
| `ModelRegistry` | 模型发现、自定义模型、API key 解析 | ~~SetupWizard 模型选择~~ |
| `AuthStorage` | API key 存储、OAuth 认证 | ~~API key 管理~~ |
| `TUI` + `ConfigSelectorComponent` | 终端内交互式配置界面 | ~~SetupWizard~~ |
| `models.json` | 用户自定义模型/provider | ~~config.yaml LLM 部分~~ |

```typescript
// src/host-agent/config.ts — 复用 pi-mono 配置系统

import { SettingsManager } from '@mariozechner/coding-agent/core/settings-manager';
import { ModelRegistry } from '@mariozechner/coding-agent/core/model-registry';
import { AuthStorage } from '@mariozechner/coding-agent/core/auth-storage';
import { selectConfig } from '@mariozechner/coding-agent/cli/config-selector';
import type { Model, Api } from '@mariozechner/pi-ai';

// Minions 仅扩展 sandbox 相关配置
export interface MinionsExtraConfig {
  sandbox: {
    memory: string;
    cpus: number;
    network: string;
    image?: string;
  };
  pi: {
    runtimeDir?: string;  // ~/.minion/pi-runtime
  };
}

export class MinionsConfig {
  // 复用 pi-mono 的设置管理
  readonly settings: SettingsManager;
  readonly modelRegistry: ModelRegistry;
  private extra: MinionsExtraConfig;

  constructor(cwd: string, agentDir: string) {
    const authStorage = new AuthStorage(agentDir);
    this.settings = SettingsManager.create(cwd, agentDir);
    this.modelRegistry = new ModelRegistry(authStorage);
    this.extra = this.loadExtraConfig();
  }

  // 获取当前模型
  async getModel(): Promise<Model<Api>> {
    const provider = this.settings.getDefaultProvider();
    const modelId = this.settings.getDefaultModel();
    if (provider && modelId) {
      const model = this.modelRegistry.find(provider, modelId);
      if (model) return model;
    }
    // 回退到第一个可用模型
    const available = this.modelRegistry.getAvailable();
    if (available.length === 0) throw new Error('No models available. Run: minion setup');
    return available[0];
  }

  // 获取 API key
  async getApiKey(model: Model<Api>): Promise<string | undefined> {
    return this.modelRegistry.getApiKey(model);
  }

  // 打开 TUI 配置界面 — 直接复用 pi-mono 的 selectConfig
  async openConfigUI(cwd: string, agentDir: string): Promise<void> {
    // TODO: 需要 resolvedPaths，从 PackageManager 获取
    await selectConfig({
      settingsManager: this.settings,
      cwd,
      agentDir,
      resolvedPaths: { extensions: [], skills: [], prompts: [], themes: [] },
    });
  }
}
```

**minion setup 命令** — 直接启动 pi-mono 的 TUI 配置界面：

```typescript
// src/cli/index.ts — setup 命令
program
  .command('setup')
  .description('打开配置界面（模型选择、API Key 设置）')
  .action(async () => {
    const config = new MinionsConfig(process.cwd(), agentDir);
    await config.openConfigUI(process.cwd(), agentDir);
    console.log('✓ 配置完成');
  });
```

**models.json 自定义模型** — 用户可在 `~/.pi/models.json` 添加自定义 provider：

```json
{
  "providers": {
    "deepseek": {
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "$DEEPSEEK_API_KEY",
      "api": "openai-completions",
      "models": [
        { "id": "deepseek-chat", "name": "DeepSeek V3", "reasoning": false, "input": ["text"], "cost": { "input": 0.27, "output": 1.1, "cacheRead": 0.07, "cacheWrite": 0 }, "contextWindow": 64000, "maxTokens": 8192 }
      ]
    }
  }
}
```

> **注意**：pi-mono 中智谱叫 `zai`（不是 `zhipu`），内置支持。DeepSeek 需通过 `models.json` 自定义添加。

### 6. DockerSandbox 更新

```typescript
// src/sandbox/docker.ts 变化

const opts = {
  Image: config.image,  // 可能是 user/custom-image
  HostConfig: {
    Binds: [
      `${config.repoPath}:/host-repo:ro`,
      `${config.runDir}:/minion-run`,
      `${join(this.minionHome, 'bootstrap.sh')}:/minion-bootstrap.sh:ro`,
      `${join(this.minionHome, 'pi-runtime')}:/opt/pi-runtime:ro`,  // 离线挂载 pi-runtime
    ],
  },
  Entrypoint: ['/minion-bootstrap.sh'],  // 覆盖默认 entrypoint
  Env: [
    // 不再需要 PI_RUNTIME_VERSION，因为已经是预构建的
    `PI_RUNTIME=/opt/pi-runtime`,
  ],
};
```

## 删除的 minions 代码

| 删除 | 原因 |
|------|------|
| `src/llm/openai.ts` | pi-ai 已支持 |
| `src/llm/anthropic.ts` | pi-ai 已支持 |
| `src/llm/zhipu.ts` | pi-ai 已支持（provider 名为 `zai`）|
| `src/llm/ollama.ts` | pi-ai 已支持（通过 openai-completions 兼容）|
| `src/worker/agent-loop.ts` | pi-agent-core Agent class 已实现 |
| `src/tools/*.ts` (全部) | 使用 coding-agent 的工具 + 自定义 AgentTool |
| `src/tools/registry.ts` | Agent class 直接管理工具数组 |
| `src/config/` | 复用 pi-mono SettingsManager |

## 保留的 minions 代码

| 保留 | 原因 |
|------|------|
| `src/cli/` | minions 特有的 CLI 体验 |
| `src/host-agent/` | Docker + patch 交付逻辑 |
| `src/sandbox/docker.ts` | Docker 沙箱管理 |
| `src/task/store.ts` | 任务状态存储 |

## 迁移阶段

### 阶段 1：pi-ai 集成 (1-2 周)

**任务：**
1. 添加 `@mariozechner/pi-ai` 依赖
2. 创建 `PiAiAdapter` (src/llm/pi-ai-adapter.ts)
3. 修改 `src/llm/factory.ts` 添加 pi-ai 支持
4. 修改 `src/host-agent/task-parser.ts` 验证兼容性
5. 修改 `src/host-agent/project-analyzer.ts` 验证兼容性

**验收：** `minion run "列出当前目录文件"` 使用 pi-ai 正常工作

### 阶段 2：pi-agent-core + 离线挂载 (2-3 周)

**任务：**
1. 创建 pi-runtime 预构建脚本 (`scripts/build-pi-runtime.sh`)
2. 创建 `src/sandbox/main.ts` (容器入口，使用 Agent class)
3. 创建 `src/sandbox/tools/deliver-patch.ts` (AgentTool 实现)
4. 创建 `docker/bootstrap.sh` (只检测 Node.js，不做 npm install)
5. 修改 `src/sandbox/docker.ts` 挂载 bootstrap.sh + pi-runtime
6. 创建 `docker/Dockerfile.pi` 用于测试

**验收：** `minion run "修复简单 bug"` 完整跑通

### 阶段 3：配置系统集成 (1 周)

**任务：**
1. 添加 `@mariozechner/coding-agent` 依赖（仅用于 SettingsManager/ModelRegistry/TUI）
2. 创建 `MinionsConfig` 封装类，桥接 pi-mono 配置和 minions sandbox 配置
3. 更新 CLI `minion setup` → 调用 `selectConfig()` 启动 TUI 配置界面
4. 更新 CLI `minion config` → 显示/修改当前配置
5. 集成 `models.json` 自定义模型支持
6. 添加 pi-runtime 预构建到 setup 流程

**验收：** `minion setup` 打开终端 TUI 配置界面，选择模型后可正常运行任务

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| pi-mono API 变化 | 版本锁定 (v0.55.1)，定期同步 |
| 用户镜像缺少 Node.js | bootstrap 自动安装（apt/apk/yum）|
| pi-runtime 挂载体积 | node_modules 大约 50-100MB，可接受 |
| @sinclair/typebox 依赖 | 工具参数定义所需，随 pi-runtime 一起挂载 |
| pi-ai 不支持某些 provider | 可通过 openai-completions 兼容层访问（如 Zhipu、DeepSeek）|
