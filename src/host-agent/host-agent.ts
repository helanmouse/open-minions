import { Agent, type AgentTool } from '@mariozechner/pi-agent-core'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HostAgentOptions, TaskResult } from './types.js'
import { buildHostAgentSystemPrompt } from './prompts.js'
import type { DockerSandbox } from '../sandbox/docker.js'
import type { ContainerRegistry } from '../container/registry.js'
import type { TaskStore } from '../task/store.js'
import type { TaskContext } from '../types/shared.js'
import { createStartContainerTool, createGetContainerStatusTool, createGetContainerJournalTool } from './tools/container-tools.js'
import { createListPatchesTool, createApplyPatchesTool } from './tools/patch-tools.js'
import { createBranchTool, pushChangesTool } from './tools/git-tools.js'

export class HostAgent {
  private agent: Agent
  private sandbox: DockerSandbox
  private registry: ContainerRegistry
  private store: TaskStore
  private minionHome: string
  private currentRunDir: string = ''
  private currentRepoPath: string = ''

  constructor(options: HostAgentOptions) {
    this.sandbox = options.sandbox
    this.registry = options.registry
    this.store = options.store
    this.minionHome = options.minionHome

    // Create tools - they will access currentRunDir and currentRepoPath via closure
    const tools: AgentTool<any>[] = [
      createStartContainerTool(this.sandbox, this.registry, () => this.currentRunDir, () => this.currentRepoPath),
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

    // Track containers and results
    const containers: Array<{ id: string; preserved?: boolean }> = []
    let journal = ''
    let llmCalls = 0
    let tokensUsed = 0

    try {
      // Phase 1: Prepare run environment
      const runDir = join(this.minionHome, 'runs', taskId)
      mkdirSync(join(runDir, 'patches'), { recursive: true })

      // Set current context for tools to access
      this.currentRunDir = runDir
      this.currentRepoPath = process.cwd()

      // Phase 2: Write context.json for Sandbox Agent
      const context: TaskContext = {
        taskId,
        description: userPrompt,
        repoType: 'local',
        branch: `minion/${taskId}`,
        baseBranch: 'main',
        projectAnalysis: {},
        rules: [],
        maxIterations: 50,
        timeout: 30
      }
      writeFileSync(join(runDir, 'context.json'), JSON.stringify(context, null, 2))

      // Phase 3: Write .env for LLM credentials
      const llmProvider = process.env.LLM_PROVIDER || ''
      const llmModel = process.env.LLM_MODEL || ''
      const llmApiKey = process.env.LLM_API_KEY || ''
      const llmBaseUrl = process.env.LLM_BASE_URL || ''

      const quoteIfNeeded = (value: string) => {
        if (/[\s"'$`\\]/.test(value)) {
          return `"${value.replace(/"/g, '\\"')}"`
        }
        return value
      }

      writeFileSync(join(runDir, '.env'), [
        `LLM_PROVIDER=${quoteIfNeeded(llmProvider)}`,
        `LLM_MODEL=${quoteIfNeeded(llmModel)}`,
        `LLM_API_KEY=${quoteIfNeeded(llmApiKey)}`,
        `LLM_BASE_URL=${quoteIfNeeded(llmBaseUrl)}`
      ].join('\n'))

      // Phase 4: Subscribe to agent events to track LLM usage
      this.agent.subscribe((event: any) => {
        if (event.type === 'message_end') {
          llmCalls++
          if (event.message?.usage) {
            tokensUsed += (event.message.usage.input_tokens || 0) + (event.message.usage.output_tokens || 0)
          }
        }
      })

      // Phase 5: Execute the agent with the user prompt
      // The agent will autonomously decide which tools to call based on the system prompt
      await this.agent.prompt(userPrompt)

      // Phase 6: Extract results from agent's tool calls
      // The agent should have called tools and we can inspect the registry for containers
      const allContainers = this.registry.list()
      for (const container of allContainers) {
        containers.push({
          id: container.id,
          preserved: container.status === 'preserved'
        })

        // Try to get journal from the last container
        if (container.metadata.runDir) {
          try {
            const { readFileSync } = await import('fs')
            const { join } = await import('path')
            journal = readFileSync(join(container.metadata.runDir, 'journal.md'), 'utf-8')
          } catch {
            // Journal not available
          }
        }
      }

      // Return success result
      return {
        taskId,
        status: 'completed',
        containers,
        patches: { applied: 0, failed: 0, conflicts: [] },
        changes: { branch: '', commits: 0, filesChanged: [] },
        stats: {
          duration: Date.now() - startTime,
          llmCalls,
          tokensUsed
        },
        journal,
        summary: 'Task completed - Agent orchestrated execution via tools'
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        taskId,
        status: 'failed',
        containers,
        patches: { applied: 0, failed: 0, conflicts: [] },
        changes: { branch: '', commits: 0, filesChanged: [] },
        stats: {
          duration: Date.now() - startTime,
          llmCalls,
          tokensUsed
        },
        journal,
        summary: `Error: ${errorMessage}`,
        error: errorMessage
      }
    }
  }

  private generateTaskId(): string {
    return randomUUID()
  }

  private extractKeyParams(toolName: string, args: any): string {
    try {
      switch (toolName) {
        case 'start_container':
          return `image=${args.image || 'unknown'}`
        case 'get_container_status':
        case 'get_container_journal':
          return `containerId=${args.containerId || 'unknown'}`
        case 'list_patches':
          return `containerId=${args.containerId || 'unknown'}`
        case 'apply_patches':
          return `patches=${args.patches?.length || 0}`
        case 'create_branch':
          return `branchName=${args.branchName || 'unknown'}`
        case 'push_changes':
          return `branch=${args.branch || 'unknown'}`
        default:
          return ''
      }
    } catch {
      return ''
    }
  }
}
