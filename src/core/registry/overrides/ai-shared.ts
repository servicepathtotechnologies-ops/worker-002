import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';
import { intentAwarePropertySelect } from '../../utils/intent-aware-property-selector';

/**
 * Shared, registry-level AI contract enforcement:
 * - intent-aware upstream JSON filtering
 * - schema-safe prompt shaping
 *
 * IMPORTANT: This is node-agnostic and reused by per-node override files.
 */
export function overrideAiNodeWithIntentAwareSelection(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  return {
    ...def,
    tags: Array.from(new Set([...(def.tags || []), 'ai'])),
    execute: async (context) => {
      return await executeViaLegacyExecutor({
        context,
        schema,
        hooks: {
          beforeExecute: (prepared) => {
            const userPrompt = String((global as any).currentWorkflowIntent || '');
            if (!userPrompt) return;

            const mostRecentUpstream =
              prepared.nodeOutputs && typeof prepared.nodeOutputs.getMostRecentOutput === 'function'
                ? prepared.nodeOutputs.getMostRecentOutput(['$json', 'json', 'trigger', 'input'])
                : null;

            if (!mostRecentUpstream) return;

            const selection = intentAwarePropertySelect(userPrompt, mostRecentUpstream);

            if (process.env.DEBUG_AI_SELECTOR === 'true') {
              console.log('[IntentAwarePropertySelector] StructuredIntent (prompt):', userPrompt);
              console.log('[IntentAwarePropertySelector] Matched Properties:', selection.matchedProperties);
              console.log('[IntentAwarePropertySelector] Mode:', selection.mode);
            }

            if (selection.mode !== 'filtered' || selection.matchedProperties.length === 0) {
              return;
            }

            // Build a deterministic prompt that uses ONLY filtered data.
            const dataJson = JSON.stringify(selection.filteredData, null, 2);
            const emailPrompt = [
              `User request: ${userPrompt}`,
              '',
              selection.matchedProperties.length === 1
                ? `Summarize ONLY the "${selection.matchedProperties[0]}" values from the data below into a professional email.`
                : `Summarize ONLY these properties (${selection.matchedProperties.join(', ')}) from the data below into a professional email.`,
              '',
              'Data (filtered):',
              dataJson,
              '',
              'Return output strictly in this JSON format:',
              '{ "subject": "short email subject", "body": "clean professional email body" }',
              '',
              'Rules:',
              '- Subject must be concise.',
              '- Body must be formatted in readable paragraphs.',
              '- Do not include explanations.',
              '- Output ONLY valid JSON.',
            ].join('\n');

            const mergedConfig = { ...prepared.mergedConfig };
            mergedConfig.prompt = emailPrompt;

            // If the node supports a response format field, prefer JSON.
            if (!('responseFormat' in mergedConfig)) {
              // no-op
            } else if (!mergedConfig.responseFormat) {
              mergedConfig.responseFormat = 'json';
            }

            const executionInput = {
              ...(typeof prepared.executionInput === 'object' && prepared.executionInput !== null ? prepared.executionInput : {}),
              _intentAwareSelection: {
                matchedProperties: selection.matchedProperties,
                mode: selection.mode,
                explanation: selection.explanation,
              },
            };

            return { mergedConfig, executionInput };
          },
        },
      });
    },
  };
}

