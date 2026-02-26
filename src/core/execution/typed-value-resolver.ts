/**
 * Typed Value Resolver
 * 
 * Resolves template expressions while preserving types.
 * Unlike resolveTemplate which always returns strings, this preserves:
 * - numbers as numbers
 * - booleans as booleans
 * - objects as objects
 * - strings as strings
 */

import { ExecutionContext, getContextValue, getAllNodeOutputs } from './typed-execution-context';
import { getNestedValue } from '../utils/object-utils';

/**
 * Resolve a template expression with type preservation
 * 
 * Examples:
 * - "{{input.age}}" where age is 25 → returns 25 (number)
 * - "{{input.name}}" where name is "John" → returns "John" (string)
 * - "{{input.active}}" where active is true → returns true (boolean)
 * - "Hello {{input.name}}" → returns "Hello John" (string interpolation)
 */
export function resolveTypedValue(
  template: string,
  context: ExecutionContext
): unknown {
  // If no template syntax, return as-is
  if (!template.includes('{{')) {
    return template;
  }
  
  // Check if entire template is a single expression
  const singleExpressionMatch = template.match(/^\{\{([^}]+)\}\}$/);
  if (singleExpressionMatch) {
    // Single expression - return typed value
    const path = singleExpressionMatch[1].trim();
    const value = getContextValue(context, path);
    return value !== undefined ? value : null;
  }
  
  // Multiple expressions or mixed text - resolve as string
  const allOutputs = getAllNodeOutputs(context);
  return resolveStringTemplate(template, allOutputs);
}

/**
 * Resolve string template with multiple expressions
 */
function resolveStringTemplate(
  template: string,
  context: Record<string, unknown>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const trimmedPath = path.trim();
    const value = getNestedValue(context, trimmedPath);
    
    if (value === null || value === undefined) {
      return '';
    }
    
    // Convert to string for interpolation
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    return String(value);
  });
}

/**
 * Resolve value with schema-driven type casting
 * 
 * If schema specifies a type, cast the value accordingly.
 * Otherwise, preserve the original type.
 */
export function resolveWithSchema(
  template: string,
  context: ExecutionContext,
  expectedType?: 'string' | 'number' | 'boolean' | 'object' | 'array'
): unknown {
  const resolved = resolveTypedValue(template, context);
  
  if (!expectedType) {
    return resolved;
  }
  
  // Cast to expected type
  switch (expectedType) {
    case 'number':
      return toNumber(resolved);
    case 'boolean':
      return toBoolean(resolved);
    case 'string':
      return String(resolved);
    case 'array':
      return toArray(resolved);
    case 'object':
      return toObject(resolved);
    default:
      return resolved;
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 0;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
  }
  if (typeof value === 'number') return value !== 0;
  return Boolean(value);
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if (obj.rows && Array.isArray(obj.rows)) return obj.rows;
    if (obj.data && Array.isArray(obj.data)) return obj.data;
    if (obj.items && Array.isArray(obj.items)) return obj.items;
    return Object.values(obj);
  }
  return [value];
}

function toObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (Array.isArray(value)) {
    const obj: Record<string, unknown> = {};
    value.forEach((item, index) => {
      obj[index.toString()] = item;
    });
    return obj;
  }
  return { value };
}
