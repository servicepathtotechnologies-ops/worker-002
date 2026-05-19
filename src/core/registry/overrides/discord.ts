/**
 * ✅ DISCORD NODE - Migrated to Registry
 * 
 * Discord messaging integration.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideDiscord(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    credentialSchema: {
      requirements: [{
        provider: 'discord',
        category: 'api_key',
        required: true,
        description: 'Discord Bot Token',
        credentialTypeId: 'discord_bot_token',
        authType: 'bearer_token' as const,
        label: 'Discord Bot Token',
      }],
      credentialFields: ['botToken', 'token'],
    },
    execute: async (context) => {
      // Use legacy executor for now (complex Discord API integration)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
