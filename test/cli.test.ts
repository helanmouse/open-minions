import { describe, it, expect } from 'vitest';
import { parseCliArgs } from '../src/cli/index.js';

describe('CLI arg parsing', () => {
  it('parses run command with natural language', () => {
    const result = parseCliArgs(['run', '修复登录页面空邮箱时的崩溃问题']);
    expect(result.command).toBe('run');
    expect(result.description).toBe('修复登录页面空邮箱时的崩溃问题');
  });

  it('parses run with --repo override', () => {
    const result = parseCliArgs(['run', 'Fix bug', '--repo', '/path/to/repo']);
    expect(result.repo).toBe('/path/to/repo');
  });

  it('parses run with -y flag', () => {
    const result = parseCliArgs(['run', '-y', 'Fix bug']);
    expect(result.yes).toBe(true);
  });

  it('parses run with -d flag', () => {
    const result = parseCliArgs(['run', '-d', 'Add feature']);
    expect(result.detach).toBe(true);
  });

  it('parses status command', () => {
    const result = parseCliArgs(['status', 'abc123']);
    expect(result.command).toBe('status');
    expect(result.taskId).toBe('abc123');
  });

  it('parses list command', () => {
    const result = parseCliArgs(['list']);
    expect(result.command).toBe('list');
  });
});
