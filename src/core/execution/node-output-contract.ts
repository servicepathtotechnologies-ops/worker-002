/**
 * ✅ UNIVERSAL: Node Output Contract
 * 
 * Defines the contract for node outputs using registry as single source of truth.
 * Each node type returns a specific output type, not generic JSON.
 */

import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { nodeCapabilityRegistryDSL } from '../../services/ai/node-capability-registry-dsl';

export interface NodeRunResult {
  output: unknown;
  nextPort?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Node output type definitions
 */
export type NodeOutputType = 
  | 'string'      // Log, Email body, etc.
  | 'number'      // Math operations
  | 'boolean'     // If/Else conditions
  | 'object'      // HTTP responses, data transformations
  | 'array'       // List operations
  | 'void';       // No output (triggers)

/**
 * ✅ UNIVERSAL: Get expected output type for a node using registry
 */
export function getNodeOutputType(nodeType: string): NodeOutputType {
  const nodeDef = unifiedNodeRegistry.get(nodeType);
  
  if (!nodeDef) {
    // Fallback to object for unknown nodes
    return 'object';
  }
  
  // ✅ UNIVERSAL: Check if node is trigger (void output)
  if (nodeDef.category === 'trigger') {
    return 'void';
  }
  
  // ✅ UNIVERSAL: Check if node is conditional (boolean output)
  if (nodeType === 'if_else' || 
      nodeType === 'switch' ||
      (nodeDef.tags || []).includes('conditional') ||
      (nodeDef.tags || []).includes('logic')) {
    // Only if_else returns boolean, switch returns object
    if (nodeType === 'if_else') {
      return 'boolean';
    }
  }
  
  // ✅ UNIVERSAL: Check output schema from registry for type hints
  const outputSchema = nodeDef.outputSchema;
  if (outputSchema && Object.keys(outputSchema).length > 0) {
    // Get first output port schema (most nodes have one default port)
    const firstPortName = Object.keys(outputSchema)[0];
    const firstPort = outputSchema[firstPortName];
    if (firstPort && firstPort.schema) {
      const schemaType = firstPort.schema.type;
      if (schemaType === 'string') return 'string';
      if (schemaType === 'number') return 'number';
      if (schemaType === 'boolean') return 'boolean';
      if (schemaType === 'array') return 'array';
    }
  }
  
  // ✅ UNIVERSAL: Check node category and capabilities for type inference
  const category = nodeDef.category || '';
  const tags = nodeDef.tags || [];
  
  // Communication nodes typically return string
  if (category === 'communication' || tags.includes('message') || tags.includes('notification')) {
    return 'string';
  }
  
  // Math/calculation nodes return number
  if (category === 'data' && (tags.includes('math') || tags.includes('calculation') || nodeType.includes('math'))) {
    return 'number';
  }
  
  // Array operations return array
  if (tags.includes('array') || tags.includes('list') || nodeType.includes('split') || nodeType.includes('filter')) {
    return 'array';
  }
  
  // Default: object
  return 'object';
}

/**
 * Validate node output matches expected type
 */
export function validateNodeOutput(
  output: unknown,
  expectedType: NodeOutputType,
  nodeType: string
): { valid: boolean; error?: string } {
  if (expectedType === 'void') {
    return { valid: true };
  }
  
  const actualType = inferType(output);
  
  // Type mapping
  const typeMap: Record<string, NodeOutputType> = {
    'number': 'number',
    'string': 'string',
    'boolean': 'boolean',
    'array': 'array',
    'object': 'object',
  };
  
  const mappedType = typeMap[actualType] || 'object';
  
  if (mappedType !== expectedType) {
    // Allow some flexibility
    if (expectedType === 'object' && mappedType !== 'void') {
      return { valid: true }; // Objects can contain anything
    }
    
    return {
      valid: false,
      error: `Node ${nodeType} expected ${expectedType} but got ${actualType}`,
    };
  }
  
  return { valid: true };
}

/**
 * Infer type of a value
 */
function inferType(value: unknown): string {
  if (value === null || value === undefined) return 'void';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return 'unknown';
}

/**
 * Normalize node output to match contract
 * 
 * Removes wrapper objects and ensures output matches expected type.
 */
export function normalizeNodeOutput(
  output: unknown,
  expectedType: NodeOutputType,
  nodeType: string
): unknown {
  // If output is wrapped in metadata, extract it
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const obj = output as Record<string, unknown>;
    if ('data' in obj && 'type' in obj) {
      output = obj.data;
    }
  }
  
  // Convert to expected type if needed
  switch (expectedType) {
    case 'string':
      return normalizeToString(output, nodeType);
    case 'number':
      return normalizeToNumber(output);
    case 'boolean':
      return normalizeToBoolean(output);
    case 'array':
      return normalizeToArray(output);
    case 'object':
      return normalizeToObject(output);
    case 'void':
      return undefined;
    default:
      return output;
  }
}

function normalizeToString(value: unknown, nodeType: string): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    // For log nodes, extract message
    if (nodeType === 'log') {
      const obj = value as Record<string, unknown>;
      if (obj.message) return String(obj.message);
      if (obj.text) return String(obj.text);
      if (obj.content) return String(obj.content);
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function normalizeToNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.count === 'number') return obj.count;
    if (typeof obj.total === 'number') return obj.total;
    if (typeof obj.result === 'number') return obj.result;
  }
  return 0;
}

function normalizeToBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
  }
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.condition === 'boolean') return obj.condition;
    if (typeof obj.result === 'boolean') return obj.result;
  }
  return Boolean(value);
}

function normalizeToArray(value: unknown): unknown[] {
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

function normalizeToObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (Array.isArray(value)) {
    return { items: value, data: value };
  }
  return { value };
}
