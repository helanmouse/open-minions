import { describe, it, expect } from 'vitest'
import { validateHostCommand } from '../src/host-agent/policy-engine.js'

describe('policy engine', () => {
  it('allows docker run with safe args', () => {
    const result = validateHostCommand('docker', ['run', '--rm', 'minion-base'])
    expect(result.allowed).toBe(true)
  })

  it('denies dangerous run flags', () => {
    const result = validateHostCommand('docker', ['run', '--privileged', 'minion-base'])
    expect(result.allowed).toBe(false)
    expect(result.deniedReason).toContain('privileged')
  })

  it('allows exec with arbitrary bash payload', () => {
    const result = validateHostCommand('docker', ['exec', '-i', 'cid', 'bash', '-lc', 'apt-get update && npm test'])
    expect(result.allowed).toBe(true)
  })

  it('denies unknown program', () => {
    const result = validateHostCommand('podman', ['run', '--rm', 'minion-base'])
    expect(result.allowed).toBe(false)
    expect(result.deniedReason).toContain('Program is not allowed')
  })

  it('denies path outside allowlist for docker mount', () => {
    const result = validateHostCommand(
      'docker',
      ['run', '--rm', '-v', '/tmp/outside:/workspace', 'minion-base'],
      { allowedPaths: ['/Users/helanmouse/project/minions'] },
    )
    expect(result.allowed).toBe(false)
    expect(result.deniedReason).toContain('outside allowed paths')
  })
})
