# Setup Page Redesign & Configuration Mapping Fix

## Overview

This document outlines the redesign of the minion setup page to support a two-level selection process (provider → source) and fixes the configuration mapping issues between the setup process and pi-mono runtime.

## Problem Statement

### Current Issues

1. **Single-level provider selection**: The current TUI setup only allows selecting a provider, with no way to choose between different API endpoints (e.g., China vs International) or specify custom URLs.

2. **Configuration mapping bugs**:
   - `MinionsConfig.getModel()` reads the first provider from `models.json` instead of using the selection from `config.json`
   - Provider name inconsistency (e.g., `zai` vs `zhipu`) causes API key lookup failures
   - No support for per-source configuration

3. **User experience gap**: Users cannot easily override API endpoints for third-party services or regional variants.

## Design

### Architecture Overview

```
Provider Selection → Source Selection → Model Selection → API Key Input
                      ↓
                 ┌─────────────┐
                 │ Official    │
                 │ China       │
                 │ Official    │
                 │ International│
                 │ Custom URL  │
                 └─────────────┘
```

**Core Components**:
- Two-level TUI selection flow
- Source configuration registry
- Fixed configuration reading logic
- Backward compatibility with old config formats

**Modified Files**:
- `src/cli/setup/tui-setup.ts` - Extend to two-level selection
- `src/cli/setup/sources.ts` - **NEW**: Source definitions and configuration
- `src/cli/setup/types.ts` - Extend types for source support
- `src/host-agent/config.ts` - Fix configuration reading logic
- `src/llm/provider-aliases.ts` - Potential adjustments

### UI Flow Design

**Step 1: Provider Selection** (existing, unchanged)

```
┌─────────────────────────────────┐
│  Select LLM Provider            │
├─────────────────────────────────┤
│  ○ OpenAI                       │
│  ○ Anthropic                    │
│  ○ Google                       │
│  ○ Zhipu AI                     │
│  ○ DeepSeek                     │
│  ...                            │
└─────────────────────────────────┘
```

**Step 2: Source Selection** (new)

```
┌─────────────────────────────────┐
│  Zhipu AI - Select Source       │
├─────────────────────────────────┤
│  ○ Official China Source        │
│    https://open.bigmodel.cn/... │
│  ○ Official International       │
│    https://api.zhipu.ai/...     │
│  ○ Custom API Endpoint          │
│    (Enter your own URL)         │
└─────────────────────────────────┘
```

**Step 2a: Custom URL Input** (when "Custom API Endpoint" is selected)

```
┌─────────────────────────────────┐
│  Enter Custom API URL           │
├─────────────────────────────────┤
│  https://                        │
│  [_________________________]     │
│                                  │
│  Enter: Confirm  Esc: Cancel     │
└─────────────────────────────────┘
```

**Step 3: Model Selection** (existing, unchanged)

**Step 4: API Key Input** (existing, unchanged)

### Configuration Storage Structure

#### New File: `src/cli/setup/sources.ts`

```typescript
export interface Source {
  id: string;           // 'official-cn', 'official-intl', 'custom'
  name: string;         // Display name
  url: string;          // Base URL (empty for custom sources)
  isCustom: boolean;    // True if this is a custom source
}

export interface ProviderSources {
  provider: string;      // pi-ai provider ID (e.g., 'zai')
  displayName: string;   // Human-readable name (e.g., 'Zhipu AI')
  sources: Source[];     // Available sources for this provider
}

export const PROVIDER_SOURCES: Record<string, ProviderSources> = {
  zai: {
    provider: 'zai',
    displayName: 'Zhipu AI',
    sources: [
      {
        id: 'official-cn',
        name: '官方中国源',
        url: 'https://open.bigmodel.cn/api/paas/v4',
        isCustom: false
      },
      {
        id: 'official-intl',
        name: '官方国际源',
        url: 'https://api.zhipu.ai/v1',
        isCustom: false
      },
      {
        id: 'custom',
        name: '自定义 API 地址',
        url: '',
        isCustom: true
      },
    ],
  },
  openai: {
    provider: 'openai',
    displayName: 'OpenAI',
    sources: [
      {
        id: 'official',
        name: '官方源',
        url: '',
        isCustom: false
      },
      {
        id: 'custom',
        name: '自定义 API 地址',
        url: '',
        isCustom: true
      },
    ],
  },
  // ... other providers
};
```

#### `models.json` Structure

```json
{
  "providers": {
    "zai": {
      "sources": {
        "official-cn": {
          "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
          "apiKey": "$ZHIPU_API_KEY"
        }
      },
      "currentSource": "official-cn",
      "api": "openai-completions",
      "models": [
        {
          "id": "glm-5",
          "name": "glm-5",
          "reasoning": false,
          "input": ["text"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 128000,
          "maxTokens": 4096
        }
      ]
    }
  }
}
```

#### `config.json` Structure

```json
{
  "provider": "zai",
  "source": "official-cn",
  "model": "glm-5"
}
```

### Configuration Reading Logic Fix

#### Problem in Current Code

`src/host-agent/config.ts` (lines 42-54):

```typescript
// ❌ Always reads first provider, ignoring config.json
const providers = Object.keys(content.providers || {});
if (providers.length > 0) {
  provider = providers[0];  // BUG: ignores config.json
  // ...
}
```

#### Fixed Implementation

```typescript
async getModel(): Promise<Model<Api>> {
  const modelsJson = join(this.agentDir, '.pi', 'models.json');
  const configJson = join(this.agentDir, '.pi', 'config.json');

  let provider = process.env.LLM_PROVIDER || 'openai';
  let sourceId: string | undefined;
  let model = process.env.LLM_MODEL || 'gpt-4o';
  let userBaseUrl = '';

  try {
    // 1. Read config.json first for current selection
    const config = JSON.parse(readFileSync(configJson, 'utf-8'));
    if (config.provider) provider = config.provider;
    if (config.source) sourceId = config.source;
    if (config.model) model = config.model;

    // 2. Read models.json for provider configuration
    const models = JSON.parse(readFileSync(modelsJson, 'utf-8'));
    const providerConfig = models.providers[provider];

    if (providerConfig) {
      // 3. Get baseUrl from selected source
      const baseUrl = sourceId && providerConfig.sources?.[sourceId]?.baseUrl;
      userBaseUrl = baseUrl || providerConfig.baseUrl || '';
    }
  } catch {
    // Fall back to env vars
  }

  // 4. Resolve provider and get model
  const resolved = resolveProvider(provider, model, userBaseUrl);
  const modelObj = getModel(resolved.piProvider as any, resolved.modelId as any);
  if (resolved.baseUrl) {
    (modelObj as any).baseUrl = resolved.baseUrl;
  }
  return modelObj;
}
```

#### Similarly fix `getRawProviderConfig()`

```typescript
getRawProviderConfig(): { provider: string; model: string; source?: string } {
  const configJson = join(this.agentDir, '.pi', 'config.json');
  let provider = process.env.LLM_PROVIDER || 'openai';
  let model = process.env.LLM_MODEL || 'gpt-4o';
  let source: string | undefined;

  try {
    const config = JSON.parse(readFileSync(configJson, 'utf-8'));
    if (config.provider) provider = config.provider;
    if (config.model) model = config.model;
    if (config.source) source = config.source;
  } catch {
    // Fall back to env vars
  }

  return { provider, model, source };
}
```

### Error Handling & Edge Cases

#### Custom URL Validation

```typescript
private validateCustomUrl(url: string): { valid: boolean; error?: string } {
  if (!url.trim()) {
    return { valid: false, error: 'URL cannot be empty' };
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, error: 'URL must start with https:// or http://' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
```

#### Backward Compatibility

Handle old `models.json` format (without `sources` field):

```typescript
if (providerConfig) {
  // New format: has sources field
  if (providerConfig.sources) {
    const baseUrl = sourceId && providerConfig.sources[sourceId]?.baseUrl;
    userBaseUrl = baseUrl || '';
  }
  // Old format: has direct baseUrl
  else if (providerConfig.baseUrl) {
    userBaseUrl = providerConfig.baseUrl;
  }
}
```

#### User Cancellation

```typescript
// Source selection - Esc key returns to provider selection
selectList.onCancel = () => {
  ui.stop();
  // Allow going back to provider selection
};

// Custom URL input - Esc key returns to source selection
inputText.onCancel = () => {
  // Return to source selection list
  this.selectSource(provider);
};
```

#### Corrupted Config Files

```typescript
try {
  const content = await readFile(modelsJsonPath, 'utf-8');
  existingModels = JSON.parse(content);
} catch {
  // File corrupted, create new
  existingModels = { providers: {} };
}
```

### Testing Strategy

#### Unit Tests

```typescript
// src/cli/setup/sources.test.ts
describe('ProviderSources', () => {
  it('should return correct sources for zai provider', () => {
    const sources = PROVIDER_SOURCES.zai.sources;
    expect(sources).toHaveLength(3);
    expect(sources[0].id).toBe('official-cn');
    expect(sources[2].isCustom).toBe(true);
  });
});

// src/host-agent/config.test.ts
describe('MinionsConfig', () => {
  it('should read provider from config.json not models.json first', async () => {
    // Mock filesystem
    const config = new MinionsConfig('/test', '/test/.minion');
    const model = await config.getModel();
    expect(model.provider).toBe('zai'); // from config.json
  });
});
```

#### Integration Tests

```bash
# Scenario 1: Select official China source
minion setup
# Select: Zhipu AI → Official China Source → glm-5 → Enter API key
# Verify: config.json has provider=zai, source=official-cn
# Verify: models.json has correct baseUrl

# Scenario 2: Select custom URL
minion setup
# Select: OpenAI → Custom API → Enter https://api.openai.com/v1 → gpt-4o
# Verify: Custom URL is saved and used correctly

# Scenario 3: Switch between configured providers
# Configure Zhipu AI first, then OpenAI
# Verify: Both providers' configs exist in models.json
# Verify: config.json points to currently selected provider
```

#### Regression Tests

```bash
# Test using environment variables (bypassing setup)
LLM_PROVIDER=zhipu LLM_MODEL=glm-5 ZHIPU_API_KEY=xxx minion run "test"

# Test with old format config files
# Verify correct reading and execution
```

## Implementation Plan

This design document will be followed by a detailed implementation plan created using the `writing-plans` skill.

## Summary

**Key Improvements**:

1. **Two-level selection UI**: Provider → Source (including custom URL option)
2. **Centralized source configuration**: `sources.ts` defines all available sources
3. **Fixed configuration reading**: Prioritize `config.json` selection over `models.json` first entry
4. **Backward compatibility**: Support old format configuration files
5. **Consistent TUI experience**: Use `InputText` component for unified styling

**Files to Modify**:
- New: `src/cli/setup/sources.ts`
- New: `src/cli/setup/source-selector.ts` (optional, encapsulates source selection logic)
- Modify: `src/cli/setup/tui-setup.ts`
- Modify: `src/cli/setup/types.ts`
- Modify: `src/host-agent/config.ts`
- Add: Test files
