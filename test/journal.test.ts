import { describe, it, expect } from 'vitest';
import { seedJournal, readJournal, rotateJournal } from '../src/sandbox/journal.js';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('journal', () => {
  it('seedJournal creates dense template with State section', () => {
    const dir = mkdtempSync(join(tmpdir(), 'journal-'));
    const path = join(dir, 'journal.md');
    seedJournal(path);
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('## Journal Entry 1');
    expect(content).toContain('### State');
    expect(content).toContain('- Phase: planning');
    expect(content).toContain('- Files modified: (none)');
    expect(content).toContain('- Files read: (none)');
    expect(content).toContain('- Tests: not-run');
    expect(content).toContain('- Commits: (none)');
    expect(content).toContain('- Tokens used: 0/0');
    expect(content).toContain('### Key Decisions');
    expect(content).toContain('### Current Progress');
    expect(content).toContain('### Remaining Work');
    expect(content).toContain('### Errors & Blockers');
  });

  it('seedJournal is idempotent — does not overwrite existing file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'journal-'));
    const path = join(dir, 'journal.md');
    writeFileSync(path, 'custom content');
    seedJournal(path);
    expect(readFileSync(path, 'utf-8')).toBe('custom content');
  });

  it('readJournal returns file content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'journal-'));
    const path = join(dir, 'journal.md');
    writeFileSync(path, '## Plan\nDo the thing');
    expect(readJournal(path)).toBe('## Plan\nDo the thing');
  });

  it('readJournal returns empty string on missing file', () => {
    expect(readJournal('/tmp/nonexistent-journal-file.md')).toBe('');
  });

  it('rotateJournal renames to journal-001.md and creates fresh template', () => {
    const dir = mkdtempSync(join(tmpdir(), 'journal-'));
    const path = join(dir, 'journal.md');
    writeFileSync(path, 'old content');
    const rotated = rotateJournal(path);
    expect(rotated).toBe(join(dir, 'journal-001.md'));
    expect(existsSync(rotated)).toBe(true);
    expect(readFileSync(rotated, 'utf-8')).toBe('old content');
    const fresh = readFileSync(path, 'utf-8');
    expect(fresh).toContain('## Journal Entry 1');
    expect(fresh).toContain('### State');
  });

  it('rotateJournal increments counter', () => {
    const dir = mkdtempSync(join(tmpdir(), 'journal-'));
    const path = join(dir, 'journal.md');
    writeFileSync(path, 'content v1');
    rotateJournal(path);
    writeFileSync(path, 'content v2');
    const rotated2 = rotateJournal(path);
    expect(rotated2).toBe(join(dir, 'journal-002.md'));
    expect(readFileSync(join(dir, 'journal-001.md'), 'utf-8')).toBe('content v1');
    expect(readFileSync(rotated2, 'utf-8')).toBe('content v2');
    const fresh = readFileSync(path, 'utf-8');
    expect(fresh).toContain('## Journal Entry 1');
  });
});
