# Open Minions

Inspired by [Stripe's Minions](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) and [OpenClaw](https://github.com/nichochar/open-claw)'s design philosophy, Open Minions is an open-source, one-shot, end-to-end AI coding agent system built for GitLab CI/CD workflows.

Give it a task — fix a bug, implement a feature, patch a flaky test — and it writes the code, runs lint, pushes a branch, and opens a Merge Request. No hand-holding required.

## How It Works

```
Engineer triggers task (CLI / GitLab Issue / Webhook)
        │
        ▼
   Gateway Server (Fastify + BullMQ)
        │
        ▼
   Agent Worker (isolated subprocess)
        │
        ├─ Blueprint Engine orchestrates the flow
        │   ├─ Deterministic steps: git clone, lint, push, create MR
        │   └─ Agent steps: LLM writes & fixes code
        │
        ├─ Local lint check (seconds, not minutes)
        │   └─ Fail? LLM auto-fixes → re-lint
        │
        ├─ Push branch → CI runs
        │   └─ Fail? LLM retries (max 2 rounds, then hands back to human)
        │
        └─ Create Merge Request → human reviews
```

## Key Concepts

### Blueprints

Blueprints are YAML-defined workflows that mix **deterministic steps** (zero LLM cost, fully predictable) with **agent steps** (LLM has full freedom to think and use tools). Borrowed from Stripe's architecture — the best of both worlds.

```yaml
# blueprints/fix-issue.yaml
steps:
  - id: clone
    type: deterministic
    action: git_clone

  - id: implement
    type: agent
    tools: [read, write, edit, bash, search_code]
    prompt: "Fix this issue: {{context.issue_description}}"
    max_iterations: 20

  - id: lint
    type: deterministic
    action: run_lint

  - id: push
    type: deterministic
    action: git_push

  - id: create_mr
    type: deterministic
    action: create_merge_request
```

### Pluggable LLMs

Swap between OpenAI, Anthropic, Ollama (local models) via config. No vendor lock-in.

### Unified Tool System

All tools implement a single `AgentTool` interface. Each Blueprint step declares which tools the LLM can access — preventing the agent from doing things it shouldn't (like pushing code during the coding phase).

### Left-Shift Feedback

Inspired by Stripe's approach: catch errors early and cheap.

1. **Local lint** — milliseconds, blocks obvious mistakes before CI
2. **CI tests** — full test suite, but LLM gets max 1-2 retry rounds
3. **Over budget?** — task returns to human. No infinite loops burning tokens.

### Per-Directory Rules

Drop `.minion-rules.md` files anywhere in your repo. The agent loads them dynamically as it navigates your codebase — no context window bloat.

```
your-repo/
├── .minion/
│   ├── config.yaml          # lint/test commands, language
│   └── rules/global.md      # global coding rules
├── src/
│   ├── .minion-rules.md     # src-specific rules
│   └── api/
│       └── .minion-rules.md # api-specific rules
```

## Quick Start

### Prerequisites

- Node.js >= 18
- A GitLab account + personal access token
- LLM API key (OpenAI / Anthropic / 本地 Ollama)

### 安装

```bash
git clone https://github.com/helanmouse/open-minions.git
cd open-minions
npm install
```

### 配置

创建 `.env` 文件：

```bash
# LLM 配置（三选一）
LLM_PROVIDER=openai          # openai | anthropic | ollama
LLM_MODEL=gpt-4o             # 模型名称
LLM_API_KEY=sk-...           # API 密钥（Ollama 不需要）
LLM_BASE_URL=                # 可选，自定义 API 地址

# GitLab 配置
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=glpat-...       # GitLab Personal Access Token

# 服务配置（可选，以下为默认值）
MINION_PORT=3000
MINION_HOST=127.0.0.1
```

### 启动服务

```bash
# 启动 Gateway 服务
npm run dev:server
```

服务启动后监听 `http://127.0.0.1:3000`。

### 通过 CLI 提交任务

```bash
# 提交一个修复 Issue 的任务
npx tsx src/cli/index.ts run \
  -r https://gitlab.com/yourgroup/yourrepo.git \
  -d "修复登录页面空邮箱时的崩溃问题" \
  -i 42 \
  -b fix-issue

# 查看任务状态
npx tsx src/cli/index.ts status <task-id>

# 列出所有任务
npx tsx src/cli/index.ts list
```

CLI 参数说明：
- `-r, --repo <url>` — GitLab 仓库地址（必填）
- `-d, --description <text>` — 任务描述（必填）
- `-b, --blueprint <name>` — 使用的 Blueprint，默认 `fix-issue`
- `-i, --issue <id>` — 关联的 GitLab Issue ID
- `-s, --server <url>` — Gateway 地址，默认 `http://127.0.0.1:3000`

### 通过 API 提交任务

```bash
curl -X POST http://127.0.0.1:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "repo_url": "https://gitlab.com/yourgroup/yourrepo.git",
    "description": "添加用户注册的邮箱验证",
    "blueprint": "fix-issue",
    "issue_id": "15",
    "title": "Add email validation"
  }'
```

### 通过 GitLab Webhook 自动触发

1. 进入 GitLab 项目 → Settings → Webhooks
2. URL 填写：`https://your-server/api/webhook/gitlab`
3. 勾选 "Issues events"
4. 给任意 Issue 添加 `minion` 标签 → Agent 自动启动

### 为目标仓库配置 Minion

在你希望 Minion 工作的仓库根目录添加配置：

```bash
# 创建配置目录
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

### 开发与测试

```bash
# 运行所有测试
npm test

# 类型检查
npm run lint

# 编译
npm run build
```

## Architecture

```
┌──────────────────────────────────────────────┐
│               Triggers                        │
│   CLI  │  GitLab Webhook  │  Future: Slack    │
└───────────────────┬──────────────────────────┘
                    │
┌───────────────────▼──────────────────────────┐
│          Gateway (Fastify + BullMQ)           │
│   Task Queue  │  Scheduler  │  GitLab Client  │
└───────────────────┬──────────────────────────┘
                    │
┌───────────────────▼──────────────────────────┐
│            Agent Worker (subprocess)          │
│   Blueprint Engine  │  LLM Adapter  │  Tools  │
└──────────────────────────────────────────────┘
```

## Project Setup for Your Repo

详见上方「为目标仓库配置 Minion」章节。

## Acknowledgments

- [Stripe Minions Blog Part 1](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) — the "what" and "why"
- [Stripe Minions Blog Part 2](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2) — the "how" (Blueprints, Devboxes, Toolshed)
- [OpenClaw](https://github.com/nichochar/open-claw) — Gateway pattern, unified tool interface, composable security layers
- [Goose](https://github.com/block/goose) — Block's open-source coding agent (Stripe's Minions fork from this)

## License

MIT
