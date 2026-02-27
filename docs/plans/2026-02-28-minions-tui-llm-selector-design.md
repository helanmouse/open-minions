# Minions TUI LLM 选择器设计

## 概述

为 `minion setup` 命令添加图形化 TUI 界面，用于选择 LLM Provider 和 Model，替代当前的 readline 简单提示。

## 目标

- 使用 `@mariozechner/pi-tui` 组件库构建 TUI 界面
- 动态加载 pi-ai 支持的所有 25 个提供商
- 提供流畅的键盘导航体验
- 保存配置到 `~/.minion/.pi/` 目录

## pi-mono 支持的提供商 (25 个)

```typescript
export type KnownProvider =
  "amazon-bedrock" | "anthropic" | "google" | "google-gemini-cli" |
  "google-antigravity" | "google-vertex" | "openai" | "azure-openai-responses" |
  "openai-codex" | "github-copilot" | "xai" | "groq" | "cerebras" |
  "openrouter" | "vercel-ai-gateway" | "zai" | "mistral" | "minimax" |
  "minimax-cn" | "huggingface" | "opencode" | "kimi-coding";
```

### 提供商分类

| 分类 | 提供商 |
|------|--------|
| 主流 | openai, anthropic, google, azure-openai-responses |
| 国产 | zai, minimax, minimax-cn, kimi-coding, opencode |
| 开源 | huggingface, mistral, groq, cerebras |
| 聚合 | openrouter, vercel-ai-gateway |
| 其他 | xai, amazon-bedrock, github-copilot, google-vertex, google-gemini-cli, google-antigravity, openai-codex |

## 用户流程

```
┌────────────────────────────────┐
│  LLM Setup TUI                 │
│  ┌──────────────────────────┐  │
│  │ Select Provider (25)     │  │  ← SelectList (动态生成)
│  │  ▶ openai               │  │
│  │    anthropic            │  │
│  │    google               │  │
│  │    zai (智谱)           │  │
│  │    ...                  │  │
│  └──────────────────────────┘  │
│           ↓                     │
│  ┌──────────────────────────┐  │
│  │ Select Model             │  │  ← SelectList (动态加载)
│  │  ▶ gpt-4o               │  │
│  │    gpt-4o-mini          │  │
│  │    o1                   │  │
│  └──────────────────────────┘  │
│           ↓                     │
│  ┌──────────────────────────┐  │
│  │ API Key Input            │  │  ← TextEditor (隐藏模式)
│  │  ••••••••               │  │
│  └──────────────────────────┘  │
│           ↓                     │
│  ┌──────────────────────────┐  │
│  │ ✓ Configuration saved   │  │
│  │   Provider: openai       │  │
│  │   Model: gpt-4o          │  │
│  └──────────────────────────┘  │
└────────────────────────────────┘
```

## 文件结构

```
src/cli/setup/
├── index.ts              # setup 命令入口 (修改现有)
├── tui-setup.ts          # TUI 主逻辑
├── provider-selector.ts  # Provider 选择组件
├── model-selector.ts     # Model 选择组件
├── apikey-input.ts       # API Key 输入组件
└── types.ts              # 共享类型
```

## 核心组件

### TuiSetup 类

```typescript
import { TUI, ProcessTerminal } from '@mariozechner/pi-tui';
import { getProviders, getModels } from '@mariozechner/pi-ai';

class TuiSetup {
  private tui: TUI;
  private config: MinionsConfig;
  private minionHome: string;

  async start(): Promise<void> {
    // 1. Provider 选择
    const provider = await this.selectProvider();
    // 2. Model 选择
    const model = await this.selectModel(provider);
    // 3. API Key 输入
    const apiKey = await this.inputApiKey(provider);
    // 4. 保存配置
    this.saveConfig(provider, model, apiKey);
  }

  private async selectProvider(): Promise<string> { /* ... */ }
  private async selectModel(provider: string): Promise<string> { /* ... */ }
  private async inputApiKey(provider: string): Promise<string> { /* ... */ }
  private saveConfig(provider: string, model: string, apiKey: string): void { /* ... */ }
}
```

### ProviderSelector

```typescript
import { SelectList, type SelectItem } from '@mariozechner/pi-tui';
import { getProviders } from '@mariozechner/pi-ai';

const items: SelectItem[] = getProviders().map(p => ({
  value: p,
  label: formatProviderLabel(p), // 添加显示名称
  description: getProviderDescription(p)
}));

const list = new SelectList(items, 10);
list.onSelect = (item) => resolve(item.value);
```

### ModelSelector

```typescript
import { SelectList } from '@mariozechner/pi-tui';
import { getModels } from '@mariozechner/pi-ai';

const models = getModels(provider);
const items: SelectItem[] = models.map(m => ({
  value: m.id,
  label: m.id,
  description: m.name
}));

const list = new SelectList(items, 10);
```

### ApiKeyInput

```typescript
import { TextEditor, type TextEditorConfig } from '@mariozechner/pi-tui';

const config: TextEditorConfig = {
  mask: '*', // 隐藏输入
  placeholder: 'Enter API key...'
};
const editor = new TextEditor(config);
```

## 键盘操作

| 按键 | 功能 |
|------|------|
| `↑/↓` | 上下选择 |
| `PageUp/PageDown` | 快速翻页 |
| `Enter` | 确认选择 |
| `Esc` | 取消/返回上一步 |
| 直接输入 | 过滤选项 |

## 配置文件格式

### ~/.minion/.pi/models.json

```json
{
  "providers": {
    "openai": {
      "apiKey": "$OPENAI_API_KEY",
      "api": "openai-completions",
      "models": [
        {
          "id": "gpt-4o",
          "name": "GPT-4o",
          "reasoning": false,
          "input": ["text"]
        }
      ]
    }
  }
}
```

### ~/.minion/.pi/config.json

```json
{
  "defaultProvider": "openai",
  "defaultModel": "gpt-4o",
  "apiKeys": {
    "openai": "sk-..."
  }
}
```

## 数据流

```
用户输入 → TUI → 组件回调
                  │
                  ▼
            收集配置数据
            { provider, model, apiKey }
                  │
                  ▼
        验证 API Key (可选，非阻塞)
                  │
                  ▼
        mkdir ~/.minion/.pi
                  │
                  ▼
    write models.json (provider + model)
                  │
                  ▼
    write config.json (API key)
                  │
                  ▼
              完成
```

## 错误处理

| 场景 | 处理 |
|------|------|
| 用户按 Esc | 返回上一步 / 退出 (保存默认值) |
| API Key 为空 | 显示错误，重新输入 |
| 文件写入失败 | 显示错误信息，退出 |
| 无可用模型 | 显示提示 "No models available"，退出 |
| 无 API Key 环境变量 | 正常继续，要求用户输入 |

## 测试计划

### 单元测试

- `ProviderSelector` - 正确加载 25 个提供商
- `ModelSelector` - 正确加载指定 provider 的模型
- `ApiKeyInput` - 隐藏输入正确工作

### 集成测试

- 完整流程：Provider → Model → API Key → 保存
- 配置文件正确生成
- 读取配置正确工作

### 手动测试

- 实际终端体验
- 键盘导航流畅性
- 错误场景处理

## 依赖

```json
{
  "@mariozechner/pi-ai": "^0.55.1",
  "@mariozechner/pi-tui": "^0.5.48"
}
```

## 未包含功能 (与 pi-mono 相比)

- 自定义模型定义 (models.json 编辑)
- Scope 切换 (all/scoped models)
- OAuth 流程
- 主题切换
- 高级设置 (transport, thinking level 等)

这些可以后续添加，初始版本专注于核心的 LLM 配置流程。
