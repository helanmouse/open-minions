import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('GET /api/todos', () => {
  it('returns array of todos', async () => {
    const res = await request(app).get('/api/todos');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe('POST /api/todos', () => {
  it('creates a new todo and returns 201', async () => {
    const res = await request(app)
      .post('/api/todos')
      .send({ title: 'Test todo', done: false });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('Test todo');
    expect(res.body.done).toBe(false);
  });

  it('new todo appears in GET list', async () => {
    const before = await request(app).get('/api/todos');
    const count = before.body.length;
    await request(app)
      .post('/api/todos')
      .send({ title: 'Another', done: true });
    const after = await request(app).get('/api/todos');
    expect(after.body.length).toBe(count + 1);
  });
});
