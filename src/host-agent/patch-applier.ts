import { execFileSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
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

export function hasGitMetadata(repoPath: string): boolean {
  return existsSync(join(repoPath, '.git'));
}

function listTarArtifacts(paths: string[]): string[] {
  const files: string[] = [];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const artifacts = readdirSync(path)
      .filter(file => file.endsWith('.tar') || file.endsWith('.tar.gz') || file.endsWith('.tgz'))
      .sort()
      .map(file => join(path, file));
    files.push(...artifacts);
  }
  return files;
}

export function applyTarArtifacts(targetPath: string, artifactPaths: string[]): PatchResult {
  const artifacts = listTarArtifacts(artifactPaths);
  if (artifacts.length === 0) {
    return { success: true, commits: 0 };
  }

  try {
    for (const artifact of artifacts) {
      execFileSync('tar', ['-xzf', artifact, '-C', targetPath], {
        encoding: 'utf-8',
        timeout: 60_000,
      });
    }
    return { success: true, commits: artifacts.length };
  } catch (e: any) {
    return { success: false, commits: 0, error: e.stderr || e.message };
  }
}

export interface HostDeliveryResult extends PatchResult {
  mode: 'git' | 'tar';
}

export function applyHostDelivery(repoPath: string, runDir: string): HostDeliveryResult {
  const patchDir = join(runDir, 'patches');
  const artifactsDir = join(runDir, 'artifacts');

  if (hasGitMetadata(repoPath)) {
    return {
      mode: 'git',
      ...applyPatches(repoPath, patchDir),
    };
  }

  return {
    mode: 'tar',
    ...applyTarArtifacts(repoPath, [artifactsDir, patchDir]),
  };
}

export function pushRepo(repoPath: string, branch: string): void {
  execFileSync('git', ['push', 'origin', branch], {
    cwd: repoPath,
    encoding: 'utf-8',
    timeout: 120_000,
  });
}
