import type { DockerSandbox } from '../../sandbox/docker.js'
import type { ContainerRegistry } from '../../container/registry.js'

interface StartContainerArgs {
  image: string
  memory?: string
  cpus?: number
  taskDescription: string
}

interface StartContainerResult {
  containerId: string
  status: 'running'
}

export function createStartContainerTool(
  sandbox: DockerSandbox,
  registry: ContainerRegistry
) {
  return {
    name: 'start_container',
    description: 'Start a Docker container to execute the task',
    parameters: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          description: 'Docker image name (e.g., "minion-base", "minion-python")'
        },
        memory: {
          type: 'string',
          description: 'Memory limit (e.g., "4g", "2g")'
        },
        cpus: {
          type: 'number',
          description: 'Number of CPU cores'
        },
        taskDescription: {
          type: 'string',
          description: 'Task description to pass to sandbox agent'
        }
      },
      required: ['image', 'taskDescription']
    },
    execute: async (args: StartContainerArgs): Promise<StartContainerResult> => {
      try {
        // Validate image name
        const imagePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
        if (!imagePattern.test(args.image)) {
          throw new Error(`Invalid image name: ${args.image}. Must start with alphanumeric and contain only alphanumeric characters, dots, hyphens, and underscores.`)
        }

        const config = {
          image: args.image,
          repoPath: process.cwd(),
          runDir: `/tmp/minion-run-${Date.now()}`,
          memory: args.memory || '4g',
          cpus: args.cpus || 2,
          env: {
            TASK_DESCRIPTION: args.taskDescription
          }
        }

        const handle = await sandbox.start(config)

        registry.register({
          id: handle.containerId,
          taskId: handle.containerId,
          status: 'running',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metadata: { runDir: config.runDir }
        })

        return {
          containerId: handle.containerId,
          status: 'running'
        }
      } catch (error) {
        throw new Error(`Failed to start container: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}
