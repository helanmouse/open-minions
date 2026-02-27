import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type, type Static } from '@sinclair/typebox';
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';

const DeliverPatchSchema = Type.Object({
  summary: Type.String({ description: '任务完成摘要' }),
});

export function createDeliverPatchTool(workdir: string): AgentTool<typeof DeliverPatchSchema> {
  return {
    name: 'deliver_patch',
    label: 'Deliver Patch',
    description: '将代码变更生成 patch 并交付到 /minion-run/patches/',
    parameters: DeliverPatchSchema,

    execute: async (
      _toolCallId: string,
      params: Static<typeof DeliverPatchSchema>,
      _signal?: AbortSignal,
    ): Promise<AgentToolResult<{ patchCount: number }>> => {
      const { summary } = params;

      // Check for changes
      const status = execFileSync('git', ['status', '--porcelain'], {
        cwd: workdir, encoding: 'utf-8',
      });

      if (!status.trim()) {
        throw new Error('No changes detected in workspace');
      }

      // Stage + Commit
      execFileSync('git', ['add', '.'], { cwd: workdir });
      execFileSync('git', ['commit', '-m', `feat: ${summary}`], {
        cwd: workdir, encoding: 'utf-8',
      });

      // Generate patch
      const patchDir = '/minion-run/patches';
      execFileSync('mkdir', ['-p', patchDir]);
      const result = execFileSync('git', [
        'format-patch', 'HEAD~1', '--output-directory', patchDir,
      ], { cwd: workdir, encoding: 'utf-8' });

      const patchCount = result.trim().split('\n').filter(Boolean).length;

      // Update status
      writeFileSync('/minion-run/status.json', JSON.stringify({
        phase: 'done', summary, patchCount,
      }, null, 2));

      return {
        content: [{ type: 'text', text: `Generated ${patchCount} patch(es): ${summary}` }],
        details: { patchCount },
      };
    },
  };
}
