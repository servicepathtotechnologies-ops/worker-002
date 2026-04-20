/**
 * ✅ WORDPRESS NODE - Migrated to Registry
 *
 * WordPress REST API integration — create, read, update, and delete posts via Application Passwords.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideWordPress(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  const requiredTags = ['wordpress', 'cms', 'blog', 'posts', 'api'];
  return {
    ...def,
    tags: Array.from(new Set([...(def.tags ?? []), ...requiredTags])),
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
