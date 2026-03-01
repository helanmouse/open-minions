/**
 * Source configuration for LLM providers
 * Defines available API sources (official, regional, custom) for each provider
 */

export interface Source {
  /** Unique identifier for this source */
  id: string;
  /** Display name for UI */
  name: string;
  /** Base URL for API requests (empty for custom sources) */
  url: string;
  /** True if this source requires user input */
  isCustom: boolean;
}

export interface ProviderSources {
  /** pi-ai provider ID (e.g., 'zai', 'openai') */
  provider: string;
  /** Human-readable display name */
  displayName: string;
  /** Available sources for this provider */
  sources: Source[];
}

/**
 * Registry of all providers and their available sources
 * Add new providers here to make them available in setup
 */
export const PROVIDER_SOURCES: Record<string, ProviderSources> = {
  zai: {
    provider: 'zai',
    displayName: 'Zhipu AI',
    sources: [
      {
        id: 'official-cn',
        name: '官方中国源',
        url: 'https://open.bigmodel.cn/api/paas/v4',
        isCustom: false
      },
      {
        id: 'official-intl',
        name: '官方国际源',
        url: 'https://api.zhipu.ai/v1',
        isCustom: false
      },
      {
        id: 'custom',
        name: '自定义 API 地址',
        url: '',
        isCustom: true
      },
    ],
  },
  openai: {
    provider: 'openai',
    displayName: 'OpenAI',
    sources: [
      {
        id: 'official',
        name: '官方源',
        url: '',
        isCustom: false
      },
      {
        id: 'custom',
        name: '自定义 API 地址',
        url: '',
        isCustom: true
      },
    ],
  },
  anthropic: {
    provider: 'anthropic',
    displayName: 'Anthropic',
    sources: [
      {
        id: 'official',
        name: '官方源',
        url: '',
        isCustom: false
      },
      {
        id: 'custom',
        name: '自定义 API 地址',
        url: '',
        isCustom: true
      },
    ],
  },
  google: {
    provider: 'google',
    displayName: 'Google',
    sources: [
      {
        id: 'official',
        name: '官方源',
        url: '',
        isCustom: false
      },
      {
        id: 'custom',
        name: '自定义 API 地址',
        url: '',
        isCustom: true
      },
    ],
  },
  deepseek: {
    provider: 'deepseek',
    displayName: 'DeepSeek',
    sources: [
      {
        id: 'official',
        name: '官方源',
        url: 'https://api.deepseek.com/v1',
        isCustom: false
      },
      {
        id: 'custom',
        name: '自定义 API 地址',
        url: '',
        isCustom: true
      },
    ],
  },
  groq: {
    provider: 'groq',
    displayName: 'Groq',
    sources: [
      {
        id: 'official',
        name: '官方源',
        url: '',
        isCustom: false
      },
      {
        id: 'custom',
        name: '自定义 API 地址',
        url: '',
        isCustom: true
      },
    ],
  },
  xai: {
    provider: 'xai',
    displayName: 'xAI (Grok)',
    sources: [
      {
        id: 'official',
        name: '官方源',
        url: '',
        isCustom: false
      },
      {
        id: 'custom',
        name: '自定义 API 地址',
        url: '',
        isCustom: true
      },
    ],
  },
  'kimi-coding': {
    provider: 'kimi-coding',
    displayName: 'Kimi (Moonshot)',
    sources: [
      {
        id: 'official',
        name: '官方源 (Anthropic Messages API)',
        url: 'https://api.kimi.com/coding',
        isCustom: false
      },
      {
        id: 'official-cn',
        name: '官方中国源',
        url: 'https://api.moonshot.cn/coding',
        isCustom: false
      },
      {
        id: 'custom',
        name: '自定义 API 地址',
        url: '',
        isCustom: true
      },
    ],
  },
  minimax: {
    provider: 'minimax',
    displayName: 'MiniMax',
    sources: [
      {
        id: 'official',
        name: '官方源 (Anthropic Messages API)',
        url: 'https://api.minimax.io/anthropic',
        isCustom: false
      },
      {
        id: 'custom',
        name: '自定义 API 地址',
        url: '',
        isCustom: true
      },
    ],
  },
  'minimax-cn': {
    provider: 'minimax-cn',
    displayName: 'MiniMax 中国',
    sources: [
      {
        id: 'official',
        name: '官方中国源 (Anthropic Messages API)',
        url: 'https://api.minimaxi.com/anthropic',
        isCustom: false
      },
      {
        id: 'custom',
        name: '自定义 API 地址',
        url: '',
        isCustom: true
      },
    ],
  },
};

/**
 * Get sources configuration for a provider
 */
export function getProviderSources(provider: string): ProviderSources | undefined {
  return PROVIDER_SOURCES[provider];
}

/**
 * Get all available providers
 */
export function getAllProviders(): ProviderSources[] {
  return Object.values(PROVIDER_SOURCES);
}
