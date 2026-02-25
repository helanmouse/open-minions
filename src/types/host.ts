export interface ProjectAnalysis {
  language: string;
  framework?: string;
  packageManager?: string;
  buildTool?: string;
  testFramework?: string;
  lintCommand?: string;
  testCommand?: string;
  monorepo?: boolean;
  notes?: string;
}

export interface ExecutionPlan {
  repo: string;
  repoType: 'local' | 'remote';
  image: string;
  task: string;
  branch: string;
}
