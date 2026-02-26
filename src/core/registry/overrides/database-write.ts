import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';

export function overrideDatabaseWrite(def: UnifiedNodeDefinition, _schema: NodeSchema): UnifiedNodeDefinition {
  return {
    ...def,
    deprecated: true,
    replacement: 'google_sheets',
    tags: Array.from(new Set([...(def.tags || []), 'deprecated'])),
  };
}

