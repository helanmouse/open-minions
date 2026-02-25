import { z } from 'zod';

const ConfigSchema = z.object({
  server: z.object({
    port: z.number().default(3000),
    host: z.string().default('127.0.0.1'),
  }),
  redis: z.object({
    url: z.string().default('redis://localhost:6379'),
  }),
  llm: z.object({
    provider: z.enum(['openai', 'anthropic', 'ollama']).default('openai'),
    model: z.string().default('gpt-4o'),
    apiKey: z.string().default(''),
    baseUrl: z.string().optional(),
  }),
  gitlab: z.object({
    url: z.string().default('https://gitlab.com'),
    token: z.string().default(''),
  }),
  agent: z.object({
    maxIterations: z.number().default(20),
    maxCiRetries: z.number().default(2),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  return ConfigSchema.parse({
    server: {
      port: Number(process.env.MINION_PORT) || undefined,
      host: process.env.MINION_HOST || undefined,
    },
    redis: {
      url: process.env.REDIS_URL || undefined,
    },
    llm: {
      provider: process.env.LLM_PROVIDER || undefined,
      model: process.env.LLM_MODEL || undefined,
      apiKey: process.env.LLM_API_KEY || undefined,
      baseUrl: process.env.LLM_BASE_URL || undefined,
    },
    gitlab: {
      url: process.env.GITLAB_URL || undefined,
      token: process.env.GITLAB_TOKEN || undefined,
    },
    agent: {
      maxIterations: Number(process.env.AGENT_MAX_ITERATIONS) || undefined,
      maxCiRetries: Number(process.env.AGENT_MAX_CI_RETRIES) || undefined,
    },
  });
}
