import { describe, it, expect } from 'vitest';
import { ContextManager } from '../src/sandbox/context-manager.js';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function makeManager(opts: {
  maxIterations?: number;
  contextWindow?: number;
  runDir?: string;
} = {}) {
  const dir = opts.runDir || mkdtempSync(join(tmpdir(), 'ctx-mgr-'));
  const journalPath = join(dir, 'journal.md');
  writeFileSync(journalPath, '## Journal Entry 1\n### State\n- Phase: coding\n### Key Decisions\nDecided to use X\n');
  return {
    manager: new ContextManager({
      maxIterations: opts.maxIterations ?? 50,
      contextWindow: opts.contextWindow ?? 128_000,
      runDir: dir,
      journalPath,
    }),
    dir,
    journalPath,
  };
}

describe('ContextManager', () => {
  describe('token tracking', () => {
    it('accumulates input and output tokens from message_end events', () => {
      const { manager } = makeManager();
      manager.onEvent({ type: 'message_end', message: { usage: { input: 100, output: 50 } } });
      manager.onEvent({ type: 'message_end', message: { usage: { input: 200, output: 75 } } });
      expect(manager.getTokenSummary()).toEqual({ input: 300, output: 125 });
    });

    it('handles missing usage gracefully', () => {
      const { manager } = makeManager();
      manager.onEvent({ type: 'message_end' });
      manager.onEvent({ type: 'message_end', message: null });
      manager.onEvent({ type: 'message_end', message: {} });
      manager.onEvent({ type: 'message_end', message: { usage: null } });
      expect(manager.getTokenSummary()).toEqual({ input: 0, output: 0 });
    });

    it('ignores non-message_end events for token tracking', () => {
      const { manager } = makeManager();
      manager.onEvent({ type: 'turn_end' });
      manager.onEvent({ type: 'content_block_delta' });
      expect(manager.getTokenSummary()).toEqual({ input: 0, output: 0 });
    });
  });

  describe('shouldReset', () => {
    it('returns true when input tokens exceed 80% of context window', () => {
      const { manager } = makeManager({ contextWindow: 1000 });
      manager.onEvent({ type: 'message_end', message: { usage: { input: 810, output: 10 } } });
      expect(manager.shouldReset()).toBe(true);
    });

    it('returns false when input tokens are under 80% of context window', () => {
      const { manager } = makeManager({ contextWindow: 1000 });
      manager.onEvent({ type: 'message_end', message: { usage: { input: 790, output: 10 } } });
      expect(manager.shouldReset()).toBe(false);
    });

    it('returns true at exactly 80%', () => {
      const { manager } = makeManager({ contextWindow: 1000 });
      manager.onEvent({ type: 'message_end', message: { usage: { input: 800, output: 0 } } });
      expect(manager.shouldReset()).toBe(true);
    });
  });

  describe('iteration enforcement', () => {
    it('counts turn_end events', () => {
      const { manager } = makeManager();
      manager.onEvent({ type: 'turn_end' });
      manager.onEvent({ type: 'turn_end' });
      expect(manager.turns).toBe(2);
    });

    it('does not count non-turn_end events as turns', () => {
      const { manager } = makeManager();
      manager.onEvent({ type: 'message_end', message: { usage: { input: 10, output: 5 } } });
      expect(manager.turns).toBe(0);
    });

    it('shouldEnforceLimit returns true at maxIterations', () => {
      const { manager } = makeManager({ maxIterations: 3 });
      manager.onEvent({ type: 'turn_end' });
      manager.onEvent({ type: 'turn_end' });
      manager.onEvent({ type: 'turn_end' });
      expect(manager.shouldEnforceLimit()).toBe(true);
    });

    it('shouldEnforceLimit returns false before maxIterations', () => {
      const { manager } = makeManager({ maxIterations: 3 });
      manager.onEvent({ type: 'turn_end' });
      manager.onEvent({ type: 'turn_end' });
      expect(manager.shouldEnforceLimit()).toBe(false);
    });

    it('shouldForceTerminate returns true after maxIterations + GRACE_TURNS', () => {
      const { manager } = makeManager({ maxIterations: 3 });
      // 3 + 2 grace = 5 turns to force terminate
      for (let i = 0; i < 5; i++) {
        manager.onEvent({ type: 'turn_end' });
      }
      expect(manager.shouldForceTerminate()).toBe(true);
    });

    it('shouldForceTerminate returns false within grace period', () => {
      const { manager } = makeManager({ maxIterations: 3 });
      for (let i = 0; i < 4; i++) {
        manager.onEvent({ type: 'turn_end' });
      }
      expect(manager.shouldForceTerminate()).toBe(false);
    });
  });

  describe('getSteeringMessage', () => {
    it('contains iteration limit and deliver_patch', () => {
      const { manager } = makeManager();
      const msg = manager.getSteeringMessage();
      expect(msg).toContain('iteration limit');
      expect(msg).toContain('deliver_patch');
    });
  });

  describe('performReset', () => {
    it('rotates journal, resets token counters, returns recovery message', async () => {
      const { manager, dir, journalPath } = makeManager();
      // Accumulate some tokens
      manager.onEvent({ type: 'message_end', message: { usage: { input: 500, output: 200 } } });
      expect(manager.getTokenSummary()).toEqual({ input: 500, output: 200 });

      const recovery = await manager.performReset();

      // Token counters should be reset
      expect(manager.getTokenSummary()).toEqual({ input: 0, output: 0 });
      // Reset count should increment
      expect(manager.resets).toBe(1);
      // Recovery message should contain journal content and reset number
      expect(recovery).toContain('context reset #1');
      expect(recovery).toContain('Decided to use X');
      // Rotated file should exist
      expect(existsSync(join(dir, 'journal-001.md'))).toBe(true);
      // Fresh journal should be seeded
      const fresh = readFileSync(journalPath, 'utf-8');
      expect(fresh).toContain('## Journal Entry 1');
    });

    it('increments reset count on successive resets', async () => {
      const { manager, journalPath } = makeManager();
      await manager.performReset();
      // Write new content for second rotation
      writeFileSync(journalPath, '## Entry 2\nMore progress\n');
      await manager.performReset();
      expect(manager.resets).toBe(2);
    });
  });

  describe('retry logic', () => {
    it('computes exponential backoff delay', () => {
      const { manager } = makeManager();
      expect(manager.getRetryDelay(0)).toBe(2000);
      expect(manager.getRetryDelay(1)).toBe(4000);
      expect(manager.getRetryDelay(2)).toBe(8000);
      expect(manager.getRetryDelay(3)).toBe(16000);
    });

    it('caps delay at MAX_DELAY_MS', () => {
      const { manager } = makeManager();
      expect(manager.getRetryDelay(10)).toBe(60_000);
    });

    it('shouldRetry returns true for retryable errors within limit', () => {
      const { manager } = makeManager();
      expect(manager.shouldRetry('rate_limit', 0)).toBe(true);
      expect(manager.shouldRetry('server_error', 1)).toBe(true);
      expect(manager.shouldRetry('timeout', 2)).toBe(true);
      expect(manager.shouldRetry('overloaded', 0)).toBe(true);
    });

    it('shouldRetry returns false when attempt >= MAX_RETRIES', () => {
      const { manager } = makeManager();
      expect(manager.shouldRetry('rate_limit', 3)).toBe(false);
      expect(manager.shouldRetry('rate_limit', 4)).toBe(false);
    });

    it('shouldRetry returns false for non-retryable errors', () => {
      const { manager } = makeManager();
      expect(manager.shouldRetry('invalid_request', 0)).toBe(false);
      expect(manager.shouldRetry('auth_error', 0)).toBe(false);
      expect(manager.shouldRetry('unknown', 0)).toBe(false);
    });
  });
});
