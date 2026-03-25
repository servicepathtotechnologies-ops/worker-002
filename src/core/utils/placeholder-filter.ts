/**
 * PLACEHOLDER FILTER
 *
 * This utility detects and filters placeholder values from node configurations.
 * Placeholder values should never appear in node output JSON.
 *
 * This ensures:
 * 1. Placeholder values are detected before execution
 * 2. Config values are filtered to remove placeholders
 * 3. Only actual user-provided values are used
 */

/**
 * True if the string looks like UI instructional copy (not normal prose).
 * Uses start-anchored patterns only — avoids false positives like "your" in
 * "Your weekly summary" or "enter" inside "Re-enter" / "carpenter".
 */
function looksLikeInstructionalPlaceholder(trimmed: string): boolean {
  // "Enter your …", "Paste your …", etc. (must start with verb + your/the)
  if (
    /^(enter|type|add|paste|insert|provide|select|fill|choose)\s+(your|the|a)\b/i.test(trimmed)
  ) {
    return true;
  }
  if (/^fill\s+this\b/i.test(trimmed)) {
    return true;
  }
  // Standalone todo marker
  if (/^\s*todo\s*$/i.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Check if a value is a placeholder
 * Placeholders include:
 * - Empty strings
 * - Common placeholder patterns (e.g., "Enter your...", "https://example.com")
 * - Template expressions that are just placeholders
 */
export function isPlaceholderValue(value: any): boolean {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value !== 'string') {
    return false; // Non-string values are not placeholders
  }

  const trimmed = value.trim();

  // Empty string
  if (trimmed === '') {
    return true;
  }

  const lowerValue = trimmed.toLowerCase();

  // ✅ ENHANCED: Detect YOUR_* patterns (e.g., YOUR_SPREADSHEET_ID, YOUR_API_KEY)
  // These are common placeholder patterns used in default configs
  if (/^your_[a-z0-9_]+$/i.test(trimmed)) {
    return true;
  }

  // ✅ ENHANCED: Detect *_PLACEHOLDER patterns (e.g., SPREADSHEET_ID_PLACEHOLDER)
  if (/_[a-z0-9_]*placeholder$/i.test(trimmed)) {
    return true;
  }

  // ✅ ENHANCED: Detect ENTER_YOUR_* patterns (e.g., ENTER_YOUR_API_KEY)
  if (/^enter_your_[a-z0-9_]+$/i.test(trimmed)) {
    return true;
  }

  if (looksLikeInstructionalPlaceholder(trimmed)) {
    return true;
  }

  // Example / docs URLs (anchor to avoid matching unrelated strings)
  if (/^https?:\/\/example\.com(\/|$|\?|#)/i.test(trimmed)) {
    return true;
  }
  if (/^https?:\/\/example(\/|$|\?|#)/i.test(trimmed)) {
    return true;
  }

  // ✅ CRITICAL FIX: Only match "placeholder" or "example" as standalone words or in specific contexts
  // Don't match valid domains like "jsonplaceholder.typicode.com" or "example-api.com"
  // Match only if it's clearly a placeholder instruction, not a valid URL/domain
  if (lowerValue.includes('placeholder') || lowerValue.includes('example')) {
    // Check if it's a valid URL/domain (has TLD like .com, .org, etc.)
    const hasValidTLD =
      /\.(com|org|net|io|co|dev|app|xyz|info|edu|gov|mil|int|biz|name|pro|museum|aero|coop|jobs|mobi|travel|tel|asia|cat|jobs|tel|xxx|arpa|xxx|test|localhost)(\/|$|\s|$)/i.test(
        trimmed
      );

    // Check if it's clearly an instruction (starts with "enter", "your", etc.)
    const isInstruction =
      /^(enter|your|add|paste|insert|provide|select|fill|use|set)\s+(your\s+)?(placeholder|example)/i.test(
        trimmed
      );

    // Only treat as placeholder if it's NOT a valid URL/domain AND it's an instruction
    if (!hasValidTLD && isInstruction) {
      return true;
    }

    // Also match if it's exactly "placeholder" or "example" (standalone)
    if (
      trimmed === 'placeholder' ||
      trimmed === 'example' ||
      trimmed === 'https://example.com' ||
      trimmed === 'http://example.com'
    ) {
      return true;
    }
  }

  // Check for ENV placeholders that aren't resolved
  if (
    trimmed.startsWith('{{ENV.') &&
    !trimmed.includes('{{$json') &&
    !trimmed.includes('{{input') &&
    !trimmed.includes('{{trigger')
  ) {
    return true; // ENV placeholder without actual value
  }

  // Check for empty template variables
  if (trimmed.startsWith('{{') && trimmed.endsWith('}}') && trimmed.includes('ENV.')) {
    return true;
  }

  return false;
}

/**
 * Filter placeholder values from a config object
 * Returns a new config object with placeholder values removed
 *
 * @param config - Node configuration object
 * @returns Config with placeholder values filtered out
 */
export function filterPlaceholderValues(config: Record<string, any>): Record<string, any> {
  const filtered: Record<string, any> = {};

  for (const [key, value] of Object.entries(config)) {
    // Skip internal metadata fields (always keep them)
    if (key.startsWith('_')) {
      filtered[key] = value;
      continue;
    }

    // Filter out placeholder values
    if (!isPlaceholderValue(value)) {
      filtered[key] = value;
    } else {
      // Log that we're filtering out a placeholder
      console.log(
        `[PlaceholderFilter] Filtering out placeholder value for ${key}: ${typeof value === 'string' ? value.substring(0, 50) : value}`
      );
    }
  }

  return filtered;
}

/**
 * Clean output to remove config values that shouldn't be in output
 * This ensures only actual output data is returned, not config values
 *
 * @param output - Node output object
 * @param config - Node configuration (to identify what to filter)
 * @returns Cleaned output without config values
 */
export function cleanOutputFromConfig(output: any, config: Record<string, any>): any {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return output; // Return as-is if not an object
  }

  const outputObj = output as Record<string, any>;
  const cleaned: Record<string, any> = {};

  // List of config keys that should never appear in output
  const configKeys = new Set(Object.keys(config));

  for (const [key, value] of Object.entries(outputObj)) {
    // Always keep error fields
    if (key === '_error' || key === '_errorCode' || key === '_errorDetails' || key === '_nodeType') {
      cleaned[key] = value;
      continue;
    }

    // Filter out config values from output
    // Config values like spreadsheetId, operation, outputFormat should not be in output
    if (configKeys.has(key)) {
      // This is a config value, don't include it in output
      continue;
    }

    // Keep all other output values
    cleaned[key] = value;
  }

  return cleaned;
}
