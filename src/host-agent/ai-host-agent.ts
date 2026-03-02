import { PromptParser } from '../parser/prompt-parser'
import { ContainerRegistry } from '../container/registry'
import { ContainerManagementTools } from '../tools/container-tools'
import { TaskStore } from '../task/store'
import type { TaskRequest } from '../types/shared'

/**
 * Minimal LLM interface for AI orchestrator.
 */
export interface LLMAdapter {
  chat(messages: Array<{ role: string; content: string }>, tools: unknown[]): Promise<{ content: string }>
}

/**
 * Minimal Sandbox interface for AI orchestrator.
 */
export interface SandboxLike {
  start(config: any): Promise<{ containerId: string }>
  stop(containerId: string): Promise<void>
}

/**
 * Configuration options for AIHostAgent.
 */
export interface AIHostAgentOptions {
  /** LLM adapter for prompt parsing */
  llm: LLMAdapter
  /** Sandbox for container execution */
  sandbox: SandboxLike
  /** Task store for persistence */
  store: TaskStore
  /** Minion home directory */
  minionHome: string
}

/**
 * Result of task execution.
 */
export interface TaskResult {
  taskId: string
  status: 'completed' | 'failed' | 'partial'
  containers: Array<{ id: string; preserved?: boolean }>
  patches: { applied: number; failed: number; conflicts: string[] }
  changes: { branch: string; commits: number; filesChanged: string[] }
  stats: { duration: number; llmCalls: number; tokensUsed: number; retries: number }
  journal: string
  summary: string
  error?: string
}

/**
 * AI-powered host agent that orchestrates task execution.
 * Coordinates prompt parsing, container management, and task lifecycle.
 */
export class AIHostAgent {
  private parser: PromptParser
  private registry: ContainerRegistry
  private containerTools: ContainerManagementTools

  constructor(private options: AIHostAgentOptions) {
    this.parser = new PromptParser(options.llm)
    this.registry = new ContainerRegistry()
    this.containerTools = new ContainerManagementTools(
      options.sandbox,
      this.registry
    )
  }

  /**
   * Execute a task from a natural language prompt.
   * @param userPrompt The user's natural language prompt
   * @returns Task execution result
   */
  async run(userPrompt: string): Promise<TaskResult> {
    const startTime = Date.now()

    // 1. Parse prompt to extract task and strategy
    const { parsedTask, strategy } = await this.parser.parse(userPrompt)

    // 2. Create task request
    const taskId = this.generateTaskId()
    const request: TaskRequest = {
      id: taskId,
      description: userPrompt,
      parsedTask,
      strategy,
      repo: process.cwd(),
      repoType: 'local',
      branch: `minion/${taskId}`,
      baseBranch: 'main',
      push: false,
      maxIterations: 50,
      timeout: strategy.timeout,
      created_at: new Date().toISOString()
    }

    this.options.store.create(request)

    // 3. Execute task
    let containerId: string | undefined
    try {
      const container = await this.containerTools.start_container({
        image: strategy.customImage || 'minion-base',
        memory: strategy.memory,
        cpus: strategy.cpus
      })
      containerId = container.id

      // Update container with taskId
      this.registry.update(containerId, { taskId })

      // TODO: Wait for container completion, apply patches, etc.
      // For now, just return success

      const duration = Date.now() - startTime

      return {
        taskId,
        status: 'completed',
        containers: [{ id: containerId }],
        patches: { applied: 0, failed: 0, conflicts: [] },
        changes: { branch: request.branch, commits: 0, filesChanged: [] },
        stats: { duration, llmCalls: 1, tokensUsed: 0, retries: 0 },
        journal: '',
        summary: 'Task completed successfully'
      }
    } catch (error: any) {
      const duration = Date.now() - startTime

      // Preserve container if requested
      if (strategy.preserveOnFailure && containerId) {
        await this.containerTools.preserve_container(
          containerId,
          `Task failed: ${error.message}`
        )
      }

      return {
        taskId,
        status: 'failed',
        containers: containerId ? [{ id: containerId, preserved: strategy.preserveOnFailure }] : [],
        patches: { applied: 0, failed: 0, conflicts: [] },
        changes: { branch: request.branch, commits: 0, filesChanged: [] },
        stats: { duration, llmCalls: 1, tokensUsed: 0, retries: 0 },
        journal: '',
        summary: 'Task failed',
        error: error.message
      }
    }
  }

  /**
   * Generate a unique task ID.
   * @returns Random task ID
   */
  private generateTaskId(): string {
    return Math.random().toString(36).substring(2, 15)
  }
}
