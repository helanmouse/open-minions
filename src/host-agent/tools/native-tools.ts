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

function executeCommand(command: string, args: string[], cwd?: string, env?: Record<string, string>, timeoutMs?: number): NativeToolResult {
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
    const stdout = execFileSync(command, args, {
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

function createNativeTool(name: 'docker' | 'git' | 'tar'): AgentTool<typeof NativeToolSchema> {
  return {
    name,
    label: name,
    description: `Execute ${name} command with policy enforcement`,
    parameters: NativeToolSchema,
    execute: async (_id: string, args: Static<typeof NativeToolSchema>): Promise<AgentToolResult<NativeToolResult>> => {
      const result = executeCommand(name, args.args, args.cwd, args.env, args.timeoutMs)
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
