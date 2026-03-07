/**
 * ✅ SLACK MESSAGE NODE - Migrated to Registry
 * 
 * Sends messages to Slack channels.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideSlackMessage(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (complex Slack API integration)
      // TODO: Port full Slack message logic to registry when time permits
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
