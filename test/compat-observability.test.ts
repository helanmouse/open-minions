import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { HostAgent } from '../src/host-agent/host-agent.js';
import type { Model } from '@mariozechner/pi-ai';
import type { DockerSandbox } from '../src/sandbox/docker.js';
import type { ContainerRegistry } from '../src/container/registry.js';
import type { TaskStore } from '../src/task/store.js';
import { executeDockerWithFallback } from '../src/host-agent/tools/native-tools.js';

let mockPrompt: any;
let mockSubscribe: any;
let idCounter = 0;

vi.mock('node:crypto', () => ({
  randomUUID: () => `task-obs-${++idCounter}`,
}));

vi.mock('@mariozechner/pi-agent-core', () => ({
  Agent: class MockAgent {
    prompt = mockPrompt;
    subscribe = mockSubscribe;
  },
}));

function createHostAgent(minionHome: string): HostAgent {
  const mockLLM = {
    provider: 'test-provider',
    modelId: 'test-model',
    api: 'openai-completions',
  } as any as Model<any>;

  const mockSandbox = {
    start: vi.fn().mockResolvedValue({ containerId: 'test123' }),
    stop: vi.fn().mockResolvedValue(undefined),
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
    getStatus: vi.fn().mockResolvedValue({ status: 'running' }),
  } as any as DockerSandbox;

  const mockRegistry = {
    register: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockReturnValue({ id: 'test123', status: 'running' }),
    update: vi.fn().mockReturnValue(true),
    list: vi.fn().mockReturnValue([]),
    remove: vi.fn().mockResolvedValue(undefined),
  } as any as ContainerRegistry;

  const mockStore = {
    create: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ id: 'task123', status: 'pending' }),
    update: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
  } as any as TaskStore;

  return new HostAgent({
    llm: mockLLM,
    sandbox: mockSandbox,
    registry: mockRegistry,
    store: mockStore,
    minionHome,
  });
}

describe('compat observability', () => {
  it('writes effective strategy and forwarded env to context', async () => {
    mockPrompt = vi.fn().mockResolvedValue({
      role: 'assistant',
      content: 'done',
    });
    mockSubscribe = vi.fn();

    const minionHome = mkdtempSync(join(tmpdir(), 'minion-compat-observability-'));
    const agent = createHostAgent(minionHome);

    await agent.run('retry up to 2 times, run 2 times in parallel, auto-apply, MINION_AI_MODE=true');

    const runIds = readdirSync(join(minionHome, 'runs'));
    const runDir = join(minionHome, 'runs', runIds[0]);
    const context = JSON.parse(readFileSync(join(runDir, 'context.json'), 'utf-8'));

    expect(context.effectiveStrategy.retryEnabled).toBe(true);
    expect(context.effectiveStrategy.retryMax).toBe(2);
    expect(context.effectiveStrategy.parallelRuns).toBe(2);
    expect(context.effectiveStrategy.autoApply).toBe(true);
    expect(context.forwardedEnv.MINION_AI_MODE).toBe('true');
    expect(context.forwardedEnv.MINION_RETRY_MAX).toBe('2');
    expect(context.forwardedEnv.MINION_PARALLEL_RUNS).toBe('2');
  });

  it('returns runtime backend metadata for podman and docker fallback', () => {
    const podmanRunner = vi.fn().mockReturnValue('ok');
    const podmanResult = executeDockerWithFallback(['run', '--rm', 'minion-base'], undefined, undefined, undefined, podmanRunner as any);
    expect(podmanResult.runtimeBackend).toBe('podman');

    const dockerFallbackRunner = vi.fn()
      .mockImplementationOnce(() => {
        const error: any = new Error('podman not found');
        error.code = 'ENOENT';
        throw error;
      })
      .mockImplementationOnce(() => 'ok');
    const dockerResult = executeDockerWithFallback(['run', '--rm', 'minion-base'], undefined, undefined, undefined, dockerFallbackRunner as any);
    expect(dockerResult.runtimeBackend).toBe('docker');
  });
});
