export const EXIT_SUCCESS = 0;
export const EXIT_CRASH = 1;
export const EXIT_NO_PATCHES = 2;

export const SANDBOX_PATHS = {
  JOURNAL: '/minion-run/journal.md',
  PATCHES: '/minion-run/patches',
  STATUS: '/minion-run/status.json',
  CONTEXT: '/minion-run/context.json',
} as const;

export const TaskStatus = [
  'queued', 'running', 'done', 'failed', 'needs_human',
] as const;
export type TaskStatusType = typeof TaskStatus[number];

export interface TaskRequest {
  id: string;
  description: string;
  repo: string;                   // local path or remote URL
  repoType: 'local' | 'remote';
  branch: string;                 // e.g. "minion/abc123"
  baseBranch: string;             // e.g. "main"
  image?: string;                 // Docker image override
  fromUrl?: string;               // issue URL for Agent to fetch
  push: boolean;                  // auto-push after completion
  maxIterations: number;
  timeout: number;                // minutes
  created_at: string;
}

export interface TaskState {
  id: string;
  status: TaskStatusType;
  request: TaskRequest;
  workdir: string;                // repo path (local original or clone dir)
  containerId?: string;
  error?: string;
  result?: TaskResult;
  started_at?: string;
  finished_at?: string;
}

export interface TaskResult {
  branch: string;
  commits: number;
  filesChanged: number;
  summary: string;
  journal?: string;
}

// Written by Host Agent to context.json, read by Sandbox Agent
export interface TaskContext {
  taskId: string;
  description: string;
  repoType: 'local' | 'remote';
  branch: string;
  baseBranch: string;
  projectAnalysis: Record<string, unknown>;
  rules: string[];
  maxIterations: number;
  timeout: number;
}

// Written by Sandbox Agent to status.json, read by Host Agent
export type SandboxPhase =
  | 'init' | 'cloning' | 'planning' | 'executing'
  | 'verifying' | 'delivering' | 'done' | 'failed';

export interface SandboxStatus {
  phase: SandboxPhase;
  plan?: string;
  currentStep?: string;
  progress?: string;
  summary?: string;
  error?: string;
  reason?: string;                // e.g. 'watchdog'
}

// LLM & Tool types (shared by both agents)
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
}

export type LLMEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call'; id: string; name: string; arguments: string }
  | { type: 'done'; usage?: { input_tokens: number; output_tokens: number } }
  | { type: 'error'; error: string };
