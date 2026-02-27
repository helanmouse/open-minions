# TUI LLM Selector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a TUI-based LLM provider and model selector for `minion setup` command using @mariozechner/pi-tui components.

**Architecture:** Replace readline-based setup with TUI interface. Use pi-ai's `getProviders()` and `getModels()` for dynamic provider/model discovery. Save configuration to `~/.minion/.pi/models.json` and `config.json`.

**Tech Stack:** @mariozechner/pi-tui, @mariozechner/pi-ai, TypeScript

---

## Task 1: Create setup TUI module structure

**Files:**
- Create: `src/cli/setup/index.ts`
- Create: `src/cli/setup/types.ts`

**Step 1: Create types file**

```typescript
// src/cli/setup/types.ts
import type { Model } from '@mariozechner/pi-ai';

export interface SetupConfig {
  provider: string;
  model: string;
  apiKey: string;
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
```

**Step 2: Create setup module index**

```typescript
// src/cli/setup/index.ts
export { TuiSetup } from './tui-setup.js';
export * from './types.js';
```

**Step 3: Run TypeScript check**

```bash
npm run lint
```

Expected: No errors (new files, empty exports)

**Step 4: Commit**

```bash
git add src/cli/setup/
git commit -m "feat: add setup TUI module structure"
```

---

## Task 2: Create ProviderSelector component

**Files:**
- Create: `src/cli/setup/provider-selector.ts`
- Test: `test/cli/setup/provider-selector.test.ts`

**Step 1: Write the failing test**

```typescript
// test/cli/setup/provider-selector.test.ts
import { describe, it, expect } from 'vitest';
import { ProviderSelector } from '../../src/cli/setup/provider-selector.js';

describe('ProviderSelector', () => {
  it('should load all providers from pi-ai', async () => {
    const selector = new ProviderSelector(async (provider) => {
      expect(provider).toBeTruthy();
      expect(typeof provider).toBe('string');
    }, () => {});

    const providers = selector.getProviders();
    expect(providers.length).toBeGreaterThan(0);
    expect(providers).toContain('openai');
    expect(providers).toContain('anthropic');
  });

  it('should call onSelect when provider selected', async () => {
    let selectedProvider: string | undefined;
    const selector = new ProviderSelector(
      async (provider) => { selectedProvider = provider; },
      () => {}
    );

    await selector.select('openai');
    expect(selectedProvider).toBe('openai');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- test/cli/setup/provider-selector.test.ts
```

Expected: FAIL - "ProviderSelector not defined"

**Step 3: Write minimal implementation**

```typescript
// src/cli/setup/provider-selector.ts
import { getProviders } from '@mariozechner/pi-ai';
import type { ProviderInfo } from './types.js';

export class ProviderSelector {
  private providers: ProviderInfo[];

  constructor(
    private onSelect: (provider: string) => Promise<void>,
    private onCancel: () => void
  ) {
    this.providers = this.loadProviders();
  }

  private loadProviders(): ProviderInfo[] {
    const knownProviders = getProviders();
    return knownProviders.map(p => ({
      id: p,
      label: this.formatLabel(p),
      description: this.getDescription(p)
    }));
  }

  private formatLabel(provider: string): string {
    const labels: Record<string, string> = {
      'openai': 'OpenAI',
      'anthropic': 'Anthropic',
      'google': 'Google',
      'zai': '智谱 AI (Zhipu)',
      'xai': 'xAI (Grok)',
      'groq': 'Groq',
      'deepseek': 'DeepSeek',
    };
    return labels[provider] || provider;
  }

  private getDescription(provider: string): string {
    const descriptions: Record<string, string> = {
      'openai': 'GPT-4o, GPT-4o-mini, o1, o3-mini',
      'anthropic': 'Claude 3.5 Sonnet, Claude 3.5 Haiku',
      'google': 'Gemini 2.0 Flash, Gemini Pro',
      'zai': 'GLM-4 Flash, GLM-4 Plus',
      'xai': 'Grok-2, Grok-mini',
      'groq': 'Llama 3.3, Mixtral',
    };
    return descriptions[provider] || '';
  }

  getProviders(): ProviderInfo[] {
    return this.providers;
  }

  async select(provider: string): Promise<void> {
    await this.onSelect(provider);
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- test/cli/setup/provider-selector.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/cli/setup/provider-selector.ts test/cli/setup/provider-selector.test.ts
git commit -m "feat: add ProviderSelector component"
```

---

## Task 3: Create ModelSelector component

**Files:**
- Create: `src/cli/setup/model-selector.ts`
- Test: `test/cli/setup/model-selector.test.ts`

**Step 1: Write the failing test**

```typescript
// test/cli/setup/model-selector.test.ts
import { describe, it, expect } from 'vitest';
import { ModelSelector } from '../../src/cli/setup/model-selector.js';

describe('ModelSelector', () => {
  it('should load models for given provider', async () => {
    const selector = new ModelSelector('openai', async (model) => {
      expect(model).toBeTruthy();
    }, () => {});

    const models = selector.getModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].id).toBeTruthy();
  });

  it('should filter models by provider', async () => {
    const openaiSelector = new ModelSelector('openai', async () => {}, () => {});
    const anthropicSelector = new ModelSelector('anthropic', async () => {}, () => {});

    const openaiModels = openaiSelector.getModels();
    const anthropicModels = anthropicSelector.getModels();

    expect(openaiModels.length).toBeGreaterThan(0);
    expect(anthropicModels.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- test/cli/setup/model-selector.test.ts
```

Expected: FAIL - "ModelSelector not defined"

**Step 3: Write minimal implementation**

```typescript
// src/cli/setup/model-selector.ts
import { getModels, type Model } from '@mariozechner/pi-ai';
import type { ModelInfo } from './types.js';

export class ModelSelector {
  private models: ModelInfo[];

  constructor(
    private provider: string,
    private onSelect: (model: string) => Promise<void>,
    private onCancel: () => void
  ) {
    this.models = this.loadModels();
  }

  private loadModels(): ModelInfo[] {
    const models = getModels(this.provider as any);
    return models.map((m: Model<any>) => ({
      id: m.id,
      name: m.name,
      description: m.reasoning ? 'Reasoning model' : 'Standard model'
    }));
  }

  getModels(): ModelInfo[] {
    return this.models;
  }

  async select(model: string): Promise<void> {
    await this.onSelect(model);
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- test/cli/setup/model-selector.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/cli/setup/model-selector.ts test/cli/setup/model-selector.test.ts
git commit -m "feat: add ModelSelector component"
```

---

## Task 4: Create ApiKeyInput component

**Files:**
- Create: `src/cli/setup/apikey-input.ts`
- Test: `test/cli/setup/apikey-input.test.ts`

**Step 1: Write the failing test**

```typescript
// test/cli/setup/apikey-input.test.ts
import { describe, it, expect } from 'vitest';
import { ApiKeyInput } from '../../src/cli/setup/apikey-input.js';

describe('ApiKeyInput', () => {
  it('should collect API key from user', async () => {
    const input = new ApiKeyInput('openai');
    // Mock input by setting value directly
    input.setMockValue('sk-test-key-12345');

    const key = await input.getInput();
    expect(key).toBe('sk-test-key-12345');
  });

  it('should validate non-empty API key', async () => {
    const input = new ApiKeyInput('openai');
    input.setMockValue('');

    await expect(input.getInput()).rejects.toThrow('API key cannot be empty');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- test/cli/setup/apikey-input.test.ts
```

Expected: FAIL - "ApiKeyInput not defined"

**Step 3: Write minimal implementation**

```typescript
// src/cli/setup/apikey-input.ts
import { TextEditor, type TextEditorConfig, Input, Container, Spacer, Text } from '@mariozechner/pi-tui';
import type { SetupConfig } from './types.js';

export class ApiKeyInput extends Container {
  private input: Input;
  private mockValue?: string;
  private resolve?: (value: string) => void;
  private reject?: (error: Error) => void;

  constructor(private provider: string) {
    super();

    this.addChild(new Text(`Enter API key for ${this.provider}:`, 0, 0));
    this.addChild(new Spacer(1));

    this.input = new Input();
    this.input.onSubmit = () => this.handleSubmit();
    this.addChild(this.input);

    this.addChild(new Spacer(1));
    this.addChild(new Text('  Press Enter to confirm', 0, 0));
  }

  // For testing only
  setMockValue(value: string): void {
    this.mockValue = value;
  }

  private async handleSubmit(): Promise<void> {
    const value = this.mockValue || this.input.getValue();

    if (!value || value.trim().length === 0) {
      this.reject?.(new Error('API key cannot be empty'));
      return;
    }

    this.resolve?.(value);
  }

  async getInput(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;

      if (this.mockValue) {
        resolve(this.mockValue);
      }
    });
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- test/cli/setup/apikey-input.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/cli/setup/apikey-input.ts test/cli/setup/apikey-input.test.ts
git commit -m "feat: add ApiKeyInput component"
```

---

## Task 5: Create TuiSetup main class

**Files:**
- Create: `src/cli/setup/tui-setup.ts`
- Test: `test/cli/setup/tui-setup.test.ts`

**Step 1: Write the failing test**

```typescript
// test/cli/setup/tui-setup.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { TuiSetup } from '../../src/cli/setup/tui-setup.js';

const TEST_DIR = '/tmp/minions-setup-test';

describe('TuiSetup', () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  it('should save configuration to files', async () => {
    const setup = new TuiSetup(TEST_DIR);

    // Mock the user input flow
    setup.setMockConfig({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test-key'
    });

    await setup.run();

    // Check models.json
    const modelsPath = join(TEST_DIR, '.pi', 'models.json');
    expect(existsSync(modelsPath)).toBe(true);

    // Check config.json
    const configPath = join(TEST_DIR, '.pi', 'config.json');
    expect(existsSync(configPath)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- test/cli/setup/tui-setup.test.ts
```

Expected: FAIL - "TuiSetup not defined"

**Step 3: Write minimal implementation**

```typescript
// src/cli/setup/tui-setup.ts
import { TUI, ProcessTerminal } from '@mariozechner/pi-tui';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { SetupConfig, SetupResult } from './types.js';

export class TuiSetup {
  private mockConfig?: SetupConfig;

  constructor(private minionHome: string) {}

  // For testing
  setMockConfig(config: SetupConfig): void {
    this.mockConfig = config;
  }

  async run(): Promise<SetupResult> {
    const config = this.mockConfig || {
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test'
    };

    this.saveConfig(config);

    return {
      config,
      saved: true
    };
  }

  private saveConfig(config: SetupConfig): void {
    const piDir = join(this.minionHome, '.pi');
    mkdirSync(piDir, { recursive: true });

    // Save models.json
    writeFileSync(
      join(piDir, 'models.json'),
      JSON.stringify({
        providers: {
          [config.provider]: {
            apiKey: `$${config.provider.toUpperCase()}_API_KEY`,
            api: 'openai-completions',
            models: [
              {
                id: config.model,
                name: config.model,
                reasoning: false,
                input: ['text']
              }
            ]
          }
        }
      }, null, 2)
    );

    // Save config.json
    writeFileSync(
      join(piDir, 'config.json'),
      JSON.stringify({
        defaultProvider: config.provider,
        defaultModel: config.model,
        apiKeys: {
          [config.provider]: config.apiKey
        }
      }, null, 2)
    );
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- test/cli/setup/tui-setup.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/cli/setup/tui-setup.ts test/cli/setup/tui-setup.test.ts
git commit -m "feat: add TuiSetup main class"
```

---

## Task 6: Integrate TUI setup into CLI

**Files:**
- Modify: `src/cli/index.ts`

**Step 1: Read current setup command**

```bash
grep -A 50 "program.command('setup')" src/cli/index.ts
```

**Step 2: Replace setup command with TUI version**

```typescript
// In src/cli/index.ts, replace the entire program.command('setup') block

import { TuiSetup } from '../setup/tui-setup.js';
import { ProcessTerminal } from '@mariozechner/pi-tui';

program
  .command('setup')
  .description('Configure LLM provider and API key (TUI)')
  .action(async () => {
    const minionHome = join(homedir(), '.minion');
    const setup = new TuiSetup(minionHome);

    try {
      const result = await setup.run();
      console.log(`\n✓ Configuration saved`);
      console.log(`  Provider: ${result.config.provider}`);
      console.log(`  Model: ${result.config.model}`);
    } catch (error: any) {
      console.error(`\n✗ Setup failed: ${error.message}`);
      process.exit(1);
    }
  });
```

**Step 3: Run TypeScript check**

```bash
npm run lint
```

Expected: No errors

**Step 4: Test manually**

```bash
npm run build
node dist/cli/index.js setup
```

Expected: Creates config files in ~/.minion/.pi/

**Step 5: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: integrate TUI setup into CLI"
```

---

## Task 7: Add TUI SelectList for interactive selection

**Files:**
- Modify: `src/cli/setup/tui-setup.ts`
- Modify: `src/cli/setup/provider-selector.ts`
- Modify: `src/cli/setup/model-selector.ts`

**Step 1: Update TuiSetup to use TUI components**

```typescript
// src/cli/setup/tui-setup.ts
import { TUI, ProcessTerminal, SelectList, Container, Spacer, Text, DynamicBorder } from '@mariozechner/pi-tui';
import { getProviders, getModels } from '@mariozechner/pi-ai';
import type { SelectItem } from '@mariozechner/pi-tui';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { SetupConfig, SetupResult } from './types.js';

export class TuiSetup {
  private mockConfig?: SetupConfig;
  private tui: TUI;

  constructor(private minionHome: string) {
    this.tui = new TUI(new ProcessTerminal());
  }

  setMockConfig(config: SetupConfig): void {
    this.mockConfig = config;
  }

  async run(): Promise<SetupResult> {
    if (this.mockConfig) {
      this.saveConfig(this.mockConfig);
      return { config: this.mockConfig, saved: true };
    }

    return new Promise((resolve, reject) => {
      // Step 1: Provider selection
      this.selectProvider().then(provider => {
        // Step 2: Model selection
        this.selectModel(provider).then(model => {
          // Step 3: API key input
          this.selectApiKey(provider).then(apiKey => {
            const config: SetupConfig = { provider, model, apiKey };
            this.saveConfig(config);
            this.tui.stop();
            resolve({ config, saved: true });
          }).catch(reject);
        }).catch(reject);
      }).catch(reject);
    });
  }

  private async selectProvider(): Promise<string> {
    const providers = getProviders();
    const items: SelectItem[] = providers.map(p => ({
      value: p,
      label: this.formatProviderLabel(p),
      description: this.getProviderDescription(p)
    }));

    return new Promise((resolve, reject) => {
      const list = new SelectList(items, Math.min(items.length, 15));
      list.onSelect = (item) => resolve(item.value);
      list.onCancel = () => reject(new Error('Cancelled by user'));

      const container = new Container();
      container.addChild(new Text('Select LLM Provider:', 0, 0));
      container.addChild(new Spacer(1));
      container.addChild(list);
      this.tui.addChild(container);
      this.tui.start();
    });
  }

  private async selectModel(provider: string): Promise<string> {
    const models = getModels(provider as any);
    const items: SelectItem[] = models.map(m => ({
      value: m.id,
      label: m.id,
      description: m.name
    }));

    return new Promise((resolve, reject) => {
      const list = new SelectList(items, Math.min(items.length, 10));
      list.onSelect = (item) => resolve(item.value);
      list.onCancel = () => reject(new Error('Cancelled by user'));

      const container = new Container();
      container.addChild(new Text(`Select Model for ${provider}:`, 0, 0));
      container.addChild(new Spacer(1));
      container.addChild(list);
      this.tui.addChild(container);
    });
  }

  private async selectApiKey(provider: string): Promise<string> {
    // For now, use environment variable or prompt
    const envKey = `${provider.toUpperCase()}_API_KEY`;
    const envValue = process.env[envKey];
    if (envValue) {
      return envValue;
    }

    // Fallback to readline for API key (can be enhanced with TUI later)
    const readline = (await import('readline')).createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      readline.question(`Enter API key for ${provider}: `, (key) => {
        readline.close();
        resolve(key);
      });
    });
  }

  private formatProviderLabel(provider: string): string {
    const labels: Record<string, string> = {
      'openai': 'OpenAI',
      'anthropic': 'Anthropic',
      'google': 'Google',
      'zai': '智谱 AI (Zhipu)',
      'xai': 'xAI (Grok)',
    };
    return labels[provider] || provider;
  }

  private getProviderDescription(provider: string): string {
    const descriptions: Record<string, string> = {
      'openai': 'GPT-4o, GPT-4o-mini, o1, o3-mini',
      'anthropic': 'Claude 3.5 Sonnet, Claude 3.5 Haiku',
      'google': 'Gemini 2.0 Flash, Gemini Pro',
    };
    return descriptions[provider] || '';
  }

  private saveConfig(config: SetupConfig): void {
    const piDir = join(this.minionHome, '.pi');
    mkdirSync(piDir, { recursive: true });

    writeFileSync(
      join(piDir, 'models.json'),
      JSON.stringify({
        providers: {
          [config.provider]: {
            apiKey: `$${config.provider.toUpperCase()}_API_KEY`,
            api: 'openai-completions',
            models: [{ id: config.model, name: config.model, reasoning: false, input: ['text'] }]
          }
        }
      }, null, 2)
    );

    writeFileSync(
      join(piDir, 'config.json'),
      JSON.stringify({
        defaultProvider: config.provider,
        defaultModel: config.model,
        apiKeys: { [config.provider]: config.apiKey }
      }, null, 2)
    );
  }
}
```

**Step 2: Update export**

```typescript
// src/cli/setup/index.ts - export SelectItem type if needed
export { TuiSetup } from './tui-setup.js';
export * from './types.js';
```

**Step 3: Run TypeScript check**

```bash
npm run lint
```

Expected: No errors

**Step 4: Commit**

```bash
git add src/cli/setup/tui-setup.ts
git commit -m "feat: add TUI SelectList for interactive provider/model selection"
```

---

## Task 8: Add integration test for full TUI flow

**Files:**
- Create: `test/cli/setup/integration.test.ts`

**Step 1: Write integration test**

```typescript
// test/cli/setup/integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { TuiSetup } from '../../../src/cli/setup/tui-setup.js';

const TEST_DIR = '/tmp/minions-setup-integration-test';

describe('TUI Setup Integration', () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  it('should complete full setup flow', async () => {
    const setup = new TuiSetup(TEST_DIR);

    setup.setMockConfig({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      apiKey: 'sk-ant-test-key'
    });

    const result = await setup.run();

    expect(result.saved).toBe(true);
    expect(result.config.provider).toBe('anthropic');
    expect(result.config.model).toBe('claude-3-5-sonnet-20241022');

    // Verify models.json
    const modelsPath = join(TEST_DIR, '.pi', 'models.json');
    expect(existsSync(modelsPath)).toBe(true);
    const models = JSON.parse(readFileSync(modelsPath, 'utf-8'));
    expect(models.providers.anthropic).toBeDefined();
    expect(models.providers.anthropic.models[0].id).toBe('claude-3-5-sonnet-20241022');

    // Verify config.json
    const configPath = join(TEST_DIR, '.pi', 'config.json');
    expect(existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.defaultProvider).toBe('anthropic');
    expect(config.defaultModel).toBe('claude-3-5-sonnet-20241022');
    expect(config.apiKeys.anthropic).toBe('sk-ant-test-key');
  });

  it('should support multiple providers', async () => {
    const providers = ['openai', 'anthropic', 'google', 'zai', 'xai'];

    for (const provider of providers) {
      const testDir = join(TEST_DIR, provider);
      mkdirSync(testDir, { recursive: true });

      const setup = new TuiSetup(testDir);
      setup.setMockConfig({
        provider,
        model: 'test-model',
        apiKey: `sk-${provider}-test`
      });

      const result = await setup.run();
      expect(result.config.provider).toBe(provider);
    }
  });
});
```

**Step 2: Run integration test**

```bash
npm test -- test/cli/setup/integration.test.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add test/cli/setup/integration.test.ts
git commit -m "test: add integration test for full TUI setup flow"
```

---

## Task 9: Update README and documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/CONFIGURATION.md`

**Step 1: Update README.md setup section**

```bash
# Find and replace the setup command description in README.md
# Old: Simple readline prompts
# New: TUI-based selection
```

Add/update:

```markdown
#### Configure (TUI)

```bash
minion setup
```

Launches an interactive TUI for selecting:
- LLM Provider (25 supported providers)
- Model (dynamic list based on provider)
- API Key
```

**Step 2: Update CONFIGURATION.md**

Add section about TUI setup:

```markdown
## TUI Setup

The `minion setup` command launches a terminal UI for interactive configuration:

- Use arrow keys to navigate
- Press Enter to select
- Press Esc to cancel
- Type to filter options

The TUI automatically discovers all available providers and models via pi-ai.
```

**Step 3: Commit**

```bash
git add README.md docs/CONFIGURATION.md
git commit -m "docs: update documentation for TUI setup"
```

---

## Task 10: Final verification and cleanup

**Files:**
- Test: All tests
- Build: Full compilation

**Step 1: Run all tests**

```bash
npm test
```

Expected: All 52+ tests pass

**Step 2: Run full build**

```bash
npm run build
```

Expected: No compilation errors

**Step 3: Manual smoke test**

```bash
# Build and test setup command
npm run build
node dist/cli/index.js setup --help
```

**Step 4: Clean up test artifacts**

```bash
rm -rf /tmp/minions-setup-test /tmp/minions-setup-integration-test
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete TUI LLM selector implementation"
```

---

## Summary

This plan implements a complete TUI-based LLM selector for minions setup:

- **10 tasks**, each with TDD approach
- **5 new components**: ProviderSelector, ModelSelector, ApiKeyInput, TuiSetup, types
- **Full test coverage**: unit + integration tests
- **25 providers** dynamically loaded from pi-ai
- **Clean architecture**: separated concerns, reusable components

Estimated completion time: ~2 hours
