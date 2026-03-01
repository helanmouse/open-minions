// src/cli/setup/types.ts

export interface SetupConfig {
  provider: string;
  model: string;
  apiKey: string;
  source?: string;      // Source ID for selecting different API sources
  customUrl?: string;   // Custom URL when source is 'custom'
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

/** Result of source selection containing source ID and base URL */
export interface SourceSelectionResult {
  sourceId: string;  // Maps to SetupConfig.source
  baseUrl: string;   // API base URL for the selected source
}
