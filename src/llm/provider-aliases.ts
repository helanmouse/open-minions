export interface ProviderAlias {
  piProvider: string;   // pi-ai 中的 KnownProvider
  baseUrl: string;      // 覆盖的 baseUrl
}

export const PROVIDER_ALIASES: Record<string, ProviderAlias> = {
  zhipu: { piProvider: 'zai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
};

/**
 * 给定用户配置的 provider 和 modelId，返回 pi-ai 的 provider、modelId 和 baseUrl 覆盖。
 * 用户配置的 baseUrl 优先级高于 alias 默认值。
 */
export function resolveProvider(provider: string, modelId: string, userBaseUrl?: string) {
  const alias = PROVIDER_ALIASES[provider];
  if (alias) {
    return {
      piProvider: alias.piProvider,
      modelId,
      baseUrl: userBaseUrl || alias.baseUrl,
    };
  }
  return { piProvider: provider, modelId, baseUrl: userBaseUrl || '' };
}
