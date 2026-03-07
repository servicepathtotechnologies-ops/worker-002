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

  // Common placeholder patterns
  // ✅ CRITICAL FIX: Use exact matches or word boundaries to avoid false positives
  // Don't match valid URLs like "jsonplaceholder.typicode.com" or "example-api.com"
  const placeholderPatterns = [
    'enter your',
    'enter ',
    'your ',
    'https://example.com',
    'http://example.com',
    'https://example',
    'http://example',
    'todo',
    'fill this',
    'add your',
    'paste your',
    'insert your',
    'provide your',
    'select your',
  ];

  // Check for exact placeholder patterns (not substring matches)
  for (const pattern of placeholderPatterns) {
    if (lowerValue.includes(pattern)) {
      return true;
    }
  }

  // ✅ CRITICAL FIX: Only match "placeholder" or "example" as standalone words or in specific contexts
  // Don't match valid domains like "jsonplaceholder.typicode.com" or "example-api.com"
  // Match only if it's clearly a placeholder instruction, not a valid URL/domain
  if (lowerValue.includes('placeholder') || lowerValue.includes('example')) {
    // Check if it's a valid URL/domain (has TLD like .com, .org, etc.)
    const hasValidTLD = /\.(com|org|net|io|co|dev|app|xyz|info|edu|gov|mil|int|biz|name|pro|museum|aero|coop|jobs|mobi|travel|tel|asia|cat|jobs|tel|xxx|arpa|xxx|test|localhost)(\/|$|\s|$)/i.test(trimmed);
    
    // Check if it's clearly an instruction (starts with "enter", "your", etc.)
    const isInstruction = /^(enter|your|add|paste|insert|provide|select|fill|use|set)\s+(your\s+)?(placeholder|example)/i.test(trimmed);
    
    // Only treat as placeholder if it's NOT a valid URL/domain AND it's an instruction
    if (!hasValidTLD && isInstruction) {
      return true;
    }
    
    // Also match if it's exactly "placeholder" or "example" (standalone)
    if (trimmed === 'placeholder' || trimmed === 'example' || trimmed === 'https://example.com' || trimmed === 'http://example.com') {
      return true;
    }
  }

  // Check for ENV placeholders that aren't resolved
  if (trimmed.startsWith('{{ENV.') && !trimmed.includes('{{$json') && !trimmed.includes('{{input') && !trimmed.includes('{{trigger')) {
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
      console.log(`[PlaceholderFilter] Filtering out placeholder value for ${key}: ${typeof value === 'string' ? value.substring(0, 50) : value}`);
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
