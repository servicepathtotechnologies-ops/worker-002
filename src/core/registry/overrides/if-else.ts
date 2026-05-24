/**
 * ✅ IF_ELSE NODE - Real Execution Logic
 *
 * Implements actual conditional branching:
 * - Evaluates conditions using legacy executor (has full condition evaluation logic)
 * - Routes to 'true' or 'false' branch based on condition result
 * - Preserves all input data for downstream nodes
 */

import type { UnifiedNodeDefinition, NodeExecutionResult, NodeInputSchema } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';
import { resolveEffectiveFieldFillMode } from '../../utils/fill-mode-resolver';
import {
  normalizeIfElseConfig,
  validateCanonicalIfElseConditions,
} from '../../utils/if-else-conditions';
import { stripSystemKeys, stripRoutingMeta } from '../../execution/system-key-filter';

export function overrideIfElse(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  const baseValidate = def.validateConfig.bind(def);

  const inputSchema: NodeInputSchema = {
    ...def.inputSchema,
    conditions: {
      ...def.inputSchema.conditions,
      fillMode: {
        default: 'buildtime_ai_once',
        supportsRuntimeAI: false,
        supportsBuildtimeAI: true,
      },
      // Structural JSON that defines branching shape; planner/AI own this at build time.
      ownership: 'structural',
      role: 'raw_json',
    },
    ...(def.inputSchema.combineOperation
      ? {
          combineOperation: {
            ...def.inputSchema.combineOperation,
            fillMode: {
              default: 'manual_static',
              supportsRuntimeAI: false,
              supportsBuildtimeAI: false,
            },
            ownership: 'value',
            role: 'content',
          },
        }
      : {}),
  };

  return {
    ...def,
    inputSchema,
    isBranching: true,
    outgoingPorts: ['true', 'false'],
    tags: Array.from(new Set([...(def.tags || []), 'conditional'])),
    validateConfig: (config: Record<string, any>) => {
      const normalizedConfig = normalizeIfElseConfig(config);
      const base = baseValidate(normalizedConfig);
      const extraErrors: string[] = [];
      const mode = resolveEffectiveFieldFillMode('conditions', inputSchema, normalizedConfig);
      const cond = normalizedConfig.conditions;
      const empty = cond === undefined || cond === null || (Array.isArray(cond) && cond.length === 0);
      if (mode !== 'runtime_ai' && empty) {
        extraErrors.push("If/Else: 'conditions' must be set unless fill mode is runtime_ai");
      }
      if (!empty) {
        extraErrors.push(...validateCanonicalIfElseConditions(cond));
      }
      const allErrors = [...(base.errors || []), ...extraErrors];
      return {
        valid: allErrors.length === 0,
        errors: allErrors,
        warnings: base.warnings,
      };
    },
    execute: async (context): Promise<NodeExecutionResult> => {
      const result = await executeViaLegacyExecutor({
        context,
        schema,
        hooks: {
          beforeExecute: (prepared) => {
            const preparedConfig = normalizeIfElseConfig(
              (prepared.mergedConfig || {}) as Record<string, unknown>
            );
            // Use the clean upstream business payload (rawInput) instead of merging
            // all upstreamOutputs — that merge brought in audit/observability keys
            // like nodeId, nodeType, rollout, kpis that polluted downstream nodes.
            const cleanUpstream = context.rawInput != null &&
              typeof context.rawInput === 'object' &&
              !Array.isArray(context.rawInput)
              ? stripSystemKeys(context.rawInput as Record<string, unknown>)
              : {};
            const configInputs = typeof prepared.executionInput === 'object' && prepared.executionInput !== null
              ? prepared.executionInput as Record<string, unknown>
              : {};
            return { executionInput: { ...cleanUpstream, ...configInputs }, mergedConfig: preparedConfig };
          },
        },
      });

      if (result.success && result.output) {
        const outObj = result.output as any;

        // Forward clean upstream business data to downstream nodes.
        // Do NOT spread context.inputs (if_else routing config: conditions, combineOperation) —
        // that would push branching config into downstream nodes as if it were business data.
        const cleanUpstream = context.rawInput != null &&
          typeof context.rawInput === 'object' &&
          !Array.isArray(context.rawInput)
          ? stripRoutingMeta(stripSystemKeys(context.rawInput as Record<string, unknown>))
          : {};

        const finalOutput = {
          ...cleanUpstream,
          ...(typeof outObj === 'object' && outObj !== null ? outObj : {}),
        };

        if (outObj.conditionResult !== undefined) {
          finalOutput.conditionResult = outObj.conditionResult;
        }

        return {
          success: true,
          output: finalOutput,
          metadata: {
            branch: outObj.conditionResult ? 'true' : 'false',
            conditionEvaluated: true,
          },
        };
      }

      return result;
    },
  };
}
