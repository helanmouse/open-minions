/**
 * Represents a container tracked by the registry.
 * Containers can be running, completed, failed, or preserved for debugging.
 */
export interface ContainerHandle {
  /** Unique container ID */
  id: string
  /** ID of the task this container is executing */
  taskId: string
  /** Current container status */
  status: 'running' | 'done' | 'failed' | 'preserved'
  /** Additional metadata about the container */
  metadata: {
    /** Retry attempt number (1-based) */
    attempt?: number
    /** Index in parallel execution (0-based) */
    parallelIndex?: number
    /** Reason for preservation (if status is 'preserved') */
    preserveReason?: string
    /** Snapshot ID if container was snapshotted */
    snapshotId?: string
    /** Exit code from container execution */
    exitCode?: number
    /** Run directory path for container execution */
    runDir?: string
    /** Error message if container failed unexpectedly */
    error?: string
  }
  /** Timestamp when container was created (milliseconds since epoch) */
  createdAt: number
  /** Timestamp when container was last updated (milliseconds since epoch) */
  updatedAt: number
}

/**
 * Registry for tracking all containers in the system.
 * Provides query capabilities for finding containers by task, status, etc.
 */
export class ContainerRegistry {
  private containers = new Map<string, ContainerHandle>()

  /**
   * Register a container in the registry.
   * @param container The container to register
   */
  register(container: ContainerHandle): void {
    const now = Date.now()
    const containerWithTimestamps = {
      ...container,
      createdAt: container.createdAt || now,
      updatedAt: container.updatedAt || now
    }
    this.containers.set(container.id, containerWithTimestamps)
  }

  /**
   * Remove a container from the registry.
   * @param containerId The container ID to unregister
   */
  unregister(containerId: string): void {
    this.containers.delete(containerId)
  }

  /**
   * Get a container by ID.
   * @param containerId The container ID
   * @returns The container or null if not found
   */
  get(containerId: string): ContainerHandle | null {
    return this.containers.get(containerId) || null
  }

  /**
   * List all registered containers.
   * @returns Array of all containers
   */
  list(): ContainerHandle[] {
    return Array.from(this.containers.values())
  }

  /**
   * Find all containers for a specific task.
   * @param taskId The task ID
   * @returns Array of containers for the task
   */
  findByTask(taskId: string): ContainerHandle[] {
    return this.list().filter(c => c.taskId === taskId)
  }

  /**
   * Find all preserved containers.
   * @returns Array of preserved containers
   */
  findPreserved(): ContainerHandle[] {
    return this.list().filter(c => c.status === 'preserved')
  }

  /**
   * Find containers older than specified hours.
   * @param hours Number of hours
   * @returns Array of old containers
   */
  findOlderThan(hours: number): ContainerHandle[] {
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000)
    return this.list().filter(c => c.createdAt < cutoffTime)
  }

  /**
   * Update a container's properties.
   * @param containerId The container ID to update
   * @param updates Partial container properties to update
   * @returns true if updated, false if container not found
   */
  update(containerId: string, updates: Partial<Omit<ContainerHandle, 'id' | 'createdAt'>>): boolean {
    const container = this.containers.get(containerId)
    if (!container) {
      return false
    }

    const updated = {
      ...container,
      ...updates,
      id: container.id, // Preserve original ID
      createdAt: container.createdAt, // Preserve creation time
      updatedAt: Date.now()
    }

    this.containers.set(containerId, updated)
    return true
  }
}
