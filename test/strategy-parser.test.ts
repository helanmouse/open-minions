import { describe, it, expect } from 'vitest'
import { parseExecutionStrategy, extractPromptEnvPairs } from '../src/host-agent/strategy-parser.js'

describe('strategy parser', () => {
  it('parses preserve/retry/parallel/auto-apply keywords', () => {
    const strategy = parseExecutionStrategy('retry if failed, run 3 times in parallel, auto-apply patches, preserve container')
    expect(strategy.preserveOnFailure).toBe(true)
    expect(strategy.retryEnabled).toBe(true)
    expect(strategy.parallelRuns).toBe(3)
    expect(strategy.autoApply).toBe(true)
  })

  it('parses resource hints', () => {
    const strategy = parseExecutionStrategy('use 8g memory and 4 cores')
    expect(strategy.memory).toBe('8g')
    expect(strategy.cpus).toBe(4)
  })

  it('extracts arbitrary env assignments from prompt', () => {
    const envs = extractPromptEnvPairs('set JAVA_HOME=/opt/jdk and TZ=Asia/Shanghai')
    expect(envs.JAVA_HOME).toBe('/opt/jdk')
    expect(envs.TZ).toBe('Asia/Shanghai')
  })

  it('uses last-write-wins for duplicated env key', () => {
    const envs = extractPromptEnvPairs('TZ=UTC TZ=Asia/Shanghai')
    expect(envs.TZ).toBe('Asia/Shanghai')
  })
})
