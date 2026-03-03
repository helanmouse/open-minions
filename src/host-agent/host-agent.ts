import { Agent } from '@mariozechner/pi-agent-core'
import { getModel } from '@mariozechner/pi-ai'
import type { HostAgentOptions, TaskResult } from './types.js'
import { buildHostAgentSystemPrompt } from './prompts.js'
import type { DockerSandbox } from '../sandbox/docker.js'
import type { ContainerRegistry } from '../container/registry.js'
import type { TaskStore } from '../task/store.js'

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

    // TODO: Create tools
    const tools: any[] = []

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

    // TODO: Implement agent execution
    await this.agent.prompt(userPrompt)

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
  }

  private generateTaskId(): string {
    return Math.random().toString(36).substring(2, 15)
  }
}
