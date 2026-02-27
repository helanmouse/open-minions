import { describe, it, expect } from 'vitest';
import { parseTaskDescription } from '../src/host-agent/task-parser.js';
import { createLLMAdapter } from '../src/llm/factory.js';
import type { LLMAdapter } from '../src/llm/types.js';
import type { Message, ToolDef, LLMEvent } from '../src/types/shared.js';

function mockLLM(response: string): LLMAdapter {
  return {
    provider: 'mock',
    async *chat(_msgs: Message[], _tools: ToolDef[]) {
      yield { type: 'text_delta' as const, content: response };
      yield { type: 'done' as const };
    },
  };
}

describe('parseTaskDescription', () => {
  it('extracts structured task from natural language', async () => {
    const llm = mockLLM(JSON.stringify({
      description: 'Fix login page crash on empty email',
      repoUrl: null,
      issueUrl: null,
      branch: null,
    }));
    const result = await parseTaskDescription(llm, '修复登录页面空邮箱时的崩溃问题');
    expect(result.description).toBe('Fix login page crash on empty email');
    expect(result.repoUrl).toBeNull();
  });

  it('extracts repo URL and issue URL from description', async () => {
    const llm = mockLLM(JSON.stringify({
      description: 'Fix issue #42',
      repoUrl: 'https://github.com/user/repo.git',
      issueUrl: 'https://github.com/user/repo/issues/42',
      branch: null,
    }));
    const result = await parseTaskDescription(
      llm,
      '修复 https://github.com/user/repo/issues/42，仓库 https://github.com/user/repo.git'
    );
    expect(result.repoUrl).toBe('https://github.com/user/repo.git');
    expect(result.issueUrl).toBe('https://github.com/user/repo/issues/42');
  });

  it('works with pi-ai provider', () => {
    const llm = createLLMAdapter({
      provider: 'pi-ai',
      model: 'gpt-4o',
      apiKey: process.env.LLM_API_KEY || 'test',
    });
    expect(llm.provider).toBe('pi-ai');
  });
});
