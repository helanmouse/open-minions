import { ContainerRegistry, ContainerHandle } from '../container/registry'

/**
 * Default container resource limits
 */
const DEFAULT_MEMORY = '4g'
const DEFAULT_CPUS = 2

/**
 * Configuration for starting a container.
 */
export interface ContainerConfig {
  /** Docker image to use */
  image: string
  /** Memory limit (e.g., "4g", "512m") */
  memory?: string
  /** Number of CPU cores */
  cpus?: number
  /** Environment variables */
  env?: Record<string, string>
}

/**
 * Minimal sandbox interface for container operations.
 * This will be replaced with the actual Sandbox type later.
 */
export interface SandboxLike {
  start(config: any): Promise<{ containerId: string }>
  stop(containerId: string): Promise<void>
}

/**
 * Tools for managing container lifecycle.
 * Wraps sandbox operations and automatically updates the registry.
 */
export class ContainerManagementTools {
  constructor(
    private sandbox: SandboxLike,
    private registry: ContainerRegistry
  ) {}

  /**
   * Start a new container and register it.
   * @param config Container configuration
   * @returns The registered container handle
   */
  async start_container(config: ContainerConfig): Promise<ContainerHandle> {
    const result = await this.sandbox.start({
      image: config.image,
      memory: config.memory || DEFAULT_MEMORY,
      cpus: config.cpus || DEFAULT_CPUS,
      env: config.env || {}
    })

    const container: ContainerHandle = {
      id: result.containerId,
      taskId: '', // Will be set by orchestrator
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {}
    }

    try {
      this.registry.register(container)
    } catch (error) {
      // Cleanup: stop the container if registration fails
      try {
        await this.sandbox.stop(result.containerId)
      } catch (stopError) {
        // Log but don't throw - we want to propagate the original error
      }
      throw error
    }

    return container
  }

  /**
   * Stop a container and update its status to 'done'.
   * @param containerId The container ID
   */
  async stop_container(containerId: string): Promise<void> {
    // Validate container exists
    const container = this.registry.get(containerId)
    if (!container) {
      throw new Error(`Container ${containerId} not found`)
    }

    try {
      await this.sandbox.stop(containerId)
    } catch (error) {
      // Log error but don't throw - we still want to update registry
      // In production, this would use a proper logger
    }

    // Always update registry even if stop fails
    this.registry.update(containerId, {
      status: 'done'
    })
  }

  /**
   * Preserve a container for debugging.
   * @param containerId The container ID
   * @param reason Reason for preservation
   */
  async preserve_container(containerId: string, reason: string): Promise<void> {
    // Validate container exists
    const container = this.registry.get(containerId)
    if (!container) {
      throw new Error(`Container ${containerId} not found`)
    }

    // Stop the container before marking as preserved
    await this.sandbox.stop(containerId)

    // Merge metadata instead of replacing
    this.registry.update(containerId, {
      status: 'preserved',
      metadata: {
        ...container.metadata,
        preserveReason: reason
      }
    })
  }

  /**
   * List all registered containers.
   * @returns Array of all containers
   */
  list_containers(): ContainerHandle[] {
    return this.registry.list()
  }
}
