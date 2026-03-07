/**
 * UNIVERSAL TEMPLATE RESOLVER
 * 
 * This is a CORE ARCHITECTURE component that provides universal template resolution
 * for ALL nodes in the system. This ensures:
 * 
 * 1. Template expressions like {{$json.items}} are resolved consistently
 * 2. All nodes get template resolution automatically
 * 3. No node-specific template logic needed
 * 4. Works for both {{$json.field}} and $json.field formats
 * 
 * This is the SINGLE SOURCE OF TRUTH for template resolution.
 * All nodes MUST use this resolver - no exceptions.
 */

import { LRUNodeOutputsCache } from '../cache/lru-node-outputs-cache';
import { getNestedValue } from './object-utils';
import { intentAwarePropertySelect } from './intent-aware-property-selector';
import { convertToType, FieldType } from './type-converter';

/**
 * Get the most recent node output from cache
 * This is used as the $json context for template resolution
 */
function getPreviousNodeOutput(nodeOutputs: LRUNodeOutputsCache): any {
  // ✅ Use timestamp-based most-recent output and ignore meta keys.
  // This prevents $json/json/trigger/input from being treated as "previous output".
  return nodeOutputs.getMostRecentOutput(['$json', 'json', 'trigger', 'input']);
}

/**
 * UNIVERSAL TEMPLATE RESOLVER (Enhanced with Type Conversion)
 * 
 * Resolves template expressions like:
 * - {{$json.items}} → actual array from previous node
 * - $json.items → actual array (handles non-template format)
 * - {{$json.field.path}} → nested value
 * 
 * ✅ NEW: Automatically converts resolved values to expected types
 * ✅ NEW: Prevents "Type mismatch" errors
 * 
 * This works for ALL nodes universally.
 * 
 * @param template - Template string or value to resolve
 * @param nodeOutputs - Cache of all node outputs
 * @param expectedType - Optional expected type for conversion
 * @param fieldName - Optional field name for better error messages
 * @returns Resolved value (converted to expected type if provided), or original if not a template
 */
export function resolveUniversalTemplate(
  template: any,
  nodeOutputs: LRUNodeOutputsCache,
  expectedType?: FieldType,
  fieldName?: string
): any {
  // If not a string, return as-is
  if (typeof template !== 'string') {
    return template;
  }
  
  // ✅ Get actual previous node output (not a key called '$json')
  const previousOutput = getPreviousNodeOutput(nodeOutputs);
  
  // Also check if $json/json keys exist in cache (set by DataFlowContractLayer)
  const jsonData = nodeOutputs.get('$json') || nodeOutputs.get('json') || previousOutput;

  const intent = (global as any).currentWorkflowIntent || '';

  const stringifyForInterpolation = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  const resolveExpression = (exprRaw: string): unknown => {
    const expr = (exprRaw || '').trim();
    if (!expr) return undefined;

    // Handle $json / json
    if (expr.startsWith('$json.')) {
      const path = expr.substring(6);
      return (jsonData && typeof jsonData === 'object') ? getNestedValue(jsonData, path) : undefined;
    }
    if (expr.startsWith('json.')) {
      const path = expr.substring(5);
      return (jsonData && typeof jsonData === 'object') ? getNestedValue(jsonData, path) : undefined;
    }

    // Handle input / trigger aliases (stored in nodeOutputs cache)
    if (expr.startsWith('input.')) {
      const path = expr.substring(6);
      const inputObj = nodeOutputs.get('input');
      return (inputObj && typeof inputObj === 'object') ? getNestedValue(inputObj as any, path) : undefined;
    }
    if (expr.startsWith('trigger.')) {
      const path = expr.substring(8);
      const triggerObj = nodeOutputs.get('trigger');
      return (triggerObj && typeof triggerObj === 'object') ? getNestedValue(triggerObj as any, path) : undefined;
    }

    // Handle named node outputs: {{google_sheets.rows}} (requires nodeOutputs to store type keys)
    const dotIdx = expr.indexOf('.');
    if (dotIdx > 0) {
      const rootKey = expr.slice(0, dotIdx);
      const path = expr.slice(dotIdx + 1);
      const root = nodeOutputs.get(rootKey);
      if (root !== undefined) {
        // Intent-aware selection: if referencing rows/items of object arrays, extract only requested column
        // when user intent specifies a property.
        if ((path === 'rows' || path === 'items') && root && typeof root === 'object') {
          const container = getNestedValue(root as any, path);
          const selection = intentAwarePropertySelect(intent, container);
          if (selection.mode === 'filtered') {
            return selection.filteredData;
          }
        }
        if (root && typeof root === 'object') {
          const resolved = getNestedValue(root as any, path);
          if (resolved !== undefined && resolved !== null) return resolved;
        }
      }
    }

    // Direct key (e.g., {{google_sheets}})
    const direct = nodeOutputs.get(expr);
    if (direct !== undefined) return direct;

    // Fallback: attempt from jsonData directly
    if (jsonData && typeof jsonData === 'object') {
      const resolved = getNestedValue(jsonData as any, expr);
      if (resolved !== undefined && resolved !== null) return resolved;
    }

    return undefined;
  };

  // Helper to convert resolved value to expected type
  const convertIfNeeded = (resolved: any): any => {
    if (expectedType && resolved !== undefined && resolved !== null) {
      const conversion = convertToType(resolved, expectedType, fieldName);
      if (conversion.success) {
        return conversion.value;
      }
      // If conversion fails, log warning but return original
      console.warn(
        `[TemplateResolver] Type conversion failed for field "${fieldName || 'unknown'}": ` +
        `${conversion.originalType} → ${expectedType}. Error: ${conversion.error || 'unknown'}`
      );
    }
    return resolved;
  };

  // Non-template format: $json.field (without {{}})
  if (template.startsWith('$json.') || template.startsWith('json.') || template.startsWith('input.') || template.startsWith('trigger.')) {
    const resolved = resolveExpression(template);
    if (resolved !== undefined) {
      return convertIfNeeded(resolved);
    }
    return template;
  }

  // Full-expression (typed) match: {{ ... }}
  const fullExpr = template.match(/^\s*\{\{\s*([^}]+)\s*\}\}\s*$/);
  if (fullExpr) {
    const resolved = resolveExpression(fullExpr[1]);
    if (resolved !== undefined) {
      return convertIfNeeded(resolved);
    }
    return template;
  }

  // Interpolated string: replace each {{...}} with string value
  if (template.includes('{{')) {
    return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (m, expr) => {
      const resolved = resolveExpression(String(expr));
      if (resolved === undefined || resolved === null) return m; // keep original if unresolved
      // For interpolated strings, always convert to string
      const stringValue = convertIfNeeded(resolved);
      return stringifyForInterpolation(stringValue);
    });
  }

  // Return as-is if can't resolve
  return template;
}

/**
 * Resolve all template expressions in a config object (Enhanced with Type Conversion)
 * This ensures ALL config fields get template resolution automatically
 * 
 * ✅ NEW: Automatically converts resolved values to expected types from node schema
 * 
 * @param config - Node configuration object
 * @param nodeOutputs - Cache of all node outputs
 * @param nodeType - Optional node type for schema-based type conversion
 * @returns Config with all templates resolved and type-converted
 */
export function resolveConfigTemplates(
  config: Record<string, any>,
  nodeOutputs: LRUNodeOutputsCache,
  nodeType?: string
): Record<string, any> {
  const resolved: Record<string, any> = {};
  
  // Get node schema for type information
  let fieldTypes: Record<string, FieldType> = {};
  if (nodeType) {
    try {
      const { nodeLibrary } = require('../../services/nodes/node-library');
      const schema = nodeLibrary.getSchema(nodeType);
      if (schema?.configSchema) {
        const optional = schema.configSchema.optional || {};
        for (const [fieldName, fieldDef] of Object.entries(optional)) {
          fieldTypes[fieldName] = (fieldDef as any)?.type || 'string';
        }
      }
    } catch (error) {
      // Schema not available, continue without type conversion
    }
  }
  
  for (const [key, value] of Object.entries(config)) {
    // Skip internal metadata fields
    if (key.startsWith('_')) {
      resolved[key] = value;
      continue;
    }
    
    // Get expected type from schema
    const expectedType = fieldTypes[key];
    
    // Resolve template expressions with type conversion
    resolved[key] = resolveUniversalTemplate(value, nodeOutputs, expectedType, key);
  }
  
  return resolved;
}

/**
 * Resolve template expressions in an array
 * Useful for array fields that contain templates
 */
export function resolveArrayTemplates(
  array: any[],
  nodeOutputs: LRUNodeOutputsCache
): any[] {
  return array.map(item => resolveUniversalTemplate(item, nodeOutputs));
}
