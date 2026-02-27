import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import { bashTool, editTool, readTool, writeTool } from '@mariozechner/coding-agent';
import { createDeliverPatchTool } from './tools/deliver-patch.js';
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
  const systemPrompt = buildSystemPrompt(ctx);

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

function buildSystemPrompt(ctx: TaskContext): string {
  return `You are Minion Sandbox Agent, an autonomous coding agent running inside an isolated Docker container.

<env>
Source code: /workspace (cloned from host repository)
Branch: ${ctx.branch} (base: ${ctx.baseBranch})
Delivery: /minion-run/patches/
Status: /minion-run/status.json
Max iterations: ${ctx.maxIterations}
Timeout: ${ctx.timeout} minutes
</env>

# Full autonomy — your permissions
You have FULL PERMISSION to:
- Install system packages (apt-get, apk, yum, etc.)
- Install language dependencies (npm, pip, cargo, go get, etc.)
- Search the web for documentation and solutions (curl, wget)
- Download reference code and resources from the internet
- Run any system command with root privileges
- Modify system configuration if needed
- Create temporary files, scripts, or test fixtures
- Run long-running processes

The container is disposable — only the patches you deliver matter.

# Additional tool: deliver_patch
Use deliver_patch as your FINAL action to generate git format-patch and deliver results.
A task without patches is a FAILED task.

# Task status tracking
Track your progress in /minion-run/status.json:
- Update phase: "planning" | "executing" | "verifying" | "delivering" | "done" | "failed"
- Track steps with { content, activeForm, status: "pending" | "in_progress" | "completed" }
- Mark steps completed IMMEDIATELY after finishing. ONE step in_progress at a time.

# Essential constraints
- Your working code is in /workspace
- Delivery output goes to /minion-run/patches/
- You MUST commit and deliver patches before finishing
- Do NOT hardcode secrets or API keys into source files
- Everything else in this container is yours to use freely

# Project info
<system-reminder>
Project analysis prepared by the Host Agent.
</system-reminder>
${JSON.stringify(ctx.projectAnalysis, null, 2)}

# Coding rules
${ctx.rules.map((r, i) => `${i + 1}. ${r}`).join('\n') || 'None specified.'}`;
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

main().catch(console.error);
