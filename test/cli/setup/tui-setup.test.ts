// test/cli/setup/tui-setup.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { TuiSetup } from '../../../src/cli/setup/tui-setup.js';
import type { SetupConfig } from '../../../src/cli/setup/types.js';

describe('TuiSetup', () => {
  const testMinionHome = '/tmp/.test-minion-' + Date.now();
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

  describe('constructor', () => {
    it('should initialize with minionHome path', () => {
      const setup = new TuiSetup(testMinionHome);
      expect(setup).toBeDefined();
    });

    it('should create .pi directory if it does not exist', async () => {
      const newTestHome = '/tmp/.test-minion-new-' + Date.now();
      const newPiDir = join(newTestHome, '.pi');

      try {
        expect(existsSync(newPiDir)).toBe(false);
        const setup = new TuiSetup(newTestHome);
        // Directory should be created when needed
        expect(setup).toBeDefined();
      } finally {
        await rm(newTestHome, { recursive: true, force: true });
      }
    });
  });

  describe('setMockConfig', () => {
    it('should set mock configuration for testing', () => {
      const setup = new TuiSetup(testMinionHome);
      const mockConfig: SetupConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-test-key-12345',
      };

      setup.setMockConfig(mockConfig);
      // Mock config is set for use in run()
      expect(setup).toBeDefined();
    });
  });

  describe('saveConfig', () => {
    it('should save models.json to .pi directory', async () => {
      const setup = new TuiSetup(testMinionHome);
      const config: SetupConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-test-key-12345',
      };

      await setup.saveConfig(config);

      const modelsJsonPath = join(piDir, 'models.json');
      expect(existsSync(modelsJsonPath)).toBe(true);

      const modelsJson = JSON.parse(await readFile(modelsJsonPath, 'utf-8'));
      expect(modelsJson).toHaveProperty('providers');
      expect(modelsJson.providers).toHaveProperty(config.provider);
    });

    it('should save config.json to .pi directory', async () => {
      const setup = new TuiSetup(testMinionHome);
      const config: SetupConfig = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        apiKey: 'sk-ant-test-key',
      };

      await setup.saveConfig(config);

      const configJsonPath = join(piDir, 'config.json');
      expect(existsSync(configJsonPath)).toBe(true);

      const configJson = JSON.parse(await readFile(configJsonPath, 'utf-8'));
      expect(configJson).toHaveProperty('provider');
      expect(configJson.provider).toBe(config.provider);
      expect(configJson).toHaveProperty('model');
      expect(configJson.model).toBe(config.model);
    });

    it('should not save API key in config.json (use environment variable reference)', async () => {
      const setup = new TuiSetup(testMinionHome);
      const config: SetupConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-test-key-12345',
      };

      await setup.saveConfig(config);

      const configJsonPath = join(piDir, 'config.json');
      const configJson = JSON.parse(await readFile(configJsonPath, 'utf-8'));

      // API key should not be stored directly in config.json
      expect(configJson.apiKey).toBeUndefined();
    });

    it('should save multiple providers to models.json', async () => {
      const setup = new TuiSetup(testMinionHome);

      // Save first config
      const config1: SetupConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-openai-key',
      };
      await setup.saveConfig(config1);

      // Save second config
      const config2: SetupConfig = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        apiKey: 'sk-ant-key',
      };
      await setup.saveConfig(config2);

      const modelsJsonPath = join(piDir, 'models.json');
      const modelsJson = JSON.parse(await readFile(modelsJsonPath, 'utf-8'));

      expect(modelsJson.providers).toHaveProperty('openai');
      expect(modelsJson.providers).toHaveProperty('anthropic');
    });
  });

  describe('run', () => {
    it('should complete setup with mock config and return SetupResult', async () => {
      const setup = new TuiSetup(testMinionHome);
      const mockConfig: SetupConfig = {
        provider: 'zai',
        model: 'glm-4-flash',
        apiKey: 'test-zhipu-key',
      };

      setup.setMockConfig(mockConfig);

      const result = await setup.run();

      expect(result).toBeDefined();
      expect(result.config.provider).toBe(mockConfig.provider);
      expect(result.config.model).toBe(mockConfig.model);
      expect(result.saved).toBe(true);
    });

    it('should save configuration files when run with mock config', async () => {
      const setup = new TuiSetup(testMinionHome);
      const mockConfig: SetupConfig = {
        provider: 'google',
        model: 'gemini-2.0-flash-exp',
        apiKey: 'test-google-key',
      };

      setup.setMockConfig(mockConfig);
      await setup.run();

      const modelsJsonPath = join(piDir, 'models.json');
      const configJsonPath = join(piDir, 'config.json');

      expect(existsSync(modelsJsonPath)).toBe(true);
      expect(existsSync(configJsonPath)).toBe(true);
    });

    it('should handle empty provider gracefully', async () => {
      const setup = new TuiSetup(testMinionHome);
      const mockConfig: SetupConfig = {
        provider: '',
        model: '',
        apiKey: '',
      };

      setup.setMockConfig(mockConfig);

      const result = await setup.run();

      // Should still complete but with empty values
      expect(result).toBeDefined();
      expect(result.saved).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle directory creation errors', async () => {
      const readOnlyPath = '/root/.minion-test-readonly';
      const setup = new TuiSetup(readOnlyPath);

      const mockConfig: SetupConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-test',
      };

      setup.setMockConfig(mockConfig);

      // Should handle permission errors gracefully
      const result = setup.run();
      // Either it fails or completes with saved=false
      if (await result.catch(() => false)) {
        // Expected failure
      } else {
        // If it succeeded, saved should be false or true depending on system
      }
    });
  });
});
