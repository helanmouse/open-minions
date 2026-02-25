import type { TaskRequest, TaskState } from '../types.js';
import { fork, type ChildProcess } from 'child_process';
import { join } from 'path';

const tasks = new Map<string, TaskState>();
const workers = new Map<string, ChildProcess>();

export function enqueueTask(request: TaskRequest): TaskState {
  const state: TaskState = {
    id: request.id,
    status: 'queued',
    request,
    steps_completed: [],
    started_at: undefined,
    finished_at: undefined,
  };
  tasks.set(request.id, state);
  return state;
}

export function dispatchTask(taskId: string): void {
  const task = tasks.get(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  task.status = 'running';
  task.started_at = new Date().toISOString();

  const workerPath = join(import.meta.dirname || __dirname, '..', 'worker', 'process.js');
  const child = fork(workerPath, [], {
    env: { ...process.env, MINION_TASK: JSON.stringify(task.request) },
    stdio: 'pipe',
  });

  workers.set(taskId, child);

  child.on('message', (msg: any) => {
    if (msg.type === 'step_completed') {
      task.steps_completed.push(msg.step_id);
    } else if (msg.type === 'status_update') {
      task.status = msg.status;
      if (msg.mr_url) task.mr_url = msg.mr_url;
      if (msg.error) task.error = msg.error;
    }
  });

  child.on('exit', (code) => {
    workers.delete(taskId);
    task.finished_at = new Date().toISOString();
    if (task.status === 'running') {
      task.status = code === 0 ? 'done' : 'failed';
    }
  });
}

export function getTask(id: string): TaskState | undefined {
  return tasks.get(id);
}

export function listTasks(): TaskState[] {
  return [...tasks.values()];
}

export function updateTask(id: string, update: Partial<TaskState>): TaskState | undefined {
  const task = tasks.get(id);
  if (!task) return undefined;
  Object.assign(task, update);
  return task;
}
