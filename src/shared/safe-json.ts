/**
 * Safe JSON parsing utilities
 * Prevents crashes from malformed JSON and provides consistent error handling
 */

/**
 * Safely parse JSON string, returning null on error
 */
export function safeParse<T = unknown>(json: string, defaultValue: T | null = null): T | null {
  if (!json || typeof json !== 'string') {
    return defaultValue;
  }

  try {
    const parsed = JSON.parse(json);
    return parsed as T;
  } catch (error) {
    console.warn('[SafeJSON] Failed to parse JSON:', error instanceof Error ? error.message : String(error));
    return defaultValue;
  }
}

/**
 * Safely parse JSON string, returning default value on error
 */
export function safeParseWithDefault<T>(json: string, defaultValue: T): T {
  const parsed = safeParse<T>(json, null);
  return parsed !== null ? parsed : defaultValue;
}

/**
 * Safely stringify object, returning empty string on error
 */
export function safeStringify(obj: unknown, defaultValue = ''): string {
  try {
    return JSON.stringify(obj);
  } catch (error) {
    console.warn('[SafeJSON] Failed to stringify object:', error instanceof Error ? error.message : String(error));
    return defaultValue;
  }
}

/**
 * Safely deep clone object using JSON (handles circular references)
 */
export function safeDeepClone<T>(obj: T): T | null {
  try {
    return JSON.parse(JSON.stringify(obj)) as T;
  } catch (error) {
    console.warn('[SafeJSON] Failed to deep clone object:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Check if string is valid JSON without parsing
 */
export function isValidJSON(str: string): boolean {
  if (!str || typeof str !== 'string') {
    return false;
  }

  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}
