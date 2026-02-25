export interface SandboxConfig {
  image: string;
  repoPath: string;
  runDir: string;
  memory: string;
  cpus: number;
  network: string;
}

export interface SandboxHandle {
  containerId: string;
  logs(): AsyncIterable<string>;
  wait(): Promise<{ exitCode: number }>;
  stop(): Promise<void>;
}

export interface Sandbox {
  pull(image: string): Promise<void>;
  start(config: SandboxConfig): Promise<SandboxHandle>;
  buildContainerOptions(config: SandboxConfig): Record<string, any>;
}
