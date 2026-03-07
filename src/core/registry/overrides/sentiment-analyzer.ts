/**
 * ✅ SENTIMENT ANALYZER NODE - Migrated to Registry
 * 
 * AI-powered sentiment analysis.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideSentimentAnalyzer(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (complex AI sentiment analysis logic)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
