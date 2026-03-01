/**
 * URL validation for custom API endpoints
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a custom API URL
 * Ensures URL is properly formatted and uses http/https protocol
 */
export function validateCustomUrl(url: string): ValidationResult {
  const trimmed = url.trim();

  if (!trimmed) {
    return { valid: false, error: 'URL cannot be empty' };
  }

  // Check for protocol first to give better error message
  if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
    return {
      valid: false,
      error: 'URL must start with https:// or http://'
    };
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        valid: false,
        error: 'URL must start with https:// or http://'
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
