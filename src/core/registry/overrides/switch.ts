/**
 * ✅ SWITCH NODE - Real Execution Logic
 *
 * Implements case-based routing via legacy executor.
 * Outgoing port names come from persisted config.cases (or legacy rules) —
 * use unifiedNodeRegistry.getOutgoingPortsForWorkflowNode(node) for graph tooling.
 */

import type { UnifiedNodeDefinition, NodeExecutionResult, NodeMigration, NodeInputSchema } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';
import { extractSwitchCasePortNames } from '../../utils/branching-node-ports';
import { resolveEffectiveFieldFillMode } from '../../utils/fill-mode-resolver';

const switchMigrations: NodeMigration[] = [
  {
    fromVersion: '1.0.0',
    toVersion: '1.1.0',
    migrate: (oldConfig: Record<string, any>) => {
      const next = { ...oldConfig };
      const casesEmpty =
        !next.cases ||
        (Array.isArray(next.cases) && next.cases.length === 0);
      if (casesEmpty && next.rules != null) {
        next.cases = next.rules;
      }
      return next;
    },
  },
];

export function overrideSwitch(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  const baseValidate = def.validateConfig.bind(def);

  const inputSchema: NodeInputSchema = {
    ...def.inputSchema,
    expression: def.inputSchema.expression
      ? {
          ...def.inputSchema.expression,
          type: def.inputSchema.expression.type === 'string' ? 'expression' : def.inputSchema.expression.type,
          fillMode: {
            default: 'buildtime_ai_once',
            supportsRuntimeAI: false,
            supportsBuildtimeAI: true,
          },
          ownership: 'value',
          role: 'config',
        }
      : def.inputSchema.expression,
    cases: def.inputSchema.cases
      ? {
          ...def.inputSchema.cases,
          fillMode: {
            default: 'buildtime_ai_once',
            supportsRuntimeAI: false,
            supportsBuildtimeAI: true,
          },
          // Structural JSON that defines branch ports/case values.
          ownership: 'structural',
          role: 'raw_json',
        }
      : def.inputSchema.cases,
    ...(def.inputSchema.routingType
      ? {
          routingType: {
            ...def.inputSchema.routingType,
            default: 'string',
            fillMode: {
              default: 'manual_static',
              supportsRuntimeAI: false,
              supportsBuildtimeAI: false,
            },
          },
        }
      : {}),
    ...(def.inputSchema.rules
      ? {
          rules: {
            ...def.inputSchema.rules,
            fillMode: {
              default: 'manual_static',
              supportsRuntimeAI: false,
              supportsBuildtimeAI: false,
            },
            ownership: 'structural',
            role: 'raw_json',
          },
        }
      : {}),
  };

  return {
    ...def,
    inputSchema,
    version: '1.1.0',
    isBranching: true,
    // Default to a generic 'output' port when no branch-specific ports
    // have been defined yet. Branch-aware helpers (getOutgoingPortsForWorkflowNode)
    // will derive case_* ports from config.cases when available; this fallback
    // only applies to minimal flows where the switch behaves like a linear step.
    outgoingPorts: def.outgoingPorts && def.outgoingPorts.length > 0 ? def.outgoingPorts : ['output'],
    migrations: [...(def.migrations || []), ...switchMigrations],
    validateConfig: (config: Record<string, any>) => {
      const base = baseValidate(config);
      const extraErrors: string[] = [];

      const exprMode = resolveEffectiveFieldFillMode('expression', inputSchema, config);
      if (exprMode !== 'runtime_ai') {
        const ex = config.expression;
        if (ex === undefined || ex === null || (typeof ex === 'string' && ex.trim() === '')) {
          extraErrors.push("Switch: 'expression' is required unless fill mode is runtime_ai");
        }
      }

      const casesMode = resolveEffectiveFieldFillMode('cases', inputSchema, config);
      const rawCases = config.cases ?? config.rules;
      let parsedCases: unknown = rawCases;
      if (typeof parsedCases === 'string') {
        try {
          parsedCases = JSON.parse(parsedCases);
        } catch {
          parsedCases = null;
        }
      }
      if (casesMode !== 'runtime_ai') {
        if (!Array.isArray(parsedCases) || parsedCases.length === 0) {
          extraErrors.push("Switch: 'cases' must contain at least one case unless fill mode is runtime_ai");
        } else {
          const values = parsedCases
            .map((c: any) => (typeof c === 'string' ? c : c?.value != null ? String(c.value) : ''))
            .map((v: string) => v.trim())
            .filter(Boolean);
          const seen = new Set<string>();
          for (const v of values) {
            if (seen.has(v)) {
              extraErrors.push(`Switch: duplicate case value "${v}" — port IDs must be unique`);
            }
            seen.add(v);
          }
        }
      }

      const allErrors = [...(base.errors || []), ...extraErrors];
      return {
        valid: allErrors.length === 0,
        errors: allErrors,
        warnings: base.warnings || [],
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

        if (outObj.matchedCase !== undefined) {
          finalOutput.matchedCase = outObj.matchedCase;
        }

        return {
          success: true,
          output: finalOutput,
          metadata: {
            branch: outObj.matchedCase || null,
            caseMatched: outObj.matchedCase !== null && outObj.matchedCase !== undefined,
          },
        };
      }

      return result;
    },
  };
}

/** Used by tests and tooling; ports match edge sourceHandle for switch. */
export function getSwitchCasePortsFromConfig(config?: Record<string, any>): string[] {
  return extractSwitchCasePortNames(config);
}
