import type { ToolContext, ToolDef, ToolResult } from '../types/shared.js';

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(params: Record<string, any>, ctx: ToolContext): Promise<ToolResult>;
}
