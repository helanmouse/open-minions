import { describe, it, expect } from 'vitest';
import { TaskStatus, type TaskRequest, type TaskState, type TaskContext, type SandboxStatus } from '../src/types/shared.js';
import type { ProjectAnalysis, ExecutionPlan } from '../src/types/host.js';

describe('TaskStatus', () => {
  it('has all expected values', () => {
    expect(TaskStatus).toContain('queued');
    expect(TaskStatus).toContain('running');
    expect(TaskStatus).toContain('done');
    expect(TaskStatus).toContain('failed');
    expect(TaskStatus).toContain('needs_human');
  });
});

describe('TaskRequest', () => {
  it('accepts valid task with local repo', () => {
    const task: TaskRequest = {
      id: 'abc123',
      description: 'Fix login bug',
      repo: '/path/to/repo',
      repoType: 'local',
      branch: 'minion/abc123',
      baseBranch: 'main',
      push: false,
      maxIterations: 50,
      timeout: 30,
      created_at: new Date().toISOString(),
    };
    expect(task.repoType).toBe('local');
  });

  it('accepts valid task with remote repo', () => {
    const task: TaskRequest = {
      id: 'def456',
      description: 'Add feature',
      repo: 'https://github.com/user/repo.git',
      repoType: 'remote',
      branch: 'minion/def456',
      baseBranch: 'main',
      push: true,
      maxIterations: 50,
      timeout: 30,
      created_at: new Date().toISOString(),
    };
    expect(task.repoType).toBe('remote');
    expect(task.push).toBe(true);
  });
});

describe('TaskContext', () => {
  it('represents context.json structure', () => {
    const ctx: TaskContext = {
      taskId: 'abc123',
      description: 'Fix login bug',
      repoType: 'local',
      branch: 'minion/abc123',
      baseBranch: 'main',
      projectAnalysis: { language: 'typescript', framework: 'express', packageManager: 'npm' },
      rules: ['Use strict mode'],
      maxIterations: 50,
      timeout: 30,
    };
    expect(ctx.taskId).toBe('abc123');
  });
});

describe('SandboxStatus', () => {
  it('represents status.json structure', () => {
    const status: SandboxStatus = {
      phase: 'executing',
      currentStep: 'Writing tests',
      progress: '3/5',
    };
    expect(status.phase).toBe('executing');
  });
});
