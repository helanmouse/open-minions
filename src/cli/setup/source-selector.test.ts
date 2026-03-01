import { describe, it, expect, vi } from 'vitest';
import { SourceSelector } from './source-selector.js';
import { PROVIDER_SOURCES } from './sources.js';

describe('SourceSelector (integration)', () => {
  it('should export SourceSelector class', () => {
    expect(SourceSelector).toBeDefined();
  });

  it('should have selectSource method', () => {
    const selector = new SourceSelector();
    expect(typeof selector.selectSource).toBe('function');
  });

  // Note: Full UI testing requires manual testing or complex mocking
  // These tests verify the structure exists
});
