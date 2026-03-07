/**
 * Webhook URL Validator
 * 
 * Validates webhook URLs to prevent invalid/placeholder values from being accepted.
 * This prevents errors like "Dammy" or "test" from being saved as webhook URLs.
 */

/**
 * ✅ WORLD-CLASS: Validate webhook URL format and content
 * 
 * Rejects:
 * - Empty or whitespace-only URLs
 * - Placeholder/test values (dammy, dummy, test, placeholder, example)
 * - Invalid URL formats
 * - Non-HTTP/HTTPS protocols
 * 
 * @param url - Webhook URL to validate
 * @returns Validation result with error message if invalid
 */
export function validateWebhookUrl(url: string | undefined | null): {
  valid: boolean;
  error?: string;
} {
  // Check if URL is provided
  if (!url || typeof url !== 'string') {
    return {
      valid: false,
      error: 'Webhook URL is required',
    };
  }

  const trimmedUrl = url.trim();

  // Check if URL is empty after trimming
  if (trimmedUrl === '') {
    return {
      valid: false,
      error: 'Webhook URL cannot be empty',
    };
  }

  // ✅ CRITICAL: Reject placeholder/test values
  const invalidValues = [
    'dammy',
    'dummy',
    'test',
    'placeholder',
    'example',
    'sample',
    'demo',
    'temp',
    'temporary',
    'fake',
    'mock',
  ];

  const urlLower = trimmedUrl.toLowerCase();
  for (const invalid of invalidValues) {
    if (urlLower.includes(invalid)) {
      return {
        valid: false,
        error: `Invalid webhook URL: "${trimmedUrl}" appears to be a placeholder or test value. Please provide a valid webhook URL.`,
      };
    }
  }

  // Validate URL format
  try {
    const urlObj = new URL(trimmedUrl);
    
    // Only allow HTTP/HTTPS protocols
    if (urlObj.protocol !== 'https:' && urlObj.protocol !== 'http:') {
      return {
        valid: false,
        error: `Invalid webhook URL protocol: ${urlObj.protocol}. Only HTTP and HTTPS are allowed.`,
      };
    }

    // Check if hostname is valid (not empty, not just a placeholder)
    if (!urlObj.hostname || urlObj.hostname.trim() === '') {
      return {
        valid: false,
        error: 'Invalid webhook URL: hostname is missing',
      };
    }

    // Additional check: hostname should not be a placeholder
    const hostnameLower = urlObj.hostname.toLowerCase();
    for (const invalid of invalidValues) {
      if (hostnameLower.includes(invalid)) {
        return {
          valid: false,
          error: `Invalid webhook URL: hostname "${urlObj.hostname}" appears to be a placeholder. Please provide a valid webhook URL.`,
        };
      }
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid webhook URL format: "${trimmedUrl}". Please provide a valid URL (e.g., https://hooks.slack.com/services/...).`,
    };
  }
}

/**
 * Validate multiple webhook URLs
 */
export function validateWebhookUrls(urls: Record<string, string>): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  for (const [key, url] of Object.entries(urls)) {
    const validation = validateWebhookUrl(url);
    if (!validation.valid) {
      errors[key] = validation.error || 'Invalid webhook URL';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
