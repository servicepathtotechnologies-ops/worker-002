/**
 * ✅ TWILIO NODE - Migrated to Registry
 * 
 * Twilio SMS/voice integration.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideTwilio(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    credentialSchema: {
      requirements: [{
        provider: 'twilio',
        category: 'api_key',
        required: true,
        description: 'Twilio Account SID + Auth Token',
        credentialTypeId: 'twilio_api_key',
        authType: 'basic_auth' as const,
        label: 'Twilio API Key',
      }],
      credentialFields: ['accountSid', 'authToken'],
    },
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
