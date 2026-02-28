/**
 * Sandbox search tools — grep, find, ls
 * Provides dedicated search capabilities for the sandbox agent.
 */
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type, type Static } from '@sinclair/typebox';
import { readdirSync, statSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

function textResult(text: string): AgentToolResult<Record<string, never>> {
  return { content: [{ type: 'text', text }], details: {} as Record<string, never> };
}

// --- grep ---
const GrepSchema = Type.Object({
  pattern: Type.String({ description: 'Regex pattern to search for' }),
  path: Type.Optional(Type.String({ description: 'Directory to search in (default: current dir)' })),
  include: Type.Optional(Type.String({ description: 'Glob filter for files (e.g. "*.ts")' })),
  context: Type.Optional(Type.Number({ description: 'Context lines around matches (default: 2)' })),
});

const MAX_GREP_LINES = 200;

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --is-inside-work-tree', { cwd: dir });
    return true;
  } catch {
    return false;
  }
}

export const grepTool: AgentTool<typeof GrepSchema> = {
  name: 'grep',
  label: 'grep',
  description: 'Search file contents using regex. Uses git grep in git repos (respects .gitignore), falls back to grep otherwise. Returns matching lines with line numbers.',
  parameters: GrepSchema,
  execute: async (_id: string, params: Static<typeof GrepSchema>) => {
    try {
      const dir = resolve(params.path ?? '.');
      const ctx = params.context ?? 2;

      if (!existsSync(dir)) return textResult(`Error: Directory not found: ${dir}`);

      let cmd: string;
      if (await isGitRepo(dir)) {
        cmd = `git grep -n -C${ctx} -E ${escapeShellArg(params.pattern)}`;
        if (params.include) cmd += ` -- ${escapeShellArg(params.include)}`;
      } else {
        cmd = `grep -rn -C${ctx} -E ${escapeShellArg(params.pattern)} .`;
        if (params.include) cmd += ` --include=${escapeShellArg(params.include)}`;
        cmd += ' --exclude-dir=.git --exclude-dir=node_modules';
      }

      const { stdout } = await execAsync(cmd, { cwd: dir, maxBuffer: 10 * 1024 * 1024, timeout: 15_000 });
      const lines = stdout.split('\n');
      if (lines.length > MAX_GREP_LINES) {
        const truncated = lines.slice(0, MAX_GREP_LINES).join('\n');
        return textResult(truncated + `\n\n[Truncated: showing ${MAX_GREP_LINES} of ${lines.length} lines. Narrow your search.]`);
      }
      return textResult(stdout || '(no matches)');
    } catch (e: any) {
      if (e.code === 1 && !e.stderr) return textResult('(no matches)');
      return textResult(`Error running grep: ${e.message}`);
    }
  },
};

// --- find ---
const FindSchema = Type.Object({
  pattern: Type.String({ description: 'Pattern to match files. Use "*.ts" for filename matching or "**/*.ts" for recursive matching.' }),
  path: Type.Optional(Type.String({ description: 'Start directory (default: current dir)' })),
});

const MAX_FIND_RESULTS = 500;

export const findTool: AgentTool<typeof FindSchema> = {
  name: 'find',
  label: 'find',
  description: 'Find files by glob pattern. Excludes .git and node_modules directories. Returns matching file paths.',
  parameters: FindSchema,
  execute: async (_id: string, params: Static<typeof FindSchema>) => {
    try {
      const dir = resolve(params.path ?? '.');
      if (!existsSync(dir)) return textResult(`Error: Directory not found: ${dir}`);

      let matchFlag: string;
      let matchPattern: string;
      if (params.pattern.startsWith('**/')) {
        // Strip **/ prefix and use -name with the remainder
        matchFlag = '-name';
        matchPattern = params.pattern.slice(3);
      } else if (params.pattern.includes('/')) {
        // Pattern contains path separators, use -path
        matchFlag = '-path';
        matchPattern = params.pattern;
      } else {
        matchFlag = '-name';
        matchPattern = params.pattern;
      }

      const cmd = `find ${escapeShellArg(dir)} -not -path '*/.git/*' -not -path '*/.git' -not -path '*/node_modules/*' -not -path '*/node_modules' ${matchFlag} ${escapeShellArg(matchPattern)} -type f`;
      const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 15_000 });
      const files = stdout.trim().split('\n').filter(Boolean);
      if (files.length === 0) return textResult('(no files found)');
      if (files.length > MAX_FIND_RESULTS) {
        const truncated = files.slice(0, MAX_FIND_RESULTS).join('\n');
        return textResult(truncated + `\n\n[Truncated: showing ${MAX_FIND_RESULTS} of ${files.length} files. Narrow your pattern.]`);
      }
      return textResult(files.join('\n'));
    } catch (e: any) {
      return textResult(`Error running find: ${e.message}`);
    }
  },
};

// --- ls ---
const LsSchema = Type.Object({
  path: Type.String({ description: 'Directory path to list' }),
});

export const lsTool: AgentTool<typeof LsSchema> = {
  name: 'ls',
  label: 'ls',
  description: 'List directory contents with metadata. Returns name, type (file/dir), and size for each entry, sorted alphabetically.',
  parameters: LsSchema,
  execute: async (_id: string, { path: p }: Static<typeof LsSchema>) => {
    try {
      const dir = resolve(p);
      if (!existsSync(dir)) return textResult(`Error: Directory not found: ${dir}`);

      const entries = readdirSync(dir);
      const rows = entries.sort().map((name) => {
        try {
          const st = statSync(join(dir, name));
          const type = st.isDirectory() ? 'dir' : 'file';
          return `${name}\t${type}\t${st.size}`;
        } catch {
          return `${name}\t?\t?`;
        }
      });
      if (rows.length === 0) return textResult('(empty directory)');
      return textResult(rows.join('\n'));
    } catch (e: any) {
      return textResult(`Error listing directory: ${e.message}`);
    }
  },
};

function escapeShellArg(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}
