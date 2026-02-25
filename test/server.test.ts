import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server/index.js';

describe('Gateway Server', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer({ skipDispatch: true });
  });

  afterAll(async () => {
    await server.close();
  });

  it('GET /health returns ok', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('POST /api/tasks validates input', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/tasks accepts valid task', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        repo_url: 'https://gitlab.com/test/repo.git',
        description: 'Fix the login bug',
        blueprint: 'fix-issue',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBeDefined();
    expect(res.json().status).toBe('queued');
  });
});
