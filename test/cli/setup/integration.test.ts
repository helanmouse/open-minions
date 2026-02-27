// test/cli/setup/integration.test.ts
/**
 * Integration test for full TUI setup flow
 *
 * This test verifies the complete setup workflow including:
 * - Provider selection (openai, anthropic, google, zai, xai)
 * - Model selection
 * - API key input
 * - Configuration persistence (models.json, config.json)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { TuiSetup } from '../../../src/cli/setup/tui-setup.js';
import type { SetupConfig } from '../../../src/cli/setup/types.js';

describe('TUI Setup Integration Tests', () => {
  const testMinionHome = '/tmp/.test-minion-integration-' + Date.now();
  const piDir = join(testMinionHome, '.pi');

  beforeEach(async () => {
    // Create test directory structure
    await mkdir(testMinionHome, { recursive: true });
    await mkdir(piDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await rm(testMinionHome, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  const testProviders: Array<{
    provider: string;
    model: string;
    apiKey: string;
    envVar: string;
  }> = [
    {
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test-openai-key-12345',
      envVar: 'OPENAI_API_KEY',
    },
    {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      apiKey: 'sk-ant-test-key-67890',
      envVar: 'ANTHROPIC_API_KEY',
    },
    {
      provider: 'google',
      model: 'gemini-2.0-flash-exp',
      apiKey: 'test-google-api-key',
      envVar: 'GOOGLE_API_KEY',
    },
    {
      provider: 'zai',
      model: 'glm-4-flash',
      apiKey: 'test-zhipu-api-key',
      envVar: 'ZHIPU_API_KEY',
    },
    {
      provider: 'xai',
      model: 'grok-2',
      apiKey: 'test-xai-api-key',
      envVar: 'XAI_API_KEY',
    },
  ];

  describe('Full setup flow with mock config', () => {
    it.each(testProviders)(
      'should complete setup flow for %s provider',
      async ({ provider, model, apiKey }) => {
        const setup = new TuiSetup(testMinionHome);
        const mockConfig: SetupConfig = { provider, model, apiKey };

        setup.setMockConfig(mockConfig);

        const result = await setup.run();

        // Verify result structure
        expect(result).toBeDefined();
        expect(result.config.provider).toBe(provider);
        expect(result.config.model).toBe(model);
        expect(result.saved).toBe(true);
      }
    );
  });

  describe('models.json verification', () => {
    it.each(testProviders)(
      'should create valid models.json for %s provider',
      async ({ provider, model, apiKey, envVar }) => {
        const setup = new TuiSetup(testMinionHome);
        const mockConfig: SetupConfig = { provider, model, apiKey };

        setup.setMockConfig(mockConfig);
        await setup.run();

        const modelsJsonPath = join(piDir, 'models.json');
        expect(existsSync(modelsJsonPath), 'models.json should exist').toBe(true);

        const modelsJson = JSON.parse(await readFile(modelsJsonPath, 'utf-8'));

        // Verify top-level structure
        expect(modelsJson).toHaveProperty('providers');
        expect(typeof modelsJson.providers).toBe('object');

        // Verify provider entry
        expect(modelsJson.providers).toHaveProperty(provider);
        const providerConfig = modelsJson.providers[provider];

        // Verify provider configuration
        expect(providerConfig).toHaveProperty('apiKey');
        expect(providerConfig.apiKey).toBe(`$${envVar}`);
        expect(providerConfig).toHaveProperty('api');
        expect(providerConfig.api).toBe('openai-completions');

        // Verify models array
        expect(providerConfig).toHaveProperty('models');
        expect(Array.isArray(providerConfig.models)).toBe(true);
        expect(providerConfig.models.length).toBeGreaterThan(0);

        // Verify model entry
        const modelEntry = providerConfig.models.find((m: any) => m.id === model);
        expect(modelEntry).toBeDefined();
        expect(modelEntry).toHaveProperty('id', model);
        expect(modelEntry).toHaveProperty('name');
        expect(modelEntry).toHaveProperty('reasoning');
        expect(typeof modelEntry.reasoning).toBe('boolean');
        expect(modelEntry).toHaveProperty('input');
        expect(Array.isArray(modelEntry.input)).toBe(true);
        expect(modelEntry).toHaveProperty('cost');
        expect(modelEntry).toHaveProperty('contextWindow');
        expect(modelEntry).toHaveProperty('maxTokens');
      }
    );

    it('should preserve existing providers when adding new ones', async () => {
      const setup = new TuiSetup(testMinionHome);

      // Setup first provider
      const config1: SetupConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-openai-key',
      };
      setup.setMockConfig(config1);
      await setup.run();

      // Create new setup instance to simulate fresh run
      const setup2 = new TuiSetup(testMinionHome);
      const config2: SetupConfig = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        apiKey: 'sk-ant-key',
      };
      setup2.setMockConfig(config2);
      await setup2.run();

      // Verify both providers exist
      const modelsJsonPath = join(piDir, 'models.json');
      const modelsJson = JSON.parse(await readFile(modelsJsonPath, 'utf-8'));

      expect(modelsJson.providers).toHaveProperty('openai');
      expect(modelsJson.providers).toHaveProperty('anthropic');
    });
  });

  describe('config.json verification', () => {
    it.each(testProviders)(
      'should create valid config.json for %s provider',
      async ({ provider, model }) => {
        const setup = new TuiSetup(testMinionHome);
        const mockConfig: SetupConfig = { provider, model, apiKey: 'test-key' };

        setup.setMockConfig(mockConfig);
        await setup.run();

        const configJsonPath = join(piDir, 'config.json');
        expect(existsSync(configJsonPath), 'config.json should exist').toBe(true);

        const configJson = JSON.parse(await readFile(configJsonPath, 'utf-8'));

        // Verify current selection
        expect(configJson).toHaveProperty('provider', provider);
        expect(configJson).toHaveProperty('model', model);

        // Verify API key is NOT stored directly (security)
        expect(configJson.apiKey).toBeUndefined();
      }
    );

    it('should update config.json on subsequent runs', async () => {
      const setup = new TuiSetup(testMinionHome);

      // First run with OpenAI
      const config1: SetupConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-openai-key',
      };
      setup.setMockConfig(config1);
      await setup.run();

      // Second run with Anthropic
      const setup2 = new TuiSetup(testMinionHome);
      const config2: SetupConfig = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        apiKey: 'sk-ant-key',
      };
      setup2.setMockConfig(config2);
      await setup2.run();

      // Verify final config reflects the last run
      const configJsonPath = join(piDir, 'config.json');
      const configJson = JSON.parse(await readFile(configJsonPath, 'utf-8'));

      expect(configJson.provider).toBe('anthropic');
      expect(configJson.model).toBe('claude-3-5-sonnet');
    });
  });

  describe('reasoning model detection', () => {
    it('should mark o1 models as reasoning models', async () => {
      const setup = new TuiSetup(testMinionHome);
      const mockConfig: SetupConfig = {
        provider: 'openai',
        model: 'o1-preview',
        apiKey: 'sk-test-key',
      };

      setup.setMockConfig(mockConfig);
      await setup.run();

      const modelsJsonPath = join(piDir, 'models.json');
      const modelsJson = JSON.parse(await readFile(modelsJsonPath, 'utf-8'));

      const modelEntry = modelsJson.providers.openai.models.find(
        (m: any) => m.id === 'o1-preview'
      );
      expect(modelEntry.reasoning).toBe(true);
    });

    it('should mark o3 models as reasoning models', async () => {
      const setup = new TuiSetup(testMinionHome);
      const mockConfig: SetupConfig = {
        provider: 'openai',
        model: 'o3-mini',
        apiKey: 'sk-test-key',
      };

      setup.setMockConfig(mockConfig);
      await setup.run();

      const modelsJsonPath = join(piDir, 'models.json');
      const modelsJson = JSON.parse(await readFile(modelsJsonPath, 'utf-8'));

      const modelEntry = modelsJson.providers.openai.models.find(
        (m: any) => m.id === 'o3-mini'
      );
      expect(modelEntry.reasoning).toBe(true);
    });

    it('should not mark standard models as reasoning models', async () => {
      const setup = new TuiSetup(testMinionHome);
      const mockConfig: SetupConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-test-key',
      };

      setup.setMockConfig(mockConfig);
      await setup.run();

      const modelsJsonPath = join(piDir, 'models.json');
      const modelsJson = JSON.parse(await readFile(modelsJsonPath, 'utf-8'));

      const modelEntry = modelsJson.providers.openai.models.find(
        (m: any) => m.id === 'gpt-4o'
      );
      expect(modelEntry.reasoning).toBe(false);
    });
  });

  describe('base URL configuration', () => {
    it('should set custom baseUrl for zai provider', async () => {
      const setup = new TuiSetup(testMinionHome);
      const mockConfig: SetupConfig = {
        provider: 'zai',
        model: 'glm-4-flash',
        apiKey: 'test-key',
      };

      setup.setMockConfig(mockConfig);
      await setup.run();

      const modelsJsonPath = join(piDir, 'models.json');
      const modelsJson = JSON.parse(await readFile(modelsJsonPath, 'utf-8'));

      expect(modelsJson.providers.zai.baseUrl).toBe('https://open.bigmodel.cn/api/paas/v4');
    });

    it('should set custom baseUrl for deepseek provider', async () => {
      const setup = new TuiSetup(testMinionHome);
      const mockConfig: SetupConfig = {
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: 'test-key',
      };

      setup.setMockConfig(mockConfig);
      await setup.run();

      const modelsJsonPath = join(piDir, 'models.json');
      const modelsJson = JSON.parse(await readFile(modelsJsonPath, 'utf-8'));

      expect(modelsJson.providers.deepseek.baseUrl).toBe('https://api.deepseek.com/v1');
    });

    it('should not set baseUrl for standard providers', async () => {
      const setup = new TuiSetup(testMinionHome);
      const mockConfig: SetupConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key',
      };

      setup.setMockConfig(mockConfig);
      await setup.run();

      const modelsJsonPath = join(piDir, 'models.json');
      const modelsJson = JSON.parse(await readFile(modelsJsonPath, 'utf-8'));

      expect(modelsJson.providers.openai.baseUrl).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle corrupt existing models.json gracefully', async () => {
      const setup = new TuiSetup(testMinionHome);

      // Create a corrupt models.json
      const { writeFile } = await import('fs/promises');
      await writeFile(join(piDir, 'models.json'), 'invalid json{{{');

      const mockConfig: SetupConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-test-key',
      };

      setup.setMockConfig(mockConfig);

      // Should not throw, should recreate file
      await expect(setup.run()).resolves.toBeDefined();

      const modelsJsonPath = join(piDir, 'models.json');
      const modelsJson = JSON.parse(await readFile(modelsJsonPath, 'utf-8'));
      expect(modelsJson).toHaveProperty('providers');
    });

    it('should handle corrupt existing config.json gracefully', async () => {
      const setup = new TuiSetup(testMinionHome);

      // Create a corrupt config.json
      const { writeFile } = await import('fs/promises');
      await writeFile(join(piDir, 'config.json'), 'invalid json{{{');

      const mockConfig: SetupConfig = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        apiKey: 'sk-test-key',
      };

      setup.setMockConfig(mockConfig);

      // Should not throw, should recreate file
      await expect(setup.run()).resolves.toBeDefined();

      const configJsonPath = join(piDir, 'config.json');
      const configJson = JSON.parse(await readFile(configJsonPath, 'utf-8'));
      expect(configJson.provider).toBe('anthropic');
    });

    it('should handle empty provider and model strings', async () => {
      const setup = new TuiSetup(testMinionHome);
      const mockConfig: SetupConfig = {
        provider: '',
        model: '',
        apiKey: '',
      };

      setup.setMockConfig(mockConfig);

      const result = await setup.run();

      expect(result.saved).toBe(true);
      expect(existsSync(join(piDir, 'models.json'))).toBe(true);
    });
  });

  describe('environment variable mapping', () => {
    it.each([
      ['openai', 'OPENAI_API_KEY'],
      ['anthropic', 'ANTHROPIC_API_KEY'],
      ['google', 'GOOGLE_API_KEY'],
      ['zai', 'ZHIPU_API_KEY'],
      ['xai', 'XAI_API_KEY'],
      ['groq', 'GROQ_API_KEY'],
      ['deepseek', 'DEEPSEEK_API_KEY'],
    ])('should map %s provider to %s environment variable', async (provider, expectedEnvVar) => {
      const setup = new TuiSetup(testMinionHome);
      const mockConfig: SetupConfig = {
        provider,
        model: 'test-model',
        apiKey: 'test-key',
      };

      setup.setMockConfig(mockConfig);
      await setup.run();

      const modelsJsonPath = join(piDir, 'models.json');
      const modelsJson = JSON.parse(await readFile(modelsJsonPath, 'utf-8'));

      expect(modelsJson.providers[provider].apiKey).toBe(`$${expectedEnvVar}`);
    });
  });

  describe('complete workflow simulation', () => {
    it('should simulate multi-provider setup scenario', async () => {
      // User starts with OpenAI
      const setup1 = new TuiSetup(testMinionHome);
      setup1.setMockConfig({
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-openai-key',
      });
      await setup1.run();

      // Then adds Anthropic for comparison
      const setup2 = new TuiSetup(testMinionHome);
      setup2.setMockConfig({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        apiKey: 'sk-ant-key',
      });
      await setup2.run();

      // Then adds Google for another use case
      const setup3 = new TuiSetup(testMinionHome);
      setup3.setMockConfig({
        provider: 'google',
        model: 'gemini-2.0-flash-exp',
        apiKey: 'test-google-key',
      });
      await setup3.run();

      // Verify all providers are in models.json
      const modelsJsonPath = join(piDir, 'models.json');
      const modelsJson = JSON.parse(await readFile(modelsJsonPath, 'utf-8'));

      expect(Object.keys(modelsJson.providers)).toContain('openai');
      expect(Object.keys(modelsJson.providers)).toContain('anthropic');
      expect(Object.keys(modelsJson.providers)).toContain('google');

      // Verify config.json reflects the last selected provider
      const configJsonPath = join(piDir, 'config.json');
      const configJson = JSON.parse(await readFile(configJsonPath, 'utf-8'));

      expect(configJson.provider).toBe('google');
      expect(configJson.model).toBe('gemini-2.0-flash-exp');
    });
  });
});
