import { writeFileSync, readFileSync, existsSync, renameSync, readdirSync } from 'fs';
import { dirname, join } from 'path';

const TEMPLATE = `## Journal Entry 1

### State
- Phase: planning
- Files modified: (none)
- Files read: (none)
- Tests: not-run
- Commits: (none)
- Tokens used: 0/0

### Key Decisions
(none yet)

### Current Progress
(none yet)

### Remaining Work
(task not started)

### Errors & Blockers
(none)
`;

export function seedJournal(path: string): void {
  if (existsSync(path)) return;
  writeFileSync(path, TEMPLATE, 'utf-8');
}

export function readJournal(path: string): string {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return '';
  }
}

export function rotateJournal(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`Cannot rotate journal: file not found at ${path}`);
  }
  const dir = dirname(path);
  const files = readdirSync(dir);
  const pattern = /^journal-(\d{3})\.md$/;
  let max = 0;
  for (const f of files) {
    const m = pattern.exec(f);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  if (max >= 999) {
    throw new Error('Journal rotation limit reached (999)');
  }
  const next = String(max + 1).padStart(3, '0');
  const rotatedPath = join(dir, `journal-${next}.md`);
  renameSync(path, rotatedPath);
  writeFileSync(path, TEMPLATE, 'utf-8');
  return rotatedPath;
}
