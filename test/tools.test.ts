import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../src/tools/registry.js';
import { readTool, writeTool, editTool, listFilesTool } from '../src/tools/file-ops.js';
import { bashTool } from '../src/tools/bash.js';
import { searchCodeTool } from '../src/tools/search.js';
import { gitTool } from '../src/tools/git.js';
import type { ToolContext } from '../src/types/shared.js';
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const makeCtx = (workdir: string): ToolContext => ({
  workdir,
  task: {
    id: '1', description: 'test', repo: '/tmp/test', repoType: 'local' as const,
    branch: 'minion/1', baseBranch: 'main', push: false,
    maxIterations: 50, timeout: 30, created_at: '',
  },
});

describe('ToolRegistry', () => {
  it('registers and retrieves tools', () => {
    const registry = new ToolRegistry();
    registry.register(readTool);
    expect(registry.get('read')).toBe(readTool);
    expect(registry.getToolDefs()).toHaveLength(1);
  });

  it('filters tools by subset', () => {
    const registry = new ToolRegistry();
    registry.register(readTool);
    registry.register(bashTool);
    const subset = registry.getToolDefs(['read']);
    expect(subset).toHaveLength(1);
    expect(subset[0].name).toBe('read');
  });
});

describe('file-ops tools', () => {
  it('read tool reads a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-test-'));
    writeFileSync(join(dir, 'hello.txt'), 'world');
    const ctx = makeCtx(dir);
    const result = await readTool.execute({ path: 'hello.txt' }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('world');
  });

  it('write tool creates a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-test-'));
    const ctx = makeCtx(dir);
    const result = await writeTool.execute({ path: 'new.txt', content: 'hello' }, ctx);
    expect(result.success).toBe(true);
    expect(readFileSync(join(dir, 'new.txt'), 'utf-8')).toBe('hello');
  });
});

describe('bash tool', () => {
  it('executes a command and returns output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-test-'));
    const ctx = makeCtx(dir);
    const result = await bashTool.execute({ command: 'echo hello' }, ctx);
    expect(result.success).toBe(true);
    expect(result.output.trim()).toBe('hello');
  });

  it('blocks dangerous commands', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-test-'));
    const ctx = makeCtx(dir);
    const result = await bashTool.execute({ command: 'rm -rf /' }, ctx);
    expect(result.success).toBe(false);
  });
});

describe('git tool', () => {
  it('initializes a repo and commits', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-git-'));
    const ctx = makeCtx(dir);
    await gitTool.execute({ command: 'init' }, ctx);
    await bashTool.execute({ command: 'git config user.email "test@test.com" && git config user.name "Test"' }, ctx);
    writeFileSync(join(dir, 'hello.txt'), 'world');
    await gitTool.execute({ command: 'add', args: ['.'] }, ctx);
    const result = await gitTool.execute({ command: 'commit', args: ['-m', 'init'] }, ctx);
    expect(result.success).toBe(true);
  });

  it('generates format-patch', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-git-'));
    const ctx = makeCtx(dir);
    await bashTool.execute({
      command: 'git init && git config user.email "t@t.com" && git config user.name "T"'
    }, ctx);
    writeFileSync(join(dir, 'a.txt'), 'v1');
    await bashTool.execute({ command: 'git add . && git commit -m "initial"' }, ctx);
    writeFileSync(join(dir, 'a.txt'), 'v2');
    await bashTool.execute({ command: 'git add . && git commit -m "change"' }, ctx);
    const result = await gitTool.execute({
      command: 'format-patch',
      args: ['HEAD~1', '--output-directory', join(dir, 'patches')],
    }, ctx);
    expect(result.success).toBe(true);
  });
});
