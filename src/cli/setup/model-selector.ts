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
      description: m.reasoning ? 'Reasoning model' : 'Standard model',
    }));
  }

  getModels(): ModelInfo[] {
    return this.models;
  }

  async select(model: string): Promise<void> {
    await this.onSelect(model);
  }
}
