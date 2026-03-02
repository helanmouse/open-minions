import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ContainerManagementTools } from './container-tools.js'
import { ContainerRegistry } from '../container/registry.js'

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
      cpus: 2
    })

    expect(handle.id).toBe('test-container-1')
    expect(handle.taskId).toBe('')
    expect(handle.status).toBe('running')
    expect(registry.get(handle.id)).toBeTruthy()
  })

  it('should preserve container with reason', async () => {
    const handle = await tools.start_container({
      image: 'minion-base'
    })

    await tools.preserve_container(handle.id, 'test failure')

    const container = registry.get(handle.id)
    expect(container?.status).toBe('preserved')
    expect(container?.metadata.preserveReason).toBe('test failure')
  })

  it('should stop container and update status', async () => {
    const handle = await tools.start_container({
      image: 'minion-base'
    })

    await tools.stop_container(handle.id)

    const container = registry.get(handle.id)
    expect(container?.status).toBe('done')
    expect(mockSandbox.stop).toHaveBeenCalledWith(handle.id)
  })

  it('should list all containers', async () => {
    await tools.start_container({ image: 'minion-base' })
    await tools.start_container({ image: 'minion-base' })

    const containers = tools.list_containers()
    expect(containers).toHaveLength(2)
  })

  describe('Error Handling', () => {
    it('should not register container if sandbox.start fails', async () => {
      mockSandbox.start.mockRejectedValueOnce(new Error('Failed to start'))

      await expect(tools.start_container({ image: 'minion-base' }))
        .rejects.toThrow('Failed to start')

      expect(registry.list()).toHaveLength(0)
    })

    it('should cleanup container if registry.register fails', async () => {
      const registrySpy = vi.spyOn(registry, 'register')
      registrySpy.mockImplementationOnce(() => {
        throw new Error('Registry error')
      })

      await expect(tools.start_container({ image: 'minion-base' }))
        .rejects.toThrow('Registry error')

      // Container should be stopped
      expect(mockSandbox.stop).toHaveBeenCalledWith('test-container-1')
    })

    it('should update registry even if sandbox.stop fails', async () => {
      const handle = await tools.start_container({ image: 'minion-base' })
      mockSandbox.stop.mockRejectedValueOnce(new Error('Stop failed'))

      await tools.stop_container(handle.id)

      const container = registry.get(handle.id)
      expect(container?.status).toBe('done')
    })

    it('should throw error if container does not exist when stopping', async () => {
      await expect(tools.stop_container('non-existent'))
        .rejects.toThrow('Container non-existent not found')
    })

    it('should throw error if container does not exist when preserving', async () => {
      await expect(tools.preserve_container('non-existent', 'reason'))
        .rejects.toThrow('Container non-existent not found')
    })
  })

  describe('preserve_container', () => {
    it('should stop container before marking as preserved', async () => {
      const handle = await tools.start_container({ image: 'minion-base' })

      await tools.preserve_container(handle.id, 'test failure')

      expect(mockSandbox.stop).toHaveBeenCalledWith(handle.id)
      const container = registry.get(handle.id)
      expect(container?.status).toBe('preserved')
    })

    it('should merge metadata instead of replacing', async () => {
      const handle = await tools.start_container({ image: 'minion-base' })

      // Add some metadata
      registry.update(handle.id, {
        metadata: { attempt: 1, parallelIndex: 2 }
      })

      await tools.preserve_container(handle.id, 'test failure')

      const container = registry.get(handle.id)
      expect(container?.metadata).toEqual({
        attempt: 1,
        parallelIndex: 2,
        preserveReason: 'test failure'
      })
    })
  })
})
