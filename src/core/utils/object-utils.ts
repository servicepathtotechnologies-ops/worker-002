/**
 * Object Utilities
 * 
 * Shared utility functions for working with objects and nested values.
 */

/**
 * Get nested value from object using dot notation path
 * 
 * Supports:
 * - Direct property access: "field"
 * - Nested property access: "field.subfield"
 * - $json prefix: "$json.field" (maps to obj.$json or obj.json or obj.input or obj)
 * - json prefix: "json.field" (maps to obj.json or obj.$json or obj.input or obj)
 * - input prefix: "input.field" (maps to obj.input or obj)
 * 
 * @param obj - The object to traverse
 * @param path - Dot-notation path to the value (e.g., "user.name" or "$json.user.name")
 * @returns The value at the path, or undefined if not found
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  if (!path || !obj) {
    return undefined;
  }

  // Handle $json and json prefixes (n8n-style syntax)
  if (path.startsWith('$json.')) {
    const jsonPath = path.substring(6);
    const jsonData =
      (obj as Record<string, unknown>).$json ??
      (obj as Record<string, unknown>).json ??
      (obj as Record<string, unknown>).input ??
      obj;
    return getNestedValue(jsonData, jsonPath);
  }

  if (path.startsWith('json.')) {
    const jsonPath = path.substring(5);
    const jsonData =
      (obj as Record<string, unknown>).json ??
      (obj as Record<string, unknown>).$json ??
      (obj as Record<string, unknown>).input ??
      obj;
    return getNestedValue(jsonData, jsonPath);
  }

  if (path.startsWith('input.')) {
    const inputPath = path.substring(6);
    const inputData = (obj as Record<string, unknown>).input ?? obj;
    return getNestedValue(inputData, inputPath);
  }

  // Direct access (if path is a direct property)
  if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
    if (path in (obj as Record<string, unknown>)) {
      return (obj as Record<string, unknown>)[path];
    }
  }

  // Dot notation traversal
  const parts = path.split('.');
  let current: unknown = obj;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    if (current === null || current === undefined) {
      return undefined;
    }
    
    // ✅ CORE ARCHITECTURE FIX: Handle array properties correctly
    // Arrays are objects in JavaScript, so they support property access
    if (typeof current === 'object') {
      // Special handling for array.length
      if (Array.isArray(current) && part === 'length') {
        return current.length;
      }
      
      // Handle object property access (works for both objects and arrays)
      current = (current as Record<string, unknown>)[part];
    } else {
      // Primitive types can't have properties accessed via dot notation
      return undefined;
    }
  }

  return current;
}
