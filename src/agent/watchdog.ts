export interface WatchdogConfig {
  maxIterations: number;
  maxTokenCost: number;  // 0 = unlimited
}

export class Watchdog {
  private config: WatchdogConfig;
  iterations = 0;
  totalTokens = 0;
  reason: string | null = null;

  constructor(config: WatchdogConfig) {
    this.config = config;
  }

  tick(tokensUsed: number = 0): void {
    this.iterations++;
    this.totalTokens += tokensUsed;
  }

  tripped(): boolean {
    if (this.iterations >= this.config.maxIterations) {
      this.reason = 'max_iterations';
      return true;
    }
    if (this.config.maxTokenCost > 0 && this.totalTokens >= this.config.maxTokenCost) {
      this.reason = 'max_token_cost';
      return true;
    }
    return false;
  }
}
