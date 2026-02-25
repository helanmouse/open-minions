import { readFileSync } from 'fs';
import { load as loadYaml } from 'js-yaml';
import type { AgentLoop } from './agent-loop.js';
import type { ToolContext } from '../types.js';

export interface BlueprintStep {
  id: string;
  type: 'deterministic' | 'agent';
  action?: string;
  tools?: string[];
  prompt?: string;
  params?: Record<string, string>;
  condition?: string;
  max_iterations?: number;
}

export interface Blueprint {
  name: string;
  steps: BlueprintStep[];
}

export interface BlueprintContext {
  task: Record<string, any>;
  steps: Record<string, any>;
  context: Record<string, any>;
}

export type DeterministicAction = (
  params: Record<string, any>,
  bpCtx: BlueprintContext,
  toolCtx: ToolContext,
) => Promise<{ exit_code: number; output: string; error?: string }>;

export class BlueprintEngine {
  private actions = new Map<string, DeterministicAction>();

  registerAction(name: string, action: DeterministicAction): void {
    this.actions.set(name, action);
  }

  loadBlueprint(path: string): Blueprint {
    const raw = readFileSync(path, 'utf-8');
    return loadYaml(raw) as Blueprint;
  }

  interpolate(template: string, ctx: BlueprintContext): string {
    return template.replace(/\{\{(.+?)\}\}/g, (_match, expr: string) => {
      const parts = expr.trim().split('.');
      let value: any = ctx;
      for (const part of parts) {
        value = value?.[part];
      }
      return value !== undefined ? String(value) : '';
    });
  }

  evaluateCondition(condition: string, ctx: BlueprintContext): boolean {
    const expr = condition.replace(/\{\{(.+?)\}\}/g, (_match, inner: string) => {
      return inner.trim();
    });
    // Parse simple "a != b" or "a == b" expressions
    const neqMatch = expr.match(/^(.+?)\s*!=\s*(.+)$/);
    if (neqMatch) {
      const left = this.resolveValue(neqMatch[1].trim(), ctx);
      const right = this.resolveValue(neqMatch[2].trim(), ctx);
      return left != right;
    }
    const eqMatch = expr.match(/^(.+?)\s*==\s*(.+)$/);
    if (eqMatch) {
      const left = this.resolveValue(eqMatch[1].trim(), ctx);
      const right = this.resolveValue(eqMatch[2].trim(), ctx);
      return left == right;
    }
    return true;
  }

  private resolveValue(expr: string, ctx: BlueprintContext): any {
    // If it's a number literal
    if (/^\d+$/.test(expr)) return Number(expr);
    // Otherwise resolve as path
    const parts = expr.split('.');
    let value: any = ctx;
    for (const part of parts) {
      value = value?.[part];
    }
    return value;
  }

  async execute(
    blueprint: Blueprint,
    bpCtx: BlueprintContext,
    agentLoop: AgentLoop,
    toolCtx: ToolContext,
  ): Promise<BlueprintContext> {
    for (const step of blueprint.steps) {
      // Check condition
      if (step.condition) {
        if (!this.evaluateCondition(step.condition, bpCtx)) {
          bpCtx.steps[step.id] = { skipped: true };
          continue;
        }
      }

      if (step.type === 'deterministic') {
        const action = this.actions.get(step.action!);
        if (!action) throw new Error(`Unknown action: ${step.action}`);
        const interpolatedParams: Record<string, any> = {};
        for (const [k, v] of Object.entries(step.params || {})) {
          interpolatedParams[k] = this.interpolate(String(v), bpCtx);
        }
        const result = await action(interpolatedParams, bpCtx, toolCtx);
        bpCtx.steps[step.id] = result;
      } else if (step.type === 'agent') {
        const prompt = this.interpolate(step.prompt || '', bpCtx);
        const result = await agentLoop.run(
          prompt,
          step.tools || [],
          toolCtx,
        );
        bpCtx.steps[step.id] = {
          exit_code: 0,
          output: result.output,
          summary: result.output.slice(0, 500),
          iterations: result.iterations,
        };
      }
    }
    return bpCtx;
  }
}
