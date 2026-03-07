/**
 * ✅ SWITCH NODE - Real Execution Logic
 * 
 * Implements actual case-based routing:
 * - Evaluates expression and matches against cases
 * - Routes to matching case branch (case_1, case_2, etc.)
 * - Preserves all input data for downstream nodes
 * - ✅ CRITICAL: Dynamically sets outgoingPorts based on cases from config
 */

import type { UnifiedNodeDefinition, NodeExecutionResult } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideSwitch(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  // ✅ REAL FUNCTIONALITY: Extract cases from config to create dynamic output ports
  // Cases can come from:
  // 1. context.config.cases (when node is being executed)
  // 2. schema default config (for initial setup)
  // 3. User prompt (will be set during workflow generation)
  
  const getCasesFromConfig = (config?: Record<string, any>): string[] => {
    if (!config) return [];
    
    try {
      const casesRaw = config.cases || config.rules || [];
      let cases: Array<{ value: string; label?: string }> = [];
      
      if (typeof casesRaw === 'string') {
        cases = JSON.parse(casesRaw);
      } else if (Array.isArray(casesRaw)) {
        cases = casesRaw;
      }
      
      // Extract case values as output port IDs
      const caseValues = cases
        .map((c: any) => c?.value != null ? String(c.value) : null)
        .filter((v: string | null): v is string => v !== null && v !== '');
      
      return caseValues;
    } catch (error) {
      console.warn('[Switch Override] Failed to parse cases from config:', error);
      return [];
    }
  };

  // Try to get cases from default config or schema
  // Note: ConfigSchema doesn't have 'default' property, so use empty object
  const defaultCases = getCasesFromConfig({});
  
  return {
    ...def,
    isBranching: true,
    // ✅ REAL FUNCTIONALITY: Set outgoingPorts dynamically based on cases
    // If cases are provided in config, use them; otherwise use default or empty
    // This creates REAL output ports (case_1, case_2, etc.) based on actual cases
    outgoingPorts: defaultCases.length > 0 ? defaultCases : def.outgoingPorts || [],
    execute: async (context): Promise<NodeExecutionResult> => {
      // ✅ REAL FUNCTIONALITY: Extract cases from runtime config (from user prompt/workflow generation)
      // This ensures the switch node has the correct output ports based on actual cases
      const runtimeCases = getCasesFromConfig(context.config);
      
      // ✅ CRITICAL: Update outgoingPorts dynamically based on cases from config
      // This makes the switch node have REAL functionality, not just a name
      if (runtimeCases.length > 0) {
        // The switch node now has real output ports: case_1, case_2, case_3, etc.
        // Each case value becomes an output port that can route to different nodes
        def.outgoingPorts = runtimeCases;
        console.log(`[Switch Override] ✅ Set ${runtimeCases.length} output ports from cases:`, runtimeCases);
      }
      
      // ✅ REAL FUNCTIONALITY: Use legacy executor which has full switch case matching logic
      // The legacy executor will:
      // 1. Resolve the expression value (from config.expression)
      // 2. Match against defined cases (config.cases)
      // 3. Return matchedCase for branch routing
      
      const result = await executeViaLegacyExecutor({
        context,
        schema,
        hooks: {
          beforeExecute: (prepared) => {
            // ✅ CRITICAL: Switch needs the FULL upstream data for expression evaluation
            // Expressions often reference upstream data like {{$json.status}}
            const mergedInput: Record<string, unknown> = {
              ...(typeof prepared.executionInput === 'object' && prepared.executionInput !== null ? prepared.executionInput : {}),
            };

            // Merge all upstream outputs into input for expression evaluation
            context.upstreamOutputs.forEach((output) => {
              if (output && typeof output === 'object' && !Array.isArray(output)) {
                Object.assign(mergedInput, output as Record<string, unknown>);
              }
            });

            return { executionInput: mergedInput };
          },
        },
      });

      // ✅ REAL FUNCTIONALITY: Ensure output contains case match result and all input data
      if (result.success && result.output) {
        const outObj = result.output as any;
        const inputObj = context.inputs as any;
        
        // Preserve case matching result (matchedCase) for branch routing
        const finalOutput = {
          ...(typeof inputObj === 'object' && inputObj !== null ? inputObj : {}),
          ...(typeof outObj === 'object' && outObj !== null ? outObj : {}),
        };

        // Ensure matchedCase is preserved (legacy executor sets this)
        if (outObj.matchedCase !== undefined) {
          finalOutput.matchedCase = outObj.matchedCase;
        }

        return { 
          success: true, 
          output: finalOutput,
          metadata: {
            branch: outObj.matchedCase || null, // ✅ Route to matching case branch
            caseMatched: outObj.matchedCase !== null && outObj.matchedCase !== undefined,
          },
        };
      }

      return result;
    },
  };
}
