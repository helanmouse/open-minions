# Sandbox Agent Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add search tools (grep/find/ls), fuzzy edit matching, journal-based context management, and retry/token/iteration controls to the sandbox agent.

**Architecture:** Cherry-pick patterns from pi-mono's coding-agent into the existing sandbox agent. New files: `search.ts` (3 tools), `context-manager.ts` (unified control). Modified files: `coding.ts` (fuzzy edit), `journal.ts` (dense template), `prompts.ts` (updated rules), `main.ts` (integration), `copy-sandbox.js` (build pipeline).

**Tech Stack:** TypeScript, @mariozechner/pi-agent-core (Agent, AgentTool, AgentEvent), @sinclair/typebox, Node.js fs/child_process, vitest.

---

### Task 1: Search Tools — grep / find / ls

**Files:**
- Create: `src/sandbox/tools/search.ts`
- Create: `test/search-tools.test.ts`

**Step 1: Write the failing tests**

```typescript
// test/search-tools.test.ts
import { describe, it, expect } from 'vitest';
import { grepTool, findTool, lsTool } from '../src/sandbox/tools/search.js';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

function setupTestDir() {
  const dir = mkdtempSync(join(tmpdir(), 'search-test-'));
  writeFileSync(join(dir, 'hello.ts'), 'export function greet() {\n  return "hello";\n}\n');
  writeFileSync(join(dir, 'world.ts'), 'export function world() {\n  return "world";\n}\n');
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, 'sub', 'nested.ts'), 'import { greet } from "../hello";\n');
  writeFileSync(join(dir, 'readme.md'), '# Test Project\n');
  // Init git so git grep works
  execSync('git init && git add . && git commit -m "init"', {
    cwd: dir,
    env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com' },
  });
  return dir;
}

describe('grepTool', () => {
  it('finds pattern matches in files', async () => {
    const dir = setupTestDir();
    process.chdir(dir);
    const result = await grepTool.execute('1', { pattern: 'greet' });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('hello.ts');
    expect(text).toContain('greet');
  });

  it('respects path parameter', async () => {
    const dir = setupTestDir();
    process.chdir(dir);
    const result = await grepTool.execute('2', { pattern: 'greet', path: 'sub' });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('nested.ts');
    expect(text).not.toContain('hello.ts');
  });

  it('respects include glob filter', async () => {
    const dir = setupTestDir();
    process.chdir(dir);
    const result = await grepTool.execute('3', { pattern: 'greet', include: '*.ts' });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('hello.ts');
  });

  it('returns error message for no matches', async () => {
    const dir = setupTestDir();
    process.chdir(dir);
    const result = await grepTool.execute('4', { pattern: 'nonexistent_xyz' });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('No matches');
  });
});

describe('findTool', () => {
  it('finds files matching glob pattern', async () => {
    const dir = setupTestDir();
    process.chdir(dir);
    const result = await findTool.execute('5', { pattern: '**/*.ts' });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('hello.ts');
    expect(text).toContain('world.ts');
    expect(text).toContain('nested.ts');
    expect(text).not.toContain('readme.md');
  });

  it('respects path parameter', async () => {
    const dir = setupTestDir();
    process.chdir(dir);
    const result = await findTool.execute('6', { pattern: '*.ts', path: 'sub' });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('nested.ts');
    expect(text).not.toContain('hello.ts');
  });
});

describe('lsTool', () => {
  it('lists directory contents with metadata', async () => {
    const dir = setupTestDir();
    process.chdir(dir);
    const result = await lsTool.execute('7', { path: '.' });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('hello.ts');
    expect(text).toContain('sub');
    expect(text).toMatch(/file|dir/);
  });

  it('returns error for nonexistent directory', async () => {
    const dir = setupTestDir();
    process.chdir(dir);
    const result = await lsTool.execute('8', { path: 'nonexistent' });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest --run test/search-tools.test.ts`
Expected: FAIL — module `../src/sandbox/tools/search.js` not found

**Step 3: Implement search tools**

```typescript
// src/sandbox/tools/search.ts
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type, type Static } from '@sinclair/typebox';
import { readdirSync, statSync } from 'fs';
import { resolve, relative } from 'path';
import { execSync } from 'child_process';

function textResult(text: string): AgentToolResult<Record<string, never>> {
  return { content: [{ type: 'text', text }], details: {} as Record<string, never> };
}

const MAX_GREP_LINES = 200;
const MAX_FIND_RESULTS = 500;

// --- grep ---
const GrepSchema = Type.Object({
  pattern: Type.String({ description: 'Regex pattern to search for' }),
  path: Type.Optional(Type.String({ description: 'Directory to search in (default: current dir)' })),
  include: Type.Optional(Type.String({ description: 'Glob filter for file names (e.g. "*.ts")' })),
  context: Type.Optional(Type.Number({ description: 'Context lines around matches (default: 2)' })),
});

export const grepTool: AgentTool<typeof GrepSchema> = {
  name: 'grep',
  label: 'grep',
  description: 'Search file contents for a regex pattern. Respects .gitignore. Returns matching lines with file paths and line numbers.',
  parameters: GrepSchema,
  execute: async (_id: string, params: Static<typeof GrepSchema>) => {
    const { pattern, path: searchPath, include, context: ctx } = params;
    const dir = resolve(searchPath || '.');
    const contextLines = ctx ?? 2;

    try {
      // Try git grep first (respects .gitignore)
      let cmd: string;
      try {
        execSync('git rev-parse --git-dir', { cwd: dir, stdio: 'pipe' });
        cmd = `git grep -n -C${contextLines} -E ${JSON.stringify(pattern)}`;
        if (searchPath) cmd += ` -- ${JSON.stringify(searchPath)}`;
        if (include) cmd += ` -- ${JSON.stringify(include)}`;
      } catch {
        // Not a git repo, fallback to grep
        cmd = `grep -rn -E ${JSON.stringify(pattern)} ${JSON.stringify(dir)}`;
        if (include) cmd += ` --include=${JSON.stringify(include)}`;
        cmd += ' --exclude-dir=.git --exclude-dir=node_modules';
      }

      const output = execSync(cmd, {
        cwd: dir, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024,
        timeout: 15_000,
      });

      const lines = output.split('\n');
      if (lines.length > MAX_GREP_LINES) {
        const truncated = lines.slice(0, MAX_GREP_LINES).join('\n');
        return textResult(`${truncated}\n\n... truncated (${lines.length} total lines). Refine your pattern or narrow the path.`);
      }
      return textResult(output || 'No matches found.');
    } catch (e: any) {
      if (e.status === 1) return textResult('No matches found.');
      return textResult(`Error: ${e.message}`);
    }
  },
};

// --- find ---
const FindSchema = Type.Object({
  pattern: Type.String({ description: 'Glob pattern to match files (e.g. "**/*.ts")' }),
  path: Type.Optional(Type.String({ description: 'Start directory (default: current dir)' })),
});

export const findTool: AgentTool<typeof FindSchema> = {
  name: 'find',
  label: 'find',
  description: 'Find files matching a glob pattern. Excludes .git and node_modules.',
  parameters: FindSchema,
  execute: async (_id: string, params: Static<typeof FindSchema>) => {
    const { pattern, path: searchPath } = params;
    const dir = resolve(searchPath || '.');

    try {
      // Use find + grep for glob matching
      // Convert simple glob to find-compatible pattern
      const cmd = `find ${JSON.stringify(dir)} -type f -not -path '*/.git/*' -not -path '*/node_modules/*' | grep -E ${JSON.stringify(globToRegex(pattern))}`;
      const output = execSync(cmd, {
        encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 15_000,
      });

      const files = output.trim().split('\n').filter(Boolean)
        .map(f => relative(process.cwd(), f));
      if (files.length > MAX_FIND_RESULTS) {
        return textResult(files.slice(0, MAX_FIND_RESULTS).join('\n') +
          `\n\n... truncated (${files.length} total files).`);
      }
      return textResult(files.join('\n') || 'No files found.');
    } catch (e: any) {
      if (e.status === 1) return textResult('No files found.');
      return textResult(`Error: ${e.message}`);
    }
  },
};

/** Convert simple glob pattern to regex for grep filtering */
function globToRegex(glob: string): string {
  return glob
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.');
}

// --- ls ---
const LsSchema = Type.Object({
  path: Type.String({ description: 'Directory path to list' }),
});

export const lsTool: AgentTool<typeof LsSchema> = {
  name: 'ls',
  label: 'ls',
  description: 'List directory contents with file type and size.',
  parameters: LsSchema,
  execute: async (_id: string, { path: dirPath }: Static<typeof LsSchema>) => {
    try {
      const abs = resolve(dirPath);
      const entries = readdirSync(abs);
      const lines = entries
        .sort()
        .map(name => {
          try {
            const st = statSync(resolve(abs, name));
            const type = st.isDirectory() ? 'dir' : 'file';
            const size = st.isDirectory() ? '-' : formatSize(st.size);
            return `${name}\t${type}\t${size}`;
          } catch {
            return `${name}\t?\t?`;
          }
        });
      return textResult(lines.join('\n') || '(empty directory)');
    } catch (e: any) {
      return textResult(`Error: ${e.message}`);
    }
  },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest --run test/search-tools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/sandbox/tools/search.ts test/search-tools.test.ts
git commit -m "feat: add grep, find, ls search tools for sandbox agent"
```

---

### Task 2: Edit Fuzzy Matching + Diff Output

**Files:**
- Modify: `src/sandbox/tools/coding.ts:62-92`
- Create: `test/edit-fuzzy.test.ts`

**Step 1: Write the failing tests**

```typescript
// test/edit-fuzzy.test.ts
import { describe, it, expect } from 'vitest';
import { editTool } from '../src/sandbox/tools/coding.js';
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('edit fuzzy matching', () => {
  it('exact match still works', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'edit-test-'));
    const file = join(dir, 'test.ts');
    writeFileSync(file, 'function hello() {\n  return "hi";\n}\n');
    const result = await editTool.execute('1', {
      path: file, oldText: '  return "hi";', newText: '  return "hello";',
    });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Successfully');
    expect(readFileSync(file, 'utf-8')).toContain('return "hello"');
  });

  it('fuzzy matches with leading/trailing whitespace differences', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'edit-test-'));
    const file = join(dir, 'test.ts');
    writeFileSync(file, 'function hello() {\n  return "hi";\n}\n');
    // oldText has extra trailing spaces — should fuzzy match
    const result = await editTool.execute('2', {
      path: file, oldText: '  return "hi";  ', newText: '  return "hello";',
    });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Fuzzy match');
    expect(readFileSync(file, 'utf-8')).toContain('return "hello"');
  });

  it('fuzzy matches with blank line differences', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'edit-test-'));
    const file = join(dir, 'test.ts');
    writeFileSync(file, 'function a() {\n\n\n  return 1;\n}\n');
    // oldText collapses blank lines
    const result = await editTool.execute('3', {
      path: file, oldText: 'function a() {\n\n  return 1;\n}', newText: 'function a() {\n  return 2;\n}',
    });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Fuzzy match');
    expect(readFileSync(file, 'utf-8')).toContain('return 2');
  });

  it('rejects fuzzy match when multiple candidates exist', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'edit-test-'));
    const file = join(dir, 'test.ts');
    writeFileSync(file, 'return 1;\nreturn 1;\n');
    const result = await editTool.execute('4', {
      path: file, oldText: 'return 1; ', newText: 'return 2;',
    });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('multiple');
  });

  it('returns diff output on successful edit', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'edit-test-'));
    const file = join(dir, 'test.ts');
    writeFileSync(file, 'line1\nline2\nline3\nline4\nline5\n');
    const result = await editTool.execute('5', {
      path: file, oldText: 'line3', newText: 'LINE3_CHANGED',
    });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('-line3');
    expect(text).toContain('+LINE3_CHANGED');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest --run test/edit-fuzzy.test.ts`
Expected: FAIL — fuzzy match tests fail (current edit requires exact match), no diff output

**Step 3: Implement fuzzy matching and diff output**

Add these helper functions and modify the edit tool in `src/sandbox/tools/coding.ts`:

```typescript
// Add before the edit tool definition:

/** Normalize text: trim each line's trailing whitespace */
function normalizeWhitespace(text: string): string {
  return text.split('\n').map(l => l.trimEnd()).join('\n');
}

/** Collapse consecutive blank lines into single blank line */
function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n');
}

/** Line-level Levenshtein distance ratio (0 = identical, 1 = completely different) */
function lineDiffRatio(a: string, b: string): number {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const maxLen = Math.max(aLines.length, bLines.length);
  if (maxLen === 0) return 0;
  let diffs = Math.abs(aLines.length - bLines.length);
  const minLen = Math.min(aLines.length, bLines.length);
  for (let i = 0; i < minLen; i++) {
    if (aLines[i].trim() !== bLines[i].trim()) diffs++;
  }
  return diffs / maxLen;
}

/** Find fuzzy matches for oldText in content. Returns array of { start, end, matched } */
function fuzzyFind(content: string, oldText: string): Array<{ start: number; end: number; matched: string }> {
  const results: Array<{ start: number; end: number; matched: string }> = [];
  const oldLines = oldText.split('\n');
  const contentLines = content.split('\n');
  const windowSize = oldLines.length;

  for (let i = 0; i <= contentLines.length - windowSize; i++) {
    const candidate = contentLines.slice(i, i + windowSize).join('\n');

    // Strategy 1: whitespace normalization
    if (normalizeWhitespace(candidate) === normalizeWhitespace(oldText)) {
      results.push({ start: i, end: i + windowSize, matched: candidate });
      continue;
    }

    // Strategy 2: blank line collapse
    if (collapseBlankLines(normalizeWhitespace(candidate)) === collapseBlankLines(normalizeWhitespace(oldText))) {
      // Need to find actual range including extra blank lines
      for (let extra = 0; extra <= 3 && i + windowSize + extra <= contentLines.length; extra++) {
        const expanded = contentLines.slice(i, i + windowSize + extra).join('\n');
        if (collapseBlankLines(normalizeWhitespace(expanded)) === collapseBlankLines(normalizeWhitespace(oldText))) {
          results.push({ start: i, end: i + windowSize + extra, matched: expanded });
          break;
        }
      }
      continue;
    }

    // Strategy 3: line-level Levenshtein
    if (lineDiffRatio(candidate, oldText) < 0.2) {
      results.push({ start: i, end: i + windowSize, matched: candidate });
    }
  }

  return results;
}

/** Generate a simple unified diff */
function generateDiff(oldContent: string, newContent: string, filePath: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const output: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];

  // Find first and last differing lines
  let firstDiff = 0;
  while (firstDiff < oldLines.length && firstDiff < newLines.length && oldLines[firstDiff] === newLines[firstDiff]) firstDiff++;
  let lastOld = oldLines.length - 1;
  let lastNew = newLines.length - 1;
  while (lastOld > firstDiff && lastNew > firstDiff && oldLines[lastOld] === newLines[lastNew]) { lastOld--; lastNew--; }

  const ctxBefore = Math.max(0, firstDiff - 3);
  const ctxAfterOld = Math.min(oldLines.length - 1, lastOld + 3);
  const ctxAfterNew = Math.min(newLines.length - 1, lastNew + 3);

  output.push(`@@ -${ctxBefore + 1},${ctxAfterOld - ctxBefore + 1} +${ctxBefore + 1},${ctxAfterNew - ctxBefore + 1} @@`);
  for (let i = ctxBefore; i < firstDiff; i++) output.push(` ${oldLines[i]}`);
  for (let i = firstDiff; i <= lastOld; i++) output.push(`-${oldLines[i]}`);
  for (let i = firstDiff; i <= lastNew; i++) output.push(`+${newLines[i]}`);
  for (let i = lastOld + 1; i <= ctxAfterOld; i++) output.push(` ${oldLines[i]}`);

  return output.join('\n');
}
```

Then modify the edit tool's execute function to use fuzzy matching on exact match failure and return diff:

```typescript
execute: async (_id: string, { path, oldText, newText }: Static<typeof EditSchema>) => {
  try {
    const abs = resolve(path);
    if (!existsSync(abs)) return textResult(`Error: File not found: ${path}`);
    const content = readFileSync(abs, 'utf-8');

    // Exact match
    if (content.includes(oldText)) {
      const occurrences = content.split(oldText).length - 1;
      if (occurrences > 1) {
        return textResult(`Error: Found ${occurrences} occurrences of the text in ${path}. The text must be unique. Please provide more context to make it unique.`);
      }
      const newContent = content.replace(oldText, newText);
      writeFileSync(abs, newContent, 'utf-8');
      const diff = generateDiff(content, newContent, path);
      return textResult(`Successfully replaced text in ${path}.\n\n${diff}`);
    }

    // Fuzzy match fallback
    const matches = fuzzyFind(content, oldText);
    if (matches.length === 0) {
      return textResult(`Error: Could not find the exact text in ${path}. The old text must match exactly including all whitespace and newlines.`);
    }
    if (matches.length > 1) {
      const locations = matches.map(m => `  line ${m.start + 1}`).join('\n');
      return textResult(`Error: Found multiple fuzzy matches in ${path}:\n${locations}\nPlease provide more context to make it unique.`);
    }

    // Single fuzzy match — apply
    const match = matches[0];
    const newContent = content.replace(match.matched, newText);
    writeFileSync(abs, newContent, 'utf-8');
    const diff = generateDiff(content, newContent, path);
    return textResult(`Fuzzy match applied in ${path}. Matched text differed in whitespace/minor edits.\n\n${diff}`);
  } catch (e: any) {
    return textResult(`Error editing file: ${e.message}`);
  }
},
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest --run test/edit-fuzzy.test.ts`
Expected: PASS

**Step 5: Run existing tests to verify no regressions**

Run: `npx vitest --run`
Expected: All existing tests PASS

**Step 6: Commit**

```bash
git add src/sandbox/tools/coding.ts test/edit-fuzzy.test.ts
git commit -m "feat: add fuzzy matching and diff output to edit tool"
```

---

### Task 3: Dense Journal Template

**Files:**
- Modify: `src/sandbox/journal.ts`
- Modify: `test/journal.test.ts`

**Step 1: Update the failing tests**

Add new tests and update existing ones in `test/journal.test.ts`:

```typescript
// Add to existing test/journal.test.ts

describe('dense journal template', () => {
  it('seedJournal creates dense template with State section', () => {
    const dir = mkdtempSync(join(tmpdir(), 'journal-'));
    const path = join(dir, 'journal.md');
    seedJournal(path);
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('### State');
    expect(content).toContain('Phase:');
    expect(content).toContain('### Key Decisions');
    expect(content).toContain('### Current Progress');
    expect(content).toContain('### Remaining Work');
    expect(content).toContain('### Errors & Blockers');
  });
});

describe('journal rotation', () => {
  it('rotateJournal renames to journal-001.md and creates fresh template', () => {
    const dir = mkdtempSync(join(tmpdir(), 'journal-'));
    const journalPath = join(dir, 'journal.md');
    writeFileSync(journalPath, '## Journal Entry 1\n### State\n- Phase: coding\n');
    const rotatedPath = rotateJournal(dir, journalPath);
    expect(rotatedPath).toContain('journal-001.md');
    expect(readFileSync(rotatedPath, 'utf-8')).toContain('Phase: coding');
    // Fresh journal created
    expect(existsSync(journalPath)).toBe(true);
    expect(readFileSync(journalPath, 'utf-8')).toContain('### State');
    expect(readFileSync(journalPath, 'utf-8')).not.toContain('Phase: coding');
  });

  it('rotateJournal increments counter', () => {
    const dir = mkdtempSync(join(tmpdir(), 'journal-'));
    const journalPath = join(dir, 'journal.md');
    writeFileSync(journalPath, 'entry 1');
    rotateJournal(dir, journalPath);
    writeFileSync(journalPath, 'entry 2');
    const second = rotateJournal(dir, journalPath);
    expect(second).toContain('journal-002.md');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest --run test/journal.test.ts`
Expected: FAIL — new template assertions fail, `rotateJournal` not found

**Step 3: Implement dense template and rotation**

Replace the TEMPLATE and add `rotateJournal` in `src/sandbox/journal.ts`:

```typescript
import { writeFileSync, readFileSync, existsSync, renameSync, readdirSync } from 'fs';

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

/**
 * Rotate journal: rename current journal.md to journal-{N}.md,
 * create fresh journal.md with empty template.
 * Returns the path of the rotated file.
 */
export function rotateJournal(dir: string, journalPath: string): string {
  // Find next rotation number
  const existing = readdirSync(dir).filter(f => /^journal-\d{3}\.md$/.test(f));
  const nextNum = existing.length + 1;
  const rotatedName = `journal-${String(nextNum).padStart(3, '0')}.md`;
  const rotatedPath = `${dir}/${rotatedName}`;

  renameSync(journalPath, rotatedPath);
  writeFileSync(journalPath, TEMPLATE, 'utf-8');

  return rotatedPath;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest --run test/journal.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/sandbox/journal.ts test/journal.test.ts
git commit -m "feat: dense journal template and rotation for context management"
```

---

### Task 4: ContextManager — Token Tracking, Context Reset, Retry, Iteration Enforcement

**Files:**
- Create: `src/sandbox/context-manager.ts`
- Create: `test/context-manager.test.ts`

**Step 1: Write the failing tests**

```typescript
// test/context-manager.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ContextManager } from '../src/sandbox/context-manager.js';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function makeManager(opts: {
  maxIterations?: number;
  contextWindow?: number;
  runDir?: string;
} = {}) {
  const dir = opts.runDir || mkdtempSync(join(tmpdir(), 'ctx-mgr-'));
  const journalPath = join(dir, 'journal.md');
  writeFileSync(journalPath, '## Journal Entry 1\n### State\n- Phase: coding\n### Key Decisions\nDecided to use X\n');
  return {
    manager: new ContextManager({
      maxIterations: opts.maxIterations ?? 50,
      contextWindow: opts.contextWindow ?? 128_000,
      runDir: dir,
      journalPath,
    }),
    dir,
    journalPath,
  };
}

describe('token tracking', () => {
  it('accumulates input/output tokens from message_end events', () => {
    const { manager } = makeManager();
    manager.onEvent({
      type: 'message_end',
      message: { usage: { input: 1000, output: 500 } },
    } as any);
    manager.onEvent({
      type: 'message_end',
      message: { usage: { input: 2000, output: 800 } },
    } as any);
    expect(manager.getTokenSummary()).toEqual({ input: 3000, output: 1300 });
  });

  it('handles events without usage gracefully', () => {
    const { manager } = makeManager();
    manager.onEvent({ type: 'message_end', message: {} } as any);
    expect(manager.getTokenSummary()).toEqual({ input: 0, output: 0 });
  });
});

describe('shouldReset', () => {
  it('returns true when input tokens exceed 80% of context window', () => {
    const { manager } = makeManager({ contextWindow: 10_000 });
    manager.onEvent({
      type: 'message_end',
      message: { usage: { input: 8500, output: 0 } },
    } as any);
    expect(manager.shouldReset()).toBe(true);
  });

  it('returns false when under threshold', () => {
    const { manager } = makeManager({ contextWindow: 128_000 });
    manager.onEvent({
      type: 'message_end',
      message: { usage: { input: 5000, output: 0 } },
    } as any);
    expect(manager.shouldReset()).toBe(false);
  });
});

describe('iteration enforcement', () => {
  it('counts turns via turn_end events', () => {
    const { manager } = makeManager({ maxIterations: 3 });
    manager.onEvent({ type: 'turn_end' } as any);
    manager.onEvent({ type: 'turn_end' } as any);
    expect(manager.shouldEnforceLimit()).toBe(false);
    manager.onEvent({ type: 'turn_end' } as any);
    expect(manager.shouldEnforceLimit()).toBe(true);
  });

  it('returns steering message at limit', () => {
    const { manager } = makeManager({ maxIterations: 2 });
    manager.onEvent({ type: 'turn_end' } as any);
    manager.onEvent({ type: 'turn_end' } as any);
    const msg = manager.getSteeringMessage();
    expect(msg).toContain('iteration limit');
    expect(msg).toContain('deliver_patch');
  });

  it('shouldForceTerminate after limit + 2 grace turns', () => {
    const { manager } = makeManager({ maxIterations: 2 });
    for (let i = 0; i < 4; i++) manager.onEvent({ type: 'turn_end' } as any);
    expect(manager.shouldForceTerminate()).toBe(true);
  });
});

describe('performReset', () => {
  it('rotates journal and returns recovery message', async () => {
    const { manager, dir, journalPath } = makeManager();
    // Simulate token accumulation
    manager.onEvent({
      type: 'message_end',
      message: { usage: { input: 5000, output: 1000 } },
    } as any);

    const recovery = await manager.performReset();

    // Journal rotated
    expect(existsSync(join(dir, 'journal-001.md'))).toBe(true);
    expect(readFileSync(join(dir, 'journal-001.md'), 'utf-8')).toContain('Phase: coding');

    // Fresh journal created
    expect(readFileSync(journalPath, 'utf-8')).not.toContain('Phase: coding');

    // Recovery message contains old journal content
    expect(recovery).toContain('Phase: coding');
    expect(recovery).toContain('Continue the task');

    // Token counters reset
    expect(manager.getTokenSummary()).toEqual({ input: 0, output: 0 });
  });
});

describe('retry logic', () => {
  it('getRetryDelay returns exponential backoff', () => {
    const { manager } = makeManager();
    expect(manager.getRetryDelay(0)).toBe(2000);
    expect(manager.getRetryDelay(1)).toBe(4000);
    expect(manager.getRetryDelay(2)).toBe(8000);
  });

  it('getRetryDelay caps at maxDelay', () => {
    const { manager } = makeManager();
    expect(manager.getRetryDelay(10)).toBeLessThanOrEqual(60_000);
  });

  it('shouldRetry returns true for retryable errors within limit', () => {
    const { manager } = makeManager();
    expect(manager.shouldRetry('rate_limit', 0)).toBe(true);
    expect(manager.shouldRetry('server_error', 2)).toBe(true);
    expect(manager.shouldRetry('server_error', 3)).toBe(false); // exceeded max
  });

  it('shouldRetry returns false for non-retryable errors', () => {
    const { manager } = makeManager();
    expect(manager.shouldRetry('invalid_request', 0)).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest --run test/context-manager.test.ts`
Expected: FAIL — module not found

**Step 3: Implement ContextManager**

```typescript
// src/sandbox/context-manager.ts
import { readJournal, rotateJournal } from './journal.js';

const RESET_THRESHOLD = 0.8;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 60_000;
const GRACE_TURNS = 2;

const RETRYABLE_ERRORS = new Set(['rate_limit', 'server_error', 'timeout', 'overloaded']);

export interface ContextManagerOptions {
  maxIterations: number;
  contextWindow: number;
  runDir: string;
  journalPath: string;
}

export class ContextManager {
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private turnCount = 0;
  private resetCount = 0;
  private readonly maxIterations: number;
  private readonly contextWindow: number;
  private readonly runDir: string;
  private readonly journalPath: string;

  constructor(opts: ContextManagerOptions) {
    this.maxIterations = opts.maxIterations;
    this.contextWindow = opts.contextWindow;
    this.runDir = opts.runDir;
    this.journalPath = opts.journalPath;
  }

  /** Call this from agent.subscribe() for every event */
  onEvent(event: any): void {
    if (event.type === 'message_end') {
      const usage = event.message?.usage;
      if (usage) {
        this.totalInputTokens += usage.input || 0;
        this.totalOutputTokens += usage.output || 0;
      }
    }
    if (event.type === 'turn_end') {
      this.turnCount++;
    }
  }

  getTokenSummary(): { input: number; output: number } {
    return { input: this.totalInputTokens, output: this.totalOutputTokens };
  }

  /** True when cumulative input tokens exceed threshold */
  shouldReset(): boolean {
    return this.totalInputTokens > this.contextWindow * RESET_THRESHOLD;
  }

  /** True when turn count reaches maxIterations */
  shouldEnforceLimit(): boolean {
    return this.turnCount >= this.maxIterations;
  }

  /** True when turn count exceeds maxIterations + grace period */
  shouldForceTerminate(): boolean {
    return this.turnCount >= this.maxIterations + GRACE_TURNS;
  }

  /** Steering message to inject when iteration limit is reached */
  getSteeringMessage(): string {
    return 'You have reached the maximum iteration limit. Call deliver_patch now with your current progress. If you cannot deliver, update the journal with status PARTIAL and explain what remains.';
  }

  /**
   * Perform context reset:
   * 1. Rotate journal file
   * 2. Reset token counters
   * 3. Return recovery message for re-prompting the agent
   */
  async performReset(): Promise<string> {
    const journalContent = readJournal(this.journalPath);
    rotateJournal(this.runDir, this.journalPath);
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.resetCount++;

    return `Continue the task. This is context reset #${this.resetCount}. Your previous execution journal:\n\n${journalContent}`;
  }

  /** Exponential backoff delay for retry attempt N */
  getRetryDelay(attempt: number): number {
    return Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
  }

  /** Whether an error type is retryable and within retry limit */
  shouldRetry(errorType: string, attempt: number): boolean {
    if (attempt >= MAX_RETRIES) return false;
    return RETRYABLE_ERRORS.has(errorType);
  }

  get resets(): number {
    return this.resetCount;
  }

  get turns(): number {
    return this.turnCount;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest --run test/context-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/sandbox/context-manager.ts test/context-manager.test.ts
git commit -m "feat: add ContextManager for token tracking, context reset, retry, iteration enforcement"
```

---

### Task 5: Update System Prompt

**Files:**
- Modify: `src/sandbox/prompts.ts`

**Step 1: Update the system prompt**

Add search tool descriptions, updated journal rules, and iteration enforcement notice to `src/sandbox/prompts.ts`. Changes to `buildSandboxSystemPrompt()`:

```typescript
// Replace the journal section (lines 43-49) with:

# Journal (MANDATORY — update after EVERY tool call batch)
A journal file exists at /minion-run/journal.md with a structured template.
You MUST keep it updated with facts only — no narrative text.

Rules:
- Update ### State on every phase transition (planning → coding → testing → debugging → delivering)
- After each tool call batch: append concrete facts to ### Current Progress
- Use full file paths, not relative references
- Keep only key error lines in ### Errors & Blockers (no full stack traces)
- Mark completed items explicitly in ### Current Progress
- Update "Files modified" and "Files read" lists in ### State
- Before deliver_patch: set ### Remaining Work to "(none)" if complete, or list what remains

Failure to update the journal is considered a task failure.
The journal is your persistent memory — if context is reset, you will recover from it.

// Replace the tool usage policy section (lines 52-55) with:

# Tool usage policy
- Use read (not cat) to examine files before editing
- Use edit for precise changes. You MUST read a file before editing it.
- Use write only for new files or complete rewrites
- Use grep to search file contents by regex pattern — prefer over bash grep
- Use find to discover files by glob pattern — prefer over bash find
- Use ls to list directory contents with metadata
- Batch independent tool calls in a single message for parallel execution

// Add before "# Essential constraints" (line 67):

# Iteration limit
You have a hard limit of ${ctx.maxIterations} iterations (LLM turns).
When you approach this limit, prioritize delivering patches with your current progress.
If you receive a steering message about the iteration limit, call deliver_patch immediately.
```

**Step 2: Verify build passes**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/sandbox/prompts.ts
git commit -m "feat: update system prompt with search tools, dense journal rules, iteration limit"
```

---

### Task 6: Integration — Wire Everything into main.ts

**Files:**
- Modify: `src/sandbox/main.ts`

**Step 1: Integrate search tools, ContextManager, and agent loop changes**

Modify `src/sandbox/main.ts`:

```typescript
// Add imports at top:
import { grepTool, findTool, lsTool } from './tools/search.js';
import { ContextManager } from './context-manager.js';

// In the tools array (line 68-74), add search tools:
const tools: any[] = [
  bashTool,
  readTool,
  editTool,
  writeTool,
  grepTool,
  findTool,
  lsTool,
  createDeliverPatchTool('/workspace'),
];

// After agent creation (line 89), create ContextManager:
const contextWindow = parseInt(process.env.LLM_CONTEXT_WINDOW || '128000', 10);
const ctxManager = new ContextManager({
  maxIterations: ctx.maxIterations,
  contextWindow,
  runDir: '/minion-run',
  journalPath: SANDBOX_PATHS.JOURNAL,
});

// Replace the agent.subscribe() block (lines 92-113) with:
agent.subscribe((event: any) => {
  try {
    // Existing logging
    if (event.type === 'tool_execution_start') {
      console.error(`[sandbox:tool] ${event.toolName} args=${JSON.stringify(event.args ?? event.input ?? {}).substring(0, 200)}`);
    } else if (event.type === 'tool_execution_end') {
      console.error(`[sandbox:tool_done] ${event.toolName} error=${event.isError || false}`);
    } else if (event.type === 'message_end') {
      const msg = event.message;
      const types = msg?.content?.map((c: any) => c.type).join(',') || '';
      console.error(`[sandbox:msg] stopReason=${msg?.stopReason} types=${types}`);
    } else if (event.type === 'agent_end') {
      const last = event.messages?.[event.messages.length - 1];
      if (last?.errorMessage) console.error(`[sandbox:error] ${last.errorMessage}`);
      console.error(`[sandbox:event] agent_end`);
    }
  } catch (e) {
    // Never let logging crash the agent
  }

  // Feed events to ContextManager
  ctxManager.onEvent(event);

  if (event.type === 'turn_start' || event.type === 'tool_execution_start') {
    updateStatus(event);
  }
});

// Replace the simple agent.prompt() call (lines 116-118) with the managed loop:
console.error('[sandbox] Calling agent.prompt()...');

let done = false;
while (!done) {
  try {
    await agent.prompt(ctx.description);
    done = true;
  } catch (err: any) {
    const errorMsg = String(err.message || err);
    console.error(`[sandbox] Agent error: ${errorMsg}`);

    // Check if context overflow — perform reset
    if (errorMsg.includes('context') && errorMsg.includes('overflow') || errorMsg.includes('too long')) {
      console.error('[sandbox] Context overflow detected, performing journal-based reset...');
      const recovery = await ctxManager.performReset();
      agent.clearMessages();
      ctx.description = recovery; // Next loop iteration will prompt with recovery
      continue;
    }

    // Check if retryable error
    const errorType = classifyError(errorMsg);
    const attempt = 0; // Simple retry counter per error
    if (ctxManager.shouldRetry(errorType, attempt)) {
      const delay = ctxManager.getRetryDelay(attempt);
      console.error(`[sandbox] Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    // Non-retryable — rethrow
    throw err;
  }
}

// After the loop, check for context reset and iteration enforcement:
// (These are handled via agent events during execution)

console.error(`[sandbox] agent.prompt() returned, turns=${ctxManager.turns} tokens=${JSON.stringify(ctxManager.getTokenSummary())}`);

// Add helper function:
function classifyError(msg: string): string {
  if (msg.includes('429') || msg.includes('rate')) return 'rate_limit';
  if (msg.includes('500') || msg.includes('502') || msg.includes('503')) return 'server_error';
  if (msg.includes('timeout')) return 'timeout';
  if (msg.includes('overloaded')) return 'overloaded';
  return 'unknown';
}
```

**Important note on iteration enforcement:** The Agent class runs its own internal loop. To enforce iteration limits mid-run, we need to use the `steer()` method. However, `steer()` can only be called while the agent is streaming. The practical approach is to check `shouldEnforceLimit()` in the `turn_end` event handler and use `agent.steer()`:

```typescript
// Inside agent.subscribe(), add after ctxManager.onEvent(event):
if (event.type === 'turn_end') {
  if (ctxManager.shouldForceTerminate()) {
    console.error('[sandbox] Force terminating — iteration limit + grace exceeded');
    agent.abort();
  } else if (ctxManager.shouldEnforceLimit()) {
    console.error('[sandbox] Iteration limit reached, steering agent to deliver');
    agent.steer({
      role: 'user',
      content: [{ type: 'text', text: ctxManager.getSteeringMessage() }],
      timestamp: Date.now(),
    } as any);
  }

  // Check for context reset
  if (ctxManager.shouldReset()) {
    console.error('[sandbox] Token threshold reached, will reset after current run');
    // Reset happens after agent.prompt() returns — re-enter loop
  }
}
```

**Step 2: Verify build passes**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/sandbox/main.ts
git commit -m "feat: integrate search tools, ContextManager into sandbox agent"
```

---

### Task 7: Update Build Pipeline

**Files:**
- Modify: `scripts/copy-sandbox.js`
- Modify: `src/types/shared.ts`

**Step 1: Add new files to copy-sandbox.js**

Add `search.js` and `context-manager.js` to the files array in `scripts/copy-sandbox.js`:

```javascript
const files = [
  { src: 'sandbox/main.js', dst: 'sandbox/main.js' },
  { src: 'sandbox/presets.js', dst: 'sandbox/presets.js' },
  { src: 'sandbox/prompts.js', dst: 'sandbox/prompts.js' },
  { src: 'sandbox/journal.js', dst: 'sandbox/journal.js' },
  { src: 'sandbox/context-manager.js', dst: 'sandbox/context-manager.js' },
  { src: 'sandbox/tools/deliver-patch.js', dst: 'sandbox/tools/deliver-patch.js' },
  { src: 'sandbox/tools/coding.js', dst: 'sandbox/tools/coding.js' },
  { src: 'sandbox/tools/search.js', dst: 'sandbox/tools/search.js' },
  { src: 'llm/provider-aliases.js', dst: 'llm/provider-aliases.js' },
  { src: 'types/shared.js', dst: 'types/shared.js' },
];
```

**Step 2: Add EXIT_TIMEOUT to shared.ts**

Add a new exit code for iteration timeout in `src/types/shared.ts`:

```typescript
export const EXIT_SUCCESS = 0;
export const EXIT_CRASH = 1;
export const EXIT_NO_PATCHES = 2;
export const EXIT_TIMEOUT = 3;
```

**Step 3: Verify full build pipeline**

Run: `npm run build && node scripts/copy-sandbox.js`
Expected: All files compile and copy successfully, including new `search.js` and `context-manager.js`

**Step 4: Commit**

```bash
git add scripts/copy-sandbox.js src/types/shared.ts
git commit -m "feat: update build pipeline for search tools and context manager"
```

---

### Task 8: Full Build Verification and Test Suite

**Files:**
- No new files — verification only

**Step 1: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 2: Run full test suite**

Run: `npx vitest --run`
Expected: All tests pass (existing + new tests for search, edit-fuzzy, journal, context-manager)

**Step 3: Run build pipeline**

Run: `npm run build && node scripts/copy-sandbox.js`
Expected: Clean build, all sandbox files copied to `~/.minion/pi-runtime/`

**Step 4: Verify copied files exist**

Run: `ls -la ~/.minion/pi-runtime/sandbox/tools/search.js ~/.minion/pi-runtime/sandbox/context-manager.js`
Expected: Both files exist

**Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address build/test issues from sandbox agent enhancements"
```

---

## Task Dependency Graph

```
Task 1 (search tools)     ──┐
Task 2 (fuzzy edit)        ──┤
Task 3 (dense journal)     ──┼── Task 5 (prompts) ── Task 6 (main.ts integration) ── Task 7 (build pipeline) ── Task 8 (verification)
Task 4 (context manager)  ──┘
```

Tasks 1–4 are independent and can be executed in parallel.
Task 5 depends on Tasks 1, 3 (references search tools and journal format in prompt).
Task 6 depends on Tasks 1, 4, 5 (imports search tools, ContextManager, uses updated prompt).
Task 7 depends on Task 6 (needs all new files to exist).
Task 8 depends on all previous tasks.

## Key Reference Files

| File | Purpose | Read before modifying |
|------|---------|----------------------|
| `src/sandbox/tools/coding.ts` | Existing tools — edit tool lives here | Yes |
| `src/sandbox/main.ts` | Agent entry point — integration target | Yes |
| `src/sandbox/journal.ts` | Journal template and helpers | Yes |
| `src/sandbox/prompts.ts` | System prompt builder | Yes |
| `scripts/copy-sandbox.js` | Build pipeline — file copy list | Yes |
| `src/types/shared.ts` | Shared constants (exit codes, paths) | Yes |
| `node_modules/@mariozechner/pi-agent-core/dist/agent.d.ts` | Agent API (clearMessages, steer, prompt, subscribe) | Reference |
| `node_modules/@mariozechner/pi-agent-core/dist/types.d.ts` | AgentTool, AgentEvent, AgentState types | Reference |
