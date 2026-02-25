/**
 * This file is forked as a child process by the Gateway's queue dispatcher.
 * It reads the task from MINION_TASK env var, executes the blueprint, and
 * reports status back to the parent process via IPC messages.
 */
import { createWorker } from './index.js';
import { loadConfig } from '../config/index.js';
import type { TaskRequest } from '../types.js';

async function main() {
  const taskJson = process.env.MINION_TASK;
  if (!taskJson) {
    console.error('MINION_TASK env var not set');
    process.exit(1);
  }

  const task: TaskRequest = JSON.parse(taskJson);
  const config = loadConfig();

  const worker = createWorker({
    llm: config.llm,
    gitlab: config.gitlab,
    blueprintsDir: './blueprints',
    maxIterations: config.agent.maxIterations,
  });

  try {
    process.send?.({ type: 'status_update', status: 'running' });

    const result = await worker.executeTask(task);

    const mrUrl = result.steps.create_mr?.output;
    process.send?.({
      type: 'status_update',
      status: mrUrl ? 'mr_created' : 'done',
      mr_url: mrUrl,
    });

    process.exit(0);
  } catch (e: any) {
    process.send?.({
      type: 'status_update',
      status: 'failed',
      error: e.message,
    });
    process.exit(1);
  }
}

main();
