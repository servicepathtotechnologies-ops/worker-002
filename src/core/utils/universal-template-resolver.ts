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
 * UNIVERSAL TEMPLATE RESOLVER
 * 
 * Resolves template expressions like:
 * - {{$json.items}} → actual array from previous node
 * - $json.items → actual array (handles non-template format)
 * - {{$json.field.path}} → nested value
 * 
 * This works for ALL nodes universally.
 * 
 * @param template - Template string or value to resolve
 * @param nodeOutputs - Cache of all node outputs
 * @returns Resolved value, or original if not a template
 */
export function resolveUniversalTemplate(
  template: any,
  nodeOutputs: LRUNodeOutputsCache
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

  // Non-template format: $json.field (without {{}})
  if (template.startsWith('$json.') || template.startsWith('json.') || template.startsWith('input.') || template.startsWith('trigger.')) {
    const resolved = resolveExpression(template);
    return resolved !== undefined ? resolved : template;
  }

  // Full-expression (typed) match: {{ ... }}
  const fullExpr = template.match(/^\s*\{\{\s*([^}]+)\s*\}\}\s*$/);
  if (fullExpr) {
    const resolved = resolveExpression(fullExpr[1]);
    return resolved !== undefined ? resolved : template;
  }

  // Interpolated string: replace each {{...}} with string value
  if (template.includes('{{')) {
    return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (m, expr) => {
      const resolved = resolveExpression(String(expr));
      if (resolved === undefined || resolved === null) return m; // keep original if unresolved
      return stringifyForInterpolation(resolved);
    });
  }

  // Return as-is if can't resolve
  return template;
}

/**
 * Resolve all template expressions in a config object
 * This ensures ALL config fields get template resolution automatically
 * 
 * @param config - Node configuration object
 * @param nodeOutputs - Cache of all node outputs
 * @returns Config with all templates resolved
 */
export function resolveConfigTemplates(
  config: Record<string, any>,
  nodeOutputs: LRUNodeOutputsCache
): Record<string, any> {
  const resolved: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(config)) {
    // Skip internal metadata fields
    if (key.startsWith('_')) {
      resolved[key] = value;
      continue;
    }
    
    // Resolve template expressions
    resolved[key] = resolveUniversalTemplate(value, nodeOutputs);
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
