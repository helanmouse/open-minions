import type { Model } from '@mariozechner/pi-ai'
import type { DockerSandbox } from '../sandbox/docker.js'
import type { ContainerRegistry } from '../container/registry.js'
import type { TaskStore } from '../task/store.js'

export interface HostAgentOptions {
  llm: Model<any>
  sandbox: DockerSandbox
  registry: ContainerRegistry
  store: TaskStore
  minionHome: string
}

export interface TaskResult {
  taskId: string
  status: 'completed' | 'failed' | 'partial'
  containers: Array<{ id: string; preserved?: boolean }>
  patches: { applied: number; failed: number; conflicts: string[] }
  changes: { branch: string; commits: number; filesChanged: string[] }
  stats: { duration: number; llmCalls: number; tokensUsed: number }
  journal: string
  summary: string
  error?: string
}
