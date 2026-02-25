import { execFileSync } from 'child_process';
import { mkdirSync } from 'fs';
import type { AgentTool } from './types.js';

export const gitTool: AgentTool = {
  name: 'git',
  description: 'Execute git commands: init, clone, add, commit, format-patch, etc.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Git subcommand (init, clone, add, commit, format-patch, etc.)' },
      args: { type: 'array', items: { type: 'string' }, description: 'Arguments for the git command' },
    },
    required: ['command'],
  },
  async execute(params, ctx) {
    const args = [params.command, ...(params.args || [])];
    // Ensure output directory exists for format-patch
    if (params.command === 'format-patch') {
      const odIdx = args.indexOf('--output-directory');
      if (odIdx !== -1 && args[odIdx + 1]) {
        mkdirSync(args[odIdx + 1], { recursive: true });
      }
    }
    try {
      const output = execFileSync('git', args, {
        cwd: ctx.workdir,
        encoding: 'utf-8',
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { success: true, output };
    } catch (e: any) {
      return {
        success: false,
        output: e.stdout || '',
        error: e.stderr || e.message,
      };
    }
  },
};
