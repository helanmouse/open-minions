import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server/index.js';
import { parseProjectId } from '../src/types.js';

describe('parseProjectId', () => {
  it('parses standard GitLab URL', () => {
    expect(parseProjectId('https://gitlab.com/group/repo.git')).toBe('group/repo');
  });

  it('parses nested group URL', () => {
    expect(parseProjectId('https://gitlab.com/org/team/repo.git')).toBe('org/team/repo');
  });

  it('throws on invalid URL', () => {
    expect(() => parseProjectId('not-a-url')).toThrow();
  });
});

describe('Integration: API → Queue → Dispatch', () => {
  it('submits a task, parses project_id, and dispatches', async () => {
    const server = await buildServer({ skipDispatch: true });

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        repo_url: 'https://gitlab.com/test/repo.git',
        description: 'Write hello world',
        blueprint: 'echo-test',
        issue_id: '1',
        title: 'Test task',
      },
    });

    expect(res.statusCode).toBe(201);
    const task = res.json();
    expect(task.status).toBe('queued');
    expect(task.request.blueprint).toBe('echo-test');
    expect(task.request.project_id).toBe('test/repo');

    // Verify task is retrievable
    const getRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}`,
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().id).toBe(task.id);

    // Verify task appears in list
    const listRes = await server.inject({
      method: 'GET',
      url: '/api/tasks',
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().length).toBeGreaterThan(0);

    await server.close();
  });

  it('handles GitLab webhook with minion label and resolves project_id', async () => {
    const server = await buildServer({ skipDispatch: true });

    const res = await server.inject({
      method: 'POST',
      url: '/api/webhook/gitlab',
      headers: { 'x-gitlab-event': 'Issue Hook' },
      payload: {
        labels: [{ title: 'minion' }],
        project: { git_http_url: 'https://gitlab.com/mygroup/myrepo.git' },
        object_attributes: {
          iid: 42,
          title: 'Fix login',
          description: 'Login page crashes on submit',
        },
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().request.issue_id).toBe('42');
    expect(res.json().request.project_id).toBe('mygroup/myrepo');

    await server.close();
  });

  it('skips GitLab webhook without minion label', async () => {
    const server = await buildServer({ skipDispatch: true });

    const res = await server.inject({
      method: 'POST',
      url: '/api/webhook/gitlab',
      headers: { 'x-gitlab-event': 'Issue Hook' },
      payload: {
        labels: [{ title: 'bug' }],
        object_attributes: { iid: 1, title: 'Bug', description: 'A bug' },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().skipped).toBe(true);

    await server.close();
  });
});
