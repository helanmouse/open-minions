import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createStartContainerTool, createGetContainerStatusTool, createGetContainerJournalTool } from './container-tools.js'
import type { DockerSandbox } from '../../sandbox/docker.js'
import type { ContainerRegistry } from '../../container/registry.js'

// Mock the fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn()
}))

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
      const mockHandle = {
        containerId: 'abc123',
        logs: vi.fn(),
        wait: vi.fn().mockResolvedValue({ exitCode: 0 }),
        stop: vi.fn()
      }
      vi.mocked(mockSandbox.start).mockResolvedValue(mockHandle)

      const getRunDir = () => '/tmp/test-run'
      const getRepoPath = () => '/tmp/test-repo'
      const tool = createStartContainerTool(mockSandbox, mockRegistry, getRunDir, getRepoPath)
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
      const mockHandle = {
        containerId: 'abc123',
        logs: vi.fn(),
        wait: vi.fn().mockResolvedValue({ exitCode: 0 }),
        stop: vi.fn()
      }
      vi.mocked(mockSandbox.start).mockResolvedValue(mockHandle)

      const getRunDir = () => '/tmp/test-run'
      const getRepoPath = () => '/tmp/test-repo'
      const tool = createStartContainerTool(mockSandbox, mockRegistry, getRunDir, getRepoPath)
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
      const getRunDir = () => '/tmp/test-run'
      const getRepoPath = () => '/tmp/test-repo'
      const tool = createStartContainerTool(mockSandbox, mockRegistry, getRunDir, getRepoPath)

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

      const getRunDir = () => '/tmp/test-run'
      const getRepoPath = () => '/tmp/test-repo'
      const tool = createStartContainerTool(mockSandbox, mockRegistry, getRunDir, getRepoPath)

      await expect(
        tool.execute('tool-call-4', {
          image: 'minion-base',
          taskDescription: 'test task'
        })
      ).rejects.toThrow('Failed to start container: Docker daemon not running')

      expect(mockRegistry.register).not.toHaveBeenCalled()
    })

    it('should update registry when container completes successfully', async () => {
      // Create a Promise that we can resolve manually
      let resolveWait: (value: { exitCode: number }) => void
      const waitPromise = new Promise<{ exitCode: number }>((resolve) => {
        resolveWait = resolve
      })

      const mockHandle = {
        containerId: 'test-container-123',
        logs: vi.fn(),
        wait: vi.fn().mockReturnValue(waitPromise),
        stop: vi.fn()
      }

      vi.mocked(mockSandbox.start).mockResolvedValue(mockHandle)

      const tool = createStartContainerTool(
        mockSandbox,
        mockRegistry,
        () => '/test/run',
        () => '/test/repo'
      )

      // Start container
      await tool.execute('test-id', {
        image: 'minion-base',
        taskDescription: 'test task'
      })

      // Verify initial status is 'running'
      expect(mockRegistry.register).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'running' })
      )

      // Simulate container completion
      resolveWait!({ exitCode: 0 })

      // Wait for background Promise to resolve
      await new Promise(resolve => setTimeout(resolve, 10))

      // Verify registry was updated to 'done'
      expect(mockRegistry.update).toHaveBeenCalledWith(
        'test-container-123',
        expect.objectContaining({
          status: 'done',
          metadata: expect.objectContaining({ exitCode: 0 })
        })
      )
    })

    it('should update registry when container fails', async () => {
      let resolveWait: (value: { exitCode: number }) => void
      const waitPromise = new Promise<{ exitCode: number }>((resolve) => {
        resolveWait = resolve
      })

      const mockHandle = {
        containerId: 'test-container-456',
        logs: vi.fn(),
        wait: vi.fn().mockReturnValue(waitPromise),
        stop: vi.fn()
      }

      vi.mocked(mockSandbox.start).mockResolvedValue(mockHandle)

      const tool = createStartContainerTool(
        mockSandbox,
        mockRegistry,
        () => '/test/run',
        () => '/test/repo'
      )

      await tool.execute('test-id', {
        image: 'minion-base',
        taskDescription: 'test task'
      })

      // Simulate container failure
      resolveWait!({ exitCode: 1 })

      await new Promise(resolve => setTimeout(resolve, 10))

      // Verify registry was updated to 'failed'
      expect(mockRegistry.update).toHaveBeenCalledWith(
        'test-container-456',
        expect.objectContaining({
          status: 'failed',
          metadata: expect.objectContaining({ exitCode: 1 })
        })
      )
    })

    it('should handle errors in background monitoring', async () => {
      const waitPromise = Promise.reject(new Error('Docker daemon crashed'))

      const mockHandle = {
        containerId: 'test-container-789',
        logs: vi.fn(),
        wait: vi.fn().mockReturnValue(waitPromise),
        stop: vi.fn()
      }

      vi.mocked(mockSandbox.start).mockResolvedValue(mockHandle)

      const tool = createStartContainerTool(
        mockSandbox,
        mockRegistry,
        () => '/test/run',
        () => '/test/repo'
      )

      await tool.execute('test-id', {
        image: 'minion-base',
        taskDescription: 'test task'
      })

      await new Promise(resolve => setTimeout(resolve, 10))

      // Verify registry was updated to 'failed' with error
      expect(mockRegistry.update).toHaveBeenCalledWith(
        'test-container-789',
        expect.objectContaining({
          status: 'failed',
          metadata: expect.objectContaining({
            exitCode: -1,
            error: 'Docker daemon crashed'
          })
        })
      )
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
        status: 'done',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: { exitCode: 0 }
      })

      const tool = createGetContainerStatusTool(mockSandbox, mockRegistry)
      const result = await tool.execute('tool-call-6', {
        containerId: 'abc123'
      })

      expect(result.details.status).toBe('done')
      expect(result.details.exitCode).toBe(0)
    })

    it('should throw error for unknown container', async () => {
      vi.mocked(mockRegistry.get).mockReturnValue(null)

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
      vi.mocked(mockRegistry.get).mockReturnValue(null)

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

    it('should successfully read journal file', async () => {
      const { readFileSync } = await import('fs')
      const mockJournalContent = '# Task Journal\n\nTask completed successfully.'

      vi.mocked(mockRegistry.get).mockReturnValue({
        id: 'abc123',
        taskId: 'abc123',
        status: 'running',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: { runDir: '/tmp/minion-abc123' }
      })

      vi.mocked(readFileSync).mockReturnValue(mockJournalContent)

      const tool = createGetContainerJournalTool(mockSandbox, mockRegistry)
      const result = await tool.execute('tool-call-10', {
        containerId: 'abc123'
      })

      expect(result.details.journal).toBe(mockJournalContent)
      expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ journal: mockJournalContent }) }])
      expect(readFileSync).toHaveBeenCalledWith('/tmp/minion-abc123/journal.md', 'utf-8')
    })

    it('should handle journal file read errors', async () => {
      const { readFileSync } = await import('fs')

      vi.mocked(mockRegistry.get).mockReturnValue({
        id: 'abc123',
        taskId: 'abc123',
        status: 'running',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: { runDir: '/tmp/minion-abc123' }
      })

      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('EACCES: permission denied')
      })

      const tool = createGetContainerJournalTool(mockSandbox, mockRegistry)
      const result = await tool.execute('tool-call-11', {
        containerId: 'abc123'
      })

      expect(result.details.journal).toBe('Error reading journal: EACCES: permission denied')
      expect(result.content).toEqual([{
        type: 'text',
        text: JSON.stringify({ journal: 'Error reading journal: EACCES: permission denied' })
      }])
    })
  })
})
