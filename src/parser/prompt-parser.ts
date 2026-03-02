import { ExecutionStrategy, getDefaultStrategy } from '../types/strategy'

/**
 * Result of parsing a user prompt.
 */
export interface ParsedPrompt {
  /** Extracted task description */
  parsedTask: string
  /** Extracted execution strategy */
  strategy: ExecutionStrategy
}

/**
 * Minimal LLM interface for prompt parsing.
 */
export interface LLMAdapter {
  chat(messages: Array<{ role: string; content: string }>, tools: unknown[]): Promise<{ content: string }>
}

/**
 * System prompt for the LLM parser.
 * Instructs the LLM to extract task and strategy from user prompts.
 */
const PARSER_SYSTEM_PROMPT = `Parse user prompt and extract:
1. Task description (what to build/fix)
2. Execution strategy (how to execute)

Return JSON only (no markdown, no explanation):
{
  "task": "create hello.py...",
  "strategy": {
    "preserveOnFailure": true,
    "patchStrategy": "auto",
    ...
  }
}

Strategy keywords:
- "preserve container" / "keep container" / "保留容器" → preserveOnFailure: true
- "auto-apply patches" / "自动应用" → patchStrategy: "auto"
- "N times in parallel" / "并行N个" → parallelRuns: N, pickBest: true
- "retry" / "重试" → retryOnFailure: true
- "use Xg memory" / "使用Xg内存" → memory: "Xg"
- "use N cores" / "使用N核" → cpus: N
- "timeout Xs" / "超时Xs" → timeout: X (in seconds)
- "timeout Xm" / "超时Xm" → timeout: X (in minutes, will be converted to seconds)

Example:
Input: "create hello.py with 5m timeout, preserve container if failed"
Output: {"task": "create hello.py", "strategy": {"timeout": 5, "preserveOnFailure": true}}

If no strategy keywords found, return empty strategy object {}.
Only include strategy fields that are explicitly mentioned.`

/**
 * Parser that uses LLM to extract task and execution strategy from natural language.
 */
export class PromptParser {
  constructor(private llm: LLMAdapter) {}

  /**
   * Parse a user prompt into task description and execution strategy.
   * @param userPrompt The natural language prompt from the user
   * @returns Parsed task and strategy
   */
  async parse(userPrompt: string): Promise<ParsedPrompt> {
    try {
      const messages = [
        { role: 'system', content: PARSER_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ]

      const response = await this.llm.chat(messages, [])

      // Extract JSON from response (handle markdown code blocks)
      let parsed: any
      try {
        // Try to find JSON in response (may be wrapped in markdown)
        const jsonMatch = response.content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0])
        } else {
          throw new Error('No JSON found in response')
        }
      } catch (e) {
        // Fallback: no strategy extraction
        return {
          parsedTask: userPrompt,
          strategy: getDefaultStrategy()
        }
      }

      // Merge parsed strategy with defaults
      const strategy = {
        ...getDefaultStrategy(),
        ...parsed.strategy
      }

      // Convert timeout from minutes to seconds if needed
      // The LLM extracts timeout value in minutes when user specifies "Xm"
      // We need to convert it to seconds since ExecutionStrategy.timeout is in seconds
      if (parsed.strategy?.timeout !== undefined && userPrompt.match(/\d+m\b/)) {
        strategy.timeout = parsed.strategy.timeout * 60
      }

      return {
        parsedTask: parsed.task || userPrompt,
        strategy
      }
    } catch (error) {
      // On any error, return original prompt with defaults
      return {
        parsedTask: userPrompt,
        strategy: getDefaultStrategy()
      }
    }
  }
}
