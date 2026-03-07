/**
 * ✅ EMAIL NODE - Migrated to Registry
 * 
 * Generic email (SMTP) integration.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideEmail(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (complex SMTP email logic)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
