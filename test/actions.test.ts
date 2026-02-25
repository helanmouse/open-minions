import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createActions } from '../src/worker/actions.js';
import type { BlueprintContext } from '../src/worker/blueprint-engine.js';
import type { ToolContext } from '../src/types.js';

const makeBpCtx = (): BlueprintContext => ({
  task: {}, steps: {}, context: {},
});

const makeToolCtx = (workdir: string): ToolContext => ({
  workdir,
  task: { id: '1', repo_url: '', project_id: '', description: '', blueprint: 'test', created_at: '' },
  stepResults: {},
});

describe('actions', () => {
  it('run_lint executes configured lint command', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-action-'));
    mkdirSync(join(dir, '.minion'), { recursive: true });
    writeFileSync(join(dir, '.minion', 'config.yaml'), 'lint_command: "echo lint-ok"');
    const actions = createActions({ url: '', token: '' });
    const result = await actions.run_lint({}, makeBpCtx(), makeToolCtx(dir));
    expect(result.exit_code).toBe(0);
    expect(result.output).toContain('lint-ok');
  });

  it('run_lint returns exit_code 1 on failure', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-action-'));
    mkdirSync(join(dir, '.minion'), { recursive: true });
    writeFileSync(join(dir, '.minion', 'config.yaml'), 'lint_command: "exit 1"');
    const actions = createActions({ url: '', token: '' });
    const result = await actions.run_lint({}, makeBpCtx(), makeToolCtx(dir));
    expect(result.exit_code).toBe(1);
  });

  it('run_lint returns skipped when no lint_command configured', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-action-'));
    mkdirSync(join(dir, '.minion'), { recursive: true });
    writeFileSync(join(dir, '.minion', 'config.yaml'), '{}');
    const actions = createActions({ url: '', token: '' });
    const result = await actions.run_lint({}, makeBpCtx(), makeToolCtx(dir));
    expect(result.exit_code).toBe(-1);
    expect(result.output).toContain('no lint_command configured');
  });
});
