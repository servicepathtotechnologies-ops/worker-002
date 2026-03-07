/**
 * ✅ HTTP REQUEST NODE - Migrated to Registry
 * 
 * Makes HTTP requests to external APIs.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideHttpRequest(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (complex HTTP logic with rate limiting, timeouts, etc.)
      // TODO: Port full HTTP request logic to registry when time permits
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
