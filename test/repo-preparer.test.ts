import { describe, it, expect } from 'vitest';
import { prepareRepo } from '../src/host-agent/repo-preparer.js';
import { mkdtempSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

describe('prepareRepo', () => {
  it('returns local path directly for local repos', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minion-repo-'));
    execSync('git init', { cwd: dir });
    const result = await prepareRepo({
      repoType: 'local',
      repo: dir,
      runDir: mkdtempSync(join(tmpdir(), 'minion-run-')),
    });
    expect(result.repoPath).toBe(dir);
    expect(result.needsCleanup).toBe(false);
  });

  it('clones remote repo to runDir/repo/', async () => {
    // Create a bare repo to clone from (simulates remote)
    const bareDir = mkdtempSync(join(tmpdir(), 'minion-bare-'));
    execSync('git init --bare', { cwd: bareDir });
    // Create a temp repo, commit, push to bare
    const srcDir = mkdtempSync(join(tmpdir(), 'minion-src-'));
    execSync(`git init && git config user.email "t@t.com" && git config user.name "T"`, { cwd: srcDir });
    execSync(`echo hello > a.txt && git add . && git commit -m "init"`, { cwd: srcDir });
    execSync(`git remote add origin ${bareDir} && git push origin HEAD:main`, { cwd: srcDir });

    const runDir = mkdtempSync(join(tmpdir(), 'minion-run-'));
    const result = await prepareRepo({
      repoType: 'remote',
      repo: bareDir,
      runDir,
    });
    expect(result.repoPath).toBe(join(runDir, 'repo'));
    expect(existsSync(join(runDir, 'repo'))).toBe(true);
    expect(result.needsCleanup).toBe(true);
  });
});
