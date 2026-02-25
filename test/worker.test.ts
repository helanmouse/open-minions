import { describe, it, expect } from 'vitest';
import { createWorker } from '../src/worker/index.js';

describe('Worker', () => {
  it('creates a worker with all components wired', () => {
    const worker = createWorker({
      llm: { provider: 'openai', model: 'gpt-4o', apiKey: 'test' },
      gitlab: { url: 'https://gitlab.com', token: '' },
      blueprintsDir: './blueprints',
      maxIterations: 20,
    });
    expect(worker).toBeDefined();
    expect(worker.blueprintEngine).toBeDefined();
    expect(worker.agentLoop).toBeDefined();
    expect(worker.toolRegistry).toBeDefined();
  });
});
