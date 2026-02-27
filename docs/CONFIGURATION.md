# Configuration

Minions V3 uses pi-mono's configuration system with support for multiple LLM providers.

## Quick Setup

Run the interactive setup command:

```bash
minion setup
```

This will prompt for:
- LLM Provider (openai, anthropic, zhipu, deepseek, etc.)
- Model name (e.g., gpt-4o, claude-3-5-sonnet-20241022)
- API Key

## Manual Configuration

Configuration is stored in `~/.minion/.pi/`:

### models.json

Defines available providers and models:

```json
{
  "providers": {
    "openai": {
      "apiKey": "$OPENAI_API_KEY",
      "api": "openai-completions",
      "models": [
        {
          "id": "gpt-4o",
          "name": "GPT-4o",
          "reasoning": false,
          "input": ["text"],
          "cost": { "input": 2.5, "output": 10 }
        }
      ]
    },
    "anthropic": {
      "apiKey": "$ANTHROPIC_API_KEY",
      "api": "anthropic-completions",
      "models": [
        {
          "id": "claude-3-5-sonnet-20241022",
          "name": "Claude 3.5 Sonnet",
          "reasoning": false,
          "input": ["text"],
          "cost": { "input": 3, "output": 15 }
        }
      ]
    },
    "deepseek": {
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "$DEEPSEEK_API_KEY",
      "api": "openai-completions",
      "models": [
        {
          "id": "deepseek-chat",
          "name": "DeepSeek V3",
          "reasoning": false,
          "input": ["text"],
          "cost": { "input": 0.27, "output": 1.1 }
        }
      ]
    },
    "zhipu": {
      "apiKey": "$ZHIPU_API_KEY",
      "api": "zai-completions",
      "models": [
        {
          "id": "glm-4-flash",
          "name": "GLM-4 Flash",
          "reasoning": false,
          "input": ["text"]
        }
      ]
    }
  }
}
```

### config.json

Stores default selections and API keys:

```json
{
  "defaultProvider": "openai",
  "defaultModel": "gpt-4o",
  "apiKeys": {
    "openai": "sk-..."
  }
}
```

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

| Provider | Models | Notes |
|----------|--------|-------|
| openai | gpt-4o, gpt-4o-mini, o1, o3-mini | Requires API key |
| anthropic | claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022 | Requires API key |
| google | gemini-2.0-flash-exp | Requires API key |
| deepseek | deepseek-chat, deepseek-reasoner | Requires API key |
| zhipu | glm-4-flash, glm-4-plus | Requires API key |

## View Configuration

```bash
minion config
```

This displays:
- Current provider and model
- API key status
- Sandbox settings (memory, CPUs, network)
- pi-runtime location
