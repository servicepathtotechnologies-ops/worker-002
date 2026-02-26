/**
 * Node Output Contract
 * 
 * Defines the contract for node outputs.
 * Each node type returns a specific output type, not generic JSON.
 */

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
 * Get expected output type for a node
 */
export function getNodeOutputType(nodeType: string): NodeOutputType {
  // String outputs
  if (['log', 'slack_message', 'email', 'discord', 'telegram'].includes(nodeType)) {
    return 'string';
  }
  
  // Number outputs
  if (['math', 'count'].includes(nodeType)) {
    return 'number';
  }
  
  // Boolean outputs
  if (['if_else'].includes(nodeType)) {
    return 'boolean';
  }
  
  // Array outputs
  if (['split', 'filter'].includes(nodeType)) {
    return 'array';
  }
  
  // Void outputs (triggers)
  if (['manual_trigger', 'webhook', 'chat_trigger', 'schedule_trigger'].includes(nodeType)) {
    return 'void';
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
