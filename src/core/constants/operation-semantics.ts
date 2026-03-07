/**
 * Operation Semantics Constants
 * 
 * ✅ ROOT-LEVEL: Defines semantic meaning of operations (domain knowledge)
 * 
 * These constants define what operations mean semantically:
 * - Read operations → dataSource
 * - Write operations → output
 * - Transform operations → transformation
 * 
 * This is NOT node-specific logic - it's domain knowledge about operation semantics.
 * All nodes use these same definitions for consistent categorization.
 */

/**
 * Read operations - fetch/retrieve data from sources
 * These operations indicate the node is a data source
 */
export const READ_OPERATIONS = [
  'read',
  'fetch',
  'get',
  'query',
  'retrieve',
  'pull',
  'list',
  'load',
  'download',
  'search',
] as const;

/**
 * Write operations - create/update/send data to destinations
 * These operations indicate the node is an output
 */
export const WRITE_OPERATIONS = [
  'write',
  'create',
  'update',
  'append',
  'send',
  'notify',
  'delete',
  'remove',
  'post',
  'put',
  'patch',
  'publish',
  'share',
  'upload',
  'submit',
  'execute',
] as const;

/**
 * Transform operations - process/analyze/convert data
 * These operations indicate the node is a transformation
 */
export const TRANSFORM_OPERATIONS = [
  'transform',
  'process',
  'analyze',
  'summarize',
  'extract',
  'parse',
  'convert',
  'format',
  'classify',
  'translate',
  'generate',
] as const;

/**
 * Data source keywords - used for intent matching
 */
export const DATA_SOURCE_KEYWORDS = [
  'read',
  'fetch',
  'get',
  'query',
  'retrieve',
  'pull',
  'list',
  'load',
] as const;

/**
 * Output keywords - used for intent matching
 */
export const OUTPUT_KEYWORDS = [
  'send',
  'write',
  'create',
  'update',
  'notify',
  'post',
  'put',
  'patch',
  'delete',
  'remove',
] as const;

/**
 * Type helpers for operation arrays
 */
export type ReadOperation = typeof READ_OPERATIONS[number];
export type WriteOperation = typeof WRITE_OPERATIONS[number];
export type TransformOperation = typeof TRANSFORM_OPERATIONS[number];

/**
 * Check if an operation is a read operation
 */
export function isReadOperation(operation: string): boolean {
  return READ_OPERATIONS.includes(operation.toLowerCase() as ReadOperation);
}

/**
 * Check if an operation is a write operation
 */
export function isWriteOperation(operation: string): boolean {
  return WRITE_OPERATIONS.includes(operation.toLowerCase() as WriteOperation);
}

/**
 * Check if an operation is a transform operation
 */
export function isTransformOperation(operation: string): boolean {
  return TRANSFORM_OPERATIONS.includes(operation.toLowerCase() as TransformOperation);
}
