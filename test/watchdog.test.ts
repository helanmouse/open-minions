import { describe, it, expect } from 'vitest';
import { Watchdog } from '../src/agent/watchdog.js';

describe('Watchdog', () => {
  it('does not trip when under limits', () => {
    const wd = new Watchdog({ maxIterations: 10, maxTokenCost: 100000 });
    wd.tick(500);
    wd.tick(500);
    expect(wd.tripped()).toBe(false);
    expect(wd.iterations).toBe(2);
  });

  it('trips on max iterations', () => {
    const wd = new Watchdog({ maxIterations: 3, maxTokenCost: 100000 });
    wd.tick(100);
    wd.tick(100);
    wd.tick(100);
    expect(wd.tripped()).toBe(true);
    expect(wd.reason).toBe('max_iterations');
  });

  it('trips on max token cost', () => {
    const wd = new Watchdog({ maxIterations: 100, maxTokenCost: 1000 });
    wd.tick(600);
    wd.tick(600);
    expect(wd.tripped()).toBe(true);
    expect(wd.reason).toBe('max_token_cost');
  });

  it('ignores token cost limit when set to 0', () => {
    const wd = new Watchdog({ maxIterations: 100, maxTokenCost: 0 });
    wd.tick(999999);
    expect(wd.tripped()).toBe(false);
  });
});
