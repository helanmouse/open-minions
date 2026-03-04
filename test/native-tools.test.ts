import { describe, it, expect } from 'vitest'
import { dockerTool, gitTool, tarTool } from '../src/host-agent/tools/native-tools.js'

describe('native tools', () => {
  it('exposes shell-style tool names', () => {
    expect(dockerTool.name).toBe('docker')
    expect(gitTool.name).toBe('git')
    expect(tarTool.name).toBe('tar')
  })
})
