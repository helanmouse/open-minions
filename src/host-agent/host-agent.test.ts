import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HostAgent } from './host-agent.js'
import type { Model } from '@mariozechner/pi-ai'
import type { DockerSandbox } from '../sandbox/docker.js'
import type { ContainerRegistry } from '../container/registry.js'
import type { TaskStore } from '../task/store.js'

// Mock the Agent class to avoid actual LLM calls
let mockPrompt: any
let mockSubscribe: any
vi.mock('@mariozechner/pi-agent-core', () => ({
  Agent: class MockAgent {
    prompt = mockPrompt
    subscribe = mockSubscribe
  }
}))

describe('HostAgent', () => {
  let agent: HostAgent
  let mockLLM: Model<any>
  let mockSandbox: DockerSandbox
  let mockRegistry: ContainerRegistry
  let mockStore: TaskStore

  beforeEach(() => {
    // Reset mock prompt function
    mockPrompt = vi.fn().mockResolvedValue({
      role: 'assistant',
      content: 'Test response'
    })

    // Reset mock subscribe function
    mockSubscribe = vi.fn()

    // Mock Model<any> - needs to be a proper Model interface
    mockLLM = {
      provider: 'test-provider',
      modelId: 'test-model',
      api: 'openai-completions'
    } as any

    // Mock DockerSandbox
    mockSandbox = {
      start: vi.fn().mockResolvedValue({ containerId: 'test123' }),
      stop: vi.fn().mockResolvedValue(undefined),
      exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
      getStatus: vi.fn().mockResolvedValue({ status: 'running' })
    } as any

    // Mock ContainerRegistry
    mockRegistry = {
      register: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ id: 'test123', status: 'running' }),
      update: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockReturnValue([]),  // Changed from mockResolvedValue to mockReturnValue
      remove: vi.fn().mockResolvedValue(undefined)
    } as any

    // Mock TaskStore
    mockStore = {
      create: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ id: 'task123', status: 'pending' }),
      update: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([])
    } as any

    agent = new HostAgent({
      llm: mockLLM,
      sandbox: mockSandbox,
      registry: mockRegistry,
      store: mockStore,
      minionHome: '/tmp/minion'
    })
  })

  it('should create HostAgent instance', () => {
    expect(agent).toBeDefined()
    expect(agent).toBeInstanceOf(HostAgent)
  })

  it('should handle simple task', async () => {
    const result = await agent.run('修复 bug')

    expect(result.taskId).toBeDefined()
    expect(result.status).toBe('completed')
    expect(result.containers).toEqual([])
    expect(result.patches).toEqual({ applied: 0, failed: 0, conflicts: [] })
    expect(result.changes).toEqual({ branch: '', commits: 0, filesChanged: [] })
    expect(result.stats).toBeDefined()
    expect(result.stats.duration).toBeGreaterThanOrEqual(0)
    expect(result.journal).toBe('')
    expect(result.summary).toBe('Task completed - Agent orchestrated execution via tools')

    // Verify mock was called with correct prompt
    expect(mockPrompt).toHaveBeenCalledWith('修复 bug')
  })

  it('should handle errors and return failed status', async () => {
    const errorMessage = 'LLM API error'
    mockPrompt.mockRejectedValueOnce(new Error(errorMessage))

    const result = await agent.run('test task')

    expect(result.status).toBe('failed')
    expect(result.error).toBeDefined()
    expect(result.error).toContain(errorMessage)
    expect(result.taskId).toBeDefined()
  })

  it('should track execution time', async () => {
    const result = await agent.run('test task')

    expect(result.stats.duration).toBeGreaterThanOrEqual(0)
    expect(typeof result.stats.duration).toBe('number')
  })
})
