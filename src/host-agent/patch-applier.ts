import { execFileSync } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';

export interface PatchResult {
  success: boolean;
  commits: number;
  error?: string;
}

export function applyPatches(repoPath: string, patchDir: string): PatchResult {
  const patches = readdirSync(patchDir)
    .filter(f => f.endsWith('.patch'))
    .sort()
    .map(f => join(patchDir, f));

  if (patches.length === 0) {
    return { success: true, commits: 0 };
  }

  try {
    // git am preserves commit messages and authorship (unlike git apply)
    execFileSync('git', ['am', ...patches], {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 60_000,
    });
    return { success: true, commits: patches.length };
  } catch (e: any) {
    // Abort failed am
    try { execFileSync('git', ['am', '--abort'], { cwd: repoPath }); } catch {}
    return { success: false, commits: 0, error: e.stderr || e.message };
  }
}

export function pushRepo(repoPath: string, branch: string): void {
  execFileSync('git', ['push', 'origin', branch], {
    cwd: repoPath,
    encoding: 'utf-8',
    timeout: 120_000,
  });
}
