/**
 * ✅ STRIPE NODE - Migrated to Registry
 * 
 * Stripe payment integration.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideStripe(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    credentialSchema: {
      requirements: [{
        provider: 'stripe',
        category: 'api_key',
        required: true,
        description: 'Stripe Secret Key',
        credentialTypeId: 'stripe_api_key',
        authType: 'bearer_token' as const,
        label: 'Stripe API Key',
      }],
      credentialFields: ['secretKey', 'apiKey'],
    },
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
