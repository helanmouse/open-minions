# 03 - TypeScript API

A TypeScript Express API with a GET `/api/todos` endpoint already implemented. The agent's task is to add a POST `/api/todos` endpoint that creates new todos.

## Starting Point

```typescript
app.get('/api/todos', (req, res) => {
  res.json(todos);
});

// TODO: Agent will add POST /api/todos here
```

## What the agent should do

- Add a `POST /api/todos` route that accepts `{ title, done }` in the request body
- Store the new todo in the in-memory array with an auto-incremented `id`
- Return the created todo with HTTP status `201`
- Ensure all existing and new supertest tests pass

## Run

```bash
# Let the minion complete the task
minion task.txt

# Verify
./verify.sh
```

---

# 03 - TypeScript API (中文)

一个 TypeScript Express API 示例，已实现 GET `/api/todos` 端点。代理的任务是添加 POST `/api/todos` 端点来创建新的待办事项。

## 起始代码

```typescript
app.get('/api/todos', (req, res) => {
  res.json(todos);
});

// TODO: 代理将在此添加 POST /api/todos
```

## 代理应完成的操作

- 添加 `POST /api/todos` 路由，接收请求体中的 `{ title, done }`
- 将新待办事项存入内存数组，使用自增 `id`
- 返回创建的待办事项，HTTP 状态码为 `201`
- 确保所有现有和新增的 supertest 测试通过

## 运行

```bash
# 让 minion 完成任务
minion task.txt

# 验证
./verify.sh
```
