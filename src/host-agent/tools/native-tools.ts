import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import { Type, type Static } from '@sinclair/typebox'
import { execFileSync } from 'child_process'
import { validateHostCommand } from '../policy-engine.js'

interface NativeToolResult {
  exitCode: number
  stdout: string
  stderr: string
  deniedReason?: string
  runtimeBackend?: 'podman' | 'docker'
}

const NativeToolSchema = Type.Object({
  args: Type.Array(Type.String(), { description: 'CLI arguments, e.g. ["run", "--rm", "image"]' }),
  cwd: Type.Optional(Type.String({ description: 'Working directory' })),
  env: Type.Optional(Type.Record(Type.String(), Type.String(), { description: 'Extra environment variables' })),
  timeoutMs: Type.Optional(Type.Number({ description: 'Execution timeout in milliseconds' })),
  runId: Type.Optional(Type.String({ description: 'Run identifier for tracing' })),
})

type ExecRunner = (
  command: string,
  args: string[],
  options: {
    cwd?: string
    env?: NodeJS.ProcessEnv
    encoding: 'utf-8'
    timeout: number
    maxBuffer: number
    stdio: 'pipe'
  },
) => string

function executeCommand(
  command: string,
  args: string[],
  cwd?: string,
  env?: Record<string, string>,
  timeoutMs?: number,
  runner: ExecRunner = execFileSync as ExecRunner,
): NativeToolResult {
  const validation = validateHostCommand(command, args)
  if (!validation.allowed) {
    return {
      exitCode: 126,
      stdout: '',
      stderr: '',
      deniedReason: validation.deniedReason,
    }
  }

  const startEnv = env ? { ...process.env, ...env } : process.env
  try {
    const stdout = runner(command, args, {
      cwd,
      env: startEnv,
      encoding: 'utf-8',
      timeout: timeoutMs ?? 120_000,
      maxBuffer: 8 * 1024 * 1024,
      stdio: 'pipe',
    })
    return { exitCode: 0, stdout: stdout ?? '', stderr: '' }
  } catch (error: any) {
    return {
      exitCode: error?.status ?? 1,
      stdout: error?.stdout?.toString?.() ?? '',
      stderr: error?.stderr?.toString?.() ?? (error?.message ?? String(error)),
    }
  }
}

export function executeDockerWithFallback(
  args: string[],
  cwd?: string,
  env?: Record<string, string>,
  timeoutMs?: number,
  runner: ExecRunner = execFileSync as ExecRunner,
): NativeToolResult {
  const podmanResult = executeCommand('docker', args, cwd, env, timeoutMs, (_command, commandArgs, options) => runner('podman', commandArgs, options))
  if (podmanResult.exitCode === 0) {
    return { ...podmanResult, runtimeBackend: 'podman' }
  }
  if (podmanResult.deniedReason) {
    return podmanResult
  }

  const dockerResult = executeCommand('docker', args, cwd, env, timeoutMs, runner)
  return { ...dockerResult, runtimeBackend: 'docker' }
}

function createNativeTool(name: 'docker' | 'git' | 'tar'): AgentTool<typeof NativeToolSchema> {
  return {
    name,
    label: name,
    description: `Execute ${name} command with policy enforcement`,
    parameters: NativeToolSchema,
    execute: async (_id: string, args: Static<typeof NativeToolSchema>): Promise<AgentToolResult<NativeToolResult>> => {
      const result = name === 'docker'
        ? executeDockerWithFallback(args.args, args.cwd, args.env, args.timeoutMs)
        : executeCommand(name, args.args, args.cwd, args.env, args.timeoutMs)
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        details: result,
      }
    },
  }
}

export const dockerTool = createNativeTool('docker')
export const gitTool = createNativeTool('git')
export const tarTool = createNativeTool('tar')
