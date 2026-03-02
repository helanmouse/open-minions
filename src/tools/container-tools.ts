import { ContainerRegistry, ContainerHandle } from '../container/registry'

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
   * @param taskId Task ID this container is executing
   * @returns The registered container handle
   */
  async start_container(config: ContainerConfig, taskId: string): Promise<ContainerHandle> {
    const result = await this.sandbox.start({
      image: config.image,
      memory: config.memory || '4g',
      cpus: config.cpus || 2,
      env: config.env || {}
    })

    const container: ContainerHandle = {
      id: result.containerId,
      taskId: taskId,
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {}
    }

    this.registry.register(container)
    return container
  }

  /**
   * Stop a container and update its status to 'done'.
   * @param containerId The container ID
   */
  async stop_container(containerId: string): Promise<void> {
    await this.sandbox.stop(containerId)

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
    this.registry.update(containerId, {
      status: 'preserved',
      metadata: { preserveReason: reason }
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
