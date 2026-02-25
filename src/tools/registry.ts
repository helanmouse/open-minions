import type { AgentTool } from './types.js';
import type { ToolDef } from '../types/shared.js';

export class ToolRegistry {
  private tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  getToolDefs(subset?: string[]): ToolDef[] {
    const entries = subset
      ? [...this.tools.values()].filter(t => subset.includes(t.name))
      : [...this.tools.values()];
    return entries.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }
}
