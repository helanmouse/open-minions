export interface ExecutionStrategy {
  // Container management
  preserveOnFailure: boolean
  preserveOnSuccess: boolean
  snapshotAfter: boolean
  customImage?: string

  // Parallel execution
  parallelRuns: number
  pickBest: boolean

  // Patch strategy
  patchStrategy: 'auto' | 'manual' | 'ask'

  // Resource configuration
  memory: string
  cpus: number
  timeout: number

  // Retry strategy
  retryOnFailure: boolean
  maxRetries: number

  // Other
  verbose: boolean
  dryRun: boolean
}

export function getDefaultStrategy(): ExecutionStrategy {
  return {
    preserveOnFailure: false,
    preserveOnSuccess: false,
    snapshotAfter: false,
    parallelRuns: 1,
    pickBest: false,
    patchStrategy: 'ask',
    memory: '4g',
    cpus: 2,
    timeout: 30,
    retryOnFailure: false,
    maxRetries: 3,
    verbose: false,
    dryRun: false,
  }
}
