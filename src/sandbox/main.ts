import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import { bashTool, editTool, readTool, writeTool } from '@mariozechner/coding-agent';
import { createDeliverPatchTool } from './tools/deliver-patch.js';
import { buildSandboxSystemPrompt } from './prompts.js';
import { readFileSync, writeFileSync } from 'fs';

interface TaskContext {
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

async function main() {
  // Change to workspace directory
  process.chdir('/workspace');

  // Parse arguments
  const configArg = process.argv.find(a => a.startsWith('--config='));
  const configPath = configArg?.split('=')[1] || '/minion-run/context.json';

  const ctx: TaskContext = JSON.parse(readFileSync(configPath, 'utf-8'));

  // Get LLM provider from environment
  const provider = process.env.LLM_PROVIDER || 'openai';
  const model = process.env.LLM_MODEL || 'gpt-4o';
  const apiKey = process.env.LLM_API_KEY || '';

  if (!apiKey) {
    console.error('LLM_API_KEY not set');
    process.exit(1);
  }

  // Set provider-specific API key env var for pi-ai
  const providerEnvKey = `${provider.toUpperCase()}_API_KEY`;
  if (!process.env[providerEnvKey]) {
    process.env[providerEnvKey] = apiKey;
  }

  // Set base URL env var if provided
  const baseUrl = process.env.LLM_BASE_URL || '';
  if (baseUrl) {
    const baseUrlEnvKey = `${provider.toUpperCase()}_BASE_URL`;
    if (!process.env[baseUrlEnvKey]) {
      process.env[baseUrlEnvKey] = baseUrl;
    }
  }

  console.log(`[sandbox] provider=${provider} model=${model} baseUrl=${baseUrl || '(default)'}`);

  // Get Model object using getModel()
  const modelObj = getModel(provider as any, model as any);

  // Use coding-agent tools + custom deliver_patch tool
  const tools: any[] = [
    bashTool,
    readTool,
    editTool,
    writeTool,
    createDeliverPatchTool('/workspace'),
  ];

  // Build system prompt
  const systemPrompt = buildSandboxSystemPrompt(ctx);

  // Create Agent
  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: modelObj,
      tools,
    },
  });

  // Subscribe to events for status tracking
  agent.subscribe((event: any) => {
    if (event.type === 'turn_start' || event.type === 'tool_execution_start') {
      updateStatus(event);
    }
  });

  // Execute task
  await agent.prompt(ctx.description);
}

function updateStatus(event: any): void {
  const statusFile = '/minion-run/status.json';
  try {
    const existing = JSON.parse(readFileSync(statusFile, 'utf-8'));
    writeFileSync(statusFile, JSON.stringify({
      ...existing,
      lastEvent: event.type,
      timestamp: Date.now(),
    }, null, 2));
  } catch {
    // Ignore errors
  }
}

main().catch(err => {
  console.error('[sandbox] Fatal error:', err);
  process.exit(1);
});
