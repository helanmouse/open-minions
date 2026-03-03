# Migration Guide: Host Agent v2 to v3

## What Changed

- **Removed**: PromptParser, ExecutionStrategy, old AIHostAgent
- **Added**: New HostAgent based on pi-agent-core with tool set
- **Benefit**: True natural language control over execution flow

## For Users

No changes needed! CLI interface remains the same:

```bash
minion run "your task description"
```

But now you have more flexibility:
- Describe complex workflows in natural language
- Agent autonomously decides execution strategy
- Better error handling and reporting

## For Developers

If you extended the old AIHostAgent:

1. **Tools are now in `src/host-agent/tools/`**
   - Each tool follows the pi-agent-core format with `name`, `description`, and `execute` function
   - Tools are automatically registered with the agent

2. **Add new tools following the pi-agent-core format:**
   ```typescript
   import { Type, type Static } from '@sinclair/typebox'
   import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'

   const MyToolSchema = Type.Object({
     param: Type.String({ description: 'Parameter description' })
   })

   export const myTool: AgentTool<typeof MyToolSchema> = {
     name: 'my_tool',
     label: 'my_tool',
     description: 'Description for the LLM',
     parameters: MyToolSchema,
     execute: async (_id: string, args: Static<typeof MyToolSchema>): Promise<AgentToolResult<MyResult>> => {
       // Implementation
       const result = { success: true, result: 'output' }
       return {
         content: [{ type: 'text', text: JSON.stringify(result) }],
         details: result
       }
     }
   }
   ```

3. **Update system prompt in `src/host-agent/prompts.ts`**
   - The system prompt guides the agent's behavior
   - Tools are automatically described to the agent

4. **Key architectural changes:**
   - No more manual prompt parsing or execution strategy selection
   - Agent uses natural language understanding to decide which tools to call
   - Tool results are automatically fed back to the agent for next steps

## Migration Examples

### Before (v2)
```typescript
// Manual parsing and strategy selection
const parsed = promptParser.parse(userInput);
const strategy = executionStrategy.select(parsed);
await strategy.execute();
```

### After (v3)
```typescript
// Natural language processing
const agent = new HostAgent(config);
await agent.run(userInput);
// Agent autonomously selects and executes tools
```

## More Information

See the full design document: `docs/plans/2026-03-03-host-agent-redesign.md`
