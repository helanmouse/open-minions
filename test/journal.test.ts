import { describe, it, expect } from 'vitest';
import { seedJournal, readJournal } from '../src/sandbox/journal.js';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('journal', () => {
  it('seedJournal creates template file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'journal-'));
    const path = join(dir, 'journal.md');
    seedJournal(path);
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('## Plan');
    expect(content).toContain('## Execution Log');
    expect(content).toContain('## Verification');
    expect(content).toContain('## Status');
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
});
