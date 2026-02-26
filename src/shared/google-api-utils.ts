// Google API Utilities
// Migrated from Supabase Edge Functions

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableStatuses?: number[];
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableStatuses: [429, 500, 502, 503, 504],
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };
  let lastError: Error | null = null;
  let delay = opts.initialDelay;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          const retryAfterMs = parseInt(retryAfter, 10) * 1000;
          console.log(`[Google API] Rate limited. Retrying after ${retryAfter} seconds`);
          await sleep(Math.min(retryAfterMs, opts.maxDelay));
          continue;
        }
      }

      if (opts.retryableStatuses.includes(response.status) && attempt < opts.maxRetries) {
        console.log(`[Google API] Request failed with status ${response.status}, retrying (attempt ${attempt + 1}/${opts.maxRetries})...`);
        await sleep(delay);
        delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < opts.maxRetries) {
        console.log(`[Google API] Network error, retrying (attempt ${attempt + 1}/${opts.maxRetries})...`);
        await sleep(delay);
        delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay);
        continue;
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

export function parseGoogleApiError(response: Response, errorText: string): string {
  let errorMessage = `Google API error: ${response.status}`;

  try {
    const errorData = JSON.parse(errorText);
    if (errorData.error?.message) {
      errorMessage = errorData.error.message;
    } else if (errorData.error_description) {
      errorMessage = errorData.error_description;
    } else if (errorData.message) {
      errorMessage = errorData.message;
    }
  } catch {
    if (errorText) {
      errorMessage = errorText.length > 200 ? errorText.substring(0, 200) + '...' : errorText;
    }
  }

  switch (response.status) {
    case 400:
      errorMessage = `Bad request: ${errorMessage}`;
      break;
    case 401:
      errorMessage = `Authentication failed: ${errorMessage}. Please re-authenticate with Google.`;
      break;
    case 403:
      errorMessage = `Permission denied: ${errorMessage}. Check your permissions and ensure you have access.`;
      break;
    case 404:
      errorMessage = `Resource not found: ${errorMessage}. Check the ID and ensure the resource exists.`;
      break;
    case 429:
      errorMessage = `Rate limit exceeded: ${errorMessage}. Please try again later.`;
      break;
    case 500:
    case 502:
    case 503:
    case 504:
      errorMessage = `Google API server error: ${errorMessage}. Please try again later.`;
      break;
  }

  return errorMessage;
}

export function sanitizeString(input: unknown, fieldName: string, maxLength?: number): string {
  if (typeof input !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }

  const sanitized = input.trim();
  
  if (sanitized.length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }

  if (maxLength && sanitized.length > maxLength) {
    throw new Error(`${fieldName} exceeds maximum length of ${maxLength} characters`);
  }

  return sanitized;
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateISO8601(dateString: string): boolean {
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  return iso8601Regex.test(dateString);
}

/**
 * Extract Google Sheets spreadsheet ID from URL or return ID if already extracted
 */
export function extractSpreadsheetId(urlOrId: string): string {
  if (!urlOrId || typeof urlOrId !== 'string') {
    throw new Error('Spreadsheet ID or URL is required');
  }

  const trimmed = urlOrId.trim();
  
  // If it doesn't contain '/', it's already an ID
  if (!trimmed.includes('/')) {
    return trimmed;
  }

  // Patterns to match Google Sheets URLs
  const patterns = [
    /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,  // Full URL: /spreadsheets/d/ID
    /\/d\/([a-zA-Z0-9-_]+)/,                // Short URL: /d/ID
    /spreadsheetId[=:]([a-zA-Z0-9-_]+)/,    // Query param: spreadsheetId=ID
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // If no pattern matches, try to extract any alphanumeric ID-like string
  const idMatch = trimmed.match(/([a-zA-Z0-9-_]{20,})/);
  if (idMatch) {
    return idMatch[1];
  }

  return trimmed;
}

export function extractDocumentId(urlOrId: string): string {
  if (!urlOrId || typeof urlOrId !== 'string') {
    throw new Error('Document ID or URL is required');
  }

  const trimmed = urlOrId.trim();
  
  if (!trimmed.includes('/')) {
    return trimmed;
  }

  const patterns = [
    /\/d\/([a-zA-Z0-9-_]+)/,
    /document\/d\/([a-zA-Z0-9-_]+)/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return trimmed;
}

export function extractFileId(urlOrId: string): string {
  if (!urlOrId || typeof urlOrId !== 'string') {
    throw new Error('File ID or URL is required');
  }

  const trimmed = urlOrId.trim();
  
  if (!trimmed.includes('/')) {
    return trimmed;
  }

  const patterns = [
    /\/d\/([a-zA-Z0-9-_]+)/,
    /file\/d\/([a-zA-Z0-9-_]+)/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return trimmed;
}

export function validateBase64(base64: string): boolean {
  try {
    const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(cleanBase64)) {
      return false;
    }
    Buffer.from(cleanBase64, 'base64');
    return true;
  } catch {
    return false;
  }
}

export function logApiOperation(service: string, operation: string, details?: Record<string, unknown>): void {
  const logData: Record<string, unknown> = {
    service,
    operation,
    timestamp: new Date().toISOString(),
    ...details,
  };
  
  console.log(`[Google ${service}] ${operation}`, JSON.stringify(logData, null, 2));
}
