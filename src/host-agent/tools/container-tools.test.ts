import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createStartContainerTool, createGetContainerStatusTool, createGetContainerJournalTool } from './container-tools.js'
import type { DockerSandbox } from '../../sandbox/docker.js'
import type { ContainerRegistry } from '../../container/registry.js'

describe('Container Tools', () => {
  let mockSandbox: DockerSandbox
  let mockRegistry: ContainerRegistry

  beforeEach(() => {
    mockSandbox = {
      start: vi.fn(),
      stop: vi.fn(),
      getStatus: vi.fn()
    } as any

    mockRegistry = {
      register: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      list: vi.fn()
    } as any
  })

  describe('start_container', () => {
    it('should start container and return ID', async () => {
      vi.mocked(mockSandbox.start).mockResolvedValue({ containerId: 'abc123' })

      const tool = createStartContainerTool(mockSandbox, mockRegistry)
      const result = await tool.execute('tool-call-1', {
        image: 'minion-base',
        taskDescription: 'test task'
      })

      expect(result.details.containerId).toBe('abc123')
      expect(result.details.status).toBe('running')
      expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.details) }])
      expect(mockRegistry.register).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'abc123',
          taskId: 'abc123',
          status: 'running'
        })
      )
    })

    it('should pass memory and cpus options', async () => {
      vi.mocked(mockSandbox.start).mockResolvedValue({ containerId: 'abc123' })

      const tool = createStartContainerTool(mockSandbox, mockRegistry)
      await tool.execute('tool-call-2', {
        image: 'minion-python',
        memory: '8g',
        cpus: 4,
        taskDescription: 'test task'
      })

      expect(mockSandbox.start).toHaveBeenCalledWith(
        expect.objectContaining({
          memory: '8g',
          cpus: 4
        })
      )
    })

    it('should reject invalid image names', async () => {
      const tool = createStartContainerTool(mockSandbox, mockRegistry)

      await expect(
        tool.execute('tool-call-3', {
          image: 'invalid image!',
          taskDescription: 'test task'
        })
      ).rejects.toThrow('Invalid image name')

      expect(mockSandbox.start).not.toHaveBeenCalled()
    })

    it('should handle sandbox.start failure', async () => {
      vi.mocked(mockSandbox.start).mockRejectedValue(new Error('Docker daemon not running'))

      const tool = createStartContainerTool(mockSandbox, mockRegistry)

      await expect(
        tool.execute('tool-call-4', {
          image: 'minion-base',
          taskDescription: 'test task'
        })
      ).rejects.toThrow('Failed to start container: Docker daemon not running')

      expect(mockRegistry.register).not.toHaveBeenCalled()
    })
  })

  describe('get_container_status', () => {
    it('should return container status', async () => {
      vi.mocked(mockRegistry.get).mockReturnValue({
        id: 'abc123',
        taskId: 'abc123',
        status: 'running',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {}
      })

      const tool = createGetContainerStatusTool(mockSandbox, mockRegistry)
      const result = await tool.execute('tool-call-5', {
        containerId: 'abc123'
      })

      expect(result.details.status).toBe('running')
      expect(result.details.exitCode).toBeUndefined()
    })

    it('should return exit code when available', async () => {
      vi.mocked(mockRegistry.get).mockReturnValue({
        id: 'abc123',
        taskId: 'abc123',
        status: 'completed',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: { exitCode: 0 }
      })

      const tool = createGetContainerStatusTool(mockSandbox, mockRegistry)
      const result = await tool.execute('tool-call-6', {
        containerId: 'abc123'
      })

      expect(result.details.status).toBe('completed')
      expect(result.details.exitCode).toBe(0)
    })

    it('should throw error for unknown container', async () => {
      vi.mocked(mockRegistry.get).mockReturnValue(undefined)

      const tool = createGetContainerStatusTool(mockSandbox, mockRegistry)

      await expect(
        tool.execute('tool-call-7', {
          containerId: 'unknown'
        })
      ).rejects.toThrow('Container unknown not found')
    })
  })

  describe('get_container_journal', () => {
    it('should return error when container not found', async () => {
      vi.mocked(mockRegistry.get).mockReturnValue(undefined)

      const tool = createGetContainerJournalTool(mockSandbox, mockRegistry)

      await expect(
        tool.execute('tool-call-8', {
          containerId: 'unknown'
        })
      ).rejects.toThrow('Container unknown not found')
    })

    it('should throw error when runDir not available', async () => {
      vi.mocked(mockRegistry.get).mockReturnValue({
        id: 'abc123',
        taskId: 'abc123',
        status: 'running',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {}
      })

      const tool = createGetContainerJournalTool(mockSandbox, mockRegistry)

      await expect(
        tool.execute('tool-call-9', {
          containerId: 'abc123'
        })
      ).rejects.toThrow('Container run directory not found')
    })
  })
})
