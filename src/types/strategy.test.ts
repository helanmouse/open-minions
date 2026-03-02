import { describe, it, expect } from 'vitest'
import { ExecutionStrategy, getDefaultStrategy } from './strategy'

describe('ExecutionStrategy', () => {
  it('should provide default strategy', () => {
    const strategy = getDefaultStrategy()
    expect(strategy.preserveOnFailure).toBe(false)
    expect(strategy.patchStrategy).toBe('ask')
    expect(strategy.parallelRuns).toBe(1)
  })
})
