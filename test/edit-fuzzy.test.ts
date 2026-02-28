import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  editTool,
  normalizeWhitespace,
  collapseBlankLines,
  lineLevDistance,
  fuzzyFind,
  generateDiff,
} from '../src/sandbox/tools/coding.js';

function getResultText(result: any): string {
  return result.content[0].text;
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'edit-fuzzy-test-'));
});

describe('helper functions', () => {
  it('normalizeWhitespace trims trailing spaces per line', () => {
    expect(normalizeWhitespace('hello   \nworld  ')).toBe('hello\nworld');
  });

  it('collapseBlankLines collapses 3+ newlines to 2', () => {
    expect(collapseBlankLines('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('lineLevDistance returns 0 for identical arrays', () => {
    expect(lineLevDistance(['a', 'b'], ['a', 'b'])).toBe(0);
  });

  it('lineLevDistance returns correct distance', () => {
    expect(lineLevDistance(['a', 'b', 'c'], ['a', 'x', 'c'])).toBe(1);
  });
});

describe('exact match (no regression)', () => {
  it('replaces exact text and returns diff', async () => {
    const file = join(dir, 'exact.txt');
    writeFileSync(file, 'line1\nline2\nline3\nline4\n');
    const result = await editTool.execute('t', { path: file, oldText: 'line2', newText: 'replaced' });
    const text = getResultText(result);
    expect(text).toContain('Successfully replaced text');
    expect(text).toContain('-line2');
    expect(text).toContain('+replaced');
    expect(readFileSync(file, 'utf-8')).toBe('line1\nreplaced\nline3\nline4\n');
  });

  it('rejects multiple exact matches', async () => {
    const file = join(dir, 'dup.txt');
    writeFileSync(file, 'aaa\nbbb\naaa\n');
    const result = await editTool.execute('t', { path: file, oldText: 'aaa', newText: 'ccc' });
    expect(getResultText(result)).toContain('Error: Found 2 occurrences');
  });

  it('returns error for missing file', async () => {
    const result = await editTool.execute('t', { path: join(dir, 'nope.txt'), oldText: 'x', newText: 'y' });
    expect(getResultText(result)).toContain('Error: File not found');
  });
});

describe('fuzzy match — trailing whitespace', () => {
  it('matches when file has trailing spaces that oldText lacks', async () => {
    const file = join(dir, 'ws.txt');
    writeFileSync(file, 'hello   \nworld  \nfoo\n');
    const result = await editTool.execute('t', { path: file, oldText: 'hello\nworld', newText: 'hi\nthere' });
    const text = getResultText(result);
    expect(text).toContain('Successfully replaced text');
    expect(text).toContain('Fuzzy match applied');
    expect(text).toContain('whitespace');
    expect(readFileSync(file, 'utf-8')).toBe('hi\nthere\nfoo\n');
  });
});

describe('fuzzy match — blank line differences', () => {
  it('matches when file has extra blank lines', async () => {
    const file = join(dir, 'blank.txt');
    writeFileSync(file, 'aaa\n\n\n\nbbb\nccc\n');
    const result = await editTool.execute('t', { path: file, oldText: 'aaa\n\nbbb', newText: 'xxx\nyyy' });
    const text = getResultText(result);
    expect(text).toContain('Successfully replaced text');
    expect(text).toContain('Fuzzy match applied');
    expect(text).toContain('blankline');
    expect(readFileSync(file, 'utf-8')).toBe('xxx\nyyy\nccc\n');
  });
});

describe('multiple fuzzy matches → error with locations', () => {
  it('reports all candidate line numbers', async () => {
    const file = join(dir, 'multi.txt');
    // Two blocks that both fuzzy-match "hello\nworld" via trailing whitespace
    writeFileSync(file, 'hello   \nworld  \nstuff\nhello  \nworld   \n');
    const result = await editTool.execute('t', { path: file, oldText: 'hello\nworld', newText: 'replaced' });
    const text = getResultText(result);
    expect(text).toContain('Error: Found 2 fuzzy matches');
    expect(text).toContain('line 1');
    expect(text).toContain('line 4');
    expect(text).toContain('Candidate locations');
  });
});

describe('fuzzyFind unit tests', () => {
  it('returns empty array when nothing matches', () => {
    const matches = fuzzyFind('aaa\nbbb\nccc', 'zzz\nyyy');
    expect(matches).toHaveLength(0);
  });

  it('levenshtein strategy matches with minor line edits', () => {
    // 10 lines, 1 line different = 10% ratio, under 20% threshold
    const fileLines = Array.from({ length: 15 }, (_, i) => `line${i}`);
    const oldLines = [...fileLines.slice(3, 13)];
    oldLines[5] = 'CHANGED_LINE'; // 1 out of 10 = 10%
    const matches = fuzzyFind(fileLines.join('\n'), oldLines.join('\n'));
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].strategy).toBe('levenshtein');
    expect(matches[0].lineNumber).toBe(4); // 0-indexed line 3 → 1-based line 4
  });
});

describe('generateDiff', () => {
  it('produces unified diff with +/- markers', () => {
    const old = 'aaa\nbbb\nccc\nddd\n';
    const neu = 'aaa\nBBB\nccc\nddd\n';
    const diff = generateDiff(old, neu, 'test.txt');
    expect(diff).toContain('--- a/test.txt');
    expect(diff).toContain('+++ b/test.txt');
    expect(diff).toContain('-bbb');
    expect(diff).toContain('+BBB');
    expect(diff).toContain(' aaa');
    expect(diff).toContain(' ccc');
  });

  it('returns empty string for identical content', () => {
    const diff = generateDiff('same\n', 'same\n', 'f.txt');
    expect(diff).toBe('');
  });
});
