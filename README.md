# Open Minions

[English](#english) | [中文](#中文)

---

## English

Inspired by [Stripe's Minions](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) and [OpenClaw](https://github.com/nichochar/open-claw), Open Minions is an open-source, one-shot, end-to-end AI coding agent powered by [pi-mono](https://github.com/badlogic/pi-mono).

Give it a task in natural language — fix a bug, implement a feature, patch a flaky test — and it writes the code, runs tests, and delivers patches. No hand-holding required.

### How It Works

```
User: "Fix login page crash when email is empty"
        │
        ▼
   Single Host Agent
        │  Parses prompt strategy/env and orchestrates host tools
        │
        ├─ docker  → run/exec isolated sandbox container
        ├─ git     → host-side patch flow for git repos
        └─ tar     → host-side artifact flow for non-git dirs
        │
        ▼
   Host-side delivery apply (git am / tar extract)
```

### Architecture

**Single-Agent Host Architecture (Current):**

- **One LLM-facing host agent** — no separate sandbox agent process.
- **Three host tools only** — `docker`, `git`, `tar`.
- **Shared policy engine** — centralized allowlist/denylist/path checks for host commands.
- **Docker backend fallback** — `podman` first, fallback to `docker`.
- **Unrestricted in-container execution** — commands run via `docker exec ... bash -lc`.
- **Host-side-only delivery** — git repos use patch apply; non-git directories use tar artifact apply.
- **Prompt strategy + env parsing** — keyword strategy and arbitrary `KEY=VALUE` passthrough.

```
┌─────────────────────────────────────────────┐
│  Host Agent (single)                        │
│  Prompt parse → strategy/env merge          │
│  Tools: docker / git / tar                  │
└──────────────────┬──────────────────────────┘
                   │ docker run / docker exec
┌──────────────────▼──────────────────────────┐
│  Isolated Sandbox Container                 │
│  Build / test / debug / modify workspace    │
└──────────────────┬──────────────────────────┘
                   │ host-side apply only
┌──────────────────▼──────────────────────────┐
│  Delivery                                   │
│  Git repo: git patch apply                  │
│  Non-git: tar artifact apply                │
└─────────────────────────────────────────────┘
```

### Key Features

- **Natural Language First** — Describe your task in plain language, the agent handles the rest
- **Single-Agent Orchestration** — One host agent manages runtime strategy, tool calls, and delivery
- **Prompt Strategy Controls** — Keywords like preserve/retry/parallel/auto-apply map to runtime env
- **Container Lifecycle Management** — Preserve containers for debugging, create snapshots, manage retries/parallel runs
- **pi-mono Integration** — Unified LLM interface via `@mariozechner/pi-ai`
- **Docker Sandbox Isolation** — All code execution happens in a secure container
- **Host-Side-Only Delivery** — Git path (`git am`) and non-git path (`tar`) are both applied on host
- **Multiple LLM Providers** — Supports OpenAI, Anthropic, Google, DeepSeek, Zhipu AI, xAI, Groq, Mistral AI, Kimi, MiniMax, Qwen, OpenRouter, AWS Bedrock, Azure OpenAI, Google Vertex AI, Vercel AI Gateway, Cerebras, and HuggingFace
- **Interactive TUI Setup** — Terminal-based UI for easy configuration with keyboard navigation, source selection, and API key management
- **Multi-Region Support** — Select regional API endpoints (e.g., China/International sources) for providers like Zhipu AI, Kimi, MiniMax, and Qwen
- **Container Presets** — Pre-configured git identity, timezone, locale (customizable)
- **Provider Aliases** — Multi-region API endpoints via alias mechanism

### Quick Start

#### Prerequisites

- Node.js >= 18
- Docker
- LLM API key (OpenAI / Anthropic / DeepSeek / Zhipu / etc.)

#### Install

```bash
git clone https://github.com/helanmouse/open-minions.git
cd open-minions
npm install
npm run build
```

#### Build pi-runtime (offline mode)

```bash
npm run build:pi-runtime
npm run build:sandbox
```

This pre-builds pi-mono packages in `~/.minion/pi-runtime/` which are then mounted to containers.

#### Configure

```bash
minion setup
```

This launches an interactive Terminal UI (TUI) for configuration:
- **Provider Selection**: Choose from supported LLM providers (OpenAI, Anthropic, Google, DeepSeek, Zhipu AI, xAI, Groq, Mistral AI, Kimi, MiniMax, Qwen, OpenRouter, AWS Bedrock, Azure OpenAI, Google Vertex AI, Vercel AI Gateway, Cerebras, HuggingFace)
- **Source Selection**: For providers with multiple regions (e.g., Zhipu AI, Kimi, MiniMax, Qwen), select between international and China sources
- **Model Selection**: Browse available models (newest models shown first)
- **API Key Input**: Enter or confirm API key with masked display for security
- Use arrow keys to navigate, Enter to select, Ctrl+C to cancel

Or manually configure with environment variables:

```bash
# LLM Configuration
LLM_PROVIDER=openai              # openai | anthropic | deepseek | zhipu | google
LLM_MODEL=gpt-4o                 # Model name
LLM_API_KEY=sk-...               # API key
LLM_BASE_URL=                    # Optional custom API endpoint
```

#### Build Docker Image

```bash
npm run docker:build
```

#### Usage

**Basic Usage:**

```bash
# Run a task
minion run "Fix login page crash when email is empty"

# Run task from a prompt file
minion run "$(cat task.txt)"

# With options
minion run -y "Add user registration" --repo /path/to/repo --timeout 60
minion run -d "Background task"          # Run detached

# Task management
minion list                               # List all tasks
minion status <task-id>                   # Check task status
minion stop <task-id>                     # Stop running task

# Configuration
minion setup                              # Interactive configuration
minion config                              # View current configuration
```

**Prompt Strategy Examples:**

Use natural language keywords to control runtime behavior:

```bash
# Preserve container on failure for debugging
minion run "Fix the bug, preserve container if failed"

# Run task multiple times in parallel
minion run "Try this optimization 3 times in parallel"

# Auto-apply patches without confirmation
minion run "Add feature X, auto-apply patches"

# Retry on failure
minion run "Deploy to staging, retry if failed"

# Custom resource allocation
minion run "Run heavy task, use 8g memory and 4 cores"

# Force AI mode with environment variable
MINION_AI_MODE=true minion run "Any task description"
```

**AI Mode Keywords:**
- English: `preserve`, `snapshot`, `parallel`, `retry`, `auto-apply`, `keep container`
- Chinese: `保留`, `快照`, `并行`, `重试`, `自动应用`

### Single-Agent Compatibility (Current)

- Host tool contract is minimized to `docker`, `git`, `tar`.
- `docker` tool resolves runtime backend in order: `podman` first, `docker` fallback.
- In-container execution remains unrestricted via `docker exec ... bash -lc "<command>"`.
- Delivery is host-side only:
  - Git repo: host applies patch flow (`git format-patch` / `git am`).
  - Non-git directory: host applies artifact flow (`tar` package/extract).
- Prompt env passthrough supports arbitrary `KEY=VALUE` pairs.
- Effective env precedence: explicit runtime env > prompt env > prompt strategy env > defaults.

### Execution Logs

During execution, you'll see detailed logs showing:
- `[host] Starting task:` - Task initialization
- `[host:tool] {tool} {params}` - Tool calls with key parameters
- `[host:tool_done] {tool} error={bool}` - Tool completion status
- `[host:msg] stopReason={reason}` - LLM response completion
- `[host:event] agent_end` - Agent completion

These logs help you understand what the agent is doing in real-time.

### Advanced Usage

The Host Agent understands natural language instructions:

```bash
# Analyze project and select appropriate image
minion run "分析项目，选择合适的镜像，修复 bug"

# Preserve container on failure
minion run "添加功能，如果失败保留容器用于调试"

# Create PR after success
minion run "修复 lint 错误，测试通过后创建 PR"
```

### Project Configuration

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for detailed configuration options including:

- Multiple LLM providers (OpenAI, Anthropic, Google, DeepSeek, Zhipu)
- Custom base URLs and provider aliases
- Container presets (git identity, timezone, locale)
- Environment variable configuration
- models.json format for pi-mono compatibility

### Development

```bash
npm test          # Run all tests
npm run lint      # Type check
npm run build     # Compile
```

### V3 Migration Notes

For users upgrading from V2:

1. Run `npm run build:pi-runtime` to build the offline runtime
2. Run `minion setup` to reconfigure your LLM
3. Config format changed to pi-mono compatible (~/.minion/.pi/models.json)

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for details.

---

## 中文

受 [Stripe Minions](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) 和 [OpenClaw](https://github.com/nichochar/open-claw) 启发，Open Minions 是一个开源的、一次性端到端 AI 编程代理，由 [pi-mono](https://github.com/badlogic/pi-mono) 提供支持。

用自然语言描述任务——修复 Bug、实现功能、修补不稳定的测试——它会自动编写代码、运行测试并交付补丁，无需人工干预。

### 工作原理

```
用户: "修复登录页面空邮箱时的崩溃问题"
        │
        ▼
   单一 Host Agent
        │  解析提示词策略/环境变量并编排主机工具
        │
        ├─ docker  → 启动/执行隔离沙箱容器
        ├─ git     → Git 仓库主机侧补丁交付
        └─ tar     → 非 Git 目录主机侧制品交付
        │
        ▼
   主机侧交付应用（git am / tar 解包）
```

### 架构

**单 Agent 主机架构（当前）：**

- **单一 LLM Host Agent** — 不再使用独立 Sandbox Agent 进程。
- **仅三类主机工具** — `docker`、`git`、`tar`。
- **统一策略引擎** — 主机命令统一走 allowlist/denylist/路径检查。
- **Docker backend 回退** — `podman` 优先，失败回退到 `docker`。
- **容器内执行不受限** — 通过 `docker exec ... bash -lc` 执行任意构建/测试/调试命令。
- **严格主机侧交付** — Git 仓库走补丁应用，非 Git 目录走 tar 制品应用。
- **提示词策略 + 环境变量解析** — 关键词策略与任意 `KEY=VALUE` 透传。

```
┌─────────────────────────────────────────────┐
│  Host Agent（单实例）                        │
│  提示词解析 → 策略/环境变量合并              │
│  工具：docker / git / tar                    │
└──────────────────┬──────────────────────────┘
                   │ docker run / docker exec
┌──────────────────▼──────────────────────────┐
│  隔离沙箱容器                                │
│  构建 / 测试 / 调试 / 修改代码               │
└──────────────────┬──────────────────────────┘
                   │ 仅主机侧应用交付
┌──────────────────▼──────────────────────────┐
│  交付                                        │
│  Git 仓库：git 补丁应用                      │
│  非 Git 目录：tar 制品应用                   │
└─────────────────────────────────────────────┘
```

### 核心特性

- **自然语言优先** — 用自然语言描述任务，代理自动完成
- **单 Agent 编排** — 一个 Host Agent 统一处理策略、工具调用、交付
- **提示词策略控制** — `preserve/retry/parallel/auto-apply` 等关键词映射到运行时环境变量
- **容器生命周期管理** — 支持保留容器、快照、重试、并行
- **pi-mono 集成** — 通过 `@mariozechner/pi-ai` 统一 LLM 接口
- **Docker 沙箱隔离** — 所有代码执行都在安全容器中进行
- **严格主机侧交付** — Git 仓库走 `git` 补丁，非 Git 目录走 `tar` 制品
- **多 LLM 支持** — 支持 OpenAI、Anthropic、Google、DeepSeek、智谱等多个提供商
- **交互式 TUI 配置** — 终端图形界面，支持键盘导航，配置更便捷
- **容器预设** — 预配置 git 身份、时区、语言环境（可自定义）
- **提供商别名** — 多区域 API 端点别名机制

### 快速开始

#### 前置条件

- Node.js >= 18
- Docker
- LLM API 密钥（OpenAI / Anthropic / DeepSeek / 智谱等）

#### 安装

```bash
git clone https://github.com/helanmouse/open-minions.git
cd open-minions
npm install
npm run build
```

#### 构建 pi-runtime（离线模式）

```bash
npm run build:pi-runtime
npm run build:sandbox
```

这会在 `~/.minion/pi-runtime/` 中预构建 pi-mono 包，然后挂载到容器中。

#### 配置

```bash
minion setup
```

这将启动交互式终端界面（TUI）进行配置：
- 使用方向键在提供商和模型之间导航
- 按 Enter 选择提供商/模型
- 按 Escape 返回上一级
- TUI 支持多提供商和多区域来源

或手动配置环境变量：

```bash
# LLM 配置
LLM_PROVIDER=openai              # openai | anthropic | deepseek | zhipu | google
LLM_MODEL=gpt-4o                 # 模型名称
LLM_API_KEY=sk-...               # API 密钥
LLM_BASE_URL=                    # 可选，自定义 API 地址
```

#### 构建 Docker 镜像

```bash
npm run docker:build
```

#### 使用

**基础用法：**

```bash
# 运行任务
minion run "修复登录页面空邮箱时的崩溃问题"

# 带选项运行
minion run -y "添加用户注册功能" --repo /path/to/repo --timeout 60
minion run -d "后台任务"                  # 后台运行

# 任务管理
minion list                               # 列出所有任务
minion status <task-id>                   # 查看任务状态
minion stop <task-id>                     # 停止运行中的任务

# 配置管理
minion setup                              # 交互式配置
minion config                              # 查看当前配置
```

**提示词策略示例：**

可用自然语言关键词控制运行行为：

```bash
# 失败时保留容器用于调试
minion run "修复这个 bug，如果失败保留容器"

# 并行运行任务多次
minion run "尝试这个优化 3 次并行"

# 自动应用补丁无需确认
minion run "添加功能 X，自动应用补丁"

# 失败时重试
minion run "部署到测试环境，失败时重试"

# 自定义资源分配
minion run "运行重型任务，使用 8g 内存和 4 核"

# 使用环境变量强制启用 AI 模式
MINION_AI_MODE=true minion run "任意任务描述"

# 从提示词文件执行任务
minion run "$(cat task.txt)"
```

**AI 模式关键词：**
- 中文：`保留`、`快照`、`并行`、`重试`、`自动应用`
- 英文：`preserve`、`snapshot`、`parallel`、`retry`、`auto-apply`、`keep container`

### 单 Agent 兼容策略（当前）

- Host 侧工具收敛为 `docker`、`git`、`tar` 三个。
- `docker` 工具内部按 `podman` → `docker` 顺序做 backend 回退。
- 容器内执行保持不受限，通过 `docker exec ... bash -lc "<command>"` 执行任意构建/测试/调试命令。
- 交付严格由 Host 侧完成：
  - Git 仓库走 `git format-patch` / `git am`。
  - 非 Git 目录走 `tar` 打包/解包同步。
- 提示词里的任意 `KEY=VALUE` 环境变量会透传到运行时。
- 生效优先级：显式运行时环境变量 > 提示词环境变量 > 提示词策略派生变量 > 默认值。

### 执行日志

执行过程中，你会看到详细的日志输出：
- `[host] Starting task:` - 任务初始化
- `[host:tool] {tool} {params}` - 工具调用及关键参数
- `[host:tool_done] {tool} error={bool}` - 工具完成状态
- `[host:msg] stopReason={reason}` - LLM 响应完成
- `[host:event] agent_end` - Agent 完成

这些日志帮助你实时了解 agent 正在做什么。

### 高级用法

Host Agent 能理解自然语言指令：

```bash
# 分析项目并选择合适的镜像
minion run "分析项目，选择合适的镜像，修复 bug"

# 失败时保留容器
minion run "添加功能，如果失败保留容器用于调试"

# 成功后创建 PR
minion run "修复 lint 错误，测试通过后创建 PR"
```

### 配置说明

详见 [docs/CONFIGURATION.md](docs/CONFIGURATION.md)，包括：

- 多 LLM 提供商（OpenAI、Anthropic、Google、DeepSeek、智谱）
- 自定义 API 地址和提供商别名
- 容器预设（git 身份、时区、语言环境）
- 环境变量配置
- 与 pi-mono 兼容的 models.json 格式

### 开发

```bash
npm test          # 运行所有测试
npm run lint      # 类型检查
npm run build     # 编译
```

### V3 迁移说明

V2 用户升级请注意：

1. 运行 `npm run build:pi-runtime` 构建离线运行时
2. 运行 `minion setup` 重新配置 LLM
3. 配置格式更改为 pi-mono 兼容格式 (~/.minion/.pi/models.json)

详见 [docs/CONFIGURATION.md](docs/CONFIGURATION.md)。

---

## Acknowledgments / 致谢

- [Stripe Minions Blog Part 1](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) — the "what" and "why"
- [Stripe Minions Blog Part 2](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2) — the "how" (Blueprints, Devboxes, Toolshed)
- [OpenClaw](https://github.com/nichochar/open-claw) — Gateway pattern, unified tool interface
- [Goose](https://github.com/block/goose) — Block's open-source coding agent

## License

MIT
