import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { TaskRequest, TaskState } from '../types/shared.js';

export class TaskStore {
  private tasks: Map<string, TaskState> = new Map();
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load(): void {
    try {
      const data = readFileSync(this.filePath, 'utf-8');
      const arr: TaskState[] = JSON.parse(data);
      for (const t of arr) this.tasks.set(t.id, t);
    } catch {
      // File doesn't exist yet, start empty
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify([...this.tasks.values()], null, 2));
  }

  create(request: TaskRequest): TaskState {
    const state: TaskState = {
      id: request.id,
      status: 'queued',
      request,
      workdir: '',
    };
    this.tasks.set(request.id, state);
    this.save();
    return state;
  }

  get(id: string): TaskState | undefined {
    return this.tasks.get(id);
  }

  update(id: string, patch: Partial<TaskState>): TaskState | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    Object.assign(task, patch);
    this.save();
    return task;
  }

  list(): TaskState[] {
    return [...this.tasks.values()];
  }
}
