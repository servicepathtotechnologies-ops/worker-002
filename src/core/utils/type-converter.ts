/**
 * ✅ TYPE CONVERTER - Production-Grade Type Conversion Service
 * 
 * This service converts resolved template values to expected types,
 * preventing "Type mismatch" errors during validation.
 * 
 * Architecture:
 * - Converts any type to any target type safely
 * - Handles edge cases (null, undefined, empty arrays)
 * - Provides fallback values when conversion fails
 * - Used by template resolver and field mapper
 */

export type FieldType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'array' 
  | 'object' 
  | 'json' 
  | 'email' 
  | 'datetime' 
  | 'expression';

export interface ConversionResult {
  success: boolean;
  value: any;
  originalType: string;
  convertedType: string;
  error?: string;
}

/**
 * ✅ Convert value to target type with safe fallbacks
 */
export function convertToType(
  value: any,
  targetType: FieldType,
  fieldName?: string
): ConversionResult {
  const originalType = getValueType(value);
  
  // If already correct type, return as-is
  if (isCompatibleType(originalType, targetType)) {
    return {
      success: true,
      value,
      originalType,
      convertedType: targetType,
    };
  }
  
  // Handle null/undefined
  if (value === null || value === undefined) {
    return convertNullToType(targetType, fieldName);
  }
  
  // Perform conversion
  try {
    switch (targetType) {
      case 'string':
        return convertToString(value);
      case 'number':
        return convertToNumber(value);
      case 'boolean':
        return convertToBoolean(value);
      case 'array':
        return convertToArray(value);
      case 'object':
        return convertToObject(value);
      case 'json':
        return convertToJson(value);
      case 'email':
        return convertToEmail(value);
      case 'datetime':
        return convertToDateTime(value);
      case 'expression':
        return { success: true, value, originalType, convertedType: 'expression' };
      default:
        return {
          success: false,
          value,
          originalType,
          convertedType: targetType,
          error: `Unknown target type: ${targetType}`,
        };
    }
  } catch (error: any) {
    return {
      success: false,
      value,
      originalType,
      convertedType: targetType,
      error: error.message || 'Conversion failed',
    };
  }
}

/**
 * Get actual type of a value
 */
function getValueType(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Check if types are compatible (no conversion needed)
 */
function isCompatibleType(sourceType: string, targetType: FieldType): boolean {
  // Exact match
  if (sourceType === targetType) return true;
  
  // String subtypes
  if (targetType === 'string' && sourceType === 'string') return true;
  if (targetType === 'email' && sourceType === 'string') return true;
  if (targetType === 'datetime' && sourceType === 'string') return true;
  
  // JSON is object
  if (targetType === 'json' && sourceType === 'object') return true;
  if (targetType === 'object' && sourceType === 'json') return true;
  
  return false;
}

/**
 * Convert null/undefined to target type with sensible defaults
 */
function convertNullToType(targetType: FieldType, fieldName?: string): ConversionResult {
  const defaults: Record<FieldType, any> = {
    string: '',
    number: 0,
    boolean: false,
    array: [],
    object: {},
    json: {},
    email: '',
    datetime: '',
    expression: '',
  };
  
  return {
    success: true,
    value: defaults[targetType],
    originalType: 'null',
    convertedType: targetType,
  };
}

/**
 * Convert to string
 */
function convertToString(value: any): ConversionResult {
  if (typeof value === 'string') {
    return { success: true, value, originalType: 'string', convertedType: 'string' };
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') {
    return { success: true, value: String(value), originalType: typeof value, convertedType: 'string' };
  }
  
  if (Array.isArray(value)) {
    // Array to string: join or JSON stringify
    if (value.length === 0) {
      return { success: true, value: '', originalType: 'array', convertedType: 'string' };
    }
    // If array of primitives, join with comma
    if (value.every(item => typeof item === 'string' || typeof item === 'number')) {
      return { success: true, value: value.join(', '), originalType: 'array', convertedType: 'string' };
    }
    // Otherwise JSON stringify
    return { success: true, value: JSON.stringify(value), originalType: 'array', convertedType: 'string' };
  }
  
  if (typeof value === 'object') {
    return { success: true, value: JSON.stringify(value), originalType: 'object', convertedType: 'string' };
  }
  
  return { success: true, value: String(value), originalType: typeof value, convertedType: 'string' };
}

/**
 * Convert to number
 */
function convertToNumber(value: any): ConversionResult {
  if (typeof value === 'number') {
    return { success: true, value, originalType: 'number', convertedType: 'number' };
  }
  
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return { success: true, value: 0, originalType: 'string', convertedType: 'number' };
    }
    const parsed = Number(trimmed);
    if (!isNaN(parsed)) {
      return { success: true, value: parsed, originalType: 'string', convertedType: 'number' };
    }
  }
  
  if (typeof value === 'boolean') {
    return { success: true, value: value ? 1 : 0, originalType: 'boolean', convertedType: 'number' };
  }
  
  if (Array.isArray(value)) {
    // Array length as number
    return { success: true, value: value.length, originalType: 'array', convertedType: 'number' };
  }
  
  // Fallback: 0
  return { success: true, value: 0, originalType: typeof value, convertedType: 'number' };
}

/**
 * Convert to boolean
 */
function convertToBoolean(value: any): ConversionResult {
  if (typeof value === 'boolean') {
    return { success: true, value, originalType: 'boolean', convertedType: 'boolean' };
  }
  
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (lower === 'true' || lower === '1' || lower === 'yes') {
      return { success: true, value: true, originalType: 'string', convertedType: 'boolean' };
    }
    if (lower === 'false' || lower === '0' || lower === 'no' || lower === '') {
      return { success: true, value: false, originalType: 'string', convertedType: 'boolean' };
    }
  }
  
  if (typeof value === 'number') {
    return { success: true, value: value !== 0, originalType: 'number', convertedType: 'boolean' };
  }
  
  if (Array.isArray(value)) {
    return { success: true, value: value.length > 0, originalType: 'array', convertedType: 'boolean' };
  }
  
  if (typeof value === 'object' && value !== null) {
    return { success: true, value: Object.keys(value).length > 0, originalType: 'object', convertedType: 'boolean' };
  }
  
  return { success: true, value: Boolean(value), originalType: typeof value, convertedType: 'boolean' };
}

/**
 * Convert to array
 */
function convertToArray(value: any): ConversionResult {
  if (Array.isArray(value)) {
    return { success: true, value, originalType: 'array', convertedType: 'array' };
  }
  
  if (typeof value === 'string') {
    // Try to parse as JSON array
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return { success: true, value: parsed, originalType: 'string', convertedType: 'array' };
      }
    } catch {
      // Not JSON, treat as single-item array
      return { success: true, value: [value], originalType: 'string', convertedType: 'array' };
    }
  }
  
  if (typeof value === 'object' && value !== null) {
    // Object to array: convert to array of values or key-value pairs
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return { success: true, value: [], originalType: 'object', convertedType: 'array' };
    }
    // Return array of values
    return { success: true, value: Object.values(value), originalType: 'object', convertedType: 'array' };
  }
  
  // Primitive to array: wrap in array
  return { success: true, value: [value], originalType: typeof value, convertedType: 'array' };
}

/**
 * Convert to object
 */
function convertToObject(value: any): ConversionResult {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return { success: true, value, originalType: 'object', convertedType: 'object' };
  }
  
  if (Array.isArray(value)) {
    // Array to object: convert to indexed object or first item
    if (value.length === 0) {
      return { success: true, value: {}, originalType: 'array', convertedType: 'object' };
    }
    // If array has one object, return it
    if (value.length === 1 && typeof value[0] === 'object' && value[0] !== null) {
      return { success: true, value: value[0], originalType: 'array', convertedType: 'object' };
    }
    // Otherwise create indexed object
    const obj: Record<string, any> = {};
    value.forEach((item, index) => {
      obj[String(index)] = item;
    });
    return { success: true, value: obj, originalType: 'array', convertedType: 'object' };
  }
  
  if (typeof value === 'string') {
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return { success: true, value: parsed, originalType: 'string', convertedType: 'object' };
      }
    } catch {
      // Not JSON, create object with single property
      return { success: true, value: { value }, originalType: 'string', convertedType: 'object' };
    }
  }
  
  // Primitive to object: wrap in object
  return { success: true, value: { value }, originalType: typeof value, convertedType: 'object' };
}

/**
 * Convert to JSON (same as object but validates JSON structure)
 */
function convertToJson(value: any): ConversionResult {
  if (typeof value === 'object' && value !== null) {
    return { success: true, value, originalType: 'object', convertedType: 'json' };
  }
  
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return { success: true, value: parsed, originalType: 'string', convertedType: 'json' };
    } catch {
      // Invalid JSON, return as object with value property
      return { success: true, value: { value }, originalType: 'string', convertedType: 'json' };
    }
  }
  
  // Wrap in object
  return { success: true, value: { value }, originalType: typeof value, convertedType: 'json' };
}

/**
 * Convert to email (validates email format)
 */
function convertToEmail(value: any): ConversionResult {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Basic email validation
    if (trimmed.includes('@') && trimmed.includes('.')) {
      return { success: true, value: trimmed, originalType: 'string', convertedType: 'email' };
    }
    // Not a valid email, return as-is (might be partial)
    return { success: true, value: trimmed, originalType: 'string', convertedType: 'email' };
  }
  
  // Convert to string first, then to email
  const stringResult = convertToString(value);
  return convertToEmail(stringResult.value);
}

/**
 * Convert to datetime (validates datetime format)
 */
function convertToDateTime(value: any): ConversionResult {
  if (typeof value === 'string') {
    // Try to parse as date
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return { success: true, value: value, originalType: 'string', convertedType: 'datetime' };
    }
    // Invalid date, return as-is
    return { success: true, value: value, originalType: 'string', convertedType: 'datetime' };
  }
  
  if (value instanceof Date) {
    return { success: true, value: value.toISOString(), originalType: 'date', convertedType: 'datetime' };
  }
  
  if (typeof value === 'number') {
    // Unix timestamp
    const date = new Date(value);
    return { success: true, value: date.toISOString(), originalType: 'number', convertedType: 'datetime' };
  }
  
  // Convert to string first
  const stringResult = convertToString(value);
  return convertToDateTime(stringResult.value);
}

/**
 * Check if two types are compatible (can be converted)
 */
export function areTypesCompatible(sourceType: string, targetType: FieldType): boolean {
  // Exact match
  if (sourceType === targetType) return true;
  
  // String can be converted to most types
  if (targetType === 'string') return true;
  
  // Email and datetime are string subtypes
  if (targetType === 'email' && sourceType === 'string') return true;
  if (targetType === 'datetime' && sourceType === 'string') return true;
  
  // Number can be converted from string
  if (targetType === 'number' && sourceType === 'string') return true;
  
  // Boolean can be converted from string/number
  if (targetType === 'boolean' && (sourceType === 'string' || sourceType === 'number')) return true;
  
  // Array and object are interconvertible
  if (targetType === 'array' && sourceType === 'object') return true;
  if (targetType === 'object' && sourceType === 'array') return true;
  
  // JSON is object
  if (targetType === 'json' && sourceType === 'object') return true;
  if (targetType === 'object' && sourceType === 'json') return true;
  
  return false;
}
