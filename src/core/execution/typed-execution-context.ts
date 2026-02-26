/**
 * Typed Execution Context
 * 
 * Core infrastructure for type-preserving workflow execution.
 * Ensures values maintain their types (number/string/boolean/object) throughout execution.
 */

import { getNestedValue } from '../utils/object-utils';

export type NodeId = string;

export interface ExecutionContext {
  variables: Record<string, unknown>;
  nodeOutputs: Map<NodeId, unknown>;
  lastOutput: unknown;
}

/**
 * Create a new execution context
 */
export function createExecutionContext(initialInput?: unknown): ExecutionContext {
  const inputObj = extractInputObject(initialInput);
  
  return {
    variables: { ...inputObj },
    nodeOutputs: new Map(),
    lastOutput: initialInput,
  };
}

/**
 * Extract input object from unknown input type
 */
function extractInputObject(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  if (Array.isArray(input)) {
    return { items: input, data: input, array: input };
  }
  return { value: input, data: input };
}

/**
 * Get value from context with type preservation
 */
export function getContextValue(
  context: ExecutionContext,
  path: string
): unknown {
  // Handle $json and json aliases
  if (path.startsWith('$json.') || path.startsWith('json.')) {
    const jsonPath = path.startsWith('$json.') 
      ? path.substring(6) 
      : path.substring(5);
    
    // ✅ CORE ARCHITECTURE FIX: Prioritize $json/json from variables (merged input)
    // This ensures {{$json.items.length}} resolves correctly
    if (context.variables.$json) {
      const value = getNestedValue(context.variables.$json, jsonPath);
      if (value !== undefined) return value;
    }
    if (context.variables.json) {
      const value = getNestedValue(context.variables.json, jsonPath);
      if (value !== undefined) return value;
    }
    
    // ✅ FIX: Also try variables directly (for root-level properties like items)
    // This handles cases where items is at root level, not nested in $json
    const directValue = getNestedValue(context.variables, jsonPath);
    if (directValue !== undefined) return directValue;
    
    // ✅ FIX: Try lastOutput as fallback (for backward compatibility)
    const lastOutputValue = getNestedValue(context.lastOutput, jsonPath);
    if (lastOutputValue !== undefined) return lastOutputValue;
    
    // ✅ FIX: If jsonPath is just a property name (e.g., "items"), try accessing it directly
    // This handles cases where $json.items should resolve to variables.items
    if (!jsonPath.includes('.')) {
      if (jsonPath in context.variables) {
        return context.variables[jsonPath];
      }
      if (context.lastOutput && typeof context.lastOutput === 'object' && !Array.isArray(context.lastOutput)) {
        const lastOutputObj = context.lastOutput as Record<string, unknown>;
        if (jsonPath in lastOutputObj) {
          return lastOutputObj[jsonPath];
        }
      }
    }
    
    return undefined;
  }
  
  // Try direct access
  if (path in context.variables) {
    return context.variables[path];
  }
  
  // Try nested access
  return getNestedValue(context.variables, path) 
    ?? getNestedValue(context.lastOutput, path);
}

/**
 * Set node output in context
 * 
 * ✅ CORE ARCHITECTURE FIX: DO NOT merge node output into root variables
 * 
 * Node outputs MUST be stored ONLY in nodeOutputs map.
 * Variables should contain ONLY:
 * - Initial input data
 * - Merged input from upstream nodes (for current node)
 * - Explicit $json/json aliases
 * 
 * NEVER merge node output into variables - this causes:
 * - Duplicated keys
 * - Flattened structures
 * - Repeated JSON blocks
 * - Root-level pollution
 */
export function setNodeOutput(
  context: ExecutionContext,
  nodeId: NodeId,
  output: unknown
): void {
  // ✅ Store output ONLY in nodeOutputs map (isolated storage)
  context.nodeOutputs.set(nodeId, output);
  context.lastOutput = output;
  
  // ❌ REMOVED: Object.assign(context.variables, output)
  // This was causing root-level pollution and duplicated keys
  // Node outputs are accessed via nodeOutputs map, not variables
}

/**
 * Get all node outputs as a flat object for template resolution
 * 
 * ✅ CORE ARCHITECTURE FIX: Return isolated node outputs, not merged variables
 * 
 * This ensures:
 * - Node outputs are accessed by nodeId
 * - No root-level pollution
 * - Clean separation between variables and node outputs
 */
export function getAllNodeOutputs(context: ExecutionContext): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  // ✅ Add variables (initial input + merged input for current node)
  // This contains the input data for template resolution
  Object.assign(result, context.variables);
  
  // ✅ Add all node outputs by node ID (isolated storage)
  context.nodeOutputs.forEach((output, nodeId) => {
    result[nodeId] = output;
  });
  
  // ✅ Add aliases for template resolution
  // $json and json point to lastOutput (for backward compatibility)
  result.$json = context.lastOutput;
  result.json = context.lastOutput;
  result.input = context.variables;
  
  return result;
}
