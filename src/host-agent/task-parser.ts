import type { LLMAdapter } from '../llm/types.js';

export interface ParsedTask {
  description: string;
  repoUrl: string | null;
  issueUrl: string | null;
  branch: string | null;
}

const PARSE_SYSTEM_PROMPT = `You are a task parser. Extract structured information from the user's natural language task description.
Return ONLY a JSON object with these fields:
- description: the core task description (translated to English if needed)
- repoUrl: git repository URL if mentioned, otherwise null
- issueUrl: issue/ticket URL if mentioned, otherwise null
- branch: target branch name if mentioned, otherwise null

Return ONLY valid JSON, no markdown fences.`;

export async function parseTaskDescription(
  llm: LLMAdapter,
  rawInput: string,
): Promise<ParsedTask> {
  let text = '';
  for await (const event of llm.chat(
    [
      { role: 'system', content: PARSE_SYSTEM_PROMPT },
      { role: 'user', content: rawInput },
    ],
    [],
  )) {
    if (event.type === 'text_delta') text += event.content;
  }
  try {
    return JSON.parse(text.trim());
  } catch {
    // Fallback: treat entire input as description
    return { description: rawInput, repoUrl: null, issueUrl: null, branch: null };
  }
}
