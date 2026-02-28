/**
 * Sandbox coding tools — inlined from @mariozechner/coding-agent
 * Returns pi-agent-core compatible { content, details } format.
 */
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type, type Static } from '@sinclair/typebox';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

function textResult(text: string): AgentToolResult<Record<string, never>> {
  return { content: [{ type: 'text', text }], details: {} as Record<string, never> };
}

// --- read ---
const ReadSchema = Type.Object({
  path: Type.String({ description: 'Path to the file to read (relative or absolute)' }),
});

export const readTool: AgentTool<typeof ReadSchema> = {
  name: 'read',
  label: 'read',
  description: 'Read the contents of a file. Returns the full file content as text.',
  parameters: ReadSchema,
  execute: async (_id: string, { path }: Static<typeof ReadSchema>) => {
    try {
      const abs = resolve(path);
      if (!existsSync(abs)) return textResult(`Error: File not found: ${path}`);
      return textResult(readFileSync(abs, 'utf-8'));
    } catch (e: any) {
      return textResult(`Error reading file: ${e.message}`);
    }
  },
};

// --- write ---
const WriteSchema = Type.Object({
  path: Type.String({ description: 'Path to the file to write (relative or absolute)' }),
  content: Type.String({ description: 'Content to write to the file' }),
});

export const writeTool: AgentTool<typeof WriteSchema> = {
  name: 'write',
  label: 'write',
  description: 'Write content to a file. Creates the file if it doesn\'t exist, overwrites if it does. Automatically creates parent directories.',
  parameters: WriteSchema,
  execute: async (_id: string, { path, content }: Static<typeof WriteSchema>) => {
    try {
      const abs = resolve(path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, 'utf-8');
      return textResult(`Successfully wrote ${content.length} bytes to ${path}`);
    } catch (e: any) {
      return textResult(`Error writing file: ${e.message}`);
    }
  },
};

// --- fuzzy matching helpers ---

/** Normalize whitespace: trim each line's leading/trailing whitespace. */
export function normalizeWhitespace(text: string): string {
  return text.split('\n').map(l => l.trimEnd()).join('\n');
}

/** Collapse consecutive blank lines into a single blank line. */
export function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n');
}

/** Line-level Levenshtein distance between two arrays of strings. */
export function lineLevDistance(a: string[], b: string[]): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export interface FuzzyMatch {
  /** The actual text in the file that matched */
  matchedText: string;
  /** 1-based line number where the match starts */
  lineNumber: number;
  /** Which strategy found it */
  strategy: 'whitespace' | 'blankline' | 'levenshtein';
}

/**
 * Try fuzzy matching strategies in order. Returns all candidate matches.
 * Each strategy scans the file for regions of the same line count as oldText
 * and applies its normalization/comparison.
 */
export function fuzzyFind(content: string, oldText: string): FuzzyMatch[] {
  const contentLines = content.split('\n');
  const oldLines = oldText.split('\n');
  const oldLen = oldLines.length;

  // Strategy 1: whitespace normalization
  const normOld = normalizeWhitespace(oldText);
  const matches1: FuzzyMatch[] = [];
  for (let i = 0; i <= contentLines.length - oldLen; i++) {
    const candidate = contentLines.slice(i, i + oldLen).join('\n');
    if (normalizeWhitespace(candidate) === normOld) {
      matches1.push({ matchedText: candidate, lineNumber: i + 1, strategy: 'whitespace' });
    }
  }
  if (matches1.length > 0) return matches1;

  // Strategy 2: blank line tolerance (collapse then compare)
  const collapsedOld = collapseBlankLines(normalizeWhitespace(oldText));
  const collapsedOldLines = collapsedOld.split('\n');
  const matches2: FuzzyMatch[] = [];
  // Sliding window with variable size since collapsing changes line count
  for (let i = 0; i < contentLines.length; i++) {
    // Try windows of varying size around the expected length
    const minWin = Math.max(1, collapsedOldLines.length - 2);
    const maxWin = Math.min(contentLines.length - i, oldLen + 4);
    for (let winSize = minWin; winSize <= maxWin; winSize++) {
      const candidate = contentLines.slice(i, i + winSize).join('\n');
      if (collapseBlankLines(normalizeWhitespace(candidate)) === collapsedOld) {
        matches2.push({ matchedText: candidate, lineNumber: i + 1, strategy: 'blankline' });
        break; // found match at this start position, move on
      }
    }
  }
  if (matches2.length > 0) return matches2;

  // Strategy 3: line-level Levenshtein with <20% difference ratio
  const matches3: FuzzyMatch[] = [];
  const threshold = 0.2;
  for (let i = 0; i <= contentLines.length - oldLen; i++) {
    const candidateLines = contentLines.slice(i, i + oldLen);
    const dist = lineLevDistance(candidateLines, oldLines);
    const ratio = dist / Math.max(oldLen, 1);
    if (ratio < threshold) {
      matches3.push({
        matchedText: candidateLines.join('\n'),
        lineNumber: i + 1,
        strategy: 'levenshtein',
      });
    }
  }
  return matches3;
}

// --- unified diff generation ---

export function generateDiff(oldText: string, newText: string, filePath: string): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Simple LCS-based diff
  const m = oldLines.length, n = newLines.length;
  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to get edit script
  type Op = { type: 'equal' | 'delete' | 'insert'; oldIdx?: number; newIdx?: number; line: string };
  const ops: Op[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.push({ type: 'equal', oldIdx: i - 1, newIdx: j - 1, line: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'insert', newIdx: j - 1, line: newLines[j - 1] });
      j--;
    } else {
      ops.push({ type: 'delete', oldIdx: i - 1, line: oldLines[i - 1] });
      i--;
    }
  }
  ops.reverse();

  // Group into hunks with 3 lines of context
  const contextSize = 3;
  const hunks: string[][] = [];
  let currentHunk: string[] = [];
  let hunkOldStart = 0, hunkNewStart = 0, hunkOldCount = 0, hunkNewCount = 0;
  let inHunk = false;
  let trailingContext = 0;

  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    const isChange = op.type !== 'equal';

    if (isChange) {
      if (!inHunk) {
        // Start new hunk: include up to contextSize preceding equal lines
        inHunk = true;
        currentHunk = [];
        hunkOldCount = 0;
        hunkNewCount = 0;
        const ctxStart = Math.max(0, k - contextSize);
        const oldBase = ops[ctxStart]?.oldIdx ?? ops[ctxStart]?.oldIdx ?? 0;
        const newBase = ops[ctxStart]?.newIdx ?? ops[ctxStart]?.newIdx ?? 0;
        hunkOldStart = (ops[ctxStart]?.type === 'insert') ? oldBase : oldBase;
        hunkNewStart = (ops[ctxStart]?.type === 'delete') ? newBase : newBase;
        // Recalculate start positions
        let oStart = 0, nStart = 0;
        for (let p = 0; p < ctxStart; p++) {
          if (ops[p].type === 'equal' || ops[p].type === 'delete') oStart++;
          if (ops[p].type === 'equal' || ops[p].type === 'insert') nStart++;
        }
        hunkOldStart = oStart;
        hunkNewStart = nStart;
        for (let p = ctxStart; p < k; p++) {
          currentHunk.push(` ${ops[p].line}`);
          if (ops[p].type === 'equal' || ops[p].type === 'delete') hunkOldCount++;
          if (ops[p].type === 'equal' || ops[p].type === 'insert') hunkNewCount++;
        }
      }
      trailingContext = 0;
    }

    if (inHunk) {
      if (op.type === 'equal') {
        currentHunk.push(` ${op.line}`);
        hunkOldCount++;
        hunkNewCount++;
        trailingContext++;
        if (trailingContext >= contextSize) {
          // Check if there are more changes ahead within context range
          let moreChanges = false;
          for (let look = k + 1; look <= Math.min(k + contextSize, ops.length - 1); look++) {
            if (ops[look].type !== 'equal') { moreChanges = true; break; }
          }
          if (!moreChanges) {
            hunks.push([`@@ -${hunkOldStart + 1},${hunkOldCount} +${hunkNewStart + 1},${hunkNewCount} @@`, ...currentHunk]);
            inHunk = false;
          }
        }
      } else if (op.type === 'delete') {
        currentHunk.push(`-${op.line}`);
        hunkOldCount++;
      } else {
        currentHunk.push(`+${op.line}`);
        hunkNewCount++;
      }
    }
  }

  if (inHunk) {
    hunks.push([`@@ -${hunkOldStart + 1},${hunkOldCount} +${hunkNewStart + 1},${hunkNewCount} @@`, ...currentHunk]);
  }

  if (hunks.length === 0) return '';

  const header = `--- a/${filePath}\n+++ b/${filePath}`;
  return header + '\n' + hunks.map(h => h.join('\n')).join('\n');
}

// --- edit ---
const EditSchema = Type.Object({
  path: Type.String({ description: 'Path to the file to edit (relative or absolute)' }),
  oldText: Type.String({ description: 'Exact text to find and replace (must match exactly)' }),
  newText: Type.String({ description: 'New text to replace the old text with' }),
});

export const editTool: AgentTool<typeof EditSchema> = {
  name: 'edit',
  label: 'edit',
  description: 'Edit a file by replacing exact text. The oldText must match exactly (including whitespace). Use this for precise, surgical edits.',
  parameters: EditSchema,
  execute: async (_id: string, { path, oldText, newText }: Static<typeof EditSchema>) => {
    try {
      const abs = resolve(path);
      if (!existsSync(abs)) return textResult(`Error: File not found: ${path}`);
      const content = readFileSync(abs, 'utf-8');

      // Try exact match first
      if (content.includes(oldText)) {
        const occurrences = content.split(oldText).length - 1;
        if (occurrences > 1) {
          return textResult(`Error: Found ${occurrences} occurrences of the text in ${path}. The text must be unique. Please provide more context to make it unique.`);
        }
        const updated = content.replace(oldText, newText);
        writeFileSync(abs, updated, 'utf-8');
        const diff = generateDiff(content, updated, path);
        return textResult(`Successfully replaced text in ${path}. Changed ${oldText.length} characters to ${newText.length} characters.\n\n${diff}`);
      }

      // Exact match failed — try fuzzy matching
      const fuzzyMatches = fuzzyFind(content, oldText);

      if (fuzzyMatches.length === 0) {
        return textResult(`Error: Could not find the exact text in ${path}. The old text must match exactly including all whitespace and newlines.`);
      }

      if (fuzzyMatches.length > 1) {
        const locations = fuzzyMatches.map(m => `  line ${m.lineNumber} (${m.strategy})`).join('\n');
        return textResult(`Error: Found ${fuzzyMatches.length} fuzzy matches in ${path}. Please provide more context to make it unique.\nCandidate locations:\n${locations}`);
      }

      // Single fuzzy match — apply replacement
      const match = fuzzyMatches[0];
      const updated = content.replace(match.matchedText, newText);
      writeFileSync(abs, updated, 'utf-8');
      const diff = generateDiff(content, updated, path);
      return textResult(`Successfully replaced text in ${path}. Changed ${oldText.length} characters to ${newText.length} characters.\nFuzzy match applied (${match.strategy}). Matched text differed in whitespace/minor edits.\n\n${diff}`);
    } catch (e: any) {
      return textResult(`Error editing file: ${e.message}`);
    }
  },
};

// --- bash ---
const BashSchema = Type.Object({
  command: Type.String({ description: 'Bash command to execute' }),
});

export const bashTool: AgentTool<typeof BashSchema> = {
  name: 'bash',
  label: 'bash',
  description: 'Execute a bash command in the current working directory. Returns stdout and stderr. Commands run with a 30 second timeout.',
  parameters: BashSchema,
  execute: async (_id: string, { command }: Static<typeof BashSchema>) => {
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      let output = '';
      if (stdout) output += stdout;
      if (stderr) output += `\nSTDERR:\n${stderr}`;
      return textResult(output || '(no output)');
    } catch (e: any) {
      return textResult(`Error executing command: ${e.message}\nSTDOUT: ${e.stdout || ''}\nSTDERR: ${e.stderr || ''}`);
    }
  },
};
