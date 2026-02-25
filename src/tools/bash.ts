import { execSync } from 'child_process';
import type { AgentTool } from './types.js';

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,
  /mkfs/,
  /dd\s+if=/,
  /:(){ :\|:& };:/,
  />\s*\/dev\/sd/,
];

export const bashTool: AgentTool = {
  name: 'bash',
  description: 'Execute a shell command in the working directory',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
    },
    required: ['command'],
  },
  async execute(params, ctx) {
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(params.command)) {
        return { success: false, output: '', error: 'Blocked: dangerous command' };
      }
    }
    try {
      const output = execSync(params.command, {
        cwd: ctx.workdir,
        encoding: 'utf-8',
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
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
