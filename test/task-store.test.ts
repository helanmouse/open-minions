import { describe, it, expect, beforeEach } from 'vitest';
import { TaskStore } from '../src/task/store.js';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('TaskStore', () => {
  let store: TaskStore;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-store-'));
    store = new TaskStore(join(dir, 'tasks.json'));
  });

  it('creates and retrieves a task', () => {
    const task = store.create({
      id: 'abc123',
      description: 'Fix bug',
      repo: '/path/to/repo',
      repoType: 'local',
      branch: 'minion/abc123',
      baseBranch: 'main',
      push: false,
      maxIterations: 50,
      timeout: 30,
      created_at: new Date().toISOString(),
    });
    expect(task.status).toBe('queued');
    expect(store.get('abc123')?.status).toBe('queued');
  });

  it('updates task status', () => {
    store.create({
      id: 'abc123', description: 'Fix bug', repo: '/tmp', repoType: 'local',
      branch: 'minion/abc123', baseBranch: 'main', push: false,
      maxIterations: 50, timeout: 30, created_at: '',
    });
    store.update('abc123', { status: 'running', started_at: new Date().toISOString() });
    expect(store.get('abc123')?.status).toBe('running');
  });

  it('lists all tasks', () => {
    store.create({
      id: 'a', description: 'A', repo: '/tmp', repoType: 'local',
      branch: 'minion/a', baseBranch: 'main', push: false,
      maxIterations: 50, timeout: 30, created_at: '',
    });
    store.create({
      id: 'b', description: 'B', repo: '/tmp', repoType: 'local',
      branch: 'minion/b', baseBranch: 'main', push: false,
      maxIterations: 50, timeout: 30, created_at: '',
    });
    expect(store.list()).toHaveLength(2);
  });

  it('persists to disk and reloads', () => {
    const path = (store as any).filePath;
    store.create({
      id: 'abc', description: 'Test', repo: '/tmp', repoType: 'local',
      branch: 'minion/abc', baseBranch: 'main', push: false,
      maxIterations: 50, timeout: 30, created_at: '',
    });
    const store2 = new TaskStore(path);
    expect(store2.get('abc')?.request.description).toBe('Test');
  });
});
