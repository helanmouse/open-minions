import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PromptParser } from './prompt-parser'
import { getDefaultStrategy } from '../types/strategy'

describe('PromptParser', () => {
  let parser: PromptParser
  let mockLLM: any

  beforeEach(() => {
    mockLLM = {
      chat: vi.fn()
    }
    parser = new PromptParser(mockLLM)
  })

  it('should extract preserve on failure', async () => {
    mockLLM.chat.mockResolvedValue({
      content: JSON.stringify({
        task: 'create hello.py',
        strategy: { preserveOnFailure: true }
      })
    })

    const result = await parser.parse(
      'create hello.py, preserve container if failed'
    )

    expect(result.parsedTask).toContain('create hello.py')
    expect(result.strategy.preserveOnFailure).toBe(true)
  })

  it('should extract parallel runs', async () => {
    mockLLM.chat.mockResolvedValue({
      content: JSON.stringify({
        task: 'try this task',
        strategy: { parallelRuns: 3, pickBest: true }
      })
    })

    const result = await parser.parse(
      'try this task 3 times in parallel'
    )

    expect(result.strategy.parallelRuns).toBe(3)
    expect(result.strategy.pickBest).toBe(true)
  })

  it('should extract patch strategy', async () => {
    mockLLM.chat.mockResolvedValue({
      content: JSON.stringify({
        task: 'create hello.py',
        strategy: { patchStrategy: 'auto' }
      })
    })

    const result = await parser.parse(
      'create hello.py, auto-apply patches'
    )

    expect(result.strategy.patchStrategy).toBe('auto')
  })

  it('should use defaults when no strategy specified', async () => {
    mockLLM.chat.mockResolvedValue({
      content: JSON.stringify({
        task: 'create hello.py',
        strategy: {}
      })
    })

    const result = await parser.parse('create hello.py')

    expect(result.strategy).toEqual(getDefaultStrategy())
  })

  it('should handle LLM parse errors gracefully', async () => {
    mockLLM.chat.mockResolvedValue({
      content: 'Invalid response without JSON'
    })

    const result = await parser.parse('create hello.py')

    expect(result.parsedTask).toBe('create hello.py')
    expect(result.strategy).toEqual(getDefaultStrategy())
  })

  it('should handle LLM network failures gracefully', async () => {
    mockLLM.chat.mockRejectedValue(new Error('Network error'))

    const result = await parser.parse('create hello.py')

    expect(result.parsedTask).toBe('create hello.py')
    expect(result.strategy).toEqual(getDefaultStrategy())
  })

  it('should merge partial strategy with defaults', async () => {
    mockLLM.chat.mockResolvedValue({
      content: JSON.stringify({
        task: 'create hello.py',
        strategy: { preserveOnFailure: true, timeout: 60 }
      })
    })

    const result = await parser.parse('create hello.py')

    const expectedStrategy = {
      ...getDefaultStrategy(),
      preserveOnFailure: true,
      timeout: 60
    }

    expect(result.strategy).toEqual(expectedStrategy)
  })

  it('should convert timeout from minutes to seconds', async () => {
    mockLLM.chat.mockResolvedValue({
      content: JSON.stringify({
        task: 'create hello.py',
        strategy: { timeout: 5 }
      })
    })

    const result = await parser.parse('create hello.py with 5m timeout')

    // When LLM extracts timeout from "5m", it should be converted to seconds
    expect(result.strategy.timeout).toBe(300) // 5 minutes = 300 seconds
  })
})
