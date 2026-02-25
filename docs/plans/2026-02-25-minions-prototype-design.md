# Minions Prototype Design

基于 Stripe Minions 架构理念 + OpenClaw 设计哲学，构建一个与 GitLab CI/CD 深度集成的自动化编程代理系统。

## 需求概要

- 基于 GitLab CI/CD 生态
- 语言无关的目标代码库
- 多入口触发（CLI / GitLab Issue / CI Pipeline）
- LLM 可插拔（OpenAI / Claude / 本地模型）
- TypeScript/Node.js 实现
- MVP 先行：CLI 触发 → AI 编码 → 本地 Lint → 推送分支 → 创建 MR

## 设计灵感

**Stripe Minions：**
- Blueprint 编排：确定性节点 + 自由 Agent 节点的混合模式
- Devbox 隔离环境：预热资源池，10 秒启动
- Toolshed + MCP：近 500 个内部工具，按任务精选子集
- 左移反馈：本地 Lint 先行，CI 重试限 1-2 次

**OpenClaw：**
- Composition over Forking：包装而非分叉
- 统一 AgentTool 接口：所有工具遵循同一接口
- 分层 Tool Policy：8 层安全策略组合
- 动态上下文组装：按需加载，不一次性塞满窗口
- Gateway 模式：单一入口拥有所有连接器和路由

## 整体架构

```
┌──────────────────────────────────────────────────────┐
│                    入口层 (Triggers)                    │
│   CLI Client  │  GitLab Webhook  │  未来: Slack/API    │
└────────────────────────┬─────────────────────────────┘
                         │ HTTP
┌────────────────────────▼─────────────────────────────┐
│               Gateway (Fastify Server)                │
│  ┌──────────┐ ┌──────────┐ ┌───────────────────────┐ │
│  │ 任务队列  │ │ 调度器    │ │ GitLab API Client     │ │
│  │ (BullMQ) │ │(Scheduler)│ │ (MR/Branch/Webhook)   │ │
│  └──────────┘ └──────────┘ └───────────────────────┘ │
└────────────────────────┬─────────────────────────────┘
                         │ 子进程 (fork)
┌────────────────────────▼─────────────────────────────┐
│              Agent Worker (隔离执行层)                  │
│  ┌────────────────────────────────────────────────┐   │
│  │         Blueprint Engine (蓝图引擎)              │   │
│  │  确定性节点: git clone, lint, push, create MR   │   │
│  │  自由节点:   LLM Agent Loop (编码/修复)          │   │
│  └────────────────────────────────────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌───────────────────────┐ │
│  │ LLM 适配器│ │ 工具注册表│ │ 上下文加载器           │ │
│  │(可插拔)   │ │(AgentTool)│ │(规则文件/Issue/文档)   │ │
│  └──────────┘ └──────────┘ └───────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

三层职责：
- **入口层**：接收来自 CLI/Webhook/API 的任务请求，可随时扩展新入口
- **Gateway**：任务队列管理（BullMQ + Redis）、Worker 调度（fork 子进程消费队列）、GitLab API 交互
- **Agent Worker**：隔离子进程，每个任务独立运行 Blueprint，由 BullMQ Worker 消费队列自动派发

Gateway 与 Worker 的连接：Gateway 入队后，BullMQ Worker 进程自动消费任务，fork 子进程执行 Blueprint，执行完毕后更新任务状态并回调通知。

## MVP 与后续版本边界

**MVP（当前版）：**
- CLI 触发 → Gateway 入队 → BullMQ Worker 消费 → Blueprint 执行（clone → LLM 编码 → lint → push → 创建 MR）
- 内存队列 + Redis（BullMQ）
- 单机部署，单 Worker 进程
- 集成测试覆盖完整闭环（真实 git 操作 + mock LLM）

**后续版（延期）：**
- GitLab Webhook 触发 + Slack Bot 入口
- @gitbeaker/rest 替代原生 fetch 调用 GitLab API
- CI 状态机（ci_running / ci_pass）+ CI 结果回调
- 多 Worker 并发 + 分布式部署
- MR 评论追加指令触发二次修复

## Blueprint 引擎

Blueprint 是 YAML 定义的有向图，混合确定性节点和自由 Agent 节点：

```yaml
# blueprints/fix-issue.yaml
name: fix-issue
steps:
  - id: clone
    type: deterministic          # 纯代码执行，零 LLM 调用
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
    type: agent                  # LLM 全权处理
    tools: [read, write, edit, bash, search_code]
    prompt: |
      根据以下 Issue 描述修复问题：
      {{context.issue_description}}
      遵循项目规则：{{context.rules}}
    max_iterations: 20

  - id: lint
    type: deterministic
    action: run_lint

  - id: fix_lint
    type: agent
    condition: "{{steps.lint.exit_code == 1}}"
    tools: [read, edit]
    prompt: "修复以下 lint 错误：{{steps.lint.errors}}"
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

设计要点：
- `deterministic` 节点：可预测、省 Token
- `agent` 节点：工具集按节点配置子集，防止越权操作
- `condition`：条件执行，lint 通过则跳过修复
- `max_iterations`：防止无限循环

## LLM 适配器

可插拔设计，统一接口：

```typescript
interface LLMAdapter {
  chat(messages: Message[], tools: ToolDef[]): AsyncIterable<LLMEvent>
}
```

内置适配器：OpenAIAdapter / AnthropicAdapter / OllamaAdapter，通过配置文件切换。

## 工具系统

统一 AgentTool 接口：

```typescript
interface AgentTool {
  name: string
  description: string
  parameters: JSONSchema
  execute(params: Record<string, any>, ctx: ToolContext): Promise<ToolResult>
}
```

export interface TaskRequest {
  id: string;
  repo_url: string;
  project_id: string;            // 从 repo_url 自动解析，如 "group/repo"
  description: string;
  issue_id?: string;
  title?: string;
  blueprint: string;
  created_at: string;
}
```

Agent 节点可用工具：read / write / edit / bash / search_code / list_files

确定性节点专用动作：git_clone / git_push / run_lint / run_test / create_merge_request / load_context

工具策略：每个 Blueprint agent 节点声明可用工具子集，防止 LLM 越权操作。

安全基线：
- 文件操作工具使用 `path.resolve` + 规范化后校验前缀，防止路径穿越
- bash 工具使用 `execFile` + 参数数组替代 shell 字符串拼接，防止命令注入
- search 工具参数通过转义处理，不直接拼入 shell

## 上下文加载策略

```
项目根目录/
├── .minion/
│   ├── config.yaml          # 项目级配置（lint命令、test命令、语言）
│   └── rules/
│       └── global.md        # 全局编码规则
├── src/
│   ├── .minion-rules.md     # src 目录专属规则
│   ├── api/
│   │   └── .minion-rules.md # api 子目录专属规则
```

加载流程：
1. 读取 `.minion/config.yaml` 获取项目配置
2. 读取触发源上下文（Issue 描述 / CLI 输入 / Pipeline 错误日志）
3. 调用 `loadRulesForPath` 加载全局规则 + 目录级规则，注入 `context.rules`
4. Agent 遍历文件系统时，动态加载当前目录的 `.minion-rules.md`
5. 所有上下文按需注入，不一次性塞满窗口

## 任务生命周期与反馈循环

状态机：`queued` → `running` → `lint_pass` → `ci_running` → `ci_pass` → `mr_created` → `done`

任何阶段失败且超过重试次数 → `needs_human`

左移反馈策略（借鉴 Stripe）：
- 本地 lint 先行：秒级反馈，低级错误拦在 CI 之前
- 未配置 lint 命令时返回 `skipped` 状态（exit_code=-1），不视为通过
- CI 反馈限次：最多 1-2 轮自动修复，超过则交还人类
- 每轮修复只把失败信息喂给 LLM，不重复发送整个代码库

工程师可在 MR 上评论追加指令 → 触发新一轮 Agent 修复。

## MVP 项目结构

```
minions/
├── package.json
├── tsconfig.json
├── src/
│   ├── cli/                    # CLI 客户端
│   │   └── index.ts
│   ├── server/                 # Gateway 服务
│   │   ├── index.ts            # Fastify 启动
│   │   ├── routes/             # API 路由
│   │   └── queue.ts            # BullMQ 任务队列
│   ├── worker/                 # Agent Worker
│   │   ├── index.ts
│   │   ├── blueprint-engine.ts # Blueprint 解析与执行
│   │   └── agent-loop.ts       # LLM Agent 循环
│   ├── llm/                    # LLM 适配器
│   │   ├── types.ts
│   │   ├── openai.ts
│   │   ├── anthropic.ts
│   │   └── ollama.ts
│   ├── tools/                  # 工具注册表
│   │   ├── types.ts
│   │   ├── file-ops.ts
│   │   ├── bash.ts
│   │   ├── search.ts
│   │   └── gitlab.ts
│   ├── context/                # 上下文加载
│   │   └── loader.ts
│   └── config/
│       └── index.ts
├── blueprints/                 # Blueprint 模板
│   ├── fix-issue.yaml
│   └── implement-feature.yaml
└── test/
```

## 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 运行时 | Node.js + TypeScript | 类型安全，LLM SDK 支持好 |
| HTTP 框架 | Fastify | 高性能，插件生态丰富 |
| 任务队列 | BullMQ + Redis | 成熟可靠，支持重试/延迟/优先级 |
| GitLab 交互 | @gitbeaker/rest | 官方推荐的 GitLab API 客户端 |
| CLI 框架 | Commander.js | 轻量，广泛使用 |
| YAML 解析 | js-yaml | Blueprint 定义解析 |
| 代码搜索 | ripgrep (子进程) | 极快的代码搜索 |
