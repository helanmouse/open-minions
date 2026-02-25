import { z } from 'zod';

const ConfigSchema = z.object({
  llm: z.object({
    provider: z.enum(['openai', 'anthropic', 'ollama']).default('openai'),
    model: z.string().default('gpt-4o'),
    apiKey: z.string().default(''),
    baseUrl: z.string().optional(),
  }),
  sandbox: z.object({
    memory: z.string().default('4g'),
    cpus: z.number().default(2),
    network: z.string().default('bridge'),
  }),
  agent: z.object({
    maxIterations: z.number().default(50),
    timeout: z.number().default(30),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  return ConfigSchema.parse({
    llm: {
      provider: process.env.LLM_PROVIDER || undefined,
      model: process.env.LLM_MODEL || undefined,
      apiKey: process.env.LLM_API_KEY || undefined,
      baseUrl: process.env.LLM_BASE_URL || undefined,
    },
    sandbox: {
      memory: process.env.SANDBOX_MEMORY || undefined,
      cpus: Number(process.env.SANDBOX_CPUS) || undefined,
      network: process.env.SANDBOX_NETWORK || undefined,
    },
    agent: {
      maxIterations: Number(process.env.AGENT_MAX_ITERATIONS) || undefined,
      timeout: Number(process.env.AGENT_TIMEOUT) || undefined,
    },
  });
}
