import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { TaskStore } from './store.js'
import { getDefaultStrategy } from '../types/strategy.js'
import type { TaskRequest } from '../types/shared.js'

const testDbPath = join(tmpdir(), 'minions-test-store.json')

describe('TaskStore', () => {
  beforeEach(() => {
    try {
      unlinkSync(testDbPath)
    } catch {
      // File doesn't exist, that's fine
    }
  })

  afterEach(() => {
    try {
      unlinkSync(testDbPath)
    } catch {
      // File doesn't exist, that's fine
    }
  })

  it('should create and retrieve a basic task', () => {
    const store = new TaskStore(testDbPath)
    const request: TaskRequest = {
      id: 'test-basic',
      description: 'basic test task',
      repo: '/test/repo',
      repoType: 'local',
      branch: 'test-branch',
      baseBranch: 'main',
      push: false,
      maxIterations: 10,
      timeout: 30,
      created_at: new Date().toISOString()
    }

    store.create(request)
    const task = store.get('test-basic')

    expect(task).toBeDefined()
    expect(task?.request.id).toBe('test-basic')
    expect(task?.status).toBe('queued')
  })

  it('should store task with execution strategy', () => {
    const store = new TaskStore(testDbPath)
    const request: TaskRequest = {
      id: 'test-123',
      description: 'test task, preserve on failure',
      parsedTask: 'test task',
      strategy: { ...getDefaultStrategy(), preserveOnFailure: true },
      repo: '/test/repo',
      repoType: 'local',
      branch: 'test-branch',
      baseBranch: 'main',
      push: false,
      maxIterations: 10,
      timeout: 30,
      created_at: new Date().toISOString()
    }

    store.create(request)
    const task = store.get('test-123')

    expect(task?.request.strategy?.preserveOnFailure).toBe(true)
    expect(task?.request.parsedTask).toBe('test task')
  })

  it('should create task without optional fields for backward compatibility', () => {
    const store = new TaskStore(testDbPath)
    const request: TaskRequest = {
      id: 'test-backward-compat',
      description: 'task without optional fields',
      repo: '/test/repo',
      repoType: 'local',
      branch: 'test-branch',
      baseBranch: 'main',
      push: false,
      maxIterations: 10,
      timeout: 30,
      created_at: new Date().toISOString()
      // Note: parsedTask and strategy are intentionally omitted
    }

    store.create(request)
    const task = store.get('test-backward-compat')

    expect(task).toBeDefined()
    expect(task?.request.id).toBe('test-backward-compat')
    expect(task?.status).toBe('queued')
    expect(task?.request.parsedTask).toBeUndefined()
    expect(task?.request.strategy).toBeUndefined()
  })
})
