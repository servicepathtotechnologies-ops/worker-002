/**
 * ✅ CHAT TRIGGER NODE - Migrated to Registry
 * 
 * Chat trigger extracts message from input.
 * Used for chat-based workflow triggers.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';

export function overrideChatTrigger(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      const { input } = context;
      
      // Extract input object
      const inputObj = typeof input === 'object' && input !== null && !Array.isArray(input)
        ? input as Record<string, unknown>
        : {};
      
      // ✅ OPTIMIZED: Chat Trigger - return clean output with just the message
      // Extract message from input (can come from chat API or manual execution)
      const message = 
        inputObj.message || 
        inputObj.text || 
        inputObj.input || 
        (typeof input === 'string' ? input : '') ||
        ''; // Empty string if no message found
      
      // Return just the message string (clean output, no metadata)
      return {
        success: true,
        output: message,
      };
    },
  };
}
