import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { enqueueTask, dispatchTask } from '../queue.js';
import { parseProjectId, type TaskRequest } from '../../types.js';

export async function webhookRoutes(app: FastifyInstance) {
  const skipDispatch = (app as any).skipDispatch ?? false;

  app.post('/api/webhook/gitlab', async (req, reply) => {
    const body = req.body as Record<string, any>;
    const event = req.headers['x-gitlab-event'];

    if (event === 'Issue Hook') {
      const labels = (body.labels || []).map((l: any) => l.title);
      if (!labels.includes('minion')) {
        return reply.status(200).send({ skipped: true });
      }
      const repoUrl = body.project?.git_http_url || '';
      const request: TaskRequest = {
        id: randomUUID(),
        repo_url: repoUrl,
        project_id: repoUrl ? parseProjectId(repoUrl) : '',
        description: body.object_attributes?.description || '',
        issue_id: String(body.object_attributes?.iid || ''),
        title: body.object_attributes?.title || '',
        blueprint: 'fix-issue',
        created_at: new Date().toISOString(),
      };
      const state = enqueueTask(request);
      if (!skipDispatch) {
        dispatchTask(state.id);
      }
      return reply.status(201).send(state);
    }

    return reply.status(200).send({ skipped: true, reason: 'unhandled event' });
  });
}
