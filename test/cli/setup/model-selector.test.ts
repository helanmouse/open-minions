// test/cli/setup/model-selector.test.ts
import { describe, it, expect } from 'vitest';
import { ModelSelector } from '../../../src/cli/setup/model-selector.js';

describe('ModelSelector', () => {
  it('should load models for given provider', async () => {
    const selector = new ModelSelector(
      'openai',
      async (model) => {
        expect(model).toBeTruthy();
      },
      () => {}
    );

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

  it('should call onSelect when model selected', async () => {
    let selectedModel: string | undefined;
    const selector = new ModelSelector(
      'openai',
      async (model) => {
        selectedModel = model;
      },
      () => {}
    );

    await selector.select('gpt-4o');
    expect(selectedModel).toBe('gpt-4o');
  });
});
