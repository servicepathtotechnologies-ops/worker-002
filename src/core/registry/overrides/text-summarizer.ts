/**
 * ✅ TEXT SUMMARIZER NODE - Migrated to Registry
 * 
 * AI-powered text summarization.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideTextSummarizer(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    execute: async (context) => {
      // Use legacy executor for now (complex AI summarization logic)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
