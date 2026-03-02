import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { unlinkSync } from 'fs'
import { TaskStore } from './store.js'
import { getDefaultStrategy } from '../types/strategy.js'
import type { TaskRequest } from '../types/shared.js'

const testDbPath = '/tmp/minions-test-store.json'

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
})
