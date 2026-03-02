import { describe, it, expect, beforeEach } from 'vitest'
import { ContainerRegistry } from './registry'

describe('ContainerRegistry', () => {
  let registry: ContainerRegistry

  beforeEach(() => {
    registry = new ContainerRegistry()
  })

  it('should register and retrieve container', () => {
    const container = {
      id: 'container-123',
      taskId: 'task-456',
      status: 'running' as const,
      metadata: { attempt: 1 }
    }

    registry.register(container)
    const retrieved = registry.get('container-123')

    expect(retrieved?.id).toBe('container-123')
    expect(retrieved?.taskId).toBe('task-456')
  })

  it('should find containers by task', () => {
    registry.register({ id: 'c1', taskId: 't1', status: 'running', metadata: {} })
    registry.register({ id: 'c2', taskId: 't1', status: 'done', metadata: {} })
    registry.register({ id: 'c3', taskId: 't2', status: 'running', metadata: {} })

    const containers = registry.findByTask('t1')
    expect(containers).toHaveLength(2)
  })

  it('should find preserved containers', () => {
    registry.register({
      id: 'c1',
      taskId: 't1',
      status: 'preserved',
      metadata: { preserveReason: 'user requested' }
    })
    registry.register({ id: 'c2', taskId: 't2', status: 'done', metadata: {} })

    const preserved = registry.findPreserved()
    expect(preserved).toHaveLength(1)
    expect(preserved[0].id).toBe('c1')
  })
})
