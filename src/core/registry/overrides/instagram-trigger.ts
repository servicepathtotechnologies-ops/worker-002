/**
 * ✅ INSTAGRAM TRIGGER NODE - Registry Override
 *
 * Trigger node for Instagram webhook events.
 * Triggers are passive — execution returns { triggered: false }.
 * Actual triggering is handled by the webhook handler.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';

export function overrideInstagramTrigger(
  def: UnifiedNodeDefinition,
  _schema: NodeSchema,
): UnifiedNodeDefinition {
  const structuralBuildtime = {
    default: 'buildtime_ai_once' as const,
    supportsRuntimeAI: false,
    supportsBuildtimeAI: true,
  };
  const manualStatic = {
    default: 'manual_static' as const,
    supportsRuntimeAI: false,
    supportsBuildtimeAI: false,
  };

  return {
    ...def,
    type: 'instagram_trigger',
    label: 'Instagram Trigger',
    category: 'trigger',
    description: 'Trigger workflows on Instagram events: new DM, comment, mention, postback',
    icon: '📸',
    version: '1.0.0',
    isBranching: false,
    incomingPorts: [],
    outgoingPorts: ['default'],
    inputSchema: {
      event: {
        type: 'string',
        description: 'Instagram event type to listen for',
        required: true,
        default: 'message.received',
        examples: ['message.received', 'comment.created', 'mention.created', 'postback'],
        ownership: 'structural',
        role: 'config',
        fillMode: structuralBuildtime,
      },
      instagramBusinessAccountId: {
        type: 'string',
        description: 'Instagram Business Account ID to listen on (optional)',
        required: false,
        ownership: 'value',
        role: 'id',
        fillMode: manualStatic,
      },
    },
    outputSchema: {
      default: {
        name: 'default',
        description: 'Instagram event payload',
        schema: {
          type: 'object',
          properties: {
            senderId: { type: 'string' },
            messageId: { type: 'string' },
            text: { type: 'string' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
    requiredInputs: ['event'],
    defaultConfig: () => ({
      event: 'message.received',
    }),
    validateConfig: (config) => {
      const errors: string[] = [];
      if (!config.event) errors.push('event is required');
      return { valid: errors.length === 0, errors };
    },
    execute: async (_context) => {
      // Trigger nodes are passive — they are activated by webhook events, not by execution
      return {
        success: true,
        output: { triggered: false },
      };
    },
  };
}
