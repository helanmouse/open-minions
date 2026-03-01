import { describe, it, expect } from 'vitest';
import {
  validateEmail, validatePhone, validateAge,
  formatCurrency, formatDate, formatPhone,
  calculateTax, calculateDiscount, calculateTotal,
  processUser,
} from '../src/monolith.js';

describe('Validation', () => {
  it('validateEmail accepts valid email', () => {
    expect(validateEmail('test@example.com')).toBe(true);
  });
  it('validateEmail rejects invalid email', () => {
    expect(validateEmail('not-an-email')).toBe(false);
  });
  it('validatePhone accepts valid phone', () => {
    expect(validatePhone('+1 234-567-8901')).toBe(true);
  });
  it('validatePhone rejects short phone', () => {
    expect(validatePhone('123')).toBe(false);
  });
  it('validateAge accepts valid age', () => {
    expect(validateAge(25)).toBe(true);
  });
  it('validateAge rejects negative', () => {
    expect(validateAge(-1)).toBe(false);
  });
});

describe('Formatting', () => {
  it('formatCurrency formats USD', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });
  it('formatDate formats ISO date', () => {
    expect(formatDate(new Date('2024-03-15T10:00:00Z'))).toBe('2024-03-15');
  });
  it('formatPhone formats 10-digit', () => {
    expect(formatPhone('1234567890')).toBe('(123) 456-7890');
  });
});

describe('Calculation', () => {
  it('calculateTax computes correctly', () => {
    expect(calculateTax(100, 0.08)).toBe(8);
  });
  it('calculateDiscount applies percent', () => {
    expect(calculateDiscount(200, 10)).toBe(180);
  });
  it('calculateTotal sums items', () => {
    expect(calculateTotal([
      { price: 10, qty: 2 },
      { price: 5, qty: 3 },
    ])).toBe(35);
  });
});

describe('processUser', () => {
  it('returns valid for good input', () => {
    const result = processUser({
      name: 'Alice', email: 'alice@example.com',
      phone: '+1 234-567-8901', age: 30,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
  it('returns errors for bad input', () => {
    const result = processUser({
      name: 'Bob', email: 'bad', phone: '123', age: -5,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
