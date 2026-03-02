import { describe, it, expect, beforeEach } from 'vitest'
import { ContainerRegistry } from './registry'

describe('ContainerRegistry', () => {
  let registry: ContainerRegistry

  beforeEach(() => {
    registry = new ContainerRegistry()
  })

  it('should register and retrieve container', () => {
    const now = Date.now()
    const container = {
      id: 'container-123',
      taskId: 'task-456',
      status: 'running' as const,
      metadata: { attempt: 1 },
      createdAt: now,
      updatedAt: now
    }

    registry.register(container)
    const retrieved = registry.get('container-123')

    expect(retrieved?.id).toBe('container-123')
    expect(retrieved?.taskId).toBe('task-456')
    expect(retrieved?.createdAt).toBe(now)
    expect(retrieved?.updatedAt).toBe(now)
  })

  it('should find containers by task', () => {
    const now = Date.now()
    registry.register({ id: 'c1', taskId: 't1', status: 'running', metadata: {}, createdAt: now, updatedAt: now })
    registry.register({ id: 'c2', taskId: 't1', status: 'done', metadata: {}, createdAt: now, updatedAt: now })
    registry.register({ id: 'c3', taskId: 't2', status: 'running', metadata: {}, createdAt: now, updatedAt: now })

    const containers = registry.findByTask('t1')
    expect(containers).toHaveLength(2)
  })

  it('should find preserved containers', () => {
    const now = Date.now()
    registry.register({
      id: 'c1',
      taskId: 't1',
      status: 'preserved',
      metadata: { preserveReason: 'user requested' },
      createdAt: now,
      updatedAt: now
    })
    registry.register({ id: 'c2', taskId: 't2', status: 'done', metadata: {}, createdAt: now, updatedAt: now })

    const preserved = registry.findPreserved()
    expect(preserved).toHaveLength(1)
    expect(preserved[0].id).toBe('c1')
  })

  it('should update container status and metadata', () => {
    const now = Date.now()
    registry.register({
      id: 'c1',
      taskId: 't1',
      status: 'running',
      metadata: { attempt: 1 },
      createdAt: now,
      updatedAt: now
    })

    const updated = registry.update('c1', {
      status: 'done',
      metadata: { attempt: 1, snapshotId: 'snap-123' }
    })

    expect(updated).toBe(true)
    const container = registry.get('c1')
    expect(container?.status).toBe('done')
    expect(container?.metadata.snapshotId).toBe('snap-123')
    expect(container?.createdAt).toBe(now)
    expect(container?.updatedAt).toBeGreaterThanOrEqual(now)
  })

  it('should return false when updating non-existent container', () => {
    const updated = registry.update('non-existent', { status: 'done' })
    expect(updated).toBe(false)
  })

  it('should preserve id and createdAt when updating', () => {
    const now = Date.now()
    registry.register({
      id: 'c1',
      taskId: 't1',
      status: 'running',
      metadata: {},
      createdAt: now,
      updatedAt: now
    })

    registry.update('c1', {
      id: 'should-be-ignored' as any,
      createdAt: 999 as any,
      status: 'done'
    })

    const container = registry.get('c1')
    expect(container?.id).toBe('c1')
    expect(container?.createdAt).toBe(now)
  })

  it('should unregister container', () => {
    const now = Date.now()
    registry.register({
      id: 'c1',
      taskId: 't1',
      status: 'running',
      metadata: {},
      createdAt: now,
      updatedAt: now
    })

    expect(registry.get('c1')).not.toBeNull()
    registry.unregister('c1')
    expect(registry.get('c1')).toBeNull()
  })

  it('should list all containers', () => {
    const now = Date.now()
    registry.register({ id: 'c1', taskId: 't1', status: 'running', metadata: {}, createdAt: now, updatedAt: now })
    registry.register({ id: 'c2', taskId: 't2', status: 'done', metadata: {}, createdAt: now, updatedAt: now })
    registry.register({ id: 'c3', taskId: 't3', status: 'failed', metadata: {}, createdAt: now, updatedAt: now })

    const all = registry.list()
    expect(all).toHaveLength(3)
    expect(all.map(c => c.id).sort()).toEqual(['c1', 'c2', 'c3'])
  })

  it('should find containers older than specified hours', () => {
    const now = Date.now()
    const twoHoursAgo = now - (2 * 60 * 60 * 1000)
    const fourHoursAgo = now - (4 * 60 * 60 * 1000)

    registry.register({ id: 'c1', taskId: 't1', status: 'running', metadata: {}, createdAt: fourHoursAgo, updatedAt: fourHoursAgo })
    registry.register({ id: 'c2', taskId: 't2', status: 'done', metadata: {}, createdAt: twoHoursAgo, updatedAt: twoHoursAgo })
    registry.register({ id: 'c3', taskId: 't3', status: 'running', metadata: {}, createdAt: now, updatedAt: now })

    const oldContainers = registry.findOlderThan(3)
    expect(oldContainers).toHaveLength(1)
    expect(oldContainers[0].id).toBe('c1')
  })

  it('should return empty array when no containers are old enough', () => {
    const now = Date.now()
    registry.register({ id: 'c1', taskId: 't1', status: 'running', metadata: {}, createdAt: now, updatedAt: now })

    const oldContainers = registry.findOlderThan(1)
    expect(oldContainers).toHaveLength(0)
  })
})
