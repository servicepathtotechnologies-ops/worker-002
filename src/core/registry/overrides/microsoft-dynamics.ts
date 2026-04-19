/**
 * ✅ MICROSOFT DYNAMICS NODE - Migrated to Registry
 *
 * Microsoft Dynamics 365 CRM integration.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideMicrosoftDynamics(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor (Dynamics 365 REST API integration)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
