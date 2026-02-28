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
   Host Agent (pi-ai LLM)
        │  Parse task → Analyze project → Prepare repo
        │
        ▼
   Docker Sandbox (isolated container)
        │  Clone repo → Journal → Plan → Code → Test → Lint → Commit
        │  (pi-agent-core + inlined coding tools)
        │
        ▼
   Patches delivered via git format-patch
        │
        ▼
   Host Agent applies patches → Push to remote
```

### Architecture

**V3 Architecture with pi-mono Integration:**

- **Host Agent** — Runs on your machine using `@mariozechner/pi-ai` for LLM calls
- **Sandbox Agent** — Runs in Docker container using `@mariozechner/pi-agent-core` Agent class
- **Tools** — Inlined coding tools (bash, read, edit, write) + custom deliver_patch
- **Offline Runtime** — pi-runtime pre-built on host, mounted to containers (no npm install inside)
- **Container Presets** — Pre-configured git identity, timezone, locale via `~/.minion/config.json`

```
┌─────────────────────────────────────────────┐
│  Host Agent (pi-ai LLM)                      │
│  Parse → Analyze → Launch Docker → Apply    │
│  patches → Push                              │
└──────────────────┬──────────────────────────┘
                   │ docker run (bootstrap.sh)
┌──────────────────▼──────────────────────────┐
│  Sandbox Agent (pi-agent-core Agent)        │
│  Clone → Journal → Plan → Code → Test →   │
│  Lint → Commit → deliver_patch             │
└─────────────────────────────────────────────┘
           ↑ pi-runtime mounted from host
           ~/.minion/pi-runtime → /opt/pi-runtime
```

### Key Features

- **Natural Language First** — Describe your task in plain language, the agent handles the rest
- **pi-mono Integration** — Unified LLM interface via `@mariozechner/pi-ai`
- **Docker Sandbox Isolation** — All code execution happens in a secure container
- **Offline Runtime** — pi-runtime pre-built on host, mounted to containers
- **Patch-Based Delivery** — Results via `git format-patch` → `git am`
- **Multiple LLM Providers** — 25 supported providers including OpenAI, Anthropic, Google, DeepSeek, Zhipu, and more
- **Interactive TUI Setup** — Terminal-based UI for easy configuration with keyboard navigation
- **Container Presets** — Pre-configured git identity, timezone, locale (customizable)
- **Agent Journal** — Mandatory execution journal for better failure diagnostics
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
- Use arrow keys to navigate between providers and models
- Press Enter to select a provider/model
- Press Escape to go back
- The TUI supports 25 LLM providers out of the box

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

```bash
# Run a task
minion run "Fix login page crash when email is empty"

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
   Host Agent（pi-ai LLM）
        │  解析任务 → 分析项目 → 准备仓库
        │
        ▼
   Docker 沙箱（隔离容器）
        │  克隆仓库 → 日志 → 规划 → 编码 → 测试 → Lint → 提交
        │  (pi-agent-core + 内置编码工具)
        │
        ▼
   通过 git format-patch 交付补丁
        │
        ▼
   Host Agent 应用补丁 → 推送到远端
```

### 架构

**V3 架构集成 pi-mono：**

- **Host Agent** — 在本机运行，使用 `@mariozechner/pi-ai` 进行 LLM 调用
- **Sandbox Agent** — 在 Docker 容器内运行，使用 `@mariozechner/pi-agent-core` Agent 类
- **工具** — 内置编码工具（bash、read、edit、write）+ 自定义 deliver_patch
- **离线运行时** — pi-runtime 在宿主机预构建，挂载到容器内
- **容器预设** — 预配置 git 身份、时区、语言环境，可通过 `~/.minion/config.json` 自定义

```
┌─────────────────────────────────────────────┐
│  Host Agent (pi-ai LLM)                      │
│  解析 → 分析 → 启动 Docker → 应用补丁 →     │
│  推送                                         │
└──────────────────┬──────────────────────────┘
                   │ docker run (bootstrap.sh)
┌──────────────────▼──────────────────────────┐
│  Sandbox Agent (pi-agent-core Agent)        │
│  克隆 → 规划 → 编码 → 测试 → Lint →         │
│  提交 → deliver_patch → git format-patch   │
└─────────────────────────────────────────────┘
           ↑ pi-runtime 从宿主机挂载
           ~/.minion/pi-runtime → /opt/pi-runtime
```

### 核心特性

- **自然语言优先** — 用自然语言描述任务，代理自动完成
- **pi-mono 集成** — 通过 `@mariozechner/pi-ai` 统一 LLM 接口
- **Docker 沙箱隔离** — 所有代码执行都在安全容器中进行
- **离线运行时** — pi-runtime 在宿主机预构建，挂载到容器内
- **补丁交付** — 通过 `git format-patch` → `git am` 交付结果
- **多 LLM 支持** — 支持 25 个 LLM 提供商，包括 OpenAI、Anthropic、Google、DeepSeek、智谱等
- **交互式 TUI 配置** — 终端图形界面，支持键盘导航，配置更便捷
- **容器预设** — 预配置 git 身份、时区、语言环境（可自定义）
- **代理日志** — 强制执行日志，便于故障诊断
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
- TUI 原生支持 25 个 LLM 提供商

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
