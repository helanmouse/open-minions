// src/host-agent/config.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { MinionsConfig } from './config.js';

describe('MinionsConfig', () => {
  let testDir: string;
  let piDir: string;

  // Create a fresh temporary directory for each test
  const setupTestDir = () => {
    testDir = mkdtempSync(join(tmpdir(), 'minion-config-test-'));
    piDir = join(testDir, '.pi');
    mkdirSync(piDir, { recursive: true });
  };

  // Clean up after each test
  afterEach(() => {
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('backward compatibility', () => {
    it('should handle old models.json format without sources', async () => {
      setupTestDir();

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

      // Pass testDir as both cwd and agentDir to use test directory
      const config = new MinionsConfig(testDir, testDir);

      // Should not throw, should read baseUrl from old format
      const rawConfig = config.getRawProviderConfig();
      expect(rawConfig.provider).toBe('deepseek');
      expect(rawConfig.source).toBeUndefined();
    });
  });

  describe('getRawProviderConfig', () => {
    it('should read provider from config.json', () => {
      setupTestDir();

      writeFileSync(join(piDir, 'config.json'), JSON.stringify({
        provider: 'openai',
        model: 'gpt-4o'
      }));

      const config = new MinionsConfig(testDir, testDir);
      const rawConfig = config.getRawProviderConfig();

      expect(rawConfig.provider).toBe('openai');
      expect(rawConfig.model).toBe('gpt-4o');
    });

    it('should read source from config.json when present', () => {
      setupTestDir();

      writeFileSync(join(piDir, 'config.json'), JSON.stringify({
        provider: 'zai',
        model: 'glm-4-flash',
        source: 'official-cn'
      }));

      const config = new MinionsConfig(testDir, testDir);
      const rawConfig = config.getRawProviderConfig();

      expect(rawConfig.provider).toBe('zai');
      expect(rawConfig.model).toBe('glm-4-flash');
      expect(rawConfig.source).toBe('official-cn');
    });

    it('should fall back to defaults when config.json does not exist', () => {
      setupTestDir();
      // Don't create config.json

      const config = new MinionsConfig(testDir, testDir);
      const rawConfig = config.getRawProviderConfig();

      expect(rawConfig.provider).toBe('openai');
      expect(rawConfig.model).toBe('gpt-4o');
      expect(rawConfig.source).toBeUndefined();
    });

    it('should fall back to defaults when config.json is malformed', () => {
      setupTestDir();

      writeFileSync(join(piDir, 'config.json'), 'invalid json {{{');

      const config = new MinionsConfig(testDir, testDir);
      const rawConfig = config.getRawProviderConfig();

      expect(rawConfig.provider).toBe('openai');
      expect(rawConfig.model).toBe('gpt-4o');
      expect(rawConfig.source).toBeUndefined();
    });
  });

  describe('getModel', () => {
    it('should handle old format with direct baseUrl', async () => {
      setupTestDir();

      // Use a known provider (openai) but with old format baseUrl
      const modelsJson = {
        providers: {
          openai: {
            baseUrl: 'https://api.openai.com/v1',
            api: 'openai-completions',
            models: [{ id: 'gpt-4o', name: 'gpt-4o' }]
          }
        }
      };
      writeFileSync(join(piDir, 'models.json'), JSON.stringify(modelsJson));

      writeFileSync(join(piDir, 'config.json'), JSON.stringify({
        provider: 'openai',
        model: 'gpt-4o'
        // Note: no 'source' field - this is the old format
      }));

      const config = new MinionsConfig(testDir, testDir);

      // Should not throw - the old format is supported
      const model = await config.getModel();
      expect(model).toBeDefined();
    });
  });

  describe('getLLMConfig', () => {
    it('should return default LLM config when no env vars set', () => {
      setupTestDir();

      const config = new MinionsConfig(testDir, testDir);
      const llmConfig = config.getLLMConfig();

      expect(llmConfig.provider).toBe('openai');
      expect(llmConfig.model).toBe('gpt-4o');
      expect(llmConfig.apiKey).toBe('');
      expect(llmConfig.baseUrl).toBeUndefined();
    });
  });

  describe('getExtraConfig', () => {
    it('should return default sandbox config when no config.json', () => {
      setupTestDir();

      const config = new MinionsConfig(testDir, testDir);
      const extra = config.getExtraConfig();

      expect(extra.sandbox.memory).toBe('4g');
      expect(extra.sandbox.cpus).toBe(2);
      expect(extra.sandbox.network).toBe('bridge');
    });

    it('should read sandbox config from agent config.json', () => {
      setupTestDir();

      const agentConfig = {
        sandbox: {
          memory: '8g',
          cpus: 4,
          network: 'host'
        },
        pi: {
          runtimeDir: '/tmp/test-runtime'
        }
      };
      writeFileSync(join(testDir, 'config.json'), JSON.stringify(agentConfig));

      // First constructor reads from user's home, need to create new instance after write
      const config = new MinionsConfig(testDir, testDir);
      const extra = config.getExtraConfig();

      expect(extra.sandbox.memory).toBe('8g');
      expect(extra.sandbox.cpus).toBe(4);
      expect(extra.sandbox.network).toBe('host');
    });
  });

  describe('saveConfig', () => {
    it('should save and reload extra config', () => {
      setupTestDir();

      const config = new MinionsConfig(testDir, testDir);

      config.saveConfig({
        sandbox: {
          memory: '16g',
          cpus: 8,
          network: 'bridge'
        }
      });

      const extra = config.getExtraConfig();
      expect(extra.sandbox.memory).toBe('16g');
      expect(extra.sandbox.cpus).toBe(8);
      expect(extra.sandbox.network).toBe('bridge');
    });

    it('should merge partial config with existing config', () => {
      setupTestDir();

      const config = new MinionsConfig(testDir, testDir);

      // Save initial config
      config.saveConfig({
        sandbox: {
          memory: '4g',
          cpus: 2,
          network: 'bridge'
        }
      });

      // Save partial update
      config.saveConfig({
        sandbox: {
          memory: '8g',
          cpus: 4,
          network: 'bridge'
        }
      });

      const extra = config.getExtraConfig();
      expect(extra.sandbox.memory).toBe('8g');
      expect(extra.sandbox.cpus).toBe(4);
    });
  });
});
