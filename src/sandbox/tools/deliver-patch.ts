import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type, type Static } from '@sinclair/typebox';
import { execFileSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';

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

      // Check for uncommitted changes
      const status = execFileSync('git', ['status', '--porcelain'], {
        cwd: workdir, encoding: 'utf-8',
      }).trim();

      if (status) {
        // Stage + Commit (exclude non-project dirs like .claude/)
        execFileSync('git', ['add', '--', '.', ':!.claude'], { cwd: workdir });
        execFileSync('git', ['commit', '-m', `feat: ${summary}`], {
          cwd: workdir, encoding: 'utf-8',
        });
      }

      // Count commits ahead of the initial commit (first commit has no parent)
      // Use rev-list to find all commits not reachable from the initial commit
      const initialCommit = execFileSync('git', ['rev-list', '--max-parents=0', 'HEAD'], {
        cwd: workdir, encoding: 'utf-8',
      }).trim().split('\n')[0];

      const commitCount = parseInt(
        execFileSync('git', ['rev-list', '--count', `${initialCommit}..HEAD`], {
          cwd: workdir, encoding: 'utf-8',
        }).trim(), 10,
      );

      if (commitCount === 0) {
        throw new Error('No changes detected — nothing to deliver');
      }

      // Generate patches for all commits after the initial one
      const patchDir = '/minion-run/patches';
      execFileSync('mkdir', ['-p', patchDir]);
      const result = execFileSync('git', [
        'format-patch', initialCommit, '--output-directory', patchDir,
      ], { cwd: workdir, encoding: 'utf-8' });

      const patchCount = result.trim().split('\n').filter(Boolean).length;

      // Auto-update journal if agent didn't fill it in
      const journalPath = '/minion-run/journal.md';
      try {
        const journal = readFileSync(journalPath, 'utf-8');
        if (journal.includes('<!-- Update this section')) {
          // Journal still has template placeholders — write a fallback entry
          const fallback = `## Plan\n${summary}\n\n## Execution Log\n1. Task completed, patch delivered.\n\n## Verification\nPatch generated successfully.\n\n## Status\nCOMPLETED\n`;
          writeFileSync(journalPath, fallback, 'utf-8');
        }
      } catch {
        // Journal file missing — create one
        writeFileSync(journalPath, `## Plan\n${summary}\n\n## Status\nCOMPLETED\n`, 'utf-8');
      }

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
