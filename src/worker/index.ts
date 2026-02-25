import { BlueprintEngine } from './blueprint-engine.js';
import { AgentLoop } from './agent-loop.js';
import { ToolRegistry } from '../tools/registry.js';
import { readTool, writeTool, editTool, listFilesTool } from '../tools/file-ops.js';
import { bashTool } from '../tools/bash.js';
import { searchCodeTool } from '../tools/search.js';
import { createActions } from './actions.js';
import { createLLMAdapter } from '../llm/factory.js';
import type { LLMConfig } from '../llm/types.js';
import type { TaskRequest, ToolContext } from '../types.js';
import type { BlueprintContext } from './blueprint-engine.js';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

interface WorkerConfig {
  llm: LLMConfig;
  gitlab: { url: string; token: string };
  blueprintsDir: string;
  maxIterations: number;
}

export function createWorker(config: WorkerConfig) {
  const llmAdapter = createLLMAdapter(config.llm);

  const toolRegistry = new ToolRegistry();
  toolRegistry.register(readTool);
  toolRegistry.register(writeTool);
  toolRegistry.register(editTool);
  toolRegistry.register(listFilesTool);
  toolRegistry.register(bashTool);
  toolRegistry.register(searchCodeTool);

  const agentLoop = new AgentLoop(llmAdapter, toolRegistry, {
    maxIterations: config.maxIterations,
  });

  const blueprintEngine = new BlueprintEngine();
  const actions = createActions(config.gitlab);

  for (const [name, action] of Object.entries(actions)) {
    blueprintEngine.registerAction(name, action);
  }

  async function executeTask(task: TaskRequest): Promise<BlueprintContext> {
    const workdir = mkdtempSync(join(tmpdir(), `minion-${task.id}-`));

    const toolCtx: ToolContext = {
      workdir,
      task,
      stepResults: {},
    };

    const bpCtx: BlueprintContext = {
      task: { ...task },
      steps: {},
      context: {},
    };

    const blueprint = blueprintEngine.loadBlueprint(
      join(config.blueprintsDir, `${task.blueprint}.yaml`)
    );

    return blueprintEngine.execute(blueprint, bpCtx, agentLoop, toolCtx);
  }

  return { blueprintEngine, agentLoop, toolRegistry, executeTask };
}
