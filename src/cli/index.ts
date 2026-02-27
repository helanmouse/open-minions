#!/usr/bin/env node
import { config } from 'dotenv';
import { Command } from 'commander';
import { join } from 'path';
import { homedir } from 'os';
import { loadConfig } from '../config/index.js';

// Load .env file from current directory or home directory
config({ path: ['.env', join(homedir(), '.minion', '.env')] });
config();
import { createLLMAdapter } from '../llm/factory.js';
import { TaskStore } from '../task/store.js';
import { DockerSandbox } from '../sandbox/docker.js';
import { HostAgent } from '../host-agent/index.js';

export interface CliArgs {
  command: string;
  description?: string;
  taskId?: string;
  repo?: string;
  image?: string;
  timeout?: number;
  yes?: boolean;
  detach?: boolean;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const result: CliArgs = { command: '' };
  const cmd = argv[0];
  result.command = cmd;

  if (cmd === 'run') {
    const rest = argv.slice(1);
    const descriptions: string[] = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--repo' && rest[i + 1]) { result.repo = rest[++i]; continue; }
      if (rest[i] === '--image' && rest[i + 1]) { result.image = rest[++i]; continue; }
      if (rest[i] === '--timeout' && rest[i + 1]) { result.timeout = Number(rest[++i]); continue; }
      if (rest[i] === '-y' || rest[i] === '--yes') { result.yes = true; continue; }
      if (rest[i] === '-d') { result.detach = true; continue; }
      descriptions.push(rest[i]);
    }
    result.description = descriptions.join(' ');
  } else if (cmd === 'status' || cmd === 'logs' || cmd === 'stop' || cmd === 'clean') {
    result.taskId = argv[1];
  }

  return result;
}

const program = new Command();

program
  .name('minion')
  .description('Minions — autonomous AI coding agents with Docker sandbox')
  .version('2.0.0');

program
  .command('run')
  .description('Run a task described in natural language')
  .argument('<description...>', 'Natural language task description')
  .option('--repo <path>', 'Override repository path or URL')
  .option('--image <name>', 'Override Docker image')
  .option('--timeout <minutes>', 'Timeout in minutes', '30')
  .option('-y, --yes', 'Skip confirmation')
  .option('-d', 'Run in background (detached)')
  .action(async (descParts: string[], opts) => {
    const description = descParts.join(' ');
    const minionHome = join(homedir(), '.minion');
    const config = loadConfig();
    const llm = createLLMAdapter(config.llm);
    const sandbox = new DockerSandbox();
    const store = new TaskStore(join(minionHome, 'tasks.json'));
    const agent = new HostAgent({ llm, sandbox, store, minionHome });

    const taskId = await agent.prepare(description, {
      repo: opts.repo,
      image: opts.image,
      yes: opts.yes,
      detach: opts.d,
      timeout: Number(opts.timeout),
    });

    const task = store.get(taskId)!;
    if (!opts.yes) {
      console.log(`\nTarget: ${task.request.repo} (${task.request.repoType})`);
      console.log(`Image:  ${task.request.image || 'minion-base'}`);
      console.log(`Task:   ${task.request.description}`);
      console.log(`\nPress Enter to start or Ctrl+C to abort`);
      await new Promise<void>(resolve => {
        process.stdin.once('data', () => resolve());
      });
    }

    console.log(`Task ${taskId} starting...`);
    await agent.run(taskId, { detach: opts.d, timeout: Number(opts.timeout) });

    const final = store.get(taskId)!;
    if (final.status === 'done') {
      console.log(`\nTask ${taskId} completed.`);
      if (final.result) {
        console.log(`Branch: ${final.result.branch}`);
        console.log(`Commits: ${final.result.commits}`);
        console.log(`Summary: ${final.result.summary}`);
      }
    } else {
      console.error(`\nTask ${taskId} failed: ${final.error}`);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check task status')
  .argument('<id>', 'Task ID')
  .action((id) => {
    const minionHome = join(homedir(), '.minion');
    const store = new TaskStore(join(minionHome, 'tasks.json'));
    const task = store.get(id);
    if (!task) { console.error(`Task ${id} not found`); process.exit(1); }
    console.log(JSON.stringify(task, null, 2));
  });

program
  .command('list')
  .description('List all tasks')
  .action(() => {
    const minionHome = join(homedir(), '.minion');
    const store = new TaskStore(join(minionHome, 'tasks.json'));
    for (const task of store.list()) {
      console.log(`${task.id}  ${task.status.padEnd(12)}  ${task.request.description.slice(0, 60)}`);
    }
  });

program
  .command('stop')
  .description('Stop a running task')
  .argument('<id>', 'Task ID')
  .action(async (id) => {
    const minionHome = join(homedir(), '.minion');
    const store = new TaskStore(join(minionHome, 'tasks.json'));
    const task = store.get(id);
    if (!task?.containerId) { console.error('No running container'); process.exit(1); }
    const Dockerode = (await import('dockerode')).default;
    const docker = new Dockerode();
    try {
      await docker.getContainer(task.containerId).stop({ t: 10 });
      store.update(id, { status: 'failed', error: 'Stopped by user', finished_at: new Date().toISOString() });
      console.log(`Task ${id} stopped.`);
    } catch (e: any) {
      console.error(`Failed to stop: ${e.message}`);
    }
  });

program
  .command('clean')
  .description('Clean up task data')
  .argument('[id]', 'Task ID (omit to clean all completed)')
  .action((id) => {
    console.log('TODO: implement cleanup');
  });

// Run CLI when executed directly
const isMain = process.argv[1]?.endsWith('cli/index.ts')
  || process.argv[1]?.endsWith('cli/index.js');

if (isMain) {
  program.parse();
}
