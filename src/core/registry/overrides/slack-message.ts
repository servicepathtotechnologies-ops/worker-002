/**
 * ✅ SLACK MESSAGE NODE - Migrated to Registry
 * 
 * Sends messages to Slack channels.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideSlackMessage(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  const inputSchema = {
    ...def.inputSchema,
    // Webhook URL is a user-provided secret at build time; Field Ownership treats it as value (not vault OAuth).
    webhookUrl: def.inputSchema.webhookUrl
      ? {
          ...def.inputSchema.webhookUrl,
          ownership: 'value' as const,
          fillMode: {
            default: 'manual_static' as const,
            supportsRuntimeAI: false,
            supportsBuildtimeAI: false,
          },
        }
      : def.inputSchema.webhookUrl,
    channel: def.inputSchema.channel
      ? {
          ...def.inputSchema.channel,
          ownership: 'structural' as const,
          fillMode: {
            default: 'manual_static' as const,
            supportsRuntimeAI: false,
            supportsBuildtimeAI: true,
          },
        }
      : def.inputSchema.channel,
    // Canonical body: NodeLibrary documents `text` as alias for `message`; one strict requirement only.
    message: def.inputSchema.message
      ? {
          ...def.inputSchema.message,
          ownership: 'value' as const,
          fillMode: {
            default: 'runtime_ai' as const,
            supportsRuntimeAI: true,
            supportsBuildtimeAI: true,
          },
          role: 'long_body' as const,
          essentialForExecution: true,
        }
      : def.inputSchema.message,
    text: def.inputSchema.text
      ? {
          ...def.inputSchema.text,
          ownership: 'value' as const,
          fillMode: {
            default: 'runtime_ai' as const,
            supportsRuntimeAI: true,
            supportsBuildtimeAI: true,
          },
          role: 'short_summary' as const,
          aliasOf: 'message',
          essentialForExecution: false,
        }
      : def.inputSchema.text,
    blocks: def.inputSchema.blocks
      ? {
          ...def.inputSchema.blocks,
          ownership: 'structural' as const,
          fillMode: {
            default: 'manual_static' as const,
            supportsRuntimeAI: false,
            supportsBuildtimeAI: true,
          },
          role: 'raw_json' as const,
        }
      : def.inputSchema.blocks,
    username: def.inputSchema.username
      ? {
          ...def.inputSchema.username,
          ownership: 'value' as const,
          fillMode: {
            default: 'manual_static' as const,
            supportsRuntimeAI: false,
            supportsBuildtimeAI: true,
          },
        }
      : def.inputSchema.username,
    iconEmoji: def.inputSchema.iconEmoji
      ? {
          ...def.inputSchema.iconEmoji,
          ownership: 'value' as const,
          fillMode: {
            default: 'manual_static' as const,
            supportsRuntimeAI: false,
            supportsBuildtimeAI: true,
          },
        }
      : def.inputSchema.iconEmoji,
  };
  return {
    ...def,
    inputSchema,
    execute: async (context) => {
      // Use legacy executor for now (complex Slack API integration)
      // TODO: Port full Slack message logic to registry when time permits
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
