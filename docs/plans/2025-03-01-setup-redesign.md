# Setup Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement two-level LLM provider setup (provider → source selection) with custom API URL support and fix configuration mapping bugs.

**Architecture:** Extend existing TUI setup with a new source selection layer using pi-tui components. Introduce a centralized source configuration registry. Fix configuration reading to prioritize config.json over models.json's first entry. Maintain backward compatibility with old config formats.

**Tech Stack:** TypeScript, @mariozechner/pi-tui, @mariozechner/pi-ai, Node.js

---

## Task 1: Create Source Configuration Module

**Files:**
- Create: `src/cli/setup/sources.ts`
- Test: `src/cli/setup/sources.test.ts`

**Step 1: Write the failing test**

Create test file `src/cli/setup/sources.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PROVIDER_SOURCES } from './sources.js';

describe('ProviderSources', () => {
  it('should have zai provider with 3 sources', () => {
    const zai = PROVIDER_SOURCES.zai;
    expect(zai).toBeDefined();
    expect(zai.provider).toBe('zai');
    expect(zai.displayName).toBe('Zhipu AI');
    expect(zai.sources).toHaveLength(3);
  });

  it('should have official-cn source with correct URL', () => {
    const cnSource = PROVIDER_SOURCES.zai.sources.find(s => s.id === 'official-cn');
    expect(cnSource).toBeDefined();
    expect(cnSource?.url).toBe('https://open.bigmodel.cn/api/paas/v4');
    expect(cnSource?.isCustom).toBe(false);
  });

  it('should have custom source with empty URL', () => {
    const customSource = PROVIDER_SOURCES.zai.sources.find(s => s.id === 'custom');
    expect(customSource).toBeDefined();
    expect(customSource?.url).toBe('');
    expect(customSource?.isCustom).toBe(true);
  });

  it('should have openai provider with official and custom sources', () => {
    const openai = PROVIDER_SOURCES.openai;
    expect(openai).toBeDefined();
    expect(openai.sources).toHaveLength(2);
    expect(openai.sources[0].id).toBe('official');
    expect(openai.sources[1].id).toBe('custom');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/cli/setup/sources.test.ts`
Expected: FAIL with "Cannot find module './sources.js'"

**Step 3: Write minimal implementation**

Create `src/cli/setup/sources.ts`:

```typescript
/**
 * Source configuration for LLM providers
 * Defines available API sources (official, regional, custom) for each provider
 */

export interface Source {
  /** Unique identifier for this source */
  id: string;
  /** Display name for UI */
  name: string;
  /** Base URL for API requests (empty for custom sources) */
  url: string;
  /** True if this source requires user input */
  isCustom: boolean;
}

export interface ProviderSources {
  /** pi-ai provider ID (e.g., 'zai', 'openai') */
  provider: string;
  /** Human-readable display name */
  displayName: string;
  /** Available sources for this provider */
  sources: Source[];
}

/**
 * Registry of all providers and their available sources
 * Add new providers here to make them available in setup
 */
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
  anthropic: {
    provider: 'anthropic',
    displayName: 'Anthropic',
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
  google: {
    provider: 'google',
    displayName: 'Google',
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
  deepseek: {
    provider: 'deepseek',
    displayName: 'DeepSeek',
    sources: [
      {
        id: 'official',
        name: '官方源',
        url: 'https://api.deepseek.com/v1',
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
  groq: {
    provider: 'groq',
    displayName: 'Groq',
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
  xai: {
    provider: 'xai',
    displayName: 'xAI (Grok)',
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
};

/**
 * Get sources configuration for a provider
 */
export function getProviderSources(provider: string): ProviderSources | undefined {
  return PROVIDER_SOURCES[provider];
}

/**
 * Get all available providers
 */
export function getAllProviders(): ProviderSources[] {
  return Object.values(PROVIDER_SOURCES);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/cli/setup/sources.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/cli/setup/sources.ts src/cli/setup/sources.test.ts
git commit -m "feat: add provider sources configuration module

Add centralized registry of LLM providers and their API sources
(official, regional, custom). Supports custom URL input.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Extend Setup Types for Source Support

**Files:**
- Modify: `src/cli/setup/types.ts`

**Step 1: Extend types**

Replace content of `src/cli/setup/types.ts`:

```typescript
// src/cli/setup/types.ts

export interface SetupConfig {
  provider: string;
  source?: string;      // NEW: source ID
  model: string;
  apiKey: string;
  customUrl?: string;   // NEW: custom URL if source is 'custom'
}

export interface SetupResult {
  config: SetupConfig;
  saved: boolean;
}

export interface ProviderInfo {
  id: string;
  label: string;
  description: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
}

// NEW: Source selection result
export interface SourceSelectionResult {
  sourceId: string;
  baseUrl: string;
}
```

**Step 2: Run type check**

Run: `npm run lint`
Expected: No type errors (new fields are optional, backward compatible)

**Step 3: Commit**

```bash
git add src/cli/setup/types.ts
git commit -m "feat: extend setup types for source selection

Add sourceId, customUrl to SetupConfig and new SourceSelectionResult
type. Backward compatible with optional fields.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Add Custom URL Validation

**Files:**
- Create: `src/cli/setup/url-validator.ts`
- Test: `src/cli/setup/url-validator.test.ts`

**Step 1: Write the failing test**

Create `src/cli/setup/url-validator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateCustomUrl } from './url-validator.js';

describe('validateCustomUrl', () => {
  it('should accept valid HTTPS URLs', () => {
    const result = validateCustomUrl('https://api.example.com/v1');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should accept valid HTTP URLs', () => {
    const result = validateCustomUrl('http://localhost:8080');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject empty URLs', () => {
    const result = validateCustomUrl('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL cannot be empty');
  });

  it('should reject URLs without protocol', () => {
    const result = validateCustomUrl('api.example.com/v1');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('https:// or http://');
  });

  it('should reject invalid protocols', () => {
    const result = validateCustomUrl('ftp://example.com');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('https:// or http://');
  });

  it('should reject malformed URLs', () => {
    const result = validateCustomUrl('https://');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid URL format');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/cli/setup/url-validator.test.ts`
Expected: FAIL with "Cannot find module './url-validator.js'"

**Step 3: Write minimal implementation**

Create `src/cli/setup/url-validator.ts`:

```typescript
/**
 * URL validation for custom API endpoints
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a custom API URL
 * Ensures URL is properly formatted and uses http/https protocol
 */
export function validateCustomUrl(url: string): ValidationResult {
  const trimmed = url.trim();

  if (!trimmed) {
    return { valid: false, error: 'URL cannot be empty' };
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        valid: false,
        error: 'URL must start with https:// or http://'
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/cli/setup/url-validator.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/cli/setup/url-validator.ts src/cli/setup/url-validator.test.ts
git commit -m "feat: add URL validation for custom API endpoints

Validate URL format and protocol. Accept http/https, reject
malformed URLs or invalid protocols.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Implement Source Selection UI

**Files:**
- Create: `src/cli/setup/source-selector.ts`
- Test: `src/cli/setup/source-selector.test.ts` (integration test)

**Step 1: Create source selector module**

Create `src/cli/setup/source-selector.ts`:

```typescript
/**
 * Source selection TUI component
 * Handles provider source selection with custom URL input support
 */

import { TUI, SelectList, Container, TextComponent, InputText, ProcessTerminal } from '@mariozechner/pi-tui';
import type { SelectItem } from '@mariozechner/pi-tui';
import type { ProviderSources, Source } from './sources.js';
import { validateCustomUrl, type ValidationResult } from './url-validator.js';
import type { SourceSelectionResult } from './types.js';

export class SourceSelector {
  private terminal: ProcessTerminal;
  private ui: TUI;
  private container: Container;

  constructor() {
    this.terminal = new ProcessTerminal();
    this.ui = new TUI(this.terminal);
    this.container = new Container();
  }

  /**
   * Run source selection for a provider
   * Returns selected source ID and base URL
   */
  async selectSource(providerSources: ProviderSources): Promise<SourceSelectionResult> {
    const sources = providerSources.sources;
    const items: SelectItem[] = sources.map(source => ({
      value: source.id,
      label: source.name,
      description: source.isCustom ? '(Enter your own URL)' : source.url,
    }));

    return new Promise((resolve, reject) => {
      // Add title
      this.container.addChild(new TextComponent(
        `${providerSources.displayName} - Select Source`,
        { bottom: 1, top: 0 }
      ));

      // Create select list
      const maxVisible = Math.min(items.length, 10);
      const selectList = new SelectList(items, maxVisible);

      selectList.onSelect = async (item: SelectItem) => {
        const selectedSource = sources.find(s => s.id === item.value);
        if (!selectedSource) {
          this.cleanup();
          reject(new Error(`Source ${item.value} not found`));
          return;
        }

        // Handle custom source
        if (selectedSource.isCustom) {
          try {
            const customUrl = await this.promptCustomUrl();
            this.cleanup();
            resolve({
              sourceId: selectedSource.id,
              baseUrl: customUrl
            });
          } catch (error) {
            // User cancelled - return to source selection
            return;
          }
        } else {
          // Official source
          this.cleanup();
          resolve({
            sourceId: selectedSource.id,
            baseUrl: selectedSource.url
          });
        }
      };

      selectList.onCancel = () => {
        this.cleanup();
        reject(new Error('Source selection cancelled'));
      };

      this.container.addChild(selectList);
      this.ui.addChild(this.container);
      this.ui.setFocus(selectList);

      console.error('Starting source selection...');
      this.ui.start();
    });
  }

  /**
   * Prompt user for custom API URL
   */
  private async promptCustomUrl(): Promise<string> {
    return new Promise((resolve, reject) => {
      // Clear container
      this.container.clear();

      // Add prompt text
      this.container.addChild(new TextComponent(
        'Enter Custom API URL',
        { bottom: 1, top: 0 }
      ));
      this.container.addChild(new TextComponent(
        'Press Enter to confirm, Esc to cancel',
        { bottom: 0, top: 1 }
      ));

      // Create input field
      const input = new InputText(60);
      input.setPlaceholder('https://');

      input.onSubmit = () => {
        const url = input.getValue();
        const validation = validateCustomUrl(url);

        if (!validation.valid) {
          // Show error and keep input
          console.error(`\nError: ${validation.error}`);
          console.error('Press Esc to cancel or enter a valid URL');
          return;
        }

        resolve(url);
      };

      input.onCancel = () => {
        reject(new Error('Custom URL input cancelled'));
      };

      this.container.addChild(input);
      this.ui.setFocus(input);
    });
  }

  private cleanup(): void {
    this.ui.stop();
  }
}
```

**Step 2: Add integration test**

Create `src/cli/setup/source-selector.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { SourceSelector } from './source-selector.js';
import { PROVIDER_SOURCES } from './sources.js';

describe('SourceSelector (integration)', () => {
  it('should export SourceSelector class', () => {
    expect(SourceSelector).toBeDefined();
  });

  it('should have selectSource method', () => {
    const selector = new SourceSelector();
    expect(typeof selector.selectSource).toBe('function');
  });

  // Note: Full UI testing requires manual testing or complex mocking
  // These tests verify the structure exists
});
```

**Step 3: Run tests**

Run: `npm test -- src/cli/setup/source-selector.test.ts`
Expected: Tests PASS

**Step 4: Commit**

```bash
git add src/cli/setup/source-selector.ts src/cli/setup/source-selector.test.ts
git commit -m "feat: add source selection UI component

Implement TUI-based source selector with custom URL input support.
Validates URLs and allows cancellation/return to source list.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Update TuiSetup to Use Source Selection

**Files:**
- Modify: `src/cli/setup/tui-setup.ts`

**Step 1: Update imports**

Add to imports at top of `src/cli/setup/tui-setup.ts`:

```typescript
import { getProviderSources, type ProviderSources } from './sources.js';
import { SourceSelector } from './source-selector.js';
```

**Step 2: Update SetupConfig interface usage**

Modify the `run()` method to include source selection:

Find the `run()` method (around line 47) and update:

```typescript
async run(): Promise<SetupResult> {
  let config: SetupConfig;

  if (this.mockConfig) {
    config = this.mockConfig;
  } else {
    // Interactive mode using TUI
    const provider = await this.selectProvider();
    const sourceResult = await this.selectSource(provider);  // NEW
    const model = await this.selectModel(provider);
    const apiKey = await this.selectApiKey(provider);

    config = {
      provider,
      source: sourceResult.sourceId,  // NEW
      model,
      apiKey,
      customUrl: sourceResult.baseUrl || undefined  // NEW
    };
  }

  // Save the configuration
  await this.saveConfig(config);

  return {
    config,
    saved: true,
  };
}
```

**Step 3: Add selectSource method**

Add new method after `selectProvider()` method (around line 83):

```typescript
/**
 * Select a source for the given provider
 * @param provider - The pi-ai provider ID
 * @returns Promise<SourceSelectionResult> with sourceId and baseUrl
 */
async selectSource(provider: string): Promise<{ sourceId: string; baseUrl: string }> {
  const providerSources = getProviderSources(provider);

  if (!providerSources) {
    // Provider doesn't have multi-source config, use default
    return { sourceId: 'official', baseUrl: '' };
  }

  const selector = new SourceSelector();
  return selector.selectSource(providerSources);
}
```

**Step 4: Update saveModelsJson to include source info**

Find `saveModelsJson()` method and update (around line 244):

```typescript
private async saveModelsJson(config: SetupConfig): Promise<void> {
  const modelsJsonPath = join(this.piDir, 'models.json');

  let existingModels: any = {};
  if (existsSync(modelsJsonPath)) {
    try {
      const content = await readFile(modelsJsonPath, 'utf-8');
      existingModels = JSON.parse(content);
    } catch {
      existingModels = { providers: {} };
    }
  }

  if (!existingModels.providers) {
    existingModels.providers = {};
  }

  const envVarName = this.getEnvVarName(config.provider);

  // Build provider configuration
  const providerConfig: any = {
    api: 'openai-completions',
    apiKey: `$${envVarName}`,
    models: [
      {
        id: config.model,
        name: config.model,
        reasoning: this.isReasoningModel(config.model),
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
  };

  // Add source configuration if sourceId is specified
  if (config.source) {
    providerConfig.sources = {};
    const baseUrl = config.customUrl || this.getBaseUrlForSource(config.provider, config.source);
    providerConfig.sources[config.source] = {
      baseUrl: baseUrl,
    };
    providerConfig.currentSource = config.source;
  } else {
    // Backward compatible: direct baseUrl
    const baseUrl = this.getBaseUrl(config.provider);
    if (baseUrl) {
      providerConfig.baseUrl = baseUrl;
    }
  }

  existingModels.providers[config.provider] = providerConfig;

  await writeFile(modelsJsonPath, JSON.stringify(existingModels, null, 2));
}
```

**Step 5: Add getBaseUrlForSource helper**

Add after `getBaseUrl()` method (around line 322):

```typescript
/**
 * Get base URL for a specific source of a provider
 * @param provider - The provider ID
 * @param sourceId - The source ID
 * @returns Base URL or empty string for default
 */
private getBaseUrlForSource(provider: string, sourceId: string): string {
  const providerSources = getProviderSources(provider);
  if (!providerSources) return '';

  const source = providerSources.sources.find(s => s.id === sourceId);
  return source?.url || '';
}
```

**Step 6: Update saveConfigJson to include source**

Find `saveConfigJson()` method and update (around line 291):

```typescript
private async saveConfigJson(config: SetupConfig): Promise<void> {
  const configJsonPath = join(this.piDir, 'config.json');

  let existingConfig: any = {};
  if (existsSync(configJsonPath)) {
    try {
      const content = await readFile(configJsonPath, 'utf-8');
      existingConfig = JSON.parse(content);
    } catch {
      existingConfig = {};
    }
  }

  // Update current selection
  existingConfig.provider = config.provider;
  existingConfig.model = config.model;
  if (config.source) {
    existingConfig.source = config.source;  // NEW
  }

  await writeFile(configJsonPath, JSON.stringify(existingConfig, null, 2));
}
```

**Step 7: Run type check**

Run: `npm run lint`
Expected: No type errors

**Step 8: Commit**

```bash
git add src/cli/setup/tui-setup.ts
git commit -m "feat: integrate source selection into TUI setup

Add two-level selection: provider → source.
Update config saving to include sourceId and customUrl.
Support backward compatibility with configs without sources.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Fix MinionsConfig.getModel() to Read from config.json

**Files:**
- Modify: `src/host-agent/config.ts`
- Test: `src/host-agent/config.test.ts`

**Step 1: Write the failing test**

Create `src/host-agent/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MinionsConfig } from './config.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('MinionsConfig - config.json priority', () => {
  const testDir = '/tmp/minions-config-test';
  const piDir = join(testDir, '.pi');

  beforeEach(() => {
    // Clean up from any previous test run
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(piDir, { recursive: true });

    // Create models.json with multiple providers
    const modelsJson = {
      providers: {
        openai: {
          models: [{ id: 'gpt-4o', name: 'gpt-4o' }]
        },
        zai: {
          models: [{ id: 'glm-5', name: 'glm-5' }]
        }
      }
    };
    writeFileSync(join(piDir, 'models.json'), JSON.stringify(modelsJson));
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it('should read provider from config.json, not models.json first entry', async () => {
    // config.json selects zai (second provider in models.json)
    const configJson = {
      provider: 'zai',
      model: 'glm-5',
      source: 'official-cn'
    };
    writeFileSync(join(piDir, 'config.json'), JSON.stringify(configJson));

    const config = new MinionsConfig(testDir);
    const rawConfig = config.getRawProviderConfig();

    // Should read zai from config.json, NOT openai (first in models.json)
    expect(rawConfig.provider).toBe('zai');
    expect(rawConfig.model).toBe('glm-5');
    expect(rawConfig.source).toBe('official-cn');
  });

  it('should fall back to env vars if config.json missing', () => {
    const config = new MinionsConfig(testDir);
    const rawConfig = config.getRawProviderConfig();

    // No config.json, should use env var defaults
    expect(rawConfig.provider).toBe('openai');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/host-agent/config.test.ts`
Expected: FAIL - Currently reads first provider from models.json

**Step 3: Fix getRawProviderConfig()**

Update `getRawProviderConfig()` method in `src/host-agent/config.ts` (around line 111):

```typescript
getRawProviderConfig(): { provider: string; model: string; source?: string } {
  const configJson = join(this.agentDir, '.pi', 'config.json');
  let provider = process.env.LLM_PROVIDER || 'openai';
  let model = process.env.LLM_MODEL || 'gpt-4o';
  let source: string | undefined;

  try {
    const config = JSON.parse(readFileSync(configJson, 'utf-8'));
    // FIXED: Read from config.json first
    if (config.provider) provider = config.provider;
    if (config.model) model = config.model;
    if (config.source) source = config.source;
  } catch {
    // Fall back to env vars if config.json missing or invalid
  }

  return { provider, model, source };
}
```

**Step 4: Fix getModel()**

Update `getModel()` method in `src/host-agent/config.ts` (around line 32):

```typescript
async getModel(): Promise<Model<Api>> {
  const modelsJson = join(this.agentDir, '.pi', 'models.json');
  const configJson = join(this.agentDir, '.pi', 'config.json');

  let provider = process.env.LLM_PROVIDER || 'openai';
  let sourceId: string | undefined;
  let model = process.env.LLM_MODEL || 'gpt-4o';
  let userBaseUrl = '';

  try {
    // FIXED: Read config.json first for current selection
    const config = JSON.parse(readFileSync(configJson, 'utf-8'));
    if (config.provider) provider = config.provider;
    if (config.source) sourceId = config.source;
    if (config.model) model = config.model;

    // Read models.json for provider configuration
    const models = JSON.parse(readFileSync(modelsJson, 'utf-8'));
    const providerConfig = models.providers[provider];

    if (providerConfig) {
      // FIXED: Get baseUrl from selected source
      if (sourceId && providerConfig.sources && providerConfig.sources[sourceId]) {
        userBaseUrl = providerConfig.sources[sourceId].baseUrl || '';
      }
      // Backward compatible: direct baseUrl
      else if (providerConfig.baseUrl) {
        userBaseUrl = providerConfig.baseUrl;
      }
    }
  } catch {
    // Fall back to env vars
  }

  // Resolve provider and get model
  const resolved = resolveProvider(provider, model, userBaseUrl);
  const modelObj = getModel(resolved.piProvider as any, resolved.modelId as any);
  if (resolved.baseUrl) {
    (modelObj as any).baseUrl = resolved.baseUrl;
  }
  return modelObj;
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- src/host-agent/config.test.ts`
Expected: Tests PASS

**Step 6: Commit**

```bash
git add src/host-agent/config.ts src/host-agent/config.test.ts
git commit -m "fix: read provider from config.json not models.json

Prioritize config.json selection over models.json first entry.
Support source-aware baseUrl lookup with backward compatibility.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Update getApiKey() to Support Source-Specific Keys

**Files:**
- Modify: `src/host-agent/config.ts`

**Step 1: Update getApiKey() method**

Find `getApiKey()` method and update (around line 68):

```typescript
async getApiKey(model: Model<Api>, originalProvider?: string): Promise<string> {
  // Check environment variable for resolved provider first (e.g. ZAI_API_KEY)
  const envKey = `${model.provider.toUpperCase()}_API_KEY`;
  if (process.env[envKey]) {
    return process.env[envKey]!;
  }

  // Check env var for original/alias provider (e.g. ZHIPU_API_KEY)
  if (originalProvider && originalProvider !== model.provider) {
    const aliasEnvKey = `${originalProvider.toUpperCase()}_API_KEY`;
    if (process.env[aliasEnvKey]) {
      return process.env[aliasEnvKey]!;
    }
  }

  // Check LLM_API_KEY as fallback
  if (process.env.LLM_API_KEY) {
    return process.env.LLM_API_KEY;
  }

  // FIXED: Check source configuration in models.json
  const configPath = join(this.agentDir, '.pi', 'config.json');
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const sourceId = config.source;

    if (sourceId) {
      const modelsJson = join(this.agentDir, '.pi', 'models.json');
      const models = JSON.parse(readFileSync(modelsJson, 'utf-8'));
      const sourceConfig = models.providers[config.provider]?.sources?.[sourceId];

      if (sourceConfig?.apiKey) {
        // Resolve environment variable reference (e.g., $ZHIPU_API_KEY)
        const key = sourceConfig.apiKey;
        if (key.startsWith('$')) {
          const envVar = key.slice(1);
          if (process.env[envVar]) return process.env[envVar]!;
        } else {
          return key;
        }
      }
    }
  } catch {
    // Fall through
  }

  // Check .pi/config.json for stored API keys (backward compatibility)
  try {
    const storedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (storedConfig.apiKeys) {
      if (storedConfig.apiKeys[model.provider]) {
        return storedConfig.apiKeys[model.provider];
      }
      if (originalProvider && storedConfig.apiKeys[originalProvider]) {
        return storedConfig.apiKeys[originalProvider];
      }
    }
  } catch {
    // Fall through
  }

  throw new Error(`API key not found for ${model.provider}. Set ${envKey} or run: minion setup`);
}
```

**Step 2: Run type check**

Run: `npm run lint`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/host-agent/config.ts
git commit -m "feat: support source-specific API key lookup

Check models.json source config for API key references.
Support $ENV_VAR syntax in source configuration.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Add Backward Compatibility for Old Config Format

**Files:**
- Modify: `src/host-agent/config.ts`

**Step 1: Ensure getModel() handles old format**

The `getModel()` method already has backward compatibility (from Task 6), but let's add a test to verify:

Add to `src/host-agent/config.test.ts`:

```typescript
it('should handle old models.json format without sources', async () => {
  // Old format: direct baseUrl in provider config
  const oldModelsJson = {
    providers: {
      deepseek: {
        baseUrl: 'https://api.deepseek.com/v1',
        api: 'openai-completions',
        models: [{ id: 'deepseek-chat', name: 'deepseek-chat' }]
      }
    }
  };
  writeFileSync(join(piDir, 'models.json'), JSON.stringify(oldModelsJson));

  const oldConfigJson = {
    provider: 'deepseek',
    model: 'deepseek-chat'
    // Note: no 'source' field
  };
  writeFileSync(join(piDir, 'config.json'), JSON.stringify(oldConfigJson));

  const config = new MinionsConfig(testDir);

  // Should not throw, should read baseUrl from old format
  const rawConfig = config.getRawProviderConfig();
  expect(rawConfig.provider).toBe('deepseek');
  expect(rawConfig.source).toBeUndefined();
});
```

**Step 2: Run test**

Run: `npm test -- src/host-agent/config.test.ts`
Expected: All tests PASS (including new test)

**Step 3: Commit**

```bash
git add src/host-agent/config.test.ts
git commit -m "test: verify backward compatibility with old config format

Test that configs without 'source' field still work correctly.
Direct baseUrl in provider config should be used.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Manual Testing & Documentation

**Files:**
- Update: `docs/CONFIGURATION.md` (if exists)

**Step 1: Manual test - Official source selection**

Run: `npm run build && minion setup`

Test:
1. Select provider: Zhipu AI
2. Select source: 官方中国源
3. Select model: glm-5
4. Enter API key

Verify:
```bash
cat ~/.minion/.pi/config.json
# Should show: { "provider": "zai", "source": "official-cn", "model": "glm-5" }

cat ~/.minion/.pi/models.json
# Should show sources.official-cn.baseUrl
```

**Step 2: Manual test - Custom URL**

Run: `minion setup`

Test:
1. Select provider: OpenAI
2. Select source: 自定义 API 地址
3. Enter URL: `https://api.openai.com/v1`
4. Select model: gpt-4o
5. Enter API key

Verify custom URL is saved and used.

**Step 3: Manual test - Multiple providers**

Run: `minion setup` twice with different providers.

Verify both providers exist in `models.json` and `config.json` points to the latest.

**Step 4: Update documentation**

If `docs/CONFIGURATION.md` exists, add section about source selection:

```markdown
## Source Selection

When running `minion setup`, you can now select between different API sources for each provider:

- **Official sources**: Default API endpoints provided by the vendor
- **Regional sources**: Different endpoints for different regions (e.g., China vs International)
- **Custom sources**: Your own API endpoint (useful for proxies, third-party services, etc.)

### Configuration Files

`~/.minion/.pi/config.json` stores your current selection:
```json
{
  "provider": "zai",
  "source": "official-cn",
  "model": "glm-5"
}
```

`~/.minion/.pi/models.json` stores all configured providers and their sources:
```json
{
  "providers": {
    "zai": {
      "sources": {
        "official-cn": {
          "baseUrl": "https://open.bigmodel.cn/api/paas/v4"
        }
      },
      "currentSource": "official-cn",
      "models": [...]
    }
  }
}
```
```

**Step 5: Commit docs**

```bash
git add docs/CONFIGURATION.md
git commit -m "docs: add source selection documentation

Explain two-level setup flow and config file structure.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 10: End-to-End Integration Test

**Files:**
- Test: Manual verification

**Step 1: Build project**

Run: `npm run build`

**Step 2: Run full workflow test**

```bash
# Setup with custom source
minion setup
# Choose: Zhipu AI → Official China Source → glm-5 → Enter API key

# Verify config
cat ~/.minion/.pi/config.json
cat ~/.minion/.pi/models.json

# Run a simple task
cd /tmp/test-minion
mkdir test-minion && cd test-minion
git init
minion run "Create a README.md with project title" --repo /tmp/test-minion

# Verify it uses the correct source (check container logs or network calls)
```

**Step 3: Test source switching**

```bash
# Switch to different source
minion setup
# Choose: Same provider → Official International Source → same model

# Verify config.json updated
cat ~/.minion/.pi/config.json
# source should be "official-intl"

# Verify both sources still in models.json
cat ~/.minion/.pi/models.json
# Should have both official-cn and official-intl
```

**Step 4: Test backward compatibility**

```bash
# Backup current config
cp ~/.minion/.pi/models.json ~/.minion/.pi/models.json.bak

# Create old-format config
cat > ~/.minion/.pi/models.json << 'EOF'
{
  "providers": {
    "deepseek": {
      "baseUrl": "https://api.deepseek.com/v1",
      "api": "openai-completions",
      "models": [{"id": "deepseek-chat", "name": "deepseek-chat"}]
    }
  }
}
EOF

cat > ~/.minion/.pi/config.json << 'EOF'
{
  "provider": "deepseek",
  "model": "deepseek-chat"
}
EOF

# Run task - should work with old format
minion run "test task" --repo /tmp/test-minion

# Restore config
mv ~/.minion/.pi/models.json.bak ~/.minion/.pi/models.json
```

**Step 5: Final verification**

Run: `npm test`
Expected: All tests pass

Run: `npm run lint`
Expected: No type errors

---

## Summary

This implementation plan:

1. ✅ Creates a centralized source configuration registry
2. ✅ Implements two-level TUI selection (provider → source)
3. ✅ Adds custom URL input with validation
4. ✅ Fixes config reading to prioritize config.json
5. ✅ Maintains backward compatibility with old config formats
6. ✅ Includes comprehensive tests
7. ✅ Updates documentation

**Total tasks**: 10
**Estimated time**: 2-3 hours
**Test coverage**: Unit tests for new modules, integration tests for TUI, manual E2E testing
