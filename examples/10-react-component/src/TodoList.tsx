import { useState } from 'react';

interface Todo {
  id: number;
  text: string;
}

const initialTodos: Todo[] = [
  { id: 1, text: 'Learn React' },
  { id: 2, text: 'Build a project' },
  { id: 3, text: 'Ship it' },
];

export function TodoList() {
  const [todos] = useState<Todo[]>(initialTodos);

  return (
    <div>
      <h1>Todo List</h1>
      <ul>
        {todos.map(todo => (
          <li key={todo.id} data-testid={`todo-${todo.id}`}>{todo.text}</li>
        ))}
      </ul>
    </div>
  );
}
