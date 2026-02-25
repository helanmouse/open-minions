import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { enqueueTask, dispatchTask, getTask, listTasks } from '../queue.js';
import { parseProjectId, type TaskRequest } from '../../types.js';

export async function taskRoutes(app: FastifyInstance) {
  const skipDispatch = (app as any).skipDispatch ?? false;

  app.post('/api/tasks', {
    schema: {
      body: {
        type: 'object',
        required: ['repo_url', 'description', 'blueprint'],
        properties: {
          repo_url: { type: 'string' },
          description: { type: 'string' },
          blueprint: { type: 'string' },
          issue_id: { type: 'string' },
          title: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const body = req.body as Record<string, string>;
    const request: TaskRequest = {
      id: randomUUID(),
      repo_url: body.repo_url,
      project_id: parseProjectId(body.repo_url),
      description: body.description,
      blueprint: body.blueprint,
      issue_id: body.issue_id,
      title: body.title,
      created_at: new Date().toISOString(),
    };
    const state = enqueueTask(request);
    if (!skipDispatch) {
      dispatchTask(state.id);
    }
    reply.status(201).send(state);
  });

  app.get('/api/tasks', async () => {
    return listTasks();
  });

  app.get('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = getTask(id);
    if (!task) return reply.status(404).send({ error: 'Not found' });
    return task;
  });
}
