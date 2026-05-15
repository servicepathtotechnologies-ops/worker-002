/**
 * ✅ WEBHOOK TRIGGER NODE - Migrated to Registry
 * 
 * Webhook trigger returns webhook payload with query params and headers.
 * Used for HTTP webhook-based workflow triggers.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';

export function overrideWebhook(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use rawInput — the incoming webhook payload from the HTTP handler.
      // context.input does not exist on NodeExecutionContext; the correct field is rawInput.
      const rawInput = context.rawInput;
      const inputObj = typeof rawInput === 'object' && rawInput !== null && !Array.isArray(rawInput)
        ? rawInput as Record<string, unknown>
        : {};
      
      // ✅ OPTIMIZED: Webhook trigger - return clean output with just the payload
      // The body contains the actual webhook payload, which is what users typically need
      // Also include query params and headers for advanced use cases
      const body = inputObj.body || inputObj;
      
      const result: Record<string, any> = typeof body === 'object' && body !== null && !Array.isArray(body) 
        ? { ...body } 
        : { body };
      
      if (inputObj.query && typeof inputObj.query === 'object' && Object.keys(inputObj.query).length > 0) {
        result.query = inputObj.query;
      }
      if (inputObj.headers && typeof inputObj.headers === 'object' && Object.keys(inputObj.headers).length > 0) {
        result.headers = inputObj.headers;
      }
      if (inputObj.method) {
        result.method = inputObj.method;
      }
      
      return {
        success: true,
        output: result,
      };
    },
  };
}
