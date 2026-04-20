/**
 * ✅ ORACLE DATABASE NODE - Migrated to Registry
 *
 * Oracle Database operations: select, insert, update, insert_or_update, delete, execute_sql.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideOracleDatabase(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
