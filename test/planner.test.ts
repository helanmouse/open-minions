import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../src/agent/planner.js';
import type { TaskContext } from '../src/types/shared.js';

describe('buildSystemPrompt', () => {
  it('includes task description and project analysis', () => {
    const ctx: TaskContext = {
      taskId: 'abc123',
      description: 'Fix login page crash on empty email',
      repoType: 'local',
      branch: 'minion/abc123',
      baseBranch: 'main',
      projectAnalysis: { language: 'typescript', framework: 'express' },
      rules: ['Use strict mode', 'All functions need JSDoc'],
      maxIterations: 50,
      timeout: 30,
    };
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain('Fix login page crash on empty email');
    expect(prompt).toContain('typescript');
    expect(prompt).toContain('Use strict mode');
    expect(prompt).toContain('minion/abc123');
  });

  it('includes delivery instructions (commit + format-patch)', () => {
    const ctx: TaskContext = {
      taskId: 'abc123',
      description: 'Fix bug',
      repoType: 'local',
      branch: 'minion/abc123',
      baseBranch: 'main',
      projectAnalysis: {},
      rules: [],
      maxIterations: 50,
      timeout: 30,
    };
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain('format-patch');
    expect(prompt).toContain('/minion-run/patches');
  });
});
