import { describe, it, expect } from 'vitest';
import { BlueprintEngine, Blueprint } from '../src/worker/blueprint-engine.js';

const testBlueprint: Blueprint = {
  name: 'test-bp',
  steps: [
    {
      id: 'step1',
      type: 'deterministic',
      action: 'test_action',
      params: { value: '{{task.description}}' },
    },
    {
      id: 'step2',
      type: 'agent',
      tools: ['echo'],
      prompt: 'Do something with {{steps.step1.output}}',
      max_iterations: 3,
    },
    {
      id: 'step3',
      type: 'deterministic',
      action: 'test_action',
      condition: '{{steps.step1.exit_code != 0}}',
      params: {},
    },
  ],
};

describe('BlueprintEngine', () => {
  it('parses template variables', () => {
    const engine = new BlueprintEngine();
    const result = engine.interpolate(
      'Hello {{task.description}}',
      { task: { description: 'world' }, steps: {}, context: {} }
    );
    expect(result).toBe('Hello world');
  });

  it('evaluates conditions', () => {
    const engine = new BlueprintEngine();
    expect(engine.evaluateCondition(
      '{{steps.lint.exit_code != 0}}',
      { task: {}, steps: { lint: { exit_code: 1 } }, context: {} }
    )).toBe(true);
    expect(engine.evaluateCondition(
      '{{steps.lint.exit_code != 0}}',
      { task: {}, steps: { lint: { exit_code: 0 } }, context: {} }
    )).toBe(false);
  });

  it('skips steps when condition is false', () => {
    const engine = new BlueprintEngine();
    const step = testBlueprint.steps[2]; // step3 with condition
    const shouldRun = engine.evaluateCondition(
      step.condition!,
      { task: {}, steps: { step1: { exit_code: 0 } }, context: {} }
    );
    expect(shouldRun).toBe(false);
  });
});
