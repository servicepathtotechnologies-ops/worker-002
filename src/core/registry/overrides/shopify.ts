/**
 * ✅ SHOPIFY NODE - Migrated to Registry
 * 
 * Shopify e-commerce integration.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideShopify(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    credentialSchema: {
      requirements: [{
        provider: 'shopify',
        category: 'api_key',
        required: true,
        description: 'Shopify Admin API access token',
        credentialTypeId: 'shopify_api_key',
        authType: 'api_key' as const,
        label: 'Shopify API Key',
      }],
      credentialFields: ['accessToken', 'apiKey'],
    },
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
