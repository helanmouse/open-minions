import { execFileSync } from 'child_process';
import { join } from 'path';
import { rmSync } from 'fs';

export interface RepoPrepareInput {
  repoType: 'local' | 'remote';
  repo: string;
  runDir: string;
}

export interface RepoPrepareResult {
  repoPath: string;       // path to mount as /host-repo:ro
  needsCleanup: boolean;  // true for remote clones (Host should clean up after push)
}

export async function prepareRepo(input: RepoPrepareInput): Promise<RepoPrepareResult> {
  if (input.repoType === 'local') {
    return { repoPath: input.repo, needsCleanup: false };
  }

  // Remote: clone to runDir/repo/ using host's git credentials
  const clonePath = join(input.runDir, 'repo');
  execFileSync('git', ['clone', input.repo, clonePath], {
    encoding: 'utf-8',
    timeout: 300_000, // 5 min for large repos
  });
  return { repoPath: clonePath, needsCleanup: true };
}

export function cleanupRepo(repoPath: string): void {
  try {
    rmSync(repoPath, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
}
