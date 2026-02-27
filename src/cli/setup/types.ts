// src/cli/setup/types.ts

export interface SetupConfig {
  provider: string;
  model: string;
  apiKey: string;
}

export interface SetupResult {
  config: SetupConfig;
  saved: boolean;
}

export interface ProviderInfo {
  id: string;
  label: string;
  description: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
}
