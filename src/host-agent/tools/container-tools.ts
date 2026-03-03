import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import { Type, type Static } from '@sinclair/typebox'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { DockerSandbox } from '../../sandbox/docker.js'
import type { ContainerRegistry } from '../../container/registry.js'

interface StartContainerResult {
  containerId: string
  status: 'running'
}

interface GetContainerStatusResult {
  status: string
  exitCode?: number
}

interface GetContainerJournalResult {
  journal: string
}

const StartContainerSchema = Type.Object({
  image: Type.String({ description: 'Docker image name (e.g., "minion-base", "minion-python")' }),
  memory: Type.Optional(Type.String({ description: 'Memory limit (e.g., "4g", "2g")' })),
  cpus: Type.Optional(Type.Number({ description: 'Number of CPU cores' })),
  taskDescription: Type.String({ description: 'Task description to pass to sandbox agent' })
})

const GetContainerStatusSchema = Type.Object({
  containerId: Type.String({ description: 'Container ID' })
})

const GetContainerJournalSchema = Type.Object({
  containerId: Type.String({ description: 'Container ID' })
})

export function createStartContainerTool(
  sandbox: DockerSandbox,
  registry: ContainerRegistry,
  getRunDir: () => string,
  getRepoPath: () => string
): AgentTool<typeof StartContainerSchema> {
  return {
    name: 'start_container',
    label: 'start_container',
    description: 'Start a Docker container to execute the task',
    parameters: StartContainerSchema,
    execute: async (_id: string, args: Static<typeof StartContainerSchema>): Promise<AgentToolResult<StartContainerResult>> => {
      try {
        // Validate image name
        const imagePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
        if (!imagePattern.test(args.image)) {
          throw new Error(`Invalid image name: ${args.image}. Must start with alphanumeric and contain only alphanumeric characters, dots, hyphens, and underscores.`)
        }

        const runDir = getRunDir()
        const repoPath = getRepoPath()

        if (!runDir) {
          throw new Error('Run directory not initialized. This is an internal error.')
        }

        const config = {
          image: args.image,
          repoPath,
          runDir,
          memory: args.memory || '4g',
          cpus: args.cpus || 2,
          network: 'bridge'
        }

        const handle = await sandbox.start(config)

        registry.register({
          id: handle.containerId,
          taskId: handle.containerId,
          status: 'running',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metadata: { runDir }
        })

        const result = {
          containerId: handle.containerId,
          status: 'running' as const
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          details: result
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
): AgentTool<typeof GetContainerStatusSchema> {
  return {
    name: 'get_container_status',
    label: 'get_container_status',
    description: 'Check container execution status',
    parameters: GetContainerStatusSchema,
    execute: async (_id: string, args: Static<typeof GetContainerStatusSchema>): Promise<AgentToolResult<GetContainerStatusResult>> => {
      const container = registry.get(args.containerId)
      if (!container) {
        throw new Error(`Container ${args.containerId} not found`)
      }

      // TODO: Check actual container status from Docker
      // For now, return registry status
      const result = {
        status: container.status,
        exitCode: container.metadata.exitCode ?? undefined
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        details: result
      }
    }
  }
}

export function createGetContainerJournalTool(
  sandbox: DockerSandbox,
  registry: ContainerRegistry
): AgentTool<typeof GetContainerJournalSchema> {
  return {
    name: 'get_container_journal',
    label: 'get_container_journal',
    description: 'Get the journal (execution log) from sandbox agent. CRITICAL: Always read this after container completes to understand what happened.',
    parameters: GetContainerJournalSchema,
    execute: async (_id: string, args: Static<typeof GetContainerJournalSchema>): Promise<AgentToolResult<GetContainerJournalResult>> => {
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
        const result = { journal }
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          details: result
        }
      } catch (error) {
        const result = { journal: `Error reading journal: ${error instanceof Error ? error.message : String(error)}` }
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          details: result
        }
      }
    }
  }
}
