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
      const base = baseValidate(config);
      const extraErrors: string[] = [];
      const mode = resolveEffectiveFieldFillMode('conditions', inputSchema, config);
      if (mode !== 'runtime_ai') {
        const cond = config.conditions;
        const empty =
          cond === undefined ||
          cond === null ||
          (Array.isArray(cond) && cond.length === 0) ||
          (typeof cond === 'string' && cond.trim() === '');
        if (empty) {
          extraErrors.push("If/Else: 'conditions' must be set unless fill mode is runtime_ai");
        }
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
            const mergedInput: Record<string, unknown> = {
              ...(typeof prepared.executionInput === 'object' && prepared.executionInput !== null
                ? prepared.executionInput
                : {}),
            };

            context.upstreamOutputs.forEach((output) => {
              if (output && typeof output === 'object' && !Array.isArray(output)) {
                Object.assign(mergedInput, output as Record<string, unknown>);
              }
            });

            return { executionInput: mergedInput };
          },
        },
      });

      if (result.success && result.output) {
        const outObj = result.output as any;
        const inputObj = context.inputs as any;

        const finalOutput = {
          ...(typeof inputObj === 'object' && inputObj !== null ? inputObj : {}),
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
