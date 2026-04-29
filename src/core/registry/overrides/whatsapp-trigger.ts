/**
 * ✅ WHATSAPP TRIGGER NODE - Registry Override
 *
 * Trigger node for WhatsApp webhook events.
 * Triggers are passive — execution returns { triggered: false }.
 * Actual triggering is handled by the webhook handler.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';

export function overrideWhatsappTrigger(
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
    type: 'whatsapp_trigger',
    label: 'WhatsApp Trigger',
    category: 'trigger',
    description: 'Trigger workflows on WhatsApp events: message received, delivered, read, conversation created',
    icon: '💬',
    version: '1.0.0',
    isBranching: false,
    incomingPorts: [],
    outgoingPorts: ['default'],
    inputSchema: {
      event: {
        type: 'string',
        description: 'WhatsApp event type to listen for',
        required: true,
        default: 'message.received',
        examples: ['message.received', 'message.sent', 'message.delivered', 'message.read', 'conversation.created', 'conversation.handoff'],
        ownership: 'structural',
        role: 'config',
        fillMode: structuralBuildtime,
      },
      phoneNumberId: {
        type: 'string',
        description: 'WhatsApp Phone Number ID to listen on (optional)',
        required: false,
        ownership: 'value',
        role: 'id',
        fillMode: manualStatic,
      },
    },
    outputSchema: {
      default: {
        name: 'default',
        description: 'WhatsApp event payload',
        schema: {
          type: 'object',
          properties: {
            messageId: { type: 'string' },
            from: { type: 'string' },
            timestamp: { type: 'string' },
            type: { type: 'string' },
            text: { type: 'string' },
            phoneNumberId: { type: 'string' },
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
