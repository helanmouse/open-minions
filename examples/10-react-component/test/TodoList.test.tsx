import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TodoList } from '../src/TodoList';

describe('TodoList', () => {
  it('renders all todo items', () => {
    render(<TodoList />);
    expect(screen.getByText('Learn React')).toBeDefined();
    expect(screen.getByText('Build a project')).toBeDefined();
    expect(screen.getByText('Ship it')).toBeDefined();
  });

  it('renders items as list items', () => {
    render(<TodoList />);
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBe(3);
  });
});
