import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AIHostAgent } from './ai-host-agent.js'
import { TaskStore } from '../task/store.js'
import { tmpdir } from 'os'
import { join } from 'path'

describe('AIHostAgent', () => {
  let agent: AIHostAgent
  let mockLLM: any
  let mockSandbox: any
  let store: TaskStore
  let testDbPath: string

  beforeEach(() => {
    testDbPath = join(tmpdir(), 'minions-test-ai-agent.json')
    store = new TaskStore(testDbPath)

    mockLLM = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          task: 'create hello.py',
          strategy: {}
        })
      })
    }

    mockSandbox = {
      start: vi.fn().mockResolvedValue({ containerId: 'test-container-123' }),
      stop: vi.fn().mockResolvedValue(undefined)
    }

    agent = new AIHostAgent({
      llm: mockLLM,
      sandbox: mockSandbox,
      store,
      minionHome: '/tmp/test'
    })
  })

  it('should parse prompt and execute task', async () => {
    const result = await agent.run('create hello.py')

    expect(result.status).toBe('completed')
    expect(result.taskId).toBeDefined()
    expect(mockLLM.chat).toHaveBeenCalled()
    expect(mockSandbox.start).toHaveBeenCalled()
  })

  it('should preserve container on failure when requested', async () => {
    mockLLM.chat.mockResolvedValue({
      content: JSON.stringify({
        task: 'create invalid code',
        strategy: { preserveOnFailure: true }
      })
    })

    mockSandbox.start.mockRejectedValue(new Error('Container failed'))

    const result = await agent.run('create invalid code, preserve container if failed')

    expect(result.status).toBe('failed')
    expect(result.error).toContain('Container failed')
  })

  it('should create task in store', async () => {
    const result = await agent.run('create hello.py')

    const task = store.get(result.taskId)
    expect(task).toBeDefined()
    expect(task?.request.description).toBe('create hello.py')
  })
})
