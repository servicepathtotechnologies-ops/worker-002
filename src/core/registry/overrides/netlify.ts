/**
 * ✅ NETLIFY NODE - Migrated to Registry
 *
 * Netlify API integration — sites, deploys, forms.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideNetlify(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    tags: Array.from(new Set([...(def.tags || []), 'netlify', 'devops', 'deploy', 'api'])),
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
