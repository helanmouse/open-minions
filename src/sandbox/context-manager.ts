import { readJournal, rotateJournal } from './journal.js';

const RESET_THRESHOLD = 0.8;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 60_000;
const GRACE_TURNS = 2;
const RETRYABLE_ERRORS = new Set(['rate_limit', 'server_error', 'timeout', 'overloaded']);

export interface ContextManagerOptions {
  maxIterations: number;
  contextWindow: number;
  runDir: string;
  journalPath: string;
}

export class ContextManager {
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private turnCount = 0;
  private resetCount = 0;
  private readonly maxIterations: number;
  private readonly contextWindow: number;
  private readonly runDir: string;
  private readonly journalPath: string;

  constructor(opts: ContextManagerOptions) {
    this.maxIterations = opts.maxIterations;
    this.contextWindow = opts.contextWindow;
    this.runDir = opts.runDir;
    this.journalPath = opts.journalPath;
  }

  onEvent(event: any): void {
    if (event.type === 'message_end') {
      const usage = event.message?.usage;
      if (usage && typeof usage === 'object') {
        if (typeof usage.input === 'number') this.totalInputTokens += usage.input;
        if (typeof usage.output === 'number') this.totalOutputTokens += usage.output;
      }
    } else if (event.type === 'turn_end') {
      this.turnCount++;
    }
  }

  getTokenSummary(): { input: number; output: number } {
    return { input: this.totalInputTokens, output: this.totalOutputTokens };
  }

  shouldReset(): boolean {
    return this.totalInputTokens >= this.contextWindow * RESET_THRESHOLD;
  }

  shouldEnforceLimit(): boolean {
    return this.turnCount >= this.maxIterations;
  }

  shouldForceTerminate(): boolean {
    return this.turnCount >= this.maxIterations + GRACE_TURNS;
  }

  getSteeringMessage(): string {
    return 'You have reached the maximum iteration limit. Call deliver_patch now with your current progress. If you cannot deliver, update the journal with status PARTIAL and explain what remains.';
  }

  async performReset(): Promise<string> {
    const journalContent = readJournal(this.journalPath);
    rotateJournal(this.journalPath);
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.resetCount++;
    return `Continue the task. This is context reset #${this.resetCount}. Your previous execution journal:\n\n${journalContent}`;
  }

  getRetryDelay(attempt: number): number {
    return Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
  }

  shouldRetry(errorType: string, attempt: number): boolean {
    if (attempt >= MAX_RETRIES) return false;
    return RETRYABLE_ERRORS.has(errorType);
  }

  get resets(): number {
    return this.resetCount;
  }

  get turns(): number {
    return this.turnCount;
  }
}
