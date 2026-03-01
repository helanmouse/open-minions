// src/cli/setup/types.ts

export interface SetupConfig {
  provider: string;
  source?: string;      // NEW: source ID
  model: string;
  apiKey: string;
  customUrl?: string;   // NEW: custom URL if source is 'custom'
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

// NEW: Source selection result
export interface SourceSelectionResult {
  sourceId: string;
  baseUrl: string;
}
