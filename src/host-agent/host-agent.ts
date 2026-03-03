import { Agent, type AgentTool } from '@mariozechner/pi-agent-core'
import { randomUUID } from 'node:crypto'
import type { HostAgentOptions, TaskResult } from './types.js'
import { buildHostAgentSystemPrompt } from './prompts.js'
import type { DockerSandbox } from '../sandbox/docker.js'
import type { ContainerRegistry } from '../container/registry.js'
import type { TaskStore } from '../task/store.js'
import { createStartContainerTool, createGetContainerStatusTool, createGetContainerJournalTool } from './tools/container-tools.js'
import { createListPatchesTool, createApplyPatchesTool } from './tools/patch-tools.js'
import { createBranchTool, pushChangesTool } from './tools/git-tools.js'

export class HostAgent {
  private agent: Agent
  private sandbox: DockerSandbox
  private registry: ContainerRegistry
  private store: TaskStore
  private minionHome: string

  constructor(options: HostAgentOptions) {
    this.sandbox = options.sandbox
    this.registry = options.registry
    this.store = options.store
    this.minionHome = options.minionHome

    // Create tools
    const tools: AgentTool<any>[] = [
      createStartContainerTool(this.sandbox, this.registry),
      createGetContainerStatusTool(this.sandbox, this.registry),
      createGetContainerJournalTool(this.sandbox, this.registry),
      createListPatchesTool(this.registry),
      createApplyPatchesTool(),
      createBranchTool,
      pushChangesTool
    ]

    // Build system prompt
    const systemPrompt = buildHostAgentSystemPrompt()

    // Create Agent
    this.agent = new Agent({
      initialState: {
        systemPrompt,
        model: options.llm,
        tools
      }
    })
  }

  async run(userPrompt: string): Promise<TaskResult> {
    const startTime = Date.now()
    const taskId = this.generateTaskId()

    try {
      // TODO: Implement agent execution
      await this.agent.prompt(userPrompt)

      // Placeholder return - will be replaced with actual implementation in later tasks
      return {
        taskId,
        status: 'completed',
        containers: [],
        patches: { applied: 0, failed: 0, conflicts: [] },
        changes: { branch: '', commits: 0, filesChanged: [] },
        stats: { duration: Date.now() - startTime, llmCalls: 0, tokensUsed: 0 },
        journal: '',
        summary: 'Not implemented yet'
      }
    } catch (error) {
      return {
        taskId,
        status: 'failed',
        containers: [],
        patches: { applied: 0, failed: 0, conflicts: [] },
        changes: { branch: '', commits: 0, filesChanged: [] },
        stats: { duration: Date.now() - startTime, llmCalls: 0, tokensUsed: 0 },
        journal: '',
        summary: `Error: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  private generateTaskId(): string {
    return randomUUID()
  }
}
