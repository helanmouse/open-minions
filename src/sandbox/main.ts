import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import { bashTool, editTool, readTool, writeTool } from './tools/coding.js';
import { createDeliverPatchTool } from './tools/deliver-patch.js';
import { buildSandboxSystemPrompt } from './prompts.js';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { seedJournal, readJournal } from './journal.js';
import { resolveProvider } from '../llm/provider-aliases.js';
import { SANDBOX_PATHS, EXIT_SUCCESS, EXIT_CRASH, EXIT_NO_PATCHES } from '../types/shared.js';

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

  // Resolve alias: e.g. zhipu → zai with CN baseUrl
  // LLM_BASE_URL env var takes priority over alias default
  const envBaseUrl = process.env.LLM_BASE_URL || '';
  const resolved = resolveProvider(provider, model, envBaseUrl || undefined);

  // Set provider-specific API key env var for pi-ai (use resolved piProvider)
  const providerEnvKey = `${resolved.piProvider.toUpperCase()}_API_KEY`;
  if (!process.env[providerEnvKey]) {
    process.env[providerEnvKey] = apiKey;
  }

  // Set base URL env var if resolved
  if (resolved.baseUrl) {
    const baseUrlEnvKey = `${resolved.piProvider.toUpperCase()}_BASE_URL`;
    if (!process.env[baseUrlEnvKey]) {
      process.env[baseUrlEnvKey] = resolved.baseUrl;
    }
  }

  console.log(`[sandbox] provider=${provider} resolved=${resolved.piProvider} model=${resolved.modelId} baseUrl=${resolved.baseUrl || '(default)'}`);

  // Get Model object using getModel()
  const modelObj = getModel(resolved.piProvider as any, resolved.modelId as any);

  // Use coding-agent tools + custom deliver_patch tool
  const tools: any[] = [
    bashTool,
    readTool,
    editTool,
    writeTool,
    createDeliverPatchTool('/workspace'),
  ];

  // Seed journal before agent creation
  seedJournal(SANDBOX_PATHS.JOURNAL);

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
    try {
      if (event.type === 'tool_execution_start') {
        console.error(`[sandbox:tool] ${event.toolName} args=${JSON.stringify(event.args ?? event.input ?? {}).substring(0, 200)}`);
      } else if (event.type === 'tool_execution_end') {
        console.error(`[sandbox:tool_done] ${event.toolName} error=${event.isError || false}`);
      } else if (event.type === 'message_end') {
        const msg = event.message;
        const types = msg?.content?.map((c: any) => c.type).join(',') || '';
        console.error(`[sandbox:msg] stopReason=${msg?.stopReason} types=${types}`);
      } else if (event.type === 'agent_end') {
        const last = event.messages?.[event.messages.length - 1];
        if (last?.errorMessage) console.error(`[sandbox:error] ${last.errorMessage}`);
        console.error(`[sandbox:event] agent_end`);
      }
    } catch (e) {
      // Never let logging crash the agent
    }
    if (event.type === 'turn_start' || event.type === 'tool_execution_start') {
      updateStatus(event);
    }
  });

  // Execute task
  console.error('[sandbox] Calling agent.prompt()...');
  await agent.prompt(ctx.description);
  console.error(`[sandbox] agent.prompt() returned, error=${(agent as any)._state?.error || 'none'}`);
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

main()
  .then(() => {
    // Check for .patch files in the patches directory
    let hasPatches = false;
    try {
      const files = readdirSync(SANDBOX_PATHS.PATCHES);
      hasPatches = files.some(f => f.endsWith('.patch'));
    } catch {}

    if (!hasPatches) {
      const journal = readJournal(SANDBOX_PATHS.JOURNAL);
      console.error('[sandbox] No patches produced.');
      if (journal) console.error('[sandbox] Journal:\n' + journal);
      try {
        writeFileSync(SANDBOX_PATHS.STATUS, JSON.stringify({
          phase: 'failed',
          error: 'Agent exited without producing patches',
          journal,
        }, null, 2));
      } catch {}
      process.exit(EXIT_NO_PATCHES);
    }

    process.exit(EXIT_SUCCESS);
  })
  .catch(err => {
    console.error('[sandbox] Fatal error:', err);
    const journal = readJournal(SANDBOX_PATHS.JOURNAL);
    try {
      writeFileSync(SANDBOX_PATHS.STATUS, JSON.stringify({
        phase: 'failed',
        error: String(err),
        journal,
      }, null, 2));
    } catch {}
    process.exit(EXIT_CRASH);
  });
