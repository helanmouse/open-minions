import { execFileSync } from 'child_process';
import type { AgentTool } from './types.js';

export const searchCodeTool: AgentTool = {
  name: 'search_code',
  description: 'Search code using ripgrep. Falls back to grep if rg not available.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Search pattern (regex)' },
      glob: { type: 'string', description: 'File glob filter, e.g. "*.ts"' },
    },
    required: ['pattern'],
  },
  async execute(params, ctx) {
    const args = ['--line-number', '--no-heading'];
    if (params.glob) args.push('--glob', params.glob);
    args.push(params.pattern, '.');
    try {
      const output = execFileSync('rg', args, {
        cwd: ctx.workdir, encoding: 'utf-8', timeout: 30_000, maxBuffer: 1024 * 1024,
      });
      return { success: true, output };
    } catch (e: any) {
      if (e.status === 1) return { success: true, output: 'No matches found' };
      // Fallback to grep
      try {
        const output = execFileSync('grep', ['-rn', params.pattern, '.'], {
          cwd: ctx.workdir, encoding: 'utf-8', timeout: 30_000,
        });
        return { success: true, output };
      } catch {
        return { success: false, output: '', error: 'Search failed' };
      }
    }
  },
};
