export interface ExecutionStrategy {
  preserveOnFailure: boolean
  snapshotMode?: 'on_failure' | 'always'
  retryEnabled: boolean
  retryMax?: number
  parallelRuns: number
  autoApply: boolean
  memory?: string
  cpus?: number
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function normalizeMemory(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  return raw.replace(/\s+/g, '').toLowerCase()
}

export function parseExecutionStrategy(prompt: string): ExecutionStrategy {
  const text = prompt || ''

  const preserveOnFailure = /(preserve|keep container|保留)/i.test(text)
  const autoApply = /(auto-apply|auto apply|自动应用)/i.test(text)
  const retryEnabled = /(retry|重试)/i.test(text)

  let snapshotMode: 'on_failure' | 'always' | undefined
  if (/(snapshot|快照)/i.test(text)) {
    snapshotMode = /(on failure|if failed|失败|失败时)/i.test(text) ? 'on_failure' : 'always'
  }

  let parallelRuns = 1
  const parallelMatches = [
    text.match(/(\d+)\s*(?:times?\s+in\s+parallel|parallel runs?)/i),
    text.match(/parallel\s+(\d+)/i),
    text.match(/并行\s*(\d+)\s*次?/),
  ]
  for (const match of parallelMatches) {
    const parsed = parsePositiveInt(match?.[1])
    if (parsed) {
      parallelRuns = parsed
      break
    }
  }

  let retryMax: number | undefined
  if (retryEnabled) {
    const retryMatches = [
      text.match(/retry(?:\s+up\s+to)?\s*(\d+)\s*times?/i),
      text.match(/重试\s*(\d+)\s*次?/),
    ]
    for (const match of retryMatches) {
      const parsed = parsePositiveInt(match?.[1])
      if (parsed) {
        retryMax = parsed
        break
      }
    }
  }

  const memoryMatches = [
    text.match(/(?:use|with)\s+(\d+\s*[gmk])\s+memory/i),
    text.match(/memory\s*(?:=|:)?\s*(\d+\s*[gmk])/i),
    text.match(/(\d+\s*[gmk])\s*内存/i),
  ]
  let memory: string | undefined
  for (const match of memoryMatches) {
    const normalized = normalizeMemory(match?.[1])
    if (normalized) {
      memory = normalized
      break
    }
  }

  const cpuMatches = [
    text.match(/(?:use|with)\s+(\d+)\s*(?:cores?|cpus?)/i),
    text.match(/(\d+)\s*(?:cores?|cpus?)/i),
    text.match(/cpus?\s*(?:=|:)?\s*(\d+)/i),
    text.match(/(\d+)\s*核/),
  ]
  let cpus: number | undefined
  for (const match of cpuMatches) {
    const parsed = parsePositiveInt(match?.[1])
    if (parsed) {
      cpus = parsed
      break
    }
  }

  return {
    preserveOnFailure,
    snapshotMode,
    retryEnabled,
    retryMax,
    parallelRuns,
    autoApply,
    memory,
    cpus,
  }
}

export function extractPromptEnvPairs(prompt: string): Record<string, string> {
  const env: Record<string, string> = {}
  const text = prompt || ''
  const pattern = /\b([A-Z_][A-Z0-9_]*)=(?:"([^"]*)"|'([^']*)'|([^\s,;]+))/g

  for (const match of text.matchAll(pattern)) {
    const key = match[1]
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    env[key] = value
  }

  return env
}
