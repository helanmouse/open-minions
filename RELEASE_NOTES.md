# Minions V3 Release Notes

## pi-mono Integration

Minions V3 integrates [pi-mono](https://github.com/badlogic/pi-mono) framework for unified LLM and agent runtime:

- **LLM layer**: Migrated to `@mariozechner/pi-ai` for unified provider interface
- **Agent runtime**: Sandbox Agent uses `@mariozechner/pi-agent-core` Agent class
- **Tools**: File tools from `@mariozechner/coding-agent` (bash, read, edit, write)
- **Offline mounting**: pi-runtime pre-built on host, mounted to containers
- **Configuration**: Interactive `minion setup` command with pi-mono compatible config

## Breaking Changes from V2

- **Configuration format**: Changed to pi-mono format (`~/.minion/.pi/models.json`)
- **New setup command**: Run `minion setup` to configure LLM provider
- **pi-runtime required**: Run `npm run build:pi-runtime` before first use

## Migration from V2

V2 users upgrading to V3 should:

1. **Build pi-runtime**:
   ```bash
   npm run build:pi-runtime
   npm run build:sandbox
   ```

2. **Reconfigure LLM**:
   ```bash
   minion setup
   ```

3. **Update config files** (if using manual `.env`):
   - Old format still supported via environment variables
   - New `~/.minion/.pi/` format allows multiple providers

## New Commands

| Command | Description |
|---------|-------------|
| `minion setup` | Interactive LLM configuration |
| `minion config` | View current configuration |

## Architecture Changes

### Before (V2)
```
Host Agent (custom LLM adapters) → Docker → Sandbox Agent (custom loop)
```

### After (V3)
```
Host Agent (pi-ai) → Docker → bootstrap.sh → Sandbox Agent (pi-agent-core)
                                      ↓
                            pi-runtime (mounted from host)
```

## Supported LLM Providers

- OpenAI (gpt-4o, gpt-4o-mini, o1, o3-mini)
- Anthropic (claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022)
- Google (gemini-2.0-flash-exp)
- DeepSeek (deepseek-chat, deepseek-reasoner)
- Zhipu (glm-4-flash, glm-4-plus)

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for details.

## Component Versions

- `@mariozechner/pi-ai`: v0.55.1
- `@mariozechner/pi-agent-core`: v0.55.1
- `@mariozechner/coding-agent`: v0.5.48
- `@sinclair/typebox`: v0.34.48

## Known Issues

- pi-mono TUI (settings wizard) is not yet integrated; using simplified prompt-based setup
- Some pi-mono APIs documented in design differ from published packages

## Future Work

- Integrate pi-mono's full TUI for settings management
- Add support for custom model definitions via models.json
- Implement task result caching
- Add multi-file patch support
