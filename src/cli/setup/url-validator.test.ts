import { describe, it, expect } from 'vitest';
import { validateCustomUrl } from './url-validator.js';

describe('validateCustomUrl', () => {
  it('should accept valid HTTPS URLs', () => {
    const result = validateCustomUrl('https://api.example.com/v1');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should accept valid HTTP URLs', () => {
    const result = validateCustomUrl('http://localhost:8080');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject empty URLs', () => {
    const result = validateCustomUrl('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL cannot be empty');
  });

  it('should reject URLs without protocol', () => {
    const result = validateCustomUrl('api.example.com/v1');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('https:// or http://');
  });

  it('should reject invalid protocols', () => {
    const result = validateCustomUrl('ftp://example.com');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('https:// or http://');
  });

  it('should reject malformed URLs', () => {
    const result = validateCustomUrl('https://');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid URL format');
  });
});
