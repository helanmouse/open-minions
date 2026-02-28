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
      if (!content.includes(oldText)) {
        return textResult(`Error: Could not find the exact text in ${path}. The old text must match exactly including all whitespace and newlines.`);
      }
      const occurrences = content.split(oldText).length - 1;
      if (occurrences > 1) {
        return textResult(`Error: Found ${occurrences} occurrences of the text in ${path}. The text must be unique. Please provide more context to make it unique.`);
      }
      writeFileSync(abs, content.replace(oldText, newText), 'utf-8');
      return textResult(`Successfully replaced text in ${path}. Changed ${oldText.length} characters to ${newText.length} characters.`);
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
