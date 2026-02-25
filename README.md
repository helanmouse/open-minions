# Open Minions

[English](#english) | [中文](#中文)

---

## English

Inspired by [Stripe's Minions](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) and [OpenClaw](https://github.com/nichochar/open-claw), Open Minions is an open-source, one-shot, end-to-end AI coding agent.

Give it a task in natural language — fix a bug, implement a feature, patch a flaky test — and it writes the code, runs tests, and delivers patches. No hand-holding required.

### How It Works

```
User: "Fix login page crash when email is empty"
        │
        ▼
   Host Agent (on your machine)
        │  Parse task → Analyze project → Prepare repo
        │
        ▼
   Docker Sandbox (isolated container)
        │  Clone repo → Plan → Code → Test → Lint → Commit
        │
        ▼
   Patches delivered via git format-patch
        │
        ▼
   Host Agent applies patches → Push to remote
```

### Architecture

**Dual-Layer Agent System:**

- **Host Agent** — Runs on your machine with restricted permissions. Parses tasks, analyzes projects, launches Docker containers, applies patches, and pushes to remote.
- **Sandbox Agent** — Runs inside a Docker container with full autonomy. Clones repo, plans approach, writes code, runs tests, and generates patches.

```
┌─────────────────────────────────────────────┐
│  Host Agent (restricted, on host machine)   │
│  Parse NL task → Analyze project → Launch   │
│  Docker → Monitor → Apply patches → Push    │
└──────────────────┬──────────────────────────┘
                   │ docker run
┌──────────────────▼──────────────────────────┐
│  Sandbox Agent (full power, in container)   │
│  Clone → Plan → Code → Test → Lint →       │
│  Commit → git format-patch                  │
└─────────────────────────────────────────────┘
```

### Key Features

- **Natural Language First** — Describe your task in plain language, the agent handles the rest
- **Docker Sandbox Isolation** — All code execution happens in a secure container
- **Pluggable LLMs** — OpenAI, Anthropic, or Ollama (local models). No vendor lock-in
- **Patch-Based Delivery** — Results via `git format-patch` → `git am`, preserving commit history
- **Watchdog Circuit Breaker** — Max iterations + token cost limits prevent runaway spending
- **Per-Directory Rules** — Drop `.minion-rules.md` anywhere in your repo for context-aware coding guidelines
- **Left-Shift Feedback** — Local lint → CI tests → human review. Catch errors early and cheap

### Quick Start

#### Prerequisites

- Node.js >= 18
- Docker
- LLM API key (OpenAI / Anthropic / local Ollama)

#### Install

```bash
git clone https://github.com/helanmouse/open-minions.git
cd open-minions
npm install
npm run build
```

#### Configure

Create a `.env` file:

```bash
# LLM Configuration (choose one provider)
LLM_PROVIDER=openai              # openai | anthropic | ollama
LLM_MODEL=gpt-4o                 # Model name
LLM_API_KEY=sk-...               # API key (not needed for Ollama)
LLM_BASE_URL=                    # Optional custom API endpoint

# Sandbox Configuration (optional)
SANDBOX_MEMORY=4g                # Default: 4g
SANDBOX_CPUS=2                   # Default: 2
SANDBOX_NETWORK=bridge           # Default: bridge

# Agent Configuration (optional)
AGENT_MAX_ITERATIONS=50          # Default: 50
AGENT_TIMEOUT=30                 # Default: 30 minutes
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
minion logs <task-id>                     # View task logs
minion stop <task-id>                     # Stop running task
minion clean [task-id]                    # Clean up task data
```

### Project Configuration

Add configuration to the target repo where you want the agent to work:

```bash
mkdir -p .minion/rules

# Project config
cat > .minion/config.yaml << 'EOF'
lint_command: "npm run lint"
test_command: "npm test"
language: "typescript"
EOF

# Global coding rules (optional)
cat > .minion/rules/global.md << 'EOF'
- Use TypeScript strict mode
- All public functions need JSDoc
- Use custom Error classes
EOF
```

You can also place `.minion-rules.md` in any subdirectory — the agent loads them dynamically as it navigates your codebase.

### Development

```bash
npm test          # Run all tests
npm run lint      # Type check
npm run build     # Compile
```

---

## 中文

受 [Stripe Minions](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) 和 [OpenClaw](https://github.com/nichochar/open-claw) 启发，Open Minions 是一个开源的、一次性端到端 AI 编程代理。

用自然语言描述任务——修复 Bug、实现功能、修补不稳定的测试——它会自动编写代码、运行测试并交付补丁，无需人工干预。

### 工作原理

```
用户: "修复登录页面空邮箱时的崩溃问题"
        │
        ▼
   Host Agent（运行在本机）
        │  解析任务 → 分析项目 → 准备仓库
        │
        ▼
   Docker 沙箱（隔离容器）
        │  克隆仓库 → 规划 → 编码 → 测试 → Lint → 提交
        │
        ▼
   通过 git format-patch 交付补丁
        │
        ▼
   Host Agent 应用补丁 → 推送到远端
```

### 架构

**双层代理系统：**

- **Host Agent** — 在本机运行，权限受限。负责解析任务、分析项目、启动 Docker 容器、应用补丁、推送到远端。
- **Sandbox Agent** — 在 Docker 容器内运行，拥有完全自主权。克隆仓库、规划方案、编写代码、运行测试、生成补丁。

```
┌─────────────────────────────────────────────┐
│  Host Agent（受限，运行在宿主机）              │
│  解析自然语言 → 分析项目 → 启动 Docker →     │
│  监控执行 → 应用补丁 → 推送远端               │
└──────────────────┬──────────────────────────┘
                   │ docker run
┌──────────────────▼──────────────────────────┐
│  Sandbox Agent（完全自主，运行在容器内）       │
│  克隆 → 规划 → 编码 → 测试 → Lint →         │
│  提交 → git format-patch                     │
└─────────────────────────────────────────────┘
```

### 核心特性

- **自然语言优先** — 用自然语言描述任务，代理自动完成
- **Docker 沙箱隔离** — 所有代码执行都在安全容器中进行
- **可插拔 LLM** — 支持 OpenAI、Anthropic、Ollama（本地模型），无厂商锁定
- **补丁交付** — 通过 `git format-patch` → `git am` 交付结果，保留完整提交历史
- **看门狗熔断器** — 最大迭代次数 + Token 成本限制，防止失控消耗
- **目录级规则** — 在仓库任意位置放置 `.minion-rules.md`，实现上下文感知的编码规范
- **左移反馈** — 本地 Lint → CI 测试 → 人工审查，尽早发现问题

### 快速开始

#### 前置条件

- Node.js >= 18
- Docker
- LLM API 密钥（OpenAI / Anthropic / 本地 Ollama）

#### 安装

```bash
git clone https://github.com/helanmouse/open-minions.git
cd open-minions
npm install
npm run build
```

#### 配置

创建 `.env` 文件：

```bash
# LLM 配置（三选一）
LLM_PROVIDER=openai              # openai | anthropic | ollama
LLM_MODEL=gpt-4o                 # 模型名称
LLM_API_KEY=sk-...               # API 密钥（Ollama 不需要）
LLM_BASE_URL=                    # 可选，自定义 API 地址

# 沙箱配置（可选）
SANDBOX_MEMORY=4g                # 默认: 4g
SANDBOX_CPUS=2                   # 默认: 2
SANDBOX_NETWORK=bridge           # 默认: bridge

# 代理配置（可选）
AGENT_MAX_ITERATIONS=50          # 默认: 50
AGENT_TIMEOUT=30                 # 默认: 30 分钟
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
minion logs <task-id>                     # 查看任务日志
minion stop <task-id>                     # 停止运行中的任务
minion clean [task-id]                    # 清理任务数据
```

### 项目配置

在目标仓库中添加配置：

```bash
mkdir -p .minion/rules

# 项目配置
cat > .minion/config.yaml << 'EOF'
lint_command: "npm run lint"
test_command: "npm test"
language: "typescript"
EOF

# 全局编码规则（可选）
cat > .minion/rules/global.md << 'EOF'
- 使用 TypeScript strict 模式
- 所有公开函数需要 JSDoc 注释
- 错误处理使用自定义 Error 类
EOF
```

也可以在任意子目录放置 `.minion-rules.md`，Agent 进入该目录时会自动加载。

### 开发

```bash
npm test          # 运行所有测试
npm run lint      # 类型检查
npm run build     # 编译
```

---

## Acknowledgments / 致谢

- [Stripe Minions Blog Part 1](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) — the "what" and "why"
- [Stripe Minions Blog Part 2](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2) — the "how" (Blueprints, Devboxes, Toolshed)
- [OpenClaw](https://github.com/nichochar/open-claw) — Gateway pattern, unified tool interface
- [Goose](https://github.com/block/goose) — Block's open-source coding agent

## License

MIT
