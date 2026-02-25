export type TaskStatus =
  | 'queued' | 'running' | 'lint_pass'
  | 'ci_running' | 'ci_pass' | 'mr_created'
  | 'done' | 'needs_human' | 'failed';

export interface TaskRequest {
  id: string;
  repo_url: string;
  project_id: string;
  description: string;
  issue_id?: string;
  title?: string;
  blueprint: string;
  created_at: string;
}

/**
 * 从 GitLab repo URL 解析 project_id
 * e.g. "https://gitlab.com/group/repo.git" → "group/repo"
 */
export function parseProjectId(repoUrl: string): string {
  const url = new URL(repoUrl);
  const path = url.pathname.replace(/^\//, '').replace(/\.git$/, '');
  if (!path) throw new Error(`Cannot parse project_id from: ${repoUrl}`);
  return path;
}

export interface TaskState {
  id: string;
  status: TaskStatus;
  request: TaskRequest;
  steps_completed: string[];
  error?: string;
  mr_url?: string;
  started_at?: string;
  finished_at?: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface ToolContext {
  workdir: string;
  task: TaskRequest;
  stepResults: Record<string, unknown>;
}

export type LLMEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call'; id: string; name: string; arguments: string }
  | { type: 'done'; usage?: { input_tokens: number; output_tokens: number } }
  | { type: 'error'; error: string };
