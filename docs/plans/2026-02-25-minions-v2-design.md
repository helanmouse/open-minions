# Minions V2 设计：本地 CLI + Docker Sandbox + 双层 Agent

## 概述

纯本地 CLI + Docker Sandbox 的自主 Agent 系统。用户通过 CLI 提交自然语言任务，Host Agent 分析本地项目并准备沙盒环境，Sandbox Agent 在隔离容器内自主完成编码、测试、提交。结果通过 Patch 机制交付回宿主机。

## 设计决策

- **双层 Agent 架构**：Host Agent（受限，分析+准备+收割）→ Sandbox Agent（全权，执行+交付）
- **宿主机极简原则**：Host Agent 只读分析本地项目、解析任务、拉取镜像、启动容器、应用 Patch
- **完全自主规划**：无预定义 YAML，Sandbox Agent 根据项目上下文自行决定执行步骤
- **Sandbox 方案**：Docker 优先，可插拔接口，未来可切换 microVM 等
- **交互模式**：默认前台 stream 日志，Ctrl+C 转后台；`-d` 直接后台运行
- **结果交付**：统一通过 Patch 机制（format-patch → apply）；远端仓库由 Host Agent 在 apply 后 push
- **自然语言优先**：CLI 第一参数就是自然语言任务描述，一切信息由 Host Agent 解析
- **上下文传递**：通过文件挂载（非环境变量）传递 TaskContext，避免 ENV 大小限制和安全隐患
- **零凭证入容器**：远端仓库由 Host Agent 在宿主机 clone，利用宿主机已有的 git 认证，容器内无需任何凭证
- **熔断机制**：Sandbox Agent 内置 Watchdog，max_iterations + max_token_cost 双重限制

## 整体架构

```
用户 (CLI)
  │
  │  minion run "修复登录bug，参考 issue #42"
  │
  ▼
┌──────────────────────────────────────────────────┐
│          Host Agent (宿主机，严格受限)              │
│                                                  │
│  权限：只读文件系统 + docker + 写 ~/.minion/       │
│                                                  │
│  1. 解析自然语言（LLM）                          │
│  2. 分析本地项目（LLM，只读扫描）                  │
│  3. 准备仓库：                                     │
│     - 本地仓库：直接用原路径                        │
│     - 远端仓库：git clone 到 ~/.minion/runs/        │
│  4. 选择镜像 + docker pull                        │
│  5. 写入 TaskContext 到 ~/.minion/runs/             │
│  6. 显示执行计划，等待用户确认（--yes 跳过）        │
│  7. docker run 启动容器（仓库只读挂载）             │
│  8. Stream 容器日志到终端                          │
│  9. 容器退出后：                                   │
│     - 读取 Patch，git apply 到仓库                 │
│     - 远端仓库：额外 git push                      │
└──────────────────────────────────────────────────┘
                    │
                    │ docker run
                    ▼
┌──────────────────────────────────────────────────┐
│        Sandbox Agent (容器内，全权限)               │
│                                                  │
│  1. 读取 /minion-run/context.json 获取任务        │
│  2. git clone file:///host-repo /workspace         │
│     （不区分本地/远端，统一流程）                    │
│  3. 扫描项目 → 规划 → 执行 → 验证                 │
│  4. git commit                                    │
│  5. git format-patch → /minion-run/patches/        │
│  6. 更新 /minion-run/status.json                  │
│                                                  │
│  工具：bash, 文件读写, 代码搜索, git               │
│  Watchdog：max_iterations + max_token_cost 熔断   │
└──────────────────────────────────────────────────┘
```

双层 Agent 职责：
- **Host Agent（宿主机）**：NL 解析、项目分析、仓库准备（远端 clone）、镜像管理、容器生命周期、Patch 应用（+ push）、状态报告
- **Sandbox Agent（容器内）**：统一 clone + 自主规划 + 编码 + 测试 + commit + format-patch

关键设计：
- Host Agent 权限受限：只读文件系统 + docker 操作 + 写 `~/.minion/` 目录 + git clone/apply/push
- Host Agent 项目分析也用 LLM（只读扫描目录结构和关键文件，能理解 monorepo、混合语言等复杂场景）
- Host Agent NL 解析用同一个 LLM（token 消耗极少，不值得单独配置小模型）
- 远端仓库由 Host Agent 在宿主机 clone 到 `~/.minion/runs/<task-id>/repo/`，利用宿主机已有的 git 认证
- 零凭证入容器：容器内无需任何 git token 或 SSH key
- 本地和远端仓库对 Sandbox Agent 完全透明，统一以 /host-repo:ro 挂载
- Sandbox Agent 统一流程：clone file:///host-repo → 工作 → commit → format-patch
- 结果统一通过 Patch 交付，远端仓库由 Host Agent 在 apply 后额外 push
- 上下文通过文件挂载传递（`~/.minion/runs/<task-id>/`），不用环境变量
- Host 和 Sandbox 之间通过共享状态文件（/minion-run/status.json）实现实时进度同步
- 多任务并行 = 多个容器各自 clone 独立副本，互不干扰

## Host Agent 流程

Host Agent 运行在宿主机，权限严格受限：

```
Step 1: 解析自然语言（LLM）
  - 调用 LLM 从用户描述中提取结构化信息：
    - 任务内容（纯描述部分）
    - issue URL（如果有）
    - 仓库地址（如果有，否则默认当前目录）
    - 其他上下文线索

Step 2: 分析本地项目（LLM，只读扫描）
  - 只读扫描项目目录结构和关键文件
  - LLM 分析判断：语言、框架、包管理器、构建工具、测试框架
  - 能理解 monorepo、混合语言、非标准目录结构等复杂场景
  - 读取 .minion/rules/ 下的规则文件
  - 读取 .minion/config.yaml（如果有）

Step 3: 准备仓库
  - 本地仓库：记录原路径，后续直接挂载
  - 远端仓库：git clone 到 ~/.minion/runs/<task-id>/repo/
    （利用宿主机已有的 git 认证，无需额外配置）

Step 4: 选择 Docker 镜像
  - 根据项目分析结果决定镜像（默认 minion-base）
  - 如果用户通过 --image 强制指定，直接使用
  - docker pull 拉取镜像

Step 5: 组装任务上下文
  - 写入 ~/.minion/runs/<task-id>/context.json（TaskContext）
  - 写入 ~/.minion/runs/<task-id>/.env（LLM 凭证）
  - 包含：任务描述、仓库信息、项目分析结果、规则文件、熔断参数

Step 6: 启动前确认
  - CLI 输出执行计划摘要：
    Target: /path/to/local/project (local)
    Image:  minion-base
    Task:   修复登录页面空邮箱时的崩溃问题
    Press Enter to start or Ctrl+C to abort
  - --yes/-y 跳过确认

Step 7: 启动沙盒容器
  docker run \
    -v <repo-path>:/host-repo:ro \
    -v ~/.minion/runs/<task-id>:/minion-run \
    --network=bridge \
    --memory=4g --cpus=2 \
    -e HTTP_PROXY=$HTTP_PROXY \
    -e HTTPS_PROXY=$HTTPS_PROXY \
    minion-base
  （本地仓库挂载原路径，远端仓库挂载 clone 后的临时目录）

Step 8: 实时监控
  - 默认 stream 容器日志到终端
  - 定期读取 /minion-run/status.json 更新进度
  - Ctrl+C → 转后台运行，提示 minion logs <task-id>

Step 9: 收割结果
  - 容器正常退出：
    - 读取 /minion-run/patches/*.patch
    - git apply 到仓库（本地原路径 或 临时 clone 目录）
    - 远端仓库：额外 git push（利用宿主机 git 认证）
  - 容器异常退出：标记 status: failed，保留日志供排查
```

Host Agent 工具集（受限）：
- `read_file` — 只读项目文件
- `list_dir` — 列出目录结构
- `git_clone` — clone 远端仓库到 ~/.minion/
- `docker_pull` — 拉取镜像
- `docker_run` — 启动容器
- `git_apply` — 应用 patch 到仓库
- `git_push` — 推送远端仓库结果

## Sandbox Agent 流程

Sandbox Agent 运行在容器内，拥有完整工具权限，内置 Watchdog 熔断：

```
Phase 1: 初始化
  - 读取 /minion-run/context.json 获取 TaskContext
  - 读取 /minion-run/.env 获取 LLM 凭证
  - 启动 Watchdog（max_iterations + max_token_cost）

Phase 2: 获取代码（统一流程，不区分本地/远端）
  - git clone file:///host-repo /workspace
  - 创建工作分支 minion/<task-id>
  - 如果 TaskContext 中包含 issue URL，fetch 并解析内容

Phase 3: 理解
  - 读取项目结构、README、package.json、Makefile 等
  - 利用 Host Agent 传入的项目分析结果加速理解
  - 如果缺少运行时或依赖，自行安装（apt-get, pip, npm 等）

Phase 4: 规划
  - Agent 输出执行计划（纯文本）
  - 计划不是死板的，执行中可以随时调整
  - 更新 /minion-run/status.json → { phase: "planning", plan: "..." }

Phase 5: 执行
  - 标准 Agent Loop: LLM 思考 → 选择工具 → 执行 → 观察结果
  - 工具集：bash, read/write/edit, search, git
  - 每次迭代更新 /minion-run/status.json（当前步骤、进度）
  - Watchdog 检查：超过 max_iterations 或 max_token_cost → 强制中止

Phase 6: 验证
  - Agent 自主决定验证方式（test、lint、type check）
  - 验证失败自动修复，超过重试上限标记 needs_human

Phase 7: 交付
  - git add + commit
  - git format-patch origin/HEAD → /minion-run/patches/
  - 更新 /minion-run/status.json → { phase: "done", summary: "..." }
  - 容器退出
```

Watchdog 熔断机制：
- `max_iterations`：Agent Loop 最大迭代次数（默认 50）
- `max_token_cost`：LLM token 消耗上限（可选）
- 触发熔断时：更新 status.json → `{ phase: "failed", reason: "watchdog" }`，容器退出

## Sandbox 容器管理

镜像策略 — Host Agent 智能选择：
1. Host Agent 根据项目特征文件选择镜像（默认 minion-base）
2. `--image` 逃生舱：用户强制指定镜像（覆盖 Host Agent 决策）
3. Sandbox Agent 启动后如果缺少依赖，自行安装

默认提供一个精简基础镜像（minion-base），预装：
- git, curl, wget
- Node.js（用于运行 Agent 进程）
- 常见构建工具（make, gcc 等）
- Sandbox Agent 根据项目需要动态安装其他运行时（Python, Go 等）

容器启动参数（由 Host Agent 组装，本地和远端统一）：
```bash
docker run \
  -v <repo-path>:/host-repo:ro \
  -v ~/.minion/runs/<task-id>:/minion-run \
  --network=bridge \
  --memory=4g --cpus=2 \
  -e HTTP_PROXY=$HTTP_PROXY \
  -e HTTPS_PROXY=$HTTPS_PROXY \
  minion-base
# repo-path: 本地仓库原路径 或 远端 clone 后的 ~/.minion/runs/<task-id>/repo/
```

挂载目录结构（~/.minion/runs/<task-id>/）：
```
/minion-run/
├── context.json          # Host Agent 写入，Sandbox Agent 只读
├── .env                  # LLM 凭证，Host Agent 写入，Sandbox Agent 只读
├── status.json           # Sandbox Agent 写入，Host Agent 读取（实时进度）
└── patches/              # Sandbox Agent 写入，Host Agent 读取（本地仓库结果）
    ├── 0001-fix-xxx.patch
    └── ...
```

安全边界：
- Host Agent：只读文件系统 + docker 操作 + 写 ~/.minion/ + git clone/apply/push
- Sandbox Agent：容器内全权限，但与宿主机隔离
- 仓库只读挂载到 /host-repo，Sandbox Agent 在 /workspace 独立副本上工作
- 零凭证入容器：git 认证全部在宿主机完成，容器内无 token/SSH key
- LLM 凭证通过文件挂载传递（/minion-run/.env），不暴露在 docker inspect / ps 中
- 自动透传宿主机 HTTP_PROXY/HTTPS_PROXY 到容器
- 资源有上限（内存、CPU、Watchdog 熔断）

多任务并行：每个容器各自 clone 独立副本到 /workspace，互不干扰。

## CLI 设计

核心理念：CLI 只接受自然语言，Host Agent 负责理解和准备。

```bash
# 最常用 — 当前目录就是仓库，纯自然语言
minion run "修复登录页面空邮箱时的崩溃问题"

# 任务描述中包含 issue URL、仓库地址等，Host Agent 自行解析
minion run "修复 https://github.com/user/repo/issues/42，仓库 https://github.com/user/repo.git"

# 后台运行
minion run -d "添加用户注册功能"

# 跳过确认
minion run -y "修复登录bug"

# 管理命令
minion list                       # 查看所有任务
minion status <task-id>           # 查看单个任务状态（读取 status.json）
minion logs <task-id>             # 查看 Agent 执行日志
minion stop <task-id>             # 停止运行中的任务
minion clean [task-id]            # 清理容器 + ~/.minion/runs/
```

run 的位置参数就是自然语言任务描述，Host Agent 从中解析出：
- 任务内容
- issue URL（如果有）
- 仓库地址（如果有，否则默认当前目录）
- 分支策略（如果有，否则自动生成 minion/<task-id>）

仅保留少量逃生舱 flag（极少使用）：
```bash
--repo <path|url>                 # 显式指定仓库（覆盖自然语言中的）
--image <name>                    # 强制指定 Docker 镜像（覆盖 Host Agent 决策）
--timeout <minutes>               # 超时时间，默认 30
-d                                # 后台运行（不 stream 日志）
-y, --yes                         # 跳过启动前确认
```

默认交互行为：
1. `minion run` 启动后前台 stream 容器日志
2. 用户按 Ctrl+C → 提示"已转入后台运行，可使用 minion logs <task-id> 查看"
3. `-d` 参数直接后台运行

启动前确认（除非 -y）：
```
Target: /Users/dev/my-project (local)
Image:  minion-base
Task:   修复登录页面空邮箱时的崩溃问题

Press Enter to start or Ctrl+C to abort
```

仓库处理（统一流程：Host clone → 只读挂载 → Sandbox clone → 工作 → patch → Host apply）：
- 未指定仓库：默认当前目录
- 自然语言中包含仓库 URL：Host Agent 提取并 clone 到 ~/.minion/runs/
- `--repo` 显式指定：覆盖自然语言解析结果
- 所有仓库统一只读挂载到容器 /host-repo
- 结果统一通过 Patch 交付，远端仓库由 Host Agent 额外 push
- git 认证全部在宿主机完成，零凭证入容器

任务状态存储：`~/.minion/tasks.json`，纯本地 JSON。

## 项目结构

```
minions/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── version.ts
│   ├── types/                       # 类型定义（按边界拆分）
│   │   ├── shared.ts                # 共用：TaskStatus, TaskContext, Config
│   │   ├── host.ts                  # Host Agent 专用类型
│   │   └── sandbox.ts               # Sandbox Agent 专用类型
│   ├── cli/                         # CLI 入口（宿主机）
│   │   └── index.ts
│   ├── host-agent/                  # Host Agent（宿主机，受限）
│   │   ├── index.ts                 # Host Agent 主流程（NL 解析 + 项目分析，均用 LLM）
│   │   ├── task-parser.ts           # 自然语言 → 结构化任务
│   │   ├── repo-preparer.ts         # 仓库准备（远端 clone + 路径统一）
│   │   └── patch-applier.ts         # 读取 patch，apply 到仓库，远端额外 push
│   ├── task/                        # 任务管理（宿主机）
│   │   └── store.ts                 # ~/.minion/tasks.json 持久化
│   ├── sandbox/                     # 沙箱管理（宿主机）
│   │   ├── types.ts                 # Sandbox 接口（可插拔）
│   │   └── docker.ts                # Docker 实现（pull + run + monitor）
│   ├── agent/                       # Sandbox Agent（容器内运行）
│   │   ├── main.ts                  # 容器入口点
│   │   ├── planner.ts               # 项目扫描 + system prompt 组装
│   │   └── watchdog.ts              # 熔断机制（iterations + token cost）
│   ├── llm/                         # LLM 适配器（双层共用）
│   ├── tools/                       # 工具系统（Sandbox Agent 用）
│   │   └── git.ts                   # git 操作工具
│   ├── context/                     # 上下文加载（复用）
│   │   └── loader.ts
│   └── config/
│       └── index.ts
├── docker/                          # Docker 镜像定义
│   └── Dockerfile.base              # 精简基础镜像（Node + Git + 构建工具）
└── test/
```

代码运行边界：
- 宿主机：cli/ + host-agent/ + task/ + sandbox/ + config/ + llm/
- 容器内：agent/ + llm/ + tools/ + context/
- 共用：types/ + llm/ + config/
