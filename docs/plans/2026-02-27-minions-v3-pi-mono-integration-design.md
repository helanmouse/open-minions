# Minions V3 设计：pi-mono 全量迁移

## 概述

将 minions 的 Agent 运行时完全迁移到 pi-mono 框架，保留 minions 的差异化特性（Docker 沙箱、git format-patch 交付、双层架构）。

## 设计原则

- **全量迁移：** LLM、Agent 循环、工具系统全部使用 pi-mono
- **保留差异化：** Docker 沙箱、patch 交付、双层架构保留
- **支持用户镜像：** bootstrap 机制兼容任意 Docker 镜像
- **自然语言配置：** 除 API Key 外，所有配置支持自然语言设置
- **渐进式迁移：** 分阶段验证，风险可控

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│  Host Agent (minions 自研 - 保留)                                │
│  ├── CLI (commander.js)                                         │
│  ├── SetupWizard (从 pi-mono/openclaw)                           │
│  ├── ConfigManager (自然语言配置)                                 │
│  ├── TaskParser (使用 pi-ai)                                     │
│  ├── ProjectAnalyzer (使用 pi-ai)                                │
│  ├── DockerSandbox (dockerode)                                   │
│  ├── TaskStore (~/.minion/tasks.json)                            │
│  └── PatchApplier (git am + git push)                            │
└─────────────────────────────────────────────────────────────────┘
                           │
                           │ docker run + bootstrap.sh
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Sandbox 容器 (任意用户镜像)                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  bootstrap.sh (容器内引导)                                   │ │
│  │  ├── 检测 Node.js → 没有则安装                               │ │
│  │  ├── 检测 pi-agent-core → 没有则 npm 安装                    │ │
│  │  └── 启动 pi-agent-core                                     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  pi-mono 组件                                               │ │
│  │  ├── pi-ai (LLM 统一接口)                                   │ │
│  │  │   └── 支持: OpenAI, Anthropic, Zhipu, DeepSeek, etc.    │ │
│  │  ├── pi-agent-core (Agent 运行时)                           │ │
│  │  │   └── Agent Loop, 扩展加载, 技能系统, 错误处理           │ │
│  │  └── pi-extensions (工具扩展)                               │ │
│  │      ├── bash, file_ops, search, git (内置)                │ │
│  │      └── minions-patch (自定义扩展)                        │ │
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

## 组件设计

### 1. ConfigManager (新增)

```typescript
// src/host-agent/config-manager.ts

export interface MinionsConfig {
  llm: {
    provider: string;
    model: string;
    apiKey: string;
    baseUrl?: string;
  };
  sandbox: {
    memory: string;
    cpus: number;
    network: string;
    image?: string;
  };
  agent: {
    maxIterations: number;
    timeout: number;
  };
  pi: {
    runtimeVersion?: string;
    runtimeDir?: string;
  };
}

export class ConfigManager {
  // 从自然语言解析配置
  async parseFromNL(input: string): Promise<Partial<MinionsConfig>>

  // 合并配置文件 + 环境变量 + 命令行参数
  load(): MinionsConfig

  // 保存配置到 ~/.minion/config.yaml
  save(config: MinionsConfig): void

  // 交互式设置向导
  async runWizard(): Promise<void>
}
```

### 2. SetupWizard (新增)

```typescript
// src/host-agent/setup-wizard.ts

export class SetupWizard {
  async run(): Promise<void> {
    // 1. 检测是否首次运行
    // 2. 显示欢迎信息
    // 3. LLM 提供商选择 (参考 pi-mono/openclaw)
    // 4. API Key 输入
    // 5. 模型选择
    // 6. 连接验证
    // 7. 保存配置
  }
}
```

### 3. bootstrap.sh

```bash
#!/usr/bin/env bash
set -e

PI_RUNTIME="${PI_RUNTIME:-/opt/pi-runtime}"
PI_VERSION="${PI_RUNTIME_VERSION:-latest}"
MINIONS_RUN="/minion-run"

# 检测 Node.js
ensure_node() {
  if command -v node &> /dev/null; then
    echo "Node.js: $(node -v)"
    return 0
  fi

  echo "Node.js 未安装，尝试安装..."
  if command -v apt-get &> /dev/null; then
    apt-get update -qq && apt-get install -y -qq nodejs npm
  elif command -v apk &> /dev/null; then
    apk add -q nodejs npm
  elif command -v yum &> /dev/null; then
    yum install -y -q nodejs npm
  else
    echo "错误: 无法安装 Node.js"
    exit 1
  fi
}

# 检测/安装 pi-runtime
ensure_pi_runtime() {
  if [ -f "$PI_RUNTIME/node_modules/@pi-monospace/agent-core/package.json" ]; then
    echo "pi-agent-core 已安装"
    return 0
  fi

  echo "安装 pi-agent-core@$PI_VERSION..."
  mkdir -p "$PI_RUNTIME"
  cd "$PI_RUNTIME"

  npm init -y
  npm install --silent @pi-monospace/agent-core @pi-monospace/ai
}

# 启动 agent
start_agent() {
  if [ -f "$MINIONS_RUN/.env" ]; then
    export $(cat "$MINIONS_RUN/.env" | grep -v '^#' | xargs)
  fi

  echo "启动 pi-agent-core..."
  exec node "$PI_RUNTIME/node_modules/@pi-monospace/agent-core/dist/index.js" \
    --config "$MINIONS_RUN/context.json"
}

main() {
  echo "=== Minions Bootstrap ==="
  ensure_node
  ensure_pi_runtime
  start_agent
}

main "$@"
```

### 4. minions-patch 扩展

```typescript
// extensions/minions-patch/src/index.ts

import { PiExtension } from '@pi-monospace/agent-core';

export default class PatchDeliveryExtension extends PiExtension {
  name = 'minions-patch';

  register() {
    this.tools.register({
      name: 'deliver_patch',
      description: '交付代码 patch 到 /minion-run/patches/',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: '任务摘要' },
        },
      },
    }, async (params) => {
      // 1. git add/commit
      // 2. git format-patch → /minion-run/patches/
      // 3. 写入 /minion-run/status.json
      return { success: true, output: 'Patch 已生成' };
    });
  }
}
```

### 5. DockerSandbox 更新

```typescript
// src/sandbox/docker.ts 变化

const opts = {
  Image: config.image,  // 可能是 user/custom-image
  HostConfig: {
    Binds: [
      `${config.repoPath}:/host-repo:ro`,
      `${config.runDir}:/minion-run`,
      `${join(this.minionHome, 'bootstrap.sh')}:/minion-bootstrap.sh:ro`,
    ],
  },
  Entrypoint: ['/minion-bootstrap.sh'],  // 覆盖默认 entrypoint
  Env: [
    `PI_RUNTIME_VERSION=${process.env.PI_RUNTIME_VERSION || 'latest'}`,
    `PI_RUNTIME=${process.env.PI_RUNTIME || '/opt/pi-runtime'}`,
  ],
};
```

## 删除的 minions 代码

| 删除 | 原因 |
|------|------|
| `src/llm/*.ts` (全部) | pi-ai 已支持所有 LLM |
| `src/worker/agent-loop.ts` | pi-agent-core 已实现 |
| `src/tools/*.ts` (全部) | pi-extensions 已实现 |
| `src/tools/registry.ts` | pi 的扩展系统 |

## 保留的 minions 代码

| 保留 | 原因 |
|------|------|
| `src/cli/` | minions 特有的 CLI 体验 |
| `src/host-agent/` | Docker + patch 交付逻辑 |
| `src/sandbox/docker.ts` | Docker 沙箱管理 |
| `src/task/store.ts` | 任务状态存储 |
| `src/config/` | minions 配置管理 |

## 迁移阶段

### 阶段 1：pi-ai 集成 (1-2 周)

**任务：**
1. 添加 pi-ai 依赖
2. 创建临时兼容层 `src/llm/pi-ai-adapter.ts`
3. 修改 `src/host-agent/task-parser.ts` 使用 pi-ai
4. 修改 `src/host-agent/project-analyzer.ts` 使用 pi-ai
5. 更新 `src/llm/factory.ts` 支持 pi-ai

**验收：** `minion run "列出当前目录文件"` 正常工作

### 阶段 2：pi-agent-core 集成 (2-3 周)

**任务：**
1. 创建 `docker/bootstrap.sh`
2. 创建 `extensions/minions-patch/`
3. 修改 `src/sandbox/docker.ts` 挂载 bootstrap.sh
4. 实现 patch 交付扩展

**验收：** `minion run "修复简单 bug"` 完整跑通

### 阶段 3：配置系统增强 (1 周)

**任务：**
1. 实现 `ConfigManager`
2. 实现 `SetupWizard`
3. 更新 CLI 支持 `minion setup`
4. 添加 `~/.minion/config.yaml`

**验收：** 首次运行自动进入设置向导

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| pi-mono API 变化 | 版本锁定，定期同步 |
| 用户镜像兼容性 | bootstrap 自动安装依赖 |
| 网络离线环境 | 支持本地 node_modules 缓存 |
