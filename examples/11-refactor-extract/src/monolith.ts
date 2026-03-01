// monolith.ts — A single file with mixed concerns: validation, formatting, and calculation.
// This file is intentionally monolithic for refactoring practice.

// --- Validation ---

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePhone(phone: string): boolean {
  return /^\+?[\d\s-]{10,}$/.test(phone);
}

export function validateAge(age: number): boolean {
  return Number.isInteger(age) && age >= 0 && age <= 150;
}

// --- Formatting ---

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11)
    return `+${digits[0]} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

// --- Calculation ---

export function calculateTax(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}

export function calculateDiscount(price: number, percent: number): number {
  return Math.round(price * (1 - percent / 100) * 100) / 100;
}

export function calculateTotal(items: { price: number; qty: number }[]): number {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

// --- User processing (uses all three concerns) ---

export interface UserInput {
  name: string;
  email: string;
  phone: string;
  age: number;
}

export function processUser(
  input: UserInput,
): { valid: boolean; errors: string[]; formatted: Record<string, string> } {
  const errors: string[] = [];
  if (!validateEmail(input.email)) errors.push('Invalid email');
  if (!validatePhone(input.phone)) errors.push('Invalid phone');
  if (!validateAge(input.age)) errors.push('Invalid age');

  return {
    valid: errors.length === 0,
    errors,
    formatted: {
      phone: formatPhone(input.phone),
    },
  };
}
