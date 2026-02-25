import type { TaskContext } from '../types/shared.js';

export function buildSystemPrompt(ctx: TaskContext): string {
  const sections: string[] = [];

  sections.push(`You are an autonomous coding agent running inside a Docker container.
Your task: ${ctx.description}

You have full access to bash, file read/write/edit, code search, and git.`);

  sections.push(`## Project Info
${JSON.stringify(ctx.projectAnalysis, null, 2)}`);

  if (ctx.rules.length > 0) {
    sections.push(`## Coding Rules
${ctx.rules.join('\n\n')}`);
  }

  sections.push(`## Working Environment
- Source code is at /workspace (your working copy)
- Work on branch: ${ctx.branch} (base: ${ctx.baseBranch})
- Repository type: ${ctx.repoType}

## Workflow
1. Scan the project structure and understand the codebase
2. Plan your approach (output your plan as text)
3. Implement the changes
4. Verify: run tests, lint, type-check as appropriate
5. If verification fails, fix and retry (max 3 retries per issue)
6. Commit your changes with descriptive messages
7. Deliver: run \`git format-patch origin/${ctx.baseBranch} --output-directory /minion-run/patches/\`
8. Update /minion-run/status.json with phase "done" and a summary

## Delivery Rules
- Always commit before generating patches
- Use descriptive commit messages (e.g. "fix: handle empty email on login page")
- Write patches to /minion-run/patches/
- Update /minion-run/status.json after each phase change

## Constraints
- Max iterations: ${ctx.maxIterations}
- Timeout: ${ctx.timeout} minutes
- Do NOT modify files outside /workspace and /minion-run/`);

  return sections.join('\n\n');
}
