import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ContainerManagementTools } from './container-tools'
import { ContainerRegistry } from '../container/registry'

describe('ContainerManagementTools', () => {
  let tools: ContainerManagementTools
  let registry: ContainerRegistry
  let mockSandbox: any

  beforeEach(() => {
    registry = new ContainerRegistry()

    // Mock sandbox with minimal interface
    // Use a counter to generate unique container IDs
    let containerCounter = 0
    mockSandbox = {
      start: vi.fn().mockImplementation(async () => ({
        containerId: `test-container-${++containerCounter}`
      })),
      stop: vi.fn().mockResolvedValue(undefined)
    }

    tools = new ContainerManagementTools(mockSandbox, registry)
  })

  it('should start container and register it', async () => {
    const handle = await tools.start_container({
      image: 'minion-base',
      memory: '4g',
      cpus: 2,
      taskId: 'task-456'
    })

    expect(handle.id).toBe('test-container-1')
    expect(handle.taskId).toBe('task-456')
    expect(handle.status).toBe('running')
    expect(registry.get(handle.id)).toBeTruthy()
  })

  it('should preserve container with reason', async () => {
    const handle = await tools.start_container({
      image: 'minion-base',
      taskId: 'task-456'
    })

    await tools.preserve_container(handle.id, 'test failure')

    const container = registry.get(handle.id)
    expect(container?.status).toBe('preserved')
    expect(container?.metadata.preserveReason).toBe('test failure')
  })

  it('should stop container and update status', async () => {
    const handle = await tools.start_container({
      image: 'minion-base',
      taskId: 'task-456'
    })

    await tools.stop_container(handle.id)

    const container = registry.get(handle.id)
    expect(container?.status).toBe('done')
    expect(mockSandbox.stop).toHaveBeenCalledWith(handle.id)
  })

  it('should list all containers', async () => {
    await tools.start_container({ image: 'minion-base', taskId: 't1' })
    await tools.start_container({ image: 'minion-base', taskId: 't2' })

    const containers = tools.list_containers()
    expect(containers).toHaveLength(2)
  })
})
