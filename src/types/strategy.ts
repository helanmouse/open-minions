/**
 * Configuration for how minion tasks are executed, including container lifecycle,
 * resource allocation, retry behavior, and patch application strategies.
 */
export interface ExecutionStrategy {
  // Container management

  /** Whether to preserve the container when execution fails (useful for debugging) */
  preserveOnFailure: boolean

  /** Whether to preserve the container when execution succeeds */
  preserveOnSuccess: boolean

  /** Whether to create a snapshot of the container after execution */
  snapshotAfter: boolean

  /** Optional custom Docker image to use instead of the default */
  customImage?: string

  // Parallel execution

  /** Number of parallel execution runs to perform (must be >= 1) */
  parallelRuns: number

  /** Whether to pick the best result from parallel runs */
  pickBest: boolean

  // Patch strategy

  /**
   * Strategy for applying patches to the codebase:
   * - 'auto': Automatically apply patches without user confirmation
   * - 'manual': User manually applies patches themselves
   * - 'ask': Prompt user for confirmation before applying each patch
   */
  patchStrategy: 'auto' | 'manual' | 'ask'

  // Resource configuration

  /**
   * Memory limit for the container in Docker format.
   * Examples: "512m", "1g", "2g", "4g"
   * Suffixes: b (bytes), k (kilobytes), m (megabytes), g (gigabytes)
   */
  memory: string

  /**
   * Number of CPUs allocated to the container.
   * Must be a positive number. Can be fractional (e.g., 0.5, 1.5, 2).
   */
  cpus: number

  /**
   * Execution timeout in seconds.
   * The task will be terminated if it exceeds this duration.
   */
  timeout: number

  // Retry strategy

  /** Whether to automatically retry failed executions */
  retryOnFailure: boolean

  /** Maximum number of retry attempts when retryOnFailure is enabled */
  maxRetries: number

  // Other

  /** Whether to output verbose logging information */
  verbose: boolean

  /** Whether to perform a dry run without actually executing (for testing) */
  dryRun: boolean
}

/**
 * Returns the default execution strategy configuration.
 * Creates a new object on each call to avoid shared references.
 *
 * Default values:
 * - Containers are not preserved after execution
 * - Single execution run (no parallelization)
 * - User is prompted before applying patches ('ask' mode)
 * - 4GB memory limit, 2 CPUs, 30 second timeout
 * - No automatic retries on failure
 * - Non-verbose, non-dry-run mode
 *
 * @returns A new ExecutionStrategy object with default values
 */
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
