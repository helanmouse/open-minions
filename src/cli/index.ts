import { Command } from 'commander';

const program = new Command();

export function parseRunArgs(opts: Record<string, any>) {
  return {
    repo_url: opts.repo,
    description: opts.description,
    blueprint: opts.blueprint || 'fix-issue',
    issue_id: opts.issue,
  };
}

program
  .name('minion')
  .description('Minions — AI coding agents for GitLab')
  .version('0.1.0');

program
  .command('run')
  .description('Submit a task to the Minion server')
  .requiredOption('-r, --repo <url>', 'GitLab repo URL')
  .requiredOption('-d, --description <text>', 'Task description')
  .option('-b, --blueprint <name>', 'Blueprint to use', 'fix-issue')
  .option('-i, --issue <id>', 'GitLab issue ID')
  .option('-s, --server <url>', 'Minion server URL', 'http://127.0.0.1:3000')
  .action(async (opts) => {
    const task = parseRunArgs(opts);
    const serverUrl = opts.server;
    try {
      const res = await fetch(`${serverUrl}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`Task created: ${data.id}`);
        console.log(`Status: ${data.status}`);
      } else {
        console.error('Failed:', data);
        process.exit(1);
      }
    } catch (e: any) {
      console.error(`Cannot reach server at ${serverUrl}: ${e.message}`);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check task status')
  .argument('<id>', 'Task ID')
  .option('-s, --server <url>', 'Minion server URL', 'http://127.0.0.1:3000')
  .action(async (id, opts) => {
    try {
      const res = await fetch(`${opts.server}/api/tasks/${id}`);
      const data = await res.json();
      console.log(JSON.stringify(data, null, 2));
    } catch (e: any) {
      console.error(`Cannot reach server: ${e.message}`);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all tasks')
  .option('-s, --server <url>', 'Minion server URL', 'http://127.0.0.1:3000')
  .action(async (opts) => {
    try {
      const res = await fetch(`${opts.server}/api/tasks`);
      const data = await res.json();
      for (const task of data as any[]) {
        console.log(`${task.id}  ${task.status}  ${task.request.description.slice(0, 60)}`);
      }
    } catch (e: any) {
      console.error(`Cannot reach server: ${e.message}`);
      process.exit(1);
    }
  });

// Run CLI when executed directly
const isMain = process.argv[1]?.endsWith('cli/index.ts')
  || process.argv[1]?.endsWith('cli/index.js');

if (isMain) {
  program.parse();
}
