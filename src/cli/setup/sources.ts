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
  /** API type to use (openai-completions, anthropic-messages, etc.) */
  apiType?: 'openai-completions' | 'anthropic-messages' | 'openai-responses' | 'google-generative-ai' | string;
  /** Actual provider ID to use (if different from parent provider) */
  actualProvider?: string;
}

export interface ProviderSources {
  /** pi-ai provider ID (e.g., 'zai', 'openai') */
  provider: string;
  /** Human-readable display name */
  displayName: string;
  /** Description shown in provider list */
  description?: string;
  /** Available sources for this provider */
  sources: Source[];
}

/**
 * Curated list of providers to display in setup
 * This list is manually maintained and controls what users see
 * Order matters - providers appear in this order in the UI
 */
export const DISPLAY_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'zai',
  'deepseek',
  'xai',
  'groq',
  'kimi-coding',
  'minimax',
  'qwen',
] as const;

/**
 * Registry of all providers and their available sources
 * Add new providers here to make them available in setup
 */
export const PROVIDER_SOURCES: Record<string, ProviderSources> = {
  openai: {
    provider: 'openai',
    displayName: 'OpenAI',
    description: 'GPT-4o, GPT-4o-mini, o1, o3-mini',
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
    description: 'Claude 3.5 Sonnet, Claude 3.5 Haiku',
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
    description: 'Gemini 2.0 Flash, Gemini Pro',
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
  zai: {
    provider: 'zai',
    displayName: 'Zhipu AI',
    description: 'GLM-4 Flash, GLM-4 Plus, GLM-5',
    sources: [
      {
        id: 'cn-openai',
        name: '中国源 (OpenAI 兼容)',
        url: 'https://open.bigmodel.cn/api/paas/v4',
        isCustom: false,
        apiType: 'openai-completions'
      },
      {
        id: 'cn-anthropic',
        name: '中国源 (Anthropic 兼容)',
        url: 'https://open.bigmodel.cn/api/anthropic',
        isCustom: false,
        apiType: 'anthropic-messages'
      },
      {
        id: 'intl-openai',
        name: '国际源 (OpenAI 兼容)',
        url: 'https://api.z.ai/api/coding/paas/v4',
        isCustom: false,
        apiType: 'openai-completions'
      },
      {
        id: 'intl-anthropic',
        name: '国际源 (Anthropic 兼容)',
        url: 'https://api.z.ai/api/anthropic',
        isCustom: false,
        apiType: 'anthropic-messages'
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
    description: 'DeepSeek V3, DeepSeek R1',
    sources: [
      {
        id: 'official',
        name: '官方源 (Anthropic 兼容)',
        url: 'https://api.deepseek.com/anthropic',
        isCustom: false,
        apiType: 'anthropic-messages'
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
    displayName: 'xAI',
    description: 'Grok-2, Grok-mini',
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
  groq: {
    provider: 'groq',
    displayName: 'Groq',
    description: 'Llama 3.3, Mixtral',
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
    displayName: 'Kimi',
    description: 'Moonshot AI',
    sources: [
      {
        id: 'global',
        name: '国际源 (Anthropic 兼容)',
        url: 'https://api.moonshot.ai/anthropic',
        isCustom: false,
        apiType: 'anthropic-messages'
      },
      {
        id: 'cn',
        name: '中国源 (Anthropic 兼容)',
        url: 'https://api.moonshot.cn/anthropic',
        isCustom: false,
        apiType: 'anthropic-messages'
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
    description: 'MiniMax-Text-01',
    sources: [
      {
        id: 'global',
        name: '国际源 (Anthropic 兼容)',
        url: 'https://api.minimax.io/anthropic',
        isCustom: false,
        apiType: 'anthropic-messages'
      },
      {
        id: 'cn',
        name: '中国源 (Anthropic 兼容)',
        url: 'https://api.minimaxi.com/anthropic',
        isCustom: false,
        apiType: 'anthropic-messages',
        actualProvider: 'minimax-cn'
      },
      {
        id: 'custom',
        name: '自定义 API 地址',
        url: '',
        isCustom: true
      },
    ],
  },
  qwen: {
    provider: 'openai',
    displayName: 'Qwen',
    description: '通义千问 (Alibaba)',
    sources: [
      {
        id: 'global',
        name: '国际源 (Anthropic 兼容)',
        url: 'https://coding-intl.dashscope.aliyuncs.com/apps/anthropic',
        isCustom: false,
        apiType: 'anthropic-messages'
      },
      {
        id: 'cn',
        name: '中国源 (Anthropic 兼容)',
        url: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
        isCustom: false,
        apiType: 'anthropic-messages'
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
