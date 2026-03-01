import express from 'express';

const app = express();
app.use(express.json());

interface Todo {
  id: number;
  title: string;
  done: boolean;
}

const todos: Todo[] = [
  { id: 1, title: 'Learn Open Minions', done: false },
];

let nextId = 2;

app.get('/api/todos', (req, res) => {
  res.json(todos);
});

// TODO: Agent will add POST /api/todos here

export { app, todos, nextId };

if (process.argv[1] === import.meta.filename) {
  app.listen(3000, () => console.log('Listening on :3000'));
}
