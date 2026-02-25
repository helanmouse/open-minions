import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { load as loadYaml } from 'js-yaml';

export interface ProjectConfig {
  lint_command?: string;
  test_command?: string;
  language?: string;
}

export function loadProjectConfig(workdir: string): ProjectConfig {
  const configPath = join(workdir, '.minion', 'config.yaml');
  if (!existsSync(configPath)) return {};
  const raw = readFileSync(configPath, 'utf-8');
  return (loadYaml(raw) as ProjectConfig) || {};
}

export function loadRulesForPath(workdir: string, filePath: string): string {
  const rules: string[] = [];
  // Load global rules
  const globalRules = join(workdir, '.minion', 'rules', 'global.md');
  if (existsSync(globalRules)) {
    rules.push(readFileSync(globalRules, 'utf-8'));
  }
  // Walk up from filePath loading .minion-rules.md
  const parts = filePath.split('/').filter(Boolean);
  let current = workdir;
  for (const part of parts) {
    current = join(current, part);
    const rulesFile = join(current, '.minion-rules.md');
    if (existsSync(rulesFile)) {
      rules.push(readFileSync(rulesFile, 'utf-8'));
    }
  }
  return rules.join('\n\n---\n\n');
}
