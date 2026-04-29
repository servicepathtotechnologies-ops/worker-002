import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';

export function overrideDatabaseWrite(def: UnifiedNodeDefinition, _schema: NodeSchema): UnifiedNodeDefinition {
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
    deprecated: true,
    replacement: 'google_sheets',
    tags: Array.from(new Set([...(def.tags || []), 'deprecated'])),
  };
}
