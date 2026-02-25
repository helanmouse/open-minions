import { execFileSync, execSync } from 'child_process';
import { loadProjectConfig, loadRulesForPath } from '../context/loader.js';
import type { BlueprintContext, DeterministicAction } from './blueprint-engine.js';
import type { ToolContext } from '../types.js';

interface GitLabConfig {
  url: string;
  token: string;
}

export function createActions(gitlab: GitLabConfig) {
  const git_clone: DeterministicAction = async (params, _bpCtx, toolCtx) => {
    try {
      execFileSync('git', ['clone', params.repo, '.'], {
        cwd: toolCtx.workdir, encoding: 'utf-8', timeout: 120_000,
      });
      execFileSync('git', ['checkout', '-b', params.branch], {
        cwd: toolCtx.workdir, encoding: 'utf-8',
      });
      return { exit_code: 0, output: `Cloned and checked out ${params.branch}` };
    } catch (e: any) {
      return { exit_code: 1, output: '', error: e.message };
    }
  };

  const load_context: DeterministicAction = async (params, bpCtx, toolCtx) => {
    const config = loadProjectConfig(toolCtx.workdir);
    bpCtx.context.config = config;
    bpCtx.context.rules = loadRulesForPath(toolCtx.workdir, 'src');
    const projectId = toolCtx.task.project_id;
    if (params.issue_id && gitlab.token && projectId) {
      try {
        const res = await fetch(
          `${gitlab.url}/api/v4/projects/${encodeURIComponent(projectId)}/issues/${params.issue_id}`,
          { headers: { 'PRIVATE-TOKEN': gitlab.token } }
        );
        if (res.ok) {
          const issue = await res.json() as any;
          bpCtx.context.issue_description = issue.description || '';
          bpCtx.context.issue_title = issue.title || '';
        }
      } catch { /* offline mode — skip */ }
    }
    return { exit_code: 0, output: 'Context loaded' };
  };

  const run_lint: DeterministicAction = async (_params, _bpCtx, toolCtx) => {
    const config = loadProjectConfig(toolCtx.workdir);
    if (!config.lint_command) {
      return { exit_code: -1, output: 'Warning: no lint_command configured in .minion/config.yaml, skipped' };
    }
    try {
      const output = execSync(config.lint_command, {
        cwd: toolCtx.workdir, encoding: 'utf-8', timeout: 60_000, shell: '/bin/sh',
      });
      return { exit_code: 0, output };
    } catch (e: any) {
      return { exit_code: 1, output: e.stdout || '', error: e.stderr || e.message };
    }
  };

  const run_test: DeterministicAction = async (_params, _bpCtx, toolCtx) => {
    const config = loadProjectConfig(toolCtx.workdir);
    if (!config.test_command) {
      return { exit_code: -1, output: 'Warning: no test_command configured, skipped' };
    }
    try {
      const output = execSync(config.test_command, {
        cwd: toolCtx.workdir, encoding: 'utf-8', timeout: 300_000, shell: '/bin/sh',
      });
      return { exit_code: 0, output };
    } catch (e: any) {
      return { exit_code: 1, output: e.stdout || '', error: e.stderr || e.message };
    }
  };

  const git_push: DeterministicAction = async (_params, _bpCtx, toolCtx) => {
    try {
      execFileSync('git', ['add', '-A'], { cwd: toolCtx.workdir, encoding: 'utf-8' });
      execFileSync('git', ['commit', '-m', 'chore: minion auto-commit', '--allow-empty'], {
        cwd: toolCtx.workdir, encoding: 'utf-8',
      });
      execFileSync('git', ['push', '-u', 'origin', 'HEAD'], {
        cwd: toolCtx.workdir, encoding: 'utf-8', timeout: 60_000,
      });
      return { exit_code: 0, output: 'Pushed' };
    } catch (e: any) {
      return { exit_code: 1, output: '', error: e.message };
    }
  };

  const create_merge_request: DeterministicAction = async (params, _bpCtx, toolCtx) => {
    if (!gitlab.token) {
      return { exit_code: 1, output: '', error: 'No GitLab token configured' };
    }
    const projectId = toolCtx.task.project_id;
    if (!projectId) {
      return { exit_code: 1, output: '', error: 'No project_id available' };
    }
    try {
      const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: toolCtx.workdir, encoding: 'utf-8',
      }).trim();
      const res = await fetch(
        `${gitlab.url}/api/v4/projects/${encodeURIComponent(projectId)}/merge_requests`,
        {
          method: 'POST',
          headers: {
            'PRIVATE-TOKEN': gitlab.token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            source_branch: branch,
            target_branch: 'main',
            title: params.title || 'Minion MR',
            description: params.description || '',
          }),
        }
      );
      const data = await res.json() as any;
      return { exit_code: 0, output: data.web_url || 'MR created' };
    } catch (e: any) {
      return { exit_code: 1, output: '', error: e.message };
    }
  };

  return { git_clone, load_context, run_lint, run_test, git_push, create_merge_request };
}
