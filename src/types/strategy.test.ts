import { describe, it, expect } from 'vitest'
import { ExecutionStrategy, getDefaultStrategy } from './strategy'

describe('ExecutionStrategy', () => {
  it('should provide default strategy with all fields', () => {
    const strategy = getDefaultStrategy()

    // Container management
    expect(strategy.preserveOnFailure).toBe(false)
    expect(strategy.preserveOnSuccess).toBe(false)
    expect(strategy.snapshotAfter).toBe(false)
    expect(strategy.customImage).toBeUndefined()

    // Parallel execution
    expect(strategy.parallelRuns).toBe(1)
    expect(strategy.pickBest).toBe(false)

    // Patch strategy
    expect(strategy.patchStrategy).toBe('ask')

    // Resource configuration
    expect(strategy.memory).toBe('4g')
    expect(strategy.cpus).toBe(2)
    expect(strategy.timeout).toBe(30)

    // Retry strategy
    expect(strategy.retryOnFailure).toBe(false)
    expect(strategy.maxRetries).toBe(3)

    // Other
    expect(strategy.verbose).toBe(false)
    expect(strategy.dryRun).toBe(false)
  })

  it('should return independent objects on multiple calls', () => {
    const strategy1 = getDefaultStrategy()
    const strategy2 = getDefaultStrategy()

    // Verify they are not the same reference
    expect(strategy1).not.toBe(strategy2)

    // Modify one and verify the other is unchanged
    strategy1.preserveOnFailure = true
    strategy1.memory = '8g'
    strategy1.parallelRuns = 5

    expect(strategy2.preserveOnFailure).toBe(false)
    expect(strategy2.memory).toBe('4g')
    expect(strategy2.parallelRuns).toBe(1)
  })
})
