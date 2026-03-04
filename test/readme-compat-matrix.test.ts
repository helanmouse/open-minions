import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { HostAgent } from '../src/host-agent/host-agent.js';
import type { Model } from '@mariozechner/pi-ai';
import type { DockerSandbox } from '../src/sandbox/docker.js';
import type { ContainerRegistry } from '../src/container/registry.js';
import type { TaskStore } from '../src/task/store.js';
import { validateHostCommand } from '../src/host-agent/policy-engine.js';
import { applyHostDelivery } from '../src/host-agent/patch-applier.js';

let mockPrompt: any;
let mockSubscribe: any;
let idCounter = 0;

vi.mock('node:crypto', () => ({
  randomUUID: () => `task-matrix-${++idCounter}`,
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

async function runPromptAndReadContext(prompt: string): Promise<any> {
  mockPrompt = vi.fn().mockResolvedValue({
    role: 'assistant',
    content: 'done',
  });
  mockSubscribe = vi.fn();

  const minionHome = mkdtempSync(join(tmpdir(), 'minion-compat-matrix-'));
  const agent = createHostAgent(minionHome);
  const keysToIsolate = [
    'JAVA_HOME',
    'TZ',
    'MINION_AI_MODE',
    'MINION_PRESERVE_ON_FAILURE',
    'MINION_SNAPSHOT_MODE',
    'MINION_PARALLEL_RUNS',
    'MINION_RETRY_ENABLED',
    'MINION_RETRY_MAX',
    'MINION_AUTO_APPLY',
    'SANDBOX_MEMORY',
    'SANDBOX_CPUS',
    'MINION_IMAGE_STRATEGY',
  ];
  const previousValues: Record<string, string | undefined> = {};
  for (const key of keysToIsolate) {
    previousValues[key] = process.env[key];
    delete process.env[key];
  }

  try {
    await agent.run(prompt);
  } finally {
    for (const key of keysToIsolate) {
      const value = previousValues[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  const runIds = readdirSync(join(minionHome, 'runs'));
  const runDir = join(minionHome, 'runs', runIds[0]);
  return JSON.parse(readFileSync(join(runDir, 'context.json'), 'utf-8'));
}

describe('README compatibility matrix', () => {
  it('maps preserve keyword to preserve env', async () => {
    const context = await runPromptAndReadContext('keep container and preserve on failure');
    expect(context.forwardedEnv.MINION_PRESERVE_ON_FAILURE).toBe('true');
  });

  it('maps snapshot keyword to snapshot env mode', async () => {
    const context = await runPromptAndReadContext('take snapshot on failure');
    expect(context.forwardedEnv.MINION_SNAPSHOT_MODE).toBe('on_failure');
  });

  it('maps parallel keyword to parallel run env', async () => {
    const context = await runPromptAndReadContext('run 3 times in parallel');
    expect(context.forwardedEnv.MINION_PARALLEL_RUNS).toBe('3');
  });

  it('maps retry keyword to retry env', async () => {
    const context = await runPromptAndReadContext('retry up to 5 times when failed');
    expect(context.forwardedEnv.MINION_RETRY_ENABLED).toBe('true');
    expect(context.forwardedEnv.MINION_RETRY_MAX).toBe('5');
  });

  it('maps auto-apply keyword to auto apply env', async () => {
    const context = await runPromptAndReadContext('auto-apply patches after task');
    expect(context.forwardedEnv.MINION_AUTO_APPLY).toBe('true');
  });

  it('maps resource hints to sandbox resource env', async () => {
    const context = await runPromptAndReadContext('use 8g memory and 4 cores');
    expect(context.forwardedEnv.SANDBOX_MEMORY).toBe('8g');
    expect(context.forwardedEnv.SANDBOX_CPUS).toBe('4');
  });

  it('passes MINION_AI_MODE from prompt env', async () => {
    const context = await runPromptAndReadContext('MINION_AI_MODE=true fix lint issues');
    expect(context.forwardedEnv.MINION_AI_MODE).toBe('true');
  });

  it('supports image-analysis selection via prompt env passthrough', async () => {
    const context = await runPromptAndReadContext('MINION_IMAGE_STRATEGY=analyze analyze project and select image');
    expect(context.forwardedEnv.MINION_IMAGE_STRATEGY).toBe('analyze');
  });

  it('passes arbitrary prompt env pairs', async () => {
    const context = await runPromptAndReadContext('set JAVA_HOME=/opt/jdk TZ=Asia/Shanghai');
    expect(context.forwardedEnv.JAVA_HOME).toBe('/opt/jdk');
    expect(context.forwardedEnv.TZ).toBe('Asia/Shanghai');
  });

  it('allows unrestricted in-container execution payload through docker exec policy', () => {
    const result = validateHostCommand('docker', ['exec', '-i', 'cid', 'bash', '-lc', 'apt-get update && npm test']);
    expect(result.allowed).toBe(true);
  });

  it('selects host-side delivery mode for git and non-git workdirs', () => {
    const gitRepo = mkdtempSync(join(tmpdir(), 'minion-compat-git-'));
    execSync('git init', { cwd: gitRepo });
    execSync('git config user.email "t@t.com" && git config user.name "T"', { cwd: gitRepo });
    writeFileSync(join(gitRepo, 'a.txt'), 'a');
    execSync('git add . && git commit -m "init"', { cwd: gitRepo });

    const runDirGit = mkdtempSync(join(tmpdir(), 'minion-compat-run-git-'));
    mkdirSync(join(runDirGit, 'patches'), { recursive: true });
    const gitResult = applyHostDelivery(gitRepo, runDirGit);
    expect(gitResult.mode).toBe('git');

    const nonGitDir = mkdtempSync(join(tmpdir(), 'minion-compat-non-git-'));
    writeFileSync(join(nonGitDir, 'note.txt'), 'before');
    const runDirTar = mkdtempSync(join(tmpdir(), 'minion-compat-run-tar-'));
    const artifactsDir = join(runDirTar, 'artifacts');
    mkdirSync(artifactsDir, { recursive: true });
    const sourceDir = mkdtempSync(join(tmpdir(), 'minion-compat-artifact-src-'));
    writeFileSync(join(sourceDir, 'note.txt'), 'after');
    execSync(`tar -czf ${join(artifactsDir, 'changes.tar.gz')} -C ${sourceDir} .`);

    const tarResult = applyHostDelivery(nonGitDir, runDirTar);
    expect(tarResult.mode).toBe('tar');
    expect(readFileSync(join(nonGitDir, 'note.txt'), 'utf-8')).toBe('after');
  });
});
