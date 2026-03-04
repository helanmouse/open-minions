import { describe, it, expect, vi } from 'vitest'
import { dockerTool, gitTool, tarTool, executeDockerWithFallback } from '../src/host-agent/tools/native-tools.js'

describe('native tools', () => {
  it('exposes shell-style tool names', () => {
    expect(dockerTool.name).toBe('docker')
    expect(gitTool.name).toBe('git')
    expect(tarTool.name).toBe('tar')
  })

  it('falls back to docker backend when podman fails', () => {
    const runner = vi.fn()
      .mockImplementationOnce(() => {
        const error: any = new Error('podman not found')
        error.code = 'ENOENT'
        throw error
      })
      .mockImplementationOnce(() => 'ok')

    const result = executeDockerWithFallback(['run', '--rm', 'minion-base'], undefined, undefined, undefined, runner as any)

    expect(result.exitCode).toBe(0)
    expect(result.runtimeBackend).toBe('docker')
    expect(runner).toHaveBeenCalledTimes(2)
    expect(runner.mock.calls[0][0]).toBe('podman')
    expect(runner.mock.calls[1][0]).toBe('docker')
  })
})
