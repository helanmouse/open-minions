import { describe, it, expect } from 'vitest';
import { grepTool, findTool, lsTool } from '../src/sandbox/tools/search.js';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function getText(result: { content: { type: string; text: string }[] }): string {
  return result.content[0].text;
}

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'search-tools-'));
}

describe('grepTool', () => {
  it('finds matching lines in files (non-git fallback)', async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'hello.txt'), 'hello world\nfoo bar\nhello again\n');
    const result = await grepTool.execute('t1', { pattern: 'hello', path: dir, context: 0 });
    const text = getText(result);
    expect(text).toContain('hello world');
    expect(text).toContain('hello again');
  });

  it('returns no matches for non-matching pattern', async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'a.txt'), 'nothing here\n');
    const result = await grepTool.execute('t2', { pattern: 'zzzzz', path: dir, context: 0 });
    expect(getText(result)).toBe('(no matches)');
  });

  it('respects include filter', async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'a.ts'), 'const x = 1;\n');
    writeFileSync(join(dir, 'b.js'), 'const x = 2;\n');
    const result = await grepTool.execute('t3', { pattern: 'const', path: dir, include: '*.ts', context: 0 });
    const text = getText(result);
    expect(text).toContain('a.ts');
    expect(text).not.toContain('b.js');
  });

  it('returns error for nonexistent directory', async () => {
    const result = await grepTool.execute('t4', { pattern: 'x', path: '/tmp/nonexistent-dir-xyz' });
    expect(getText(result)).toContain('Error');
  });

  it('truncates output beyond 200 lines', async () => {
    const dir = makeTempDir();
    // Create a file with 300 matching lines
    const lines = Array.from({ length: 300 }, (_, i) => `match_line_${i}`).join('\n');
    writeFileSync(join(dir, 'big.txt'), lines);
    const result = await grepTool.execute('t5', { pattern: 'match_line', path: dir, context: 0 });
    expect(getText(result)).toContain('[Truncated');
  });
});

describe('findTool', () => {
  it('finds files matching glob pattern', async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'foo.ts'), '');
    writeFileSync(join(dir, 'bar.ts'), '');
    writeFileSync(join(dir, 'baz.js'), '');
    const result = await findTool.execute('t6', { pattern: '*.ts', path: dir });
    const text = getText(result);
    expect(text).toContain('foo.ts');
    expect(text).toContain('bar.ts');
    expect(text).not.toContain('baz.js');
  });

  it('excludes node_modules', async () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, 'node_modules'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'dep.ts'), '');
    writeFileSync(join(dir, 'src.ts'), '');
    const result = await findTool.execute('t7', { pattern: '*.ts', path: dir });
    const text = getText(result);
    expect(text).toContain('src.ts');
    expect(text).not.toContain('dep.ts');
  });

  it('returns no files found for non-matching pattern', async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'a.txt'), '');
    const result = await findTool.execute('t8', { pattern: '*.xyz', path: dir });
    expect(getText(result)).toBe('(no files found)');
  });

  it('returns error for nonexistent directory', async () => {
    const result = await findTool.execute('t9', { pattern: '*.ts', path: '/tmp/nonexistent-dir-xyz' });
    expect(getText(result)).toContain('Error');
  });
});

describe('lsTool', () => {
  it('lists directory contents with metadata', async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'file.txt'), 'hello');
    mkdirSync(join(dir, 'subdir'));
    const result = await lsTool.execute('t10', { path: dir });
    const text = getText(result);
    expect(text).toContain('file.txt\tfile\t5');
    expect(text).toContain('subdir\tdir\t');
  });

  it('returns entries sorted alphabetically', async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'c.txt'), '');
    writeFileSync(join(dir, 'a.txt'), '');
    writeFileSync(join(dir, 'b.txt'), '');
    const result = await lsTool.execute('t11', { path: dir });
    const text = getText(result);
    const names = text.split('\n').map((l: string) => l.split('\t')[0]);
    expect(names).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });

  it('returns empty directory message', async () => {
    const dir = makeTempDir();
    const result = await lsTool.execute('t12', { path: dir });
    expect(getText(result)).toBe('(empty directory)');
  });

  it('returns error for nonexistent directory', async () => {
    const result = await lsTool.execute('t13', { path: '/tmp/nonexistent-dir-xyz' });
    expect(getText(result)).toContain('Error');
  });
});
