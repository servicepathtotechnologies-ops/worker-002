/**
 * ✅ UNIVERSAL: Check if a value is truly empty
 * 
 * This is the SINGLE SOURCE OF TRUTH for empty value checks across the entire system.
 * Handles: strings, arrays, objects, nested structures, template expressions
 * 
 * Used by:
 * - Question generator (to determine if fields need questions)
 * - Workflow builder (to determine if fields need auto-generation)
 * - Validation (to check if required fields are populated)
 * 
 * @param value - The value to check
 * @returns true if the value is empty, false otherwise
 */
export function isEmptyValue(value: any): boolean {
  // Null/undefined are empty
  if (value === null || value === undefined) {
    return true;
  }

  // Strings: empty or only whitespace
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return true;
    }
    // Template placeholders are considered empty
    if (trimmed.includes('{{$json.timestamp}}') ||
        trimmed.includes('{{$json.record}}') ||
        trimmed.includes('{{$json.output}}') ||
        trimmed.includes('{{ENV.') ||
        (trimmed.startsWith('{{') && trimmed.endsWith('}}') && trimmed.includes('$json') && !trimmed.includes('.'))) {
      return true;
    }
    return false;
  }

  // Arrays: empty array OR array with all empty items
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return true;
    }
    // Check if all items in array are empty
    return value.every(item => isEmptyValue(item));
  }

  // Objects: empty object OR object with all empty values
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return true;
    }
    // Check if all values in object are empty
    return keys.every(key => isEmptyValue(value[key]));
  }

  // Numbers: 0 is not empty
  // Booleans: false is not empty
  // For other types, consider them non-empty
  return false;
}
