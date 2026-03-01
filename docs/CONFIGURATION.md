# Configuration

Minions V3 uses pi-mono's configuration system with support for 25 LLM providers.

## Quick Setup

Run the interactive setup command:

```bash
minion setup
```

This launches an interactive Terminal UI (TUI) for configuration.

### TUI Keyboard Navigation

The TUI interface supports these keyboard shortcuts:
- **Arrow keys (↑/↓/←/→)** - Navigate between providers and models
- **Enter** - Select the current provider/model
- **Escape** - Go back to the previous screen
- **Ctrl+C** - Exit the setup

### Supported Providers

The TUI supports 25 LLM providers out of the box, including:
- OpenAI (gpt-4o, gpt-4o-mini, o1, o3-mini)
- Anthropic (claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022)
- Google (gemini-2.0-flash-exp)
- DeepSeek (deepseek-chat, deepseek-reasoner)
- Zhipu (glm-4-flash, glm-4-plus)
- And 20+ more providers

The setup will prompt for:
1. **LLM Provider** (openai, anthropic, zhipu, deepseek, etc.)
2. **Source Selection** - Choose between:
   - Official sources - Default API endpoints from the vendor
   - Regional sources - Different endpoints for different regions (e.g., China vs International)
   - Custom API - Your own endpoint (useful for proxies or third-party services)
3. **Model name** (e.g., gpt-4o, claude-3-5-sonnet-20241022)
4. **API Key** - Or uses existing environment variable if set

### Source Selection

When running `minion setup`, you can now select between different API sources for each provider:

- **Official sources**: Default API endpoints provided by the vendor
- **Regional sources**: Different endpoints for different regions (e.g., China vs International for Zhipu AI, MiniMax)
- **Custom sources**: Your own API endpoint (useful for proxies, third-party services, etc.)

For example, Zhipu AI offers:
- 官方中国源 - `https://open.bigmodel.cn/api/paas/v4`
- 官方国际源 - `https://api.zhipu.ai/v1`
- 自定义 API 地址 - Enter your own URL

## Manual Configuration

Configuration is stored in `~/.minion/.pi/`:

### models.json

Defines available providers, their API sources, and models:

```json
{
  "providers": {
    "zai": {
      "sources": {
        "official-cn": {
          "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
          "apiKey": "$ZHIPU_API_KEY"
        }
      },
      "currentSource": "official-cn",
      "api": "openai-completions",
      "models": [
        {
          "id": "glm-4-flash",
          "name": "GLM-4 Flash",
          "reasoning": false,
          "input": ["text"],
          "cost": { "input": 0, "output": 0 },
          "contextWindow": 128000,
          "maxTokens": 4096
        }
      ]
    },
    "openai": {
      "api": "openai-completions",
      "models": [
        {
          "id": "gpt-4o",
          "name": "GPT-4o",
          "reasoning": false,
          "input": ["text"],
          "cost": { "input": 2.5, "output": 10 },
          "contextWindow": 128000,
          "maxTokens": 4096
        }
      ]
    },
    "anthropic": {
      "api": "anthropic-completions",
      "models": [
        {
          "id": "claude-3-5-sonnet-20241022",
          "name": "Claude 3.5 Sonnet",
          "reasoning": false,
          "input": ["text"],
          "cost": { "input": 3, "output": 15 },
          "contextWindow": 200000,
          "maxTokens": 8192
        }
      ]
    },
    "deepseek": {
      "sources": {
        "official": {
          "baseUrl": "https://api.deepseek.com/v1",
          "apiKey": "$DEEPSEEK_API_KEY"
        }
      },
      "currentSource": "official",
      "api": "openai-completions",
      "models": [
        {
          "id": "deepseek-chat",
          "name": "DeepSeek V3",
          "reasoning": false,
          "input": ["text"],
          "cost": { "input": 0.27, "output": 1.1 },
          "contextWindow": 128000,
          "maxTokens": 4096
        }
      ]
    }
  }
}
```

### config.json

Stores your current provider, source, and model selection:

```json
{
  "provider": "zai",
  "source": "official-cn",
  "model": "glm-4-flash"
}
```

**Note**: API keys are stored as environment variable references in `models.json` (e.g., `$ZHIPU_API_KEY`), not directly in `config.json`. This keeps your actual keys secure in your environment.

## Environment Variables

You can also use environment variables:

- `LLM_PROVIDER` - Provider name (openai, anthropic, etc.)
- `LLM_MODEL` - Model identifier (gpt-4o, claude-3-5-sonnet-20241022, etc.)
- `LLM_API_KEY` - API key
- `LLM_BASE_URL` - Optional base URL override

Provider-specific env vars take precedence:
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `DEEPSEEK_API_KEY`
- `ZHIPU_API_KEY`

## Built-in Providers

The TUI supports 25 LLM providers. Commonly used providers include:

| Provider | Models | Notes |
|----------|--------|-------|
| openai | gpt-4o, gpt-4o-mini, o1, o3-mini | Requires API key |
| anthropic | claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022 | Requires API key |
| google | gemini-2.0-flash-exp | Requires API key |
| deepseek | deepseek-chat, deepseek-reasoner | Requires API key |
| zhipu | glm-4-flash, glm-4-plus | Requires API key |

Run `minion setup` to see the full list of 25 supported providers.

## View Configuration

```bash
minion config
```

This displays:
- Current provider and model
- API key status
- Sandbox settings (memory, CPUs, network)
- pi-runtime location
