# Minions V2 设计：本地 CLI + Docker Sandbox + 自主 Agent

## 概述

从 GitLab CI/CD 集成架构转向纯本地 CLI + Docker Sandbox 的自主 Agent 系统。用户通过 CLI 提交任务，Agent 在隔离的 Docker 容器内自主完成编码、测试、提交，结果以 git 分支形式交付。

## 设计决策

- **架构方案**：Agent-in-Sandbox — 整个 Agent 进程运行在 Docker 容器内，宿主机只负责调度和收割
- **Blueprint 策略**：完全自主规划 — 无预定义 YAML，Agent 根据项目上下文自行决定执行步骤
- **Sandbox 方案**：Docker 优先，可插拔接口，未来可切换 microVM 等
- **交互模式**：Fire-and-forget — 用户提交后 Agent 全程自主，完成后通知结果
- **结果交付**：自动创建 git 分支 + 提交
- **任务来源**：CLI 描述、远端 issue URL（Agent 自行 fetch 解析）、远端/本地仓库

## 整体架构

```
用户 (CLI)
  │
  │  minion run -d "修复登录bug" --repo /path/to/repo
  │
  ▼
┌─────────────────────────────────────────────┐
│              Minion CLI (宿主机)              │
│                                             │
│  1. 解析任务参数                              │
│  2. git worktree add / git clone             │
│  3. docker run → 启动 sandbox 容器            │
│     - 挂载 worktree 到容器内                  │
│     - 注入任务描述 + LLM 配置                  │
│  4. 后台运行，监控容器状态                     │
│  5. 收割结果：检查 git diff，报告状态           │
└─────────────────────────────────────────────┘
                    │
                    │ docker run -v worktree:/workspace
                    ▼
┌─────────────────────────────────────────────┐
│           Sandbox 容器 (Docker)              │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │          Agent 进程                    │  │
│  │                                       │  │
│  │  1. 扫描项目结构，理解代码库             │  │
│  │  2. 自主规划执行步骤                    │  │
│  │  3. 循环：LLM 思考 → 调用工具 → 反馈    │  │
│  │  4. 自我验证（lint、test）              │  │
│  │  5. git commit 到 worktree 分支         │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  工具：bash, 文件读写, 代码搜索, git          │
│  环境：项目所需的语言运行时 + 依赖             │
└─────────────────────────────────────────────┘
```

三层职责：
- **CLI（宿主机）**：任务调度、worktree/clone 管理、容器生命周期、结果收割
- **Sandbox（容器）**：Agent 执行环境，完全隔离
- **Agent（容器内进程）**：自主规划 + 执行，无预定义 blueprint

关键设计：
- 本地仓库用 git worktree（共享 .git，秒级创建）；远端仓库用 git clone 到临时目录
- 容器挂载 worktree/clone 目录，Agent 修改直接反映在宿主机
- 多任务并行 = 多个 worktree + 多个容器，互不干扰

## Agent 自主规划

Agent 拿到任务后自己决定怎么做，不依赖预定义 YAML：

```
Phase 1: 理解
  - 读取项目结构、README、package.json、Makefile 等
  - 读取 .minion/rules/ 下的规则文件
  - 识别语言、框架、构建工具、测试框架
  - 如果有 issue URL，fetch 并解析内容

Phase 2: 规划
  - Agent 输出执行计划（纯文本）
  - 计划不是死板的，执行中可以随时调整

Phase 3: 执行
  - 标准 Agent Loop: LLM 思考 → 选择工具 → 执行 → 观察结果
  - 工具集：bash, read/write/edit, search, git

Phase 4: 验证
  - Agent 自主决定验证方式（test、lint、type check）
  - 验证失败自动修复，超过重试上限标记 needs_human

Phase 5: 提交
  - git add + commit 到 worktree 分支
  - 容器退出，宿主机收割结果
```

## Sandbox 容器管理

镜像选择优先级：
1. CLI `--image` / `--dockerfile` 参数 → 最高优先
2. `.minion/config.yaml` 中 `sandbox.image` → 项目默认值
3. 自动检测项目类型 → docker pull 对应镜像

容器启动参数：
```bash
docker run \
  -v <worktree>:/workspace \
  -e MINION_TASK=<json> \
  -e LLM_PROVIDER=... \
  -e LLM_API_KEY=... \
  --network=bridge \
  --memory=4g --cpus=2 \
  <image>
```

安全边界：
- 容器内 Agent 只能访问 /workspace
- 网络开放供 LLM API 调用和 npm install 等
- 宿主机文件系统不可见
- 资源有上限（内存、CPU）

多任务并行：每个任务独立 worktree + 独立容器，互不干扰。

## CLI 设计

```bash
# 核心命令
minion run [options]              # 提交任务
minion list                       # 查看所有任务
minion status <task-id>           # 查看单个任务状态
minion logs <task-id>             # 查看 Agent 执行日志
minion stop <task-id>             # 停止运行中的任务
minion clean [task-id]            # 清理 worktree + 容器

# run 参数
-d, --description <text>          # 任务描述
-r, --repo <path|url>             # 仓库路径或远端 URL，默认当前目录
--from <url>                      # 从 issue URL 获取任务（Agent 自行 fetch 解析）
--image <name>                    # Docker 镜像
--dockerfile <path>               # 本地 Dockerfile
--branch <name>                   # 目标分支名，默认 minion/<task-id>
--base <branch>                   # 基于哪个分支，默认当前分支
--push                            # 完成后自动推送到远端
--token <token>                   # 认证 token（用于私有 issue/仓库）
--max-iterations <n>              # Agent 最大迭代次数，默认 50
--timeout <minutes>               # 超时时间，默认 30
```

任务来源：
- `-d` 手动描述
- `--from <url>` 远端 issue（GitLab/GitHub/Jira 等，Agent 自行解析）
- 两者可组合使用

仓库来源：
- 本地路径 → git worktree add
- 远端 URL → git clone 到临时目录
- 完成后 `--push` 可自动推送

任务状态存储：`~/.minion/tasks.json`，纯本地 JSON，不需要数据库。

## 可复用模块（从 V1）

```
完全复用：
  src/llm/              # LLM 适配器层
  src/worker/agent-loop.ts  # Agent 循环核心逻辑
  src/context/loader.ts     # 规则加载

复用并简化：
  src/tools/            # 去掉容器内不需要的安全过滤
  src/config/           # 调整配置字段

重写：
  src/cli/              # 新命令结构

新增：
  src/sandbox/          # Docker 容器管理
  src/task/             # 任务状态管理
  src/agent/            # 容器内 Agent 入口 + 项目扫描

删除：
  src/server/           # 不需要 Gateway
  src/worker/blueprint-engine.ts  # 不需要预定义 blueprint
  src/worker/actions.ts           # 融入 Agent 自主决策
  blueprints/                     # 不需要 YAML 模板
```

## 项目结构

```
minions/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── version.ts
│   ├── cli/                        # CLI 入口（宿主机）
│   │   └── index.ts
│   ├── task/                       # 任务管理（宿主机）
│   │   ├── store.ts                # ~/.minion/tasks.json 持久化
│   │   └── manager.ts              # worktree/clone + 容器生命周期 + 结果收割
│   ├── sandbox/                    # 沙箱管理（宿主机）
│   │   ├── types.ts                # Sandbox 接口（可插拔）
│   │   ├── docker.ts               # Docker 实现
│   │   └── image.ts                # 镜像选择逻辑
│   ├── agent/                      # Agent 进程（容器内运行）
│   │   ├── main.ts                 # 容器入口点
│   │   └── planner.ts              # 项目扫描 + system prompt 组装
│   ├── llm/                        # LLM 适配器（复用）
│   ├── tools/                      # 工具系统（复用，简化安全层）
│   │   └── git.ts                  # 新增：git 操作工具
│   ├── context/                    # 上下文加载（复用）
│   │   └── loader.ts
│   └── config/
│       └── index.ts
├── docker/                         # Docker 镜像定义
│   ├── Dockerfile.base
│   ├── Dockerfile.node
│   └── Dockerfile.python
└── test/
```

代码运行边界：
- 宿主机：cli/ + task/ + sandbox/ + config/
- 容器内：agent/ + llm/ + tools/ + context/
