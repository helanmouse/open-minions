import { readFileSync } from 'fs'
import { join } from 'path'
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

interface GetContainerStatusArgs {
  containerId: string
}

interface GetContainerStatusResult {
  status: string
  exitCode?: number
}

interface GetContainerJournalArgs {
  containerId: string
}

interface GetContainerJournalResult {
  journal: string
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

export function createGetContainerStatusTool(
  sandbox: DockerSandbox,
  registry: ContainerRegistry
) {
  return {
    name: 'get_container_status',
    description: 'Check container execution status',
    parameters: {
      type: 'object',
      properties: {
        containerId: {
          type: 'string',
          description: 'Container ID'
        }
      },
      required: ['containerId']
    },
    execute: async (args: GetContainerStatusArgs): Promise<GetContainerStatusResult> => {
      const container = registry.get(args.containerId)
      if (!container) {
        throw new Error(`Container ${args.containerId} not found`)
      }

      // TODO: Check actual container status from Docker
      // For now, return registry status
      return {
        status: container.status,
        exitCode: container.metadata.exitCode ?? undefined
      }
    }
  }
}

export function createGetContainerJournalTool(
  sandbox: DockerSandbox,
  registry: ContainerRegistry
) {
  return {
    name: 'get_container_journal',
    description: 'Get the journal (execution log) from sandbox agent. CRITICAL: Always read this after container completes to understand what happened.',
    parameters: {
      type: 'object',
      properties: {
        containerId: {
          type: 'string',
          description: 'Container ID'
        }
      },
      required: ['containerId']
    },
    execute: async (args: GetContainerJournalArgs): Promise<GetContainerJournalResult> => {
      const container = registry.get(args.containerId)
      if (!container) {
        throw new Error(`Container ${args.containerId} not found`)
      }

      // Read journal from container's run directory
      const runDir = container.metadata.runDir
      if (!runDir) {
        throw new Error('Container run directory not found')
      }

      try {
        const journalPath = join(runDir, 'journal.md')
        const journal = readFileSync(journalPath, 'utf-8')
        return { journal }
      } catch (error: any) {
        return { journal: `Error reading journal: ${error.message}` }
      }
    }
  }
}
