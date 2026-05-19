/**
 * ✅ GITHUB NODE - Migrated to Registry
 * 
 * GitHub integration.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideGithub(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    credentialSchema: {
      requirements: [{
        provider: 'github',
        category: 'api_key',
        required: true,
        description: 'GitHub Personal Access Token',
        credentialTypeId: 'github_pat',
        authType: 'bearer_token' as const,
        label: 'GitHub Personal Token',
      }],
      credentialFields: ['token', 'apiKey'],
    },
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
