import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import { applyHostDelivery } from '../src/host-agent/patch-applier.js';

function setupGitRepo(dir: string): void {
  execSync('git init', { cwd: dir });
  execSync('git config user.email "t@t.com" && git config user.name "T"', { cwd: dir });
  writeFileSync(join(dir, 'a.txt'), 'original');
  execSync('git add . && git commit -m "initial"', { cwd: dir });
}

describe('host-side-only delivery', () => {
  it('generates and applies delivery on host for git repos', () => {
    const runDir = mkdtempSync(join(tmpdir(), 'minion-run-delivery-git-'));
    const patchDir = join(runDir, 'patches');
    mkdirSync(patchDir, { recursive: true });

    const sourceRepo = mkdtempSync(join(tmpdir(), 'minion-src-repo-'));
    setupGitRepo(sourceRepo);
    writeFileSync(join(sourceRepo, 'a.txt'), 'modified');
    execSync('git add . && git commit -m "fix: update a.txt"', { cwd: sourceRepo });
    execSync(`git format-patch HEAD~1 --output-directory ${patchDir}`, { cwd: sourceRepo });

    const targetRepo = mkdtempSync(join(tmpdir(), 'minion-target-repo-'));
    setupGitRepo(targetRepo);

    const result = applyHostDelivery(targetRepo, runDir);
    expect(result.mode).toBe('git');
    expect(result.success).toBe(true);
    expect(result.commits).toBe(1);
    expect(readFileSync(join(targetRepo, 'a.txt'), 'utf-8')).toBe('modified');
  });

  it('uses host tar packaging/apply path for non-git dirs', () => {
    const runDir = mkdtempSync(join(tmpdir(), 'minion-run-delivery-tar-'));
    const artifactsDir = join(runDir, 'artifacts');
    mkdirSync(artifactsDir, { recursive: true });

    const sourceDir = mkdtempSync(join(tmpdir(), 'minion-delivery-src-'));
    writeFileSync(join(sourceDir, 'note.txt'), 'from-artifact');
    execSync(`tar -czf ${join(artifactsDir, 'changes.tar.gz')} -C ${sourceDir} .`);

    const targetDir = mkdtempSync(join(tmpdir(), 'minion-delivery-target-'));
    writeFileSync(join(targetDir, 'note.txt'), 'before');

    const result = applyHostDelivery(targetDir, runDir);
    expect(result.mode).toBe('tar');
    expect(result.success).toBe(true);
    expect(result.commits).toBe(1);
    expect(readFileSync(join(targetDir, 'note.txt'), 'utf-8')).toBe('from-artifact');
  });
});
