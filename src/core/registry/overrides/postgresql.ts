/**
 * ✅ POSTGRESQL NODE - Migrated to Registry
 * 
 * PostgreSQL database operations.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overridePostgresql(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    credentialSchema: {
      requirements: [
        {
          provider: 'postgresql',
          category: 'connection_string',
          required: false,
          description: 'PostgreSQL connection string. Falls back to DATABASE_URL when omitted.',
        },
      ],
      credentialFields: ['connectionString'],
    },
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
