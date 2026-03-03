import type { DockerSandbox } from '../../sandbox/docker.js'
import type { ContainerRegistry } from '../../container/registry.js'

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
    execute: async (args: any) => {
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
        taskId: '',
        status: 'running',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {}
      })

      return {
        containerId: handle.containerId,
        status: 'running'
      }
    }
  }
}
