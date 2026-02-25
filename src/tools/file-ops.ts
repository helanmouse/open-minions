import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import type { AgentTool } from './types.js';

function safePath(workdir: string, path: string): string {
  const resolved = resolve(join(workdir, path));
  const normalizedWorkdir = resolve(workdir) + '/';
  if (resolved !== resolve(workdir) && !resolved.startsWith(normalizedWorkdir)) {
    throw new Error('Path traversal blocked');
  }
  return resolved;
}

export const readTool: AgentTool = {
  name: 'read',
  description: 'Read file contents',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Relative file path' } },
    required: ['path'],
  },
  async execute(params, ctx) {
    try {
      const full = safePath(ctx.workdir, params.path);
      return { success: true, output: readFileSync(full, 'utf-8') };
    } catch (e: any) {
      return { success: false, output: '', error: e.message };
    }
  },
};

export const writeTool: AgentTool = {
  name: 'write',
  description: 'Write content to a file, creating directories as needed',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative file path' },
      content: { type: 'string', description: 'File content' },
    },
    required: ['path', 'content'],
  },
  async execute(params, ctx) {
    try {
      const full = safePath(ctx.workdir, params.path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, params.content);
      return { success: true, output: `Wrote ${params.path}` };
    } catch (e: any) {
      return { success: false, output: '', error: e.message };
    }
  },
};

export const editTool: AgentTool = {
  name: 'edit',
  description: 'Replace a string in a file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      old_string: { type: 'string' },
      new_string: { type: 'string' },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  async execute(params, ctx) {
    try {
      const full = safePath(ctx.workdir, params.path);
      const content = readFileSync(full, 'utf-8');
      if (!content.includes(params.old_string)) {
        return { success: false, output: '', error: 'old_string not found in file' };
      }
      writeFileSync(full, content.replace(params.old_string, params.new_string));
      return { success: true, output: `Edited ${params.path}` };
    } catch (e: any) {
      return { success: false, output: '', error: e.message };
    }
  },
};

export const listFilesTool: AgentTool = {
  name: 'list_files',
  description: 'List files in a directory',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Relative directory path' } },
    required: ['path'],
  },
  async execute(params, ctx) {
    try {
      const full = safePath(ctx.workdir, params.path);
      const entries = readdirSync(full, { withFileTypes: true });
      const lines = entries.map(e => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`);
      return { success: true, output: lines.join('\n') };
    } catch (e: any) {
      return { success: false, output: '', error: e.message };
    }
  },
};
