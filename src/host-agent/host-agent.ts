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
import { parseExecutionStrategy, extractPromptEnvPairs } from './strategy-parser.js'
import { dockerTool, gitTool, tarTool } from './tools/native-tools.js'

interface HostRunOptions {
  runtimeEnv?: Record<string, string>
}

const PASSTHROUGH_RUNTIME_ENV_KEYS = new Set([
  'JAVA_HOME',
  'TZ',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
])

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

    // Create minimal native tools (shell-style)
    const tools: AgentTool<any>[] = [
      dockerTool,
      gitTool,
      tarTool,
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

  async run(userPrompt: string, runOptions: HostRunOptions = {}): Promise<TaskResult> {
    const startTime = Date.now()
    const taskId = this.generateTaskId()

    // Log task start
    console.error(`[host] Starting task: ${taskId}`)

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

      const strategy = parseExecutionStrategy(userPrompt)
      const promptEnv = extractPromptEnvPairs(userPrompt)
      const effectiveRuntimeEnv = this.buildRuntimeEnv(strategy, promptEnv, runOptions.runtimeEnv)

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
        timeout: 30,
        effectiveStrategy: strategy,
        forwardedEnv: effectiveRuntimeEnv,
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

      const runtimeEnvLines = Object.entries(effectiveRuntimeEnv)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${quoteIfNeeded(value)}`)

      writeFileSync(join(runDir, '.env'), [
        `LLM_PROVIDER=${quoteIfNeeded(llmProvider)}`,
        `LLM_MODEL=${quoteIfNeeded(llmModel)}`,
        `LLM_API_KEY=${quoteIfNeeded(llmApiKey)}`,
        `LLM_BASE_URL=${quoteIfNeeded(llmBaseUrl)}`,
        ...runtimeEnvLines,
      ].join('\n'))

      // Phase 4: Subscribe to agent events to track LLM usage and log execution
      this.agent.subscribe((event: any) => {
        try {
          if (event.type === 'tool_execution_start') {
            const toolName = event.toolName || 'unknown'
            const args = event.args || event.input || {}
            const keyParams = this.extractKeyParams(toolName, args)
            const paramsStr = keyParams ? ` ${keyParams}` : ''
            console.error(`[host:tool] ${toolName}${paramsStr}`)
          } else if (event.type === 'tool_execution_end') {
            const toolName = event.toolName || 'unknown'
            const hasError = event.isError || false
            console.error(`[host:tool_done] ${toolName} error=${hasError}`)
          } else if (event.type === 'message_end') {
            llmCalls++
            if (event.message?.usage) {
              tokensUsed += (event.message.usage.input_tokens || 0) + (event.message.usage.output_tokens || 0)
            }
            // Add message logging
            const msg = event.message
            const types = msg?.content?.map((c: any) => c.type).join(',') || ''
            console.error(`[host:msg] stopReason=${msg?.stopReason} types=${types}`)
          } else if (event.type === 'agent_end') {
            // Check for errors in last message
            const last = event.messages?.[event.messages.length - 1]
            if (last?.errorMessage) {
              console.error(`[host:error] ${last.errorMessage}`)
            }
            console.error(`[host:event] agent_end`)
          }
        } catch (e) {
          // Never let logging crash the agent
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
        case 'docker':
        case 'git':
        case 'tar':
          return `args=${args.args?.slice?.(0, 3)?.join(' ') || ''}`.trim()
        default:
          return ''
      }
    } catch {
      return ''
    }
  }

  private strategyToEnv(strategy: ReturnType<typeof parseExecutionStrategy>): Record<string, string> {
    const env: Record<string, string> = {}
    if (strategy.preserveOnFailure) env.MINION_PRESERVE_ON_FAILURE = 'true'
    if (strategy.snapshotMode) env.MINION_SNAPSHOT_MODE = strategy.snapshotMode
    if (strategy.retryEnabled) env.MINION_RETRY_ENABLED = 'true'
    if (strategy.retryMax) env.MINION_RETRY_MAX = String(strategy.retryMax)
    if (strategy.parallelRuns > 1) env.MINION_PARALLEL_RUNS = String(strategy.parallelRuns)
    if (strategy.autoApply) env.MINION_AUTO_APPLY = 'true'
    if (strategy.memory) env.SANDBOX_MEMORY = strategy.memory
    if (strategy.cpus) env.SANDBOX_CPUS = String(strategy.cpus)
    return env
  }

  private buildRuntimeEnv(
    strategy: ReturnType<typeof parseExecutionStrategy>,
    promptEnv: Record<string, string>,
    explicitRuntimeEnv?: Record<string, string>,
  ): Record<string, string> {
    const defaults = this.defaultRuntimeEnv()
    const strategyEnv = this.strategyToEnv(strategy)
    const processExplicitEnv = this.extractProcessRuntimeEnv()

    return {
      ...defaults,
      ...strategyEnv,
      ...promptEnv,
      ...processExplicitEnv,
      ...(explicitRuntimeEnv ?? {}),
    }
  }

  private defaultRuntimeEnv(): Record<string, string> {
    return {}
  }

  private extractProcessRuntimeEnv(): Record<string, string> {
    const runtimeEnv: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value !== 'string' || value.length === 0) continue
      if (
        key.startsWith('MINION_')
        || key.startsWith('SANDBOX_')
        || PASSTHROUGH_RUNTIME_ENV_KEYS.has(key)
      ) {
        runtimeEnv[key] = value
      }
    }
    return runtimeEnv
  }
}
