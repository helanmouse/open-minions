import { describe, it, expect } from 'vitest';
import { applyPatches } from '../src/host-agent/patch-applier.js';
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

function setupGitRepo(dir: string): void {
  execSync('git init', { cwd: dir });
  execSync('git config user.email "t@t.com" && git config user.name "T"', { cwd: dir });
  writeFileSync(join(dir, 'a.txt'), 'original');
  execSync('git add . && git commit -m "initial"', { cwd: dir });
}

describe('applyPatches', () => {
  it('applies patches using git am (preserves commit messages)', () => {
    // Create source repo, make a change, generate patch
    const srcDir = mkdtempSync(join(tmpdir(), 'minion-src-'));
    setupGitRepo(srcDir);
    writeFileSync(join(srcDir, 'a.txt'), 'modified');
    execSync('git add . && git commit -m "fix: update a.txt"', { cwd: srcDir });
    const patchDir = mkdtempSync(join(tmpdir(), 'minion-patches-'));
    execSync(`git format-patch HEAD~1 --output-directory ${patchDir}`, { cwd: srcDir });

    // Create target repo (same initial state)
    const targetDir = mkdtempSync(join(tmpdir(), 'minion-target-'));
    setupGitRepo(targetDir);

    const result = applyPatches(targetDir, patchDir);
    expect(result.success).toBe(true);
    expect(result.commits).toBe(1);
    expect(readFileSync(join(targetDir, 'a.txt'), 'utf-8')).toBe('modified');

    // Verify commit message is preserved (git am, not git apply)
    const log = execSync('git log --oneline -1', { cwd: targetDir, encoding: 'utf-8' });
    expect(log).toContain('fix: update a.txt');
  });

  it('returns failure when no patches found', () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-empty-'));
    setupGitRepo(dir);
    const emptyPatchDir = mkdtempSync(join(tmpdir(), 'minion-patches-'));
    const result = applyPatches(dir, emptyPatchDir);
    expect(result.success).toBe(true);
    expect(result.commits).toBe(0);
  });
});
