// src/cli/setup/types.ts

export interface SetupConfig {
  provider: string;
  model: string;
  apiKey: string;
  source?: string;      // Source ID for selecting different API sources
  customUrl?: string;   // Custom URL when source is 'custom'
  apiType?: string;     // API type (e.g., 'openai-completions', 'anthropic-messages')
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

/** Result of source selection containing source ID, base URL, and API type */
export interface SourceSelectionResult {
  sourceId: string;  // Maps to SetupConfig.source
  baseUrl: string;   // API base URL for the selected source
  apiType?: string;  // API type (e.g., 'openai-completions', 'anthropic-messages')
  actualProvider?: string;  // Actual provider ID to use (if different from selected provider)
}
