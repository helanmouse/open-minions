import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { HostAgent } from '../src/host-agent/host-agent.js'
import type { Model } from '@mariozechner/pi-ai'
import type { DockerSandbox } from '../src/sandbox/docker.js'
import type { ContainerRegistry } from '../src/container/registry.js'
import type { TaskStore } from '../src/task/store.js'

let mockPrompt: any
let mockSubscribe: any

vi.mock('node:crypto', () => ({
  randomUUID: () => 'task-runtime-env',
}))

vi.mock('@mariozechner/pi-agent-core', () => ({
  Agent: class MockAgent {
    prompt = mockPrompt
    subscribe = mockSubscribe
  },
}))

describe('host agent runtime env forwarding', () => {
  let minionHome: string
  let previousEnv: Record<string, string | undefined>

  const createAgent = () => {
    const mockLLM = {
      provider: 'test-provider',
      modelId: 'test-model',
      api: 'openai-completions',
    } as any as Model<any>

    const mockSandbox = {
      start: vi.fn().mockResolvedValue({ containerId: 'test123' }),
      stop: vi.fn().mockResolvedValue(undefined),
      exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
      getStatus: vi.fn().mockResolvedValue({ status: 'running' }),
    } as any as DockerSandbox

    const mockRegistry = {
      register: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockReturnValue({ id: 'test123', status: 'running' }),
      update: vi.fn().mockReturnValue(true),
      list: vi.fn().mockReturnValue([]),
      remove: vi.fn().mockResolvedValue(undefined),
    } as any as ContainerRegistry

    const mockStore = {
      create: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ id: 'task123', status: 'pending' }),
      update: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
    } as any as TaskStore

    return new HostAgent({
      llm: mockLLM,
      sandbox: mockSandbox,
      registry: mockRegistry,
      store: mockStore,
      minionHome,
    })
  }

  beforeEach(() => {
    mockPrompt = vi.fn().mockResolvedValue({
      role: 'assistant',
      content: 'done',
    })
    mockSubscribe = vi.fn()
    minionHome = mkdtempSync(join(tmpdir(), 'minion-runtime-env-'))
    previousEnv = {
      MINION_AI_MODE: process.env.MINION_AI_MODE,
      MINION_AUTO_APPLY: process.env.MINION_AUTO_APPLY,
      SANDBOX_MEMORY: process.env.SANDBOX_MEMORY,
      TZ: process.env.TZ,
      JAVA_HOME: process.env.JAVA_HOME,
    }
    delete process.env.MINION_AI_MODE
    delete process.env.MINION_AUTO_APPLY
    delete process.env.SANDBOX_MEMORY
    delete process.env.JAVA_HOME
    delete process.env.TZ
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    rmSync(minionHome, { recursive: true, force: true })
  })

  it('forwards strategy and prompt env pairs into context and runtime env file', async () => {
    process.env.MINION_AI_MODE = 'true'
    const agent = createAgent()

    await agent.run('run 3 times in parallel and auto-apply, set JAVA_HOME=/opt/jdk TZ=Asia/Shanghai')

    const runDir = join(minionHome, 'runs', 'task-runtime-env')
    const context = JSON.parse(readFileSync(join(runDir, 'context.json'), 'utf-8'))
    const envFile = readFileSync(join(runDir, '.env'), 'utf-8')

    expect(context.forwardedEnv.MINION_PARALLEL_RUNS).toBe('3')
    expect(context.forwardedEnv.MINION_AUTO_APPLY).toBe('true')
    expect(context.forwardedEnv.JAVA_HOME).toBe('/opt/jdk')
    expect(context.forwardedEnv.TZ).toBe('Asia/Shanghai')
    expect(context.forwardedEnv.MINION_AI_MODE).toBe('true')

    expect(envFile).toContain('MINION_PARALLEL_RUNS=3')
    expect(envFile).toContain('MINION_AUTO_APPLY=true')
    expect(envFile).toContain('JAVA_HOME=/opt/jdk')
    expect(envFile).toContain('TZ=Asia/Shanghai')
    expect(envFile).toContain('MINION_AI_MODE=true')
  })

  it('resolves runtime env precedence as explicit > prompt > strategy > defaults', async () => {
    process.env.MINION_AUTO_APPLY = 'process-explicit'
    const agent = createAgent()

    await agent.run(
      'auto-apply MINION_AUTO_APPLY=prompt-value SANDBOX_MEMORY=16g',
      { runtimeEnv: { MINION_AUTO_APPLY: 'cli-explicit', SANDBOX_MEMORY: '32g' } },
    )

    const runDir = join(minionHome, 'runs', 'task-runtime-env')
    const context = JSON.parse(readFileSync(join(runDir, 'context.json'), 'utf-8'))

    expect(context.forwardedEnv.MINION_AUTO_APPLY).toBe('cli-explicit')
    expect(context.forwardedEnv.SANDBOX_MEMORY).toBe('32g')
  })
})
