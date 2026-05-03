/**
 * ✅ LIGHTRICKS NODE - Migrated to Registry
 *
 * Lightricks LTX-2 AI video generation — text-to-video, image-to-video, and more.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideLightricks(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    tags: Array.from(new Set([...(def.tags || []), 'lightricks', 'ltx', 'video', 'ai', 'generation', 'media'])),
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
