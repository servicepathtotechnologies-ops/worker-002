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
      // Prefer raw runtime payload (chat webhook/chat UI input), then resolved inputs.
      const sourceInput = context.rawInput ?? context.inputs ?? {};

      // Extract input object
      const inputObj = typeof sourceInput === 'object' && sourceInput !== null && !Array.isArray(sourceInput)
        ? sourceInput as Record<string, unknown>
        : {};
      
      // Extract message from input (chat API or manual execution)
      const message = 
        inputObj.message || 
        inputObj.text || 
        inputObj.input || 
        (typeof sourceInput === 'string' ? sourceInput : '') ||
        '';

      const channel =
        (typeof inputObj.sessionId === 'string' && inputObj.sessionId) ||
        (typeof inputObj.channel === 'string' && inputObj.channel) ||
        '';
      
      // Return structured output so downstream nodes can reference trigger.message reliably.
      return {
        success: true,
        output: {
          message,
          channel,
          sessionId: (inputObj.sessionId as string) || '',
          trigger: (inputObj.trigger as string) || 'chat',
          node_id: (inputObj.node_id as string) || '',
          workflow_id: (inputObj.workflow_id as string) || '',
          timestamp: (inputObj.timestamp as string) || new Date().toISOString(),
          _chat: Boolean(inputObj._chat ?? true),
        },
      };
    },
  };
}
