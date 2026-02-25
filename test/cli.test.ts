import { describe, it, expect } from 'vitest';
import { parseRunArgs } from '../src/cli/index.js';

describe('CLI arg parsing', () => {
  it('parses run command args', () => {
    const result = parseRunArgs({
      repo: 'https://gitlab.com/test/repo.git',
      description: 'Fix login bug',
      blueprint: 'fix-issue',
      issue: '42',
    });
    expect(result.repo_url).toBe('https://gitlab.com/test/repo.git');
    expect(result.description).toBe('Fix login bug');
    expect(result.blueprint).toBe('fix-issue');
    expect(result.issue_id).toBe('42');
  });

  it('defaults blueprint to fix-issue', () => {
    const result = parseRunArgs({
      repo: 'https://gitlab.com/test/repo.git',
      description: 'Fix something',
    });
    expect(result.blueprint).toBe('fix-issue');
  });
});
