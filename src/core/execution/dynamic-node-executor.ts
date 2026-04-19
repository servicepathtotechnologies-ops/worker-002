/**
 * DYNAMIC NODE EXECUTOR
 * 
 * This replaces all hardcoded node-specific logic in the execution engine.
 * 
 * Architecture:
 * - Fetches node definition from UnifiedNodeRegistry
 * - Validates config against node schema
 * - Executes node using definition.execute()
 * - NO if/else logic for specific node types
 * - NO hardcoded node behavior
 * 
 * This ensures:
 * - All node behavior comes from registry
 * - Permanent fixes apply to all workflows
 * - Infinite scalability
 */

import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import type { UnifiedNodeDefinition } from '../types/unified-node-contract';
import { NodeExecutionContext, NodeExecutionResult, FieldFillMode, NodeInputField } from '../types/unified-node-contract';
import { WorkflowNode, Workflow } from '../../core/types/ai-types';
import { LRUNodeOutputsCache } from '../cache/lru-node-outputs-cache';
import { SupabaseClient } from '@supabase/supabase-js';
// ✅ PRODUCTION-GRADE: Removed normalizeNodeType - node types must be canonical before reaching executor
import { IntentDrivenJsonRouter, shouldActivateRouter } from '../intent-driven-json-router';
import { universalNodeAIContext } from '../../services/ai/universal-node-ai-context';
import { aiFieldDetector } from '../../services/ai/ai-field-detector';
import { normalizeRuntimePayload } from '../runtime/runtime-input-adapter';
import { validateResolvedInput, guaranteeInputForSchema } from './input-guarantee';
import { buildEffectiveFillModes, isMeaningfulStaticValue } from '../utils/fill-mode-resolver';
import {
  isEffectivelyEmptyUpstreamPayload,
  isUpstreamNarrativelyThinForRuntimeAi,
} from '../utils/upstream-payload-signal';
import {
  getUpstreamNodeTypeFromExecutionGlobal,
  pickPrimaryNarrativeStringFromUpstreamOutput,
} from '../utils/upstream-narrative-text';
import { fillMissingTitleLikeRuntimeAiFields } from './runtime-ai-title-backfill';
import { applyInputAliasesFromSchema } from './apply-input-aliases';
import { isCredentialOwnership } from '../utils/field-ownership';
import { applyDeterministicFieldContracts } from './field-contract-engine';

/** Stable nodeOutputs cache keys — see `worker/docs/OBSERVABILITY_CONTRACT.md`. */
export const EXECUTION_OBSERVABILITY_KEYS = {
  resolvedInputs: (nodeId: string) => `__resolved_inputs__:${nodeId}`,
  runtimeResolutionAudit: (nodeId: string) => `__runtime_resolution_audit__:${nodeId}`,
} as const;

type UniversalInputContractFlags = {
  enabled: boolean;
  strictValidation: boolean;
  auditOnly: boolean;
};

function getUniversalInputContractFlags(): UniversalInputContractFlags {
  return {
    enabled: process.env.UNIVERSAL_INPUT_CONTRACT_V2 !== 'false',
    strictValidation: process.env.UNIVERSAL_INPUT_CONTRACT_STRICT_VALIDATION === 'true',
    auditOnly: process.env.UNIVERSAL_INPUT_CONTRACT_AUDIT_ONLY === 'true',
  };
}

function looksPlaceholderLikeValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const t = value.trim().toLowerCase();
  if (!t) return true;
  return (
    t.includes('process the workflow') ||
    t.includes('using the configured nodes') ||
    t.includes('placeholder') ||
    t.includes('lorem ipsum') ||
    t === 'generated message'
  );
}

/**
 * Registry role first; if role is missing (legacy defs), allow canonical text field names only.
 */
function shouldFillRuntimeAiFromWorkflowIntent(fieldName: string, fieldDef: NodeInputField | undefined): boolean {
  if (!fieldDef) return false;
  const t = (fieldDef.type || 'string') as string;
  if (t !== 'string' && t !== 'expression') return false;
  const role = fieldDef.role;
  if (
    role === 'prompt' ||
    role === 'content' ||
    role === 'long_body' ||
    role === 'short_summary' ||
    role === 'title_like'
  ) {
    return true;
  }
  if (role) return false;
  const f = fieldName.toLowerCase();
  return f === 'prompt' || f === 'query' || f === 'text' || f === 'message';
}

/**
 * Prefer canonical / essential body fields when mapping plain-text AI output (message mode).
 * Avoids filling `text` while leaving `message` empty when both exist (e.g. slack_message alias pair).
 */
export function pickPrimaryMessageLikeField(inputSchema: Record<string, any>): string | undefined {
  const keys = Object.keys(inputSchema);
  const candidates = keys.filter((field) => {
    const fl = field.toLowerCase();
    return (
      fl.includes('message') ||
      fl.includes('text') ||
      fl.includes('body') ||
      fl.includes('content')
    );
  });
  if (candidates.length === 0) return undefined;
  const aliasTargets = new Set<string>();
  for (const [, def] of Object.entries(inputSchema)) {
    const ao = (def as { aliasOf?: string })?.aliasOf;
    if (typeof ao === 'string') aliasTargets.add(ao);
  }
  const canonical = candidates.find((c) => aliasTargets.has(c));
  if (canonical) return canonical;
  const byRole = candidates.find((c) => (inputSchema[c] as { role?: string })?.role === 'long_body');
  if (byRole) return byRole;
  const essential = candidates.find(
    (c) => (inputSchema[c] as { essentialForExecution?: boolean })?.essentialForExecution === true
  );
  if (essential) return essential;
  if (candidates.includes('message')) return 'message';
  return candidates[0];
}

export interface DynamicExecutionContext {
  node: WorkflowNode;
  input: unknown;
  nodeOutputs: LRUNodeOutputsCache;
  supabase: SupabaseClient;
  workflowId: string;
  userId?: string;
  currentUserId?: string;
}

interface UniversalContractParams {
  definition: UnifiedNodeDefinition;
  node: WorkflowNode;
  nodeType: string;
  migratedConfig: Record<string, any>;
  nodeOutputs: LRUNodeOutputsCache;
  upstreamPayload: unknown;
}

interface UniversalContractResult {
  resolvedInputs: Record<string, any>;
  runtimeFieldsAudit: string[];
  resolvedRuntimeFieldsAudit: string[];
  missingRuntimeFieldsAudit: string[];
  outputFallbackUsed: boolean;
  outputFallbackReason?: string;
}

function isSensitiveInputField(fieldName: string): boolean {
  const key = fieldName.toLowerCase();
  return (
    key.includes('credential') ||
    key.includes('password') ||
    key.includes('token') ||
    key.includes('secret') ||
    key.includes('apikey') ||
    key.includes('api_key') ||
    key.includes('auth') ||
    key.includes('oauth') ||
    key.includes('privatekey') ||
    key.includes('private_key')
  );
}

/**
 * Registry/schema-driven verbose logging for AI input resolution (avoid node-type string checks).
 */
function shouldLogVerboseAiInputResolution(definition: UnifiedNodeDefinition | undefined): boolean {
  if (!definition) return false;
  if (definition.category === 'ai') return true;
  const schema = definition.inputSchema as Record<string, unknown> | undefined;
  if (schema && typeof schema === 'object') {
    const keys = Object.keys(schema);
    if (keys.includes('body') && (keys.includes('headers') || keys.includes('url'))) {
      return true;
    }
  }
  return false;
}

function sanitizeResolvedInputsForPersistence(inputs: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [fieldName, value] of Object.entries(inputs)) {
    if (isSensitiveInputField(fieldName)) {
      sanitized[fieldName] = '[MASKED]';
      continue;
    }
    sanitized[fieldName] = value;
  }
  return sanitized;
}

function isMeaningfulValueForResolution(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

/**
 * Execute node using dynamic definition from registry
 * 
 * This is the NEW execution path that replaces all hardcoded switch statements.
 * All node behavior comes from UnifiedNodeRegistry.
 */
export async function executeNodeDynamically(
  context: DynamicExecutionContext
): Promise<unknown> {
  const { node, input, nodeOutputs, supabase, workflowId, userId, currentUserId } = context;
  const runtimeMarker = 'runtime-marker-2026-03-20-v1';
  const expectedRuntimeMarker = (global as any).__expectedExecutionRuntimeMarker;
  if (expectedRuntimeMarker && expectedRuntimeMarker !== runtimeMarker) {
    console.warn('[DynamicExecutor] ⚠️ Runtime marker mismatch detected', {
      expectedRuntimeMarker,
      runtimeMarker,
      nodeId: node.id,
      workflowId,
    });
  }
  
  // Step 1: Extract node type
  const nodeType = node.data?.type || node.type;
  
  // Step 2: ✅ PRODUCTION-GRADE: Strict validation BEFORE registry
  // This ensures only canonical node types reach the registry
  try {
    const { assertValidNodeType } = require('../utils/node-authority');
    assertValidNodeType(nodeType);
  } catch (error: any) {
    console.error(`[DynamicExecutor] ❌ ${error.message}`);
    return {
      _error: error.message,
      _nodeType: nodeType,
    };
  }
  
  // Step 3: Get node definition from registry (SINGLE SOURCE OF TRUTH)
  // At this point, nodeType is guaranteed to be canonical
  const definition = unifiedNodeRegistry.get(nodeType);
  
  if (!definition) {
    // This should NEVER happen if assertValidNodeType passed
    // If it does, it's an integrity issue
    const errorMsg = `[DynamicExecutor] ❌ Integrity error: Canonical node type '${nodeType}' not found in registry. This indicates a system initialization failure.`;
    console.error(errorMsg);
    return {
      _error: errorMsg,
      _nodeType: nodeType,
    };
  }
  
  console.log(`[DynamicExecutor] ✅ Executing ${nodeType} using definition from registry`);
  
  // Step 3: Migrate config to current schema version (backward compatibility)
  let config = node.data?.config || {};
  const migratedConfig = unifiedNodeRegistry.migrateConfig(nodeType, config);
  config = migratedConfig;
  
  // Derive effective fill modes for each input field from registry metadata and
  // any explicit per-node overrides stored in config._fillMode.
  const inputSchema = definition.inputSchema as Record<string, { fillMode?: { default: FieldFillMode; supportsRuntimeAI?: boolean; supportsBuildtimeAI?: boolean } }>;
  const effectiveFillModes = buildEffectiveFillModes(definition.inputSchema, config as Record<string, any>);
  
  // ✅ ROOT-LEVEL: Auto-fill text fields using AI before validation
  // This ensures message, subject, body, etc. are auto-generated if empty.
  // Respect registry/UI-driven fill modes so we ONLY auto-fill fields that are
  // allowed to use build-time AI (buildtime_ai_once or runtime_ai) and are not
  // explicitly locked to manual_static.
  try {
    const aiFields = aiFieldDetector.detectAIFields(node);
    const emptyAIFields = aiFields
      .filter(f => f.shouldAutoGenerate)
      .map(f => f.fieldName)
      .filter(fieldName => {
        const mode = effectiveFillModes[fieldName];
        const fieldDef = inputSchema?.[fieldName];
        const supportsBuildtimeAI = fieldDef?.fillMode?.supportsBuildtimeAI ?? false;
        // Skip fields that are explicitly manual or where build-time AI is disallowed.
        if (mode === 'manual_static' || !supportsBuildtimeAI) {
          return false;
        }
        const currentValue = config[fieldName];
        return !currentValue || (typeof currentValue === 'string' && currentValue.trim() === '');
      });
    
    if (emptyAIFields.length > 0) {
      console.log(`[DynamicExecutor] 🤖 Auto-generating ${emptyAIFields.length} text field(s) for ${nodeType}: ${emptyAIFields.join(', ')}`);
      
      // Get previous node outputs for context
      const previousOutputs: Record<string, any> = {};
      try {
        // Extract previous outputs from nodeOutputs cache
        const allOutputs = nodeOutputs.getAll();
        Object.assign(previousOutputs, allOutputs);
      } catch (e) {
        console.warn(`[DynamicExecutor] ⚠️ Could not get previous outputs for AI context:`, e);
      }
      
      // Get user prompt from workflow metadata (if available)
      const userPrompt = (global as any).currentWorkflowIntent || 'Process workflow data';
      
      // Create workflow context (minimal - just for AI context)
      const workflowContext: Workflow = {
        nodes: [node], // Minimal workflow for context
        edges: [],
        metadata: { workflowId },
      };
      
      // Auto-fill using AI
      const autoFilledNode = await universalNodeAIContext.autoFillNode(
        { ...node, data: { ...node.data, config } },
        workflowContext,
        userPrompt,
        previousOutputs
      );
      
      // Update config with AI-generated fields
      config = autoFilledNode.data?.config || config;
      console.log(`[DynamicExecutor] ✅ AI auto-filled ${emptyAIFields.length} field(s) for ${nodeType}`);
    }
  } catch (error) {
    console.warn(`[DynamicExecutor] ⚠️ AI auto-fill failed (non-blocking):`, error);
    // Continue without auto-fill - use existing config
  }
  
  // Step 4: Validate config against node schema
  const validation = unifiedNodeRegistry.validateConfig(nodeType, config);
  
  if (!validation.valid) {
    console.error(`[DynamicExecutor] ❌ Config validation failed for ${nodeType}:`, validation.errors);
    
    // ✅ DEFAULT: Strict mode enabled (production-grade)
    // Can be overridden with VALIDATION_STRICT=false if needed
    const isStrictMode = process.env.VALIDATION_STRICT !== 'false';
    
    if (isStrictMode) {
      return {
        _error: `Configuration validation failed: ${validation.errors.join(', ')}`,
        _validationErrors: validation.errors,
        _nodeType: nodeType,
      };
    }
    
    // In non-strict mode, log warnings and continue (backward compatibility - NOT RECOMMENDED)
    if (validation.warnings) {
      console.warn(`[DynamicExecutor] ⚠️  Config warnings for ${nodeType}:`, validation.warnings);
    }
  }
  
  // Step 5: Intent Router (Phase 2) - Conditional activation with skip logic
  // Only activates when: confidence < 0.85, schema drift, or explicit filtering
  const upstreamOutputs = nodeOutputs.getAll();
  const filteredOutputs: Record<string, any> = {};
  
  if (upstreamOutputs && typeof upstreamOutputs === 'object') {
    const userPrompt = (global as any).currentWorkflowIntent || '';
    
    // Process router for each upstream output (async)
    const routerPromises: Promise<void>[] = [];
    
    Object.entries(upstreamOutputs as Record<string, any>).forEach(([upstreamNodeId, output]) => {
      // Check if router should activate for this upstream node
      // For each field that needs input, check if we have metadata for that field
      // We need to check metadata per field, not just the first field
      const mappingMetadata = node.data?.config?._mappingMetadata;
      
      // Try to find metadata for any field that references this upstream node
      // For now, use the first available metadata as a proxy
      // In production, this would be field-specific
      let fieldMetadata: any = undefined;
      if (mappingMetadata && typeof mappingMetadata === 'object') {
        const metadataEntries = Object.entries(mappingMetadata);
        if (metadataEntries.length > 0) {
          // Use the first field's metadata as representative
          // TODO: Make this field-specific in future
          fieldMetadata = metadataEntries[0][1] as any;
        }
      }
      
      const shouldRoute = shouldActivateRouter(
        fieldMetadata,
        output,
        userPrompt
      );
      
      if (shouldRoute) {
        // Use router to filter/transform data
        const router = new IntentDrivenJsonRouter();
        const routingContext = {
          previousOutput: output,
          targetNodeInputSchema: definition.inputSchema,
          userIntent: userPrompt,
          sourceNodeType: 'unknown', // TODO: Get from upstream node
          targetNodeType: nodeType,
          sourceNodeId: upstreamNodeId,
          targetNodeId: node.id,
          mappingMetadata: fieldMetadata,
        };
        
        const routerPromise = router.route(routingContext).then((routingResult: any) => {
          filteredOutputs[upstreamNodeId] = routingResult.filteredPayload;
          console.log(`[DynamicExecutor] 🔄 Router activated for ${upstreamNodeId} → ${node.id}: ${routingResult.explanation}`);
        }).catch(() => {
          // Fallback to original output if routing fails
          filteredOutputs[upstreamNodeId] = output;
        });
        
        routerPromises.push(routerPromise);
      } else {
        // Skip router - use output as-is
        filteredOutputs[upstreamNodeId] = output;
        console.log(`[DynamicExecutor] ⏭️  Router skipped for ${upstreamNodeId} → ${node.id} (confidence: ${fieldMetadata?.confidence?.toFixed(3) || 'N/A'})`);
      }
    });
    
    // Wait for all router operations to complete
    await Promise.all(routerPromises);
  }

  // Step 5.5: Raw upstream payload – AI will analyze its keys and produce JSON for this node.
  // Empty-until-runtime: config input fields are left empty at build time; we fill them here from actual previous output.
  const upstreamPayload = input !== undefined && input !== null ? input : getPreviousNodeOutput(nodeOutputs);

  const universalFlags = getUniversalInputContractFlags();
  // Step 6: Universal node input contract orchestration (intent + previous output + AI + deterministic fallback).
  const contractResult = await resolveNodeInputsUniversalContract({
    definition,
    node,
    nodeType,
    migratedConfig,
    nodeOutputs,
    upstreamPayload,
  });
  let resolvedInputs = contractResult.resolvedInputs;
  const runtimeInputSchema = definition.inputSchema as Record<string, any>;
  const requiredInputs = definition.requiredInputs || [];

  // Strict runtime_ai enforcement for registry-required runtime fields only.
  // Optional runtime fields may remain empty without blocking execution.
  const strictRuntimeFieldNames = Object.keys(runtimeInputSchema).filter((fieldName) => {
    if (effectiveFillModes[fieldName] !== 'runtime_ai') return false;
    return requiredInputs.includes(fieldName);
  });
  const unresolvedRuntimeFields = strictRuntimeFieldNames.filter(
    (fieldName) => !isMeaningfulStaticValue((resolvedInputs as Record<string, any>)[fieldName])
  );
  if (unresolvedRuntimeFields.length > 0 && (universalFlags.strictValidation || !universalFlags.auditOnly)) {
    return {
      _error: `Runtime input resolution failed for required field(s): ${unresolvedRuntimeFields.join(', ')}`,
      _validationErrors: unresolvedRuntimeFields.map((f) => `Required runtime_ai field '${f}' is missing after runtime resolution`),
      _nodeType: nodeType,
    };
  }

  // Deterministic runtime fill-mode observability for debugging and rollout KPIs.
  try {
    const effectiveFillModesForSchema = Object.fromEntries(
      Object.keys(runtimeInputSchema).map((fieldName) => [fieldName, effectiveFillModes[fieldName] ?? 'manual_static'])
    );
    console.log(`[DynamicExecutor] Fill-mode resolution summary for ${node.id} (${nodeType}):`, {
      effectiveFillModes: effectiveFillModesForSchema,
      runtimeFields: contractResult.runtimeFieldsAudit,
      resolvedRuntimeFields: contractResult.resolvedRuntimeFieldsAudit,
      missingRuntimeFields: contractResult.missingRuntimeFieldsAudit,
      outputFallbackUsed: contractResult.outputFallbackUsed,
    });

    nodeOutputs.set(
      EXECUTION_OBSERVABILITY_KEYS.runtimeResolutionAudit(node.id),
      {
        runtimeMarker,
        nodeId: node.id,
        nodeType,
        rollout: {
          contractV2: universalFlags.enabled,
          strictValidation: universalFlags.strictValidation,
          auditOnly: universalFlags.auditOnly,
        },
        runtimeFields: contractResult.runtimeFieldsAudit,
        resolvedRuntimeFields: contractResult.resolvedRuntimeFieldsAudit,
        unresolvedRuntimeFields: contractResult.missingRuntimeFieldsAudit,
        runtimeOwnedFields: contractResult.runtimeFieldsAudit,
        runtimeResolvedFields: contractResult.resolvedRuntimeFieldsAudit,
        runtimeResolutionErrors: contractResult.missingRuntimeFieldsAudit,
        fallbackApplied: contractResult.runtimeFieldsAudit.length > 0,
        outputFallbackUsed: contractResult.outputFallbackUsed,
        outputFallbackReason: contractResult.outputFallbackReason,
        kpis: {
          unresolvedRuntimeFieldsRate:
            contractResult.runtimeFieldsAudit.length > 0
              ? Number((contractResult.missingRuntimeFieldsAudit.length / contractResult.runtimeFieldsAudit.length).toFixed(4))
              : 0,
          fallbackPublishRate: contractResult.outputFallbackUsed ? 1 : 0,
        },
        schemaValidationFailures: contractResult.missingRuntimeFieldsAudit.map((f) => `missing:${f}`),
        canonicalizationIssues: [],
        capturedAt: new Date().toISOString(),
      },
      true
    );
  } catch (runtimeAuditError) {
    console.warn(`[DynamicExecutor] Failed to persist runtime resolution audit for ${node.id}:`, runtimeAuditError);
  }

  // Capture resolved runtime inputs for execution observability without leaking secrets.
  // This is used by execution detail views and "last runtime value" previews in UI.
  let resolvedInputSources: Record<string, 'runtime_ai' | 'static_config'> = {};
  try {
    resolvedInputSources = {};
    for (const fieldName of Object.keys(resolvedInputs || {})) {
      resolvedInputSources[fieldName] = effectiveFillModes[fieldName] === 'runtime_ai'
        ? 'runtime_ai'
        : 'static_config';
    }
    nodeOutputs.set(
      EXECUTION_OBSERVABILITY_KEYS.resolvedInputs(node.id),
      {
        fields: sanitizeResolvedInputsForPersistence(resolvedInputs || {}),
        sources: resolvedInputSources,
        runtimeMarker,
        capturedAt: new Date().toISOString(),
      },
      true
    );
  } catch (captureError) {
    console.warn(`[DynamicExecutor] Failed to capture resolved inputs for ${node.id}:`, captureError);
  }

  // Branching nodes (switch/if_else and any future branching type) evaluate expressions
  // against upstream data while also resolving runtime_ai config fields.
  let effectiveInput: unknown = upstreamPayload;
  if (definition.isBranching === true) {
    const up =
      typeof upstreamPayload === 'object' && upstreamPayload !== null && !Array.isArray(upstreamPayload)
        ? (upstreamPayload as Record<string, unknown>)
        : {};
    const res =
      resolvedInputs && typeof resolvedInputs === 'object' && !Array.isArray(resolvedInputs)
        ? (resolvedInputs as Record<string, unknown>)
        : {};
    effectiveInput = { ...up, ...res };
    if (Object.keys(res).length > 0) {
      console.log(
        `[DynamicExecutor] ✅ Merged upstream payload with resolved branching config for ${nodeType} (upstreamKeys=${Object.keys(up).join(', ')}, resolvedKeys=${Object.keys(res).join(', ')})`
      );
    }
  } else if (resolvedInputs && typeof resolvedInputs === 'object' && Object.keys(resolvedInputs).length > 0) {
    effectiveInput = resolvedInputs;
    const prevKeys = typeof upstreamPayload === 'object' && upstreamPayload !== null ? Object.keys(upstreamPayload as object) : [];
    console.log(`[DynamicExecutor] ✅ AI analyzed previous keys [${prevKeys.join(', ')}] and produced input JSON for ${nodeType}`);
  } else if (upstreamPayload !== undefined && upstreamPayload !== null && typeof upstreamPayload === 'object') {
    const expectedKeys = (node.data?.config as Record<string, unknown>)?._expectedInputKeys as string[] | undefined;
    const { normalizedPayload, normalized } = normalizeRuntimePayload({
      payload: upstreamPayload,
      expectedKeys: Array.isArray(expectedKeys) ? expectedKeys : undefined,
    });
    if (normalized) effectiveInput = normalizedPayload;
  }

  // Store effective input as 'input'/$json for template resolution and execution (node sees the structure it needs)
  if (effectiveInput !== undefined && effectiveInput !== null) {
    nodeOutputs.set('input', effectiveInput, true);
    nodeOutputs.set('$json', effectiveInput, true);
    nodeOutputs.set('json', effectiveInput, true);
  }

  // ✅ CRITICAL FIX: Merge AI-generated inputs back into config for UI display
  // This ensures AI-generated values (headers, body, prompts, etc.) are visible in Properties Panel
  // Only merge if the field is empty in config (don't overwrite user-provided values)
  const mergedConfig = { ...migratedConfig };
  const mergedDef = unifiedNodeRegistry.get(nodeType);
  const mergedSchema = mergedDef?.inputSchema || {};
  for (const [fieldName, aiValue] of Object.entries(resolvedInputs)) {
    const fieldDef = (mergedSchema as Record<string, any>)[fieldName];
    if (fieldDef && isCredentialOwnership(fieldName, fieldDef)) {
      // Never persist AI-generated credential-like values into node config.
      continue;
    }
    const currentValue = mergedConfig[fieldName];
    // Only merge if current value is empty/undefined/null
    if (!currentValue || 
        (typeof currentValue === 'string' && currentValue.trim() === '') ||
        (typeof currentValue === 'object' && Object.keys(currentValue).length === 0)) {
      mergedConfig[fieldName] = aiValue;
      console.log(`[DynamicExecutor] ✅ Merged AI-generated value for ${fieldName} into config`);
    }
  }

  // ── runtime_ai resolution contract (spec task 9) ────────────────────────
  // Resolve all {{$json.*}} template expressions in mergedConfig via
  // universalTemplateResolver BEFORE the legacy executor receives config.
  // This ensures no template syntax leaks into node execution.
  const { resolveUniversalTemplate } = require('../utils/universal-template-resolver');
  const templateResolvedConfig: Record<string, any> = {};
  for (const [key, value] of Object.entries(mergedConfig)) {
    if (typeof value === 'string' && (value.includes('{{') || value.includes('$json'))) {
      templateResolvedConfig[key] = resolveUniversalTemplate(value, nodeOutputs);
    } else {
      templateResolvedConfig[key] = value;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Step 7: Create execution context (rawInput = effective normalized payload for never-failing code)
  const execContext: NodeExecutionContext = {
    nodeId: node.id,
    nodeType,
    config: templateResolvedConfig, // Use template-resolved config (spec task 9)
    inputs: resolvedInputs, // Use resolved inputs for execution
    rawInput: effectiveInput,
    upstreamOutputs: new Map(),
    workflowId,
    userId,
    currentUserId,
    supabase,
    resolvedInputSources,
  };
  
        // Populate upstreamOutputs map
        const allUpstreamOutputs = nodeOutputs.getAll();
        if (allUpstreamOutputs && typeof allUpstreamOutputs === 'object') {
          Object.entries(allUpstreamOutputs as Record<string, any>).forEach(([upstreamNodeId, output]) => {
            execContext.upstreamOutputs.set(upstreamNodeId, output);
          });
        }
  
  // Step 8: Execute node using definition.execute() (NO hardcoded logic)
  try {
    const result = await definition.execute(execContext);
    
    if (!result.success) {
      console.error(`[DynamicExecutor] ❌ Node execution failed:`, result.error);
      return {
        _error: result.error?.message || 'Node execution failed',
        _errorCode: result.error?.code,
        _errorDetails: result.error?.details,
        _nodeType: nodeType,
      };
    }
    
    // Step 9: Validate output against output schema
    const outputValidation = validateOutputAgainstSchema(result.output, definition.outputSchema);
    if (!outputValidation.valid) {
      console.warn(`[DynamicExecutor] ⚠️  Output validation warnings:`, outputValidation.warnings);
    }
    
    // ✅ CLEAN OUTPUT FROM CONFIG VALUES (CORE ARCHITECTURE FIX)
    // Remove config values from output to ensure only actual output data is returned
    // This prevents placeholder values and config fields from appearing in output JSON
    const { cleanOutputFromConfig } = await import('../utils/placeholder-filter');
    const cleanedOutput = cleanOutputFromConfig(result.output, migratedConfig);
    
    return cleanedOutput;
    
  } catch (error: any) {
    console.error(`[DynamicExecutor] ❌ Unhandled error during execution:`, error);
    
    // ✅ CLEAN ERROR OUTPUT: Don't include config values in error output
    const errorOutput = {
      _error: error.message || 'Unhandled execution error',
      _errorDetails: error,
      _nodeType: nodeType,
    };
    
    // Clean output to remove any config values that might have been added
    const { cleanOutputFromConfig } = await import('../utils/placeholder-filter');
    const cleanedErrorOutput = cleanOutputFromConfig(errorOutput, migratedConfig);
    
    return cleanedErrorOutput;
  }
}

/**
 * Resolve input values using AI Input Resolver (NEW ARCHITECTURE)
 * When overridePreviousOutput is provided (e.g. normalized payload from runtime adapter), use it for key-aware binding.
 */
async function resolveInputsWithAI(
  inputSchema: any,
  config: Record<string, any>,
  nodeOutputs: LRUNodeOutputsCache,
  currentNodeId: string,
  nodeType: string,
  nodeLabel?: string,
  overridePreviousOutput?: unknown,
  retryRequiredFields?: string[]
): Promise<Record<string, any>> {
  let previousOutput: unknown;
  if (overridePreviousOutput !== undefined) {
    previousOutput = overridePreviousOutput;
    (global as any).lastPreviousOutputNodeId = null;
  } else {
    // ✅ UNIVERSAL FIX: Skip entries that are effectively empty (meta/trigger-only payloads).
    // getMostRecentOutputEntry returns the entry with the highest setTimestamp, but meta keys
    // (e.g. $json, trigger) may be refreshed after the real node output, shadowing it.
    // We iterate from most-recent to least-recent and return the first non-empty real entry.
    const entry = nodeOutputs.getMostRecentOutputEntry(['$json', 'json', 'trigger', 'input']);
    if (
      entry &&
      !isEffectivelyEmptyUpstreamPayload(entry.value) &&
      !isUpstreamNarrativelyThinForRuntimeAi(entry.value)
    ) {
      previousOutput = entry.value;
      (global as any).lastPreviousOutputNodeId = entry.key ?? null;
    } else {
      // Fall back: try all entries (excluding meta keys) and pick the first with real narrative payload
      const allEntries = nodeOutputs.getAllEntries?.(['$json', 'json', 'trigger', 'input']) ?? [];
      const nonEmptyEntry = allEntries.find(
        (e) =>
          !isEffectivelyEmptyUpstreamPayload(e.value) && !isUpstreamNarrativelyThinForRuntimeAi(e.value)
      );
      previousOutput = nonEmptyEntry?.value ?? entry?.value;
      (global as any).lastPreviousOutputNodeId = (nonEmptyEntry?.key ?? entry?.key) ?? null;
    }
  }

  // Store previous output globally for body mapping (and node id for registry-driven narrative pick).
  (global as any).lastPreviousOutput = previousOutput;
  
  // User intent from currentWorkflowIntent set at execution start in execute-workflow (single source for this run).
  const userIntent = (global as any).currentWorkflowIntent || 'Process workflow data';
  
  // Thin upstream payloads should not short-circuit to static config.
  // We still run AI resolution using workflow intent so runtime_ai fields can be generated.
  if (
    previousOutput == null ||
    (typeof previousOutput === 'object' && Object.keys(previousOutput as object).length === 0) ||
    isEffectivelyEmptyUpstreamPayload(previousOutput) ||
    isUpstreamNarrativelyThinForRuntimeAi(previousOutput)
  ) {
    console.log('[DynamicExecutor] ℹ️ Thin upstream payload detected, running intent-only AI input resolution', {
      nodeType,
      nodeId: currentNodeId,
    });
    previousOutput = undefined;
    (global as any).lastPreviousOutput = undefined;
    (global as any).lastPreviousOutputNodeId = null;
  }

  // Import AI Input Resolver – AI analyzes actual keys (number, value, number.1, number.list, etc.) and creates input JSON
  const { aiInputResolver } = await import('../ai-input-resolver');
  
  // Resolve inputs using AI
  try {
    const definitionForVerboseLogs = unifiedNodeRegistry.get(nodeType);
    const logVerboseAiResolution = shouldLogVerboseAiInputResolution(definitionForVerboseLogs);
    if (logVerboseAiResolution) {
      console.log('[DynamicExecutor] 🔍 Starting AI input resolution for node:', {
        nodeId: currentNodeId,
        nodeType,
        nodeLabel,
        hasPreviousOutput: previousOutput !== undefined,
        previousOutputKeys: previousOutput && typeof previousOutput === 'object' 
          ? Object.keys(previousOutput as Record<string, unknown>)
          : [],
        previousOutputSample: previousOutput && typeof previousOutput === 'object'
          ? JSON.stringify(previousOutput).substring(0, 200)
          : String(previousOutput).substring(0, 200),
        inputSchemaKeys: Object.keys(inputSchema || {}),
        userIntent,
      });
    }

    const resolved = await aiInputResolver.resolveInput({
      previousOutput,
      nodeInputSchema: inputSchema,
      userIntent,
      nodeType,
      nodeLabel,
      retryRequiredFields,
    });

    if (logVerboseAiResolution) {
      console.log('[DynamicExecutor] ✅ AI input resolution result:', {
        nodeId: currentNodeId,
        nodeType,
        mode: resolved.mode,
        resolvedValueType: typeof resolved.value,
        resolvedValueKeys: resolved.value && typeof resolved.value === 'object'
          ? Object.keys(resolved.value as Record<string, unknown>)
          : [],
        resolvedValueSample: resolved.value && typeof resolved.value === 'object'
          ? JSON.stringify(resolved.value).substring(0, 300)
          : String(resolved.value).substring(0, 300),
        hasPrompt: resolved.value && typeof resolved.value === 'object' && 'prompt' in (resolved.value as Record<string, unknown>),
        hasBody: resolved.value && typeof resolved.value === 'object' && 'body' in (resolved.value as Record<string, unknown>),
        hasHeaders: resolved.value && typeof resolved.value === 'object' && 'headers' in (resolved.value as Record<string, unknown>),
        explanation: resolved.explanation,
      });
    }

    // Map resolved value to input schema fields
    const mapped = mapResolvedValueToSchema(resolved.value, inputSchema, resolved.mode);

    if (logVerboseAiResolution) {
      console.log('[DynamicExecutor] ✅ Mapped resolved input to schema:', {
        nodeId: currentNodeId,
        mappedKeys: Object.keys(mapped),
        mappedSample: JSON.stringify(mapped).substring(0, 300),
        hasPrompt: 'prompt' in mapped,
        hasBody: 'body' in mapped,
        hasHeaders: 'headers' in mapped,
        bodyType: mapped.body ? typeof mapped.body : 'N/A',
        bodySample: mapped.body ? JSON.stringify(mapped.body).substring(0, 200) : 'N/A',
        headersSample: mapped.headers ? JSON.stringify(mapped.headers).substring(0, 200) : 'N/A',
      });
    }
    
    return mapped;
  } catch (error: any) {
    console.warn(`[DynamicExecutor] ⚠️  AI input resolution failed, using fallback: ${error.message}`);
    
    // Fallback: Use config values as-is (backward compatibility)
    return resolveInputsFromConfig(inputSchema, config, nodeOutputs);
  }
}

/**
 * Universal contract orchestrator for node input resolution.
 * Order: static/template config -> previous-output extraction -> AI mapping ->
 * deterministic contracts -> guarantee -> intent backfill -> output reliability fallback.
 */
async function resolveNodeInputsUniversalContract(
  params: UniversalContractParams
): Promise<UniversalContractResult> {
  const { definition, node, nodeType, migratedConfig, nodeOutputs, upstreamPayload } = params;
  const requiredInputs = definition.requiredInputs || [];
  const runtimeInputSchema = definition.inputSchema as Record<string, any>;
  const effectiveFillModes = buildEffectiveFillModes(definition.inputSchema, migratedConfig as Record<string, any>);
  const rawWorkflowIntent = String((global as any).currentWorkflowIntent || '').trim();

  let resolvedInputs = await resolveInputsWithAI(
    definition.inputSchema as any,
    migratedConfig,
    nodeOutputs,
    node.id,
    nodeType,
    node.data?.label,
    upstreamPayload
  );

  let runtimeFieldsAudit: string[] = [];
  let resolvedRuntimeFieldsAudit: string[] = [];
  let missingRuntimeFieldsAudit: string[] = [];
  let outputFallbackUsed = false;
  let outputFallbackReason: string | undefined;

  if (
    runtimeInputSchema &&
    (upstreamPayload == null || typeof upstreamPayload === 'object' || typeof upstreamPayload === 'string')
  ) {
    let current = typeof resolvedInputs === 'object' && resolvedInputs !== null ? resolvedInputs : {};
    const validation = validateResolvedInput(current, runtimeInputSchema, requiredInputs);
    if (!validation.valid && requiredInputs.length > 0) {
      try {
        const retried = await resolveInputsWithAI(
          definition.inputSchema as any,
          migratedConfig,
          nodeOutputs,
          node.id,
          nodeType,
          node.data?.label,
          upstreamPayload,
          requiredInputs
        );
        const retriedCurrent = typeof retried === 'object' && retried !== null ? retried : {};
        if (validateResolvedInput(retriedCurrent, runtimeInputSchema, requiredInputs).valid) {
          resolvedInputs = retriedCurrent;
          current = retriedCurrent;
        }
      } catch {
        // Keep original and continue through deterministic contract layers.
      }
    }

    resolvedInputs = guaranteeInputForSchema({
      resolved: current,
      previousOutput: upstreamPayload,
      inputSchema: runtimeInputSchema,
      requiredInputs,
      mappingMetadata: (migratedConfig as Record<string, any>)?._mappingMetadata,
      fieldFillModes: effectiveFillModes,
    });

    fillMissingTitleLikeRuntimeAiFields({
      resolvedInputs: resolvedInputs as Record<string, any>,
      upstreamPayload,
      inputSchema: runtimeInputSchema,
      effectiveFillModes,
      workflowIntent: rawWorkflowIntent,
    });

    const outputNode =
      String(definition.category) === 'output' || definition.category === 'communication';
    if (
      (isEffectivelyEmptyUpstreamPayload(upstreamPayload) ||
        isUpstreamNarrativelyThinForRuntimeAi(upstreamPayload)) &&
      !outputNode
    ) {
      const fallbackIntent =
        rawWorkflowIntent.length > 0 ? rawWorkflowIntent : 'Process the workflow using the configured nodes.';
      for (const fieldName of Object.keys(runtimeInputSchema)) {
        if (effectiveFillModes[fieldName] !== 'runtime_ai') continue;
        const fieldDef = runtimeInputSchema[fieldName] as NodeInputField | undefined;
        if (!shouldFillRuntimeAiFromWorkflowIntent(fieldName, fieldDef)) continue;
        if (isMeaningfulStaticValue((resolvedInputs as Record<string, any>)[fieldName])) continue;
        (resolvedInputs as Record<string, any>)[fieldName] = fallbackIntent;
      }
    }

    const contractResult = applyDeterministicFieldContracts(
      resolvedInputs as Record<string, unknown>,
      {
        nodeType,
        userIntent: rawWorkflowIntent,
        upstreamPayload,
        config: migratedConfig as Record<string, unknown>,
        inputSchema: runtimeInputSchema,
      }
    );
    resolvedInputs = contractResult.resolvedInputs as Record<string, any>;

    for (const fieldName of Object.keys(runtimeInputSchema)) {
      const mode = effectiveFillModes[fieldName];
      if (mode === 'manual_static' || mode === 'buildtime_ai_once') {
        const staticValue = (migratedConfig as Record<string, any>)[fieldName];
        if (isMeaningfulStaticValue(staticValue)) {
          (resolvedInputs as Record<string, any>)[fieldName] = staticValue;
        }
      }
    }

    applyInputAliasesFromSchema(resolvedInputs as Record<string, unknown>, runtimeInputSchema as Record<string, any>);

    const runtimeFields = Object.keys(runtimeInputSchema).filter(
      (fieldName) => effectiveFillModes[fieldName] === 'runtime_ai'
    );
    const resolvedRuntimeFields = runtimeFields.filter((fieldName) =>
      isMeaningfulValueForResolution((resolvedInputs as Record<string, any>)?.[fieldName])
    );
    const missingRuntimeFields = runtimeFields.filter((fieldName) => !resolvedRuntimeFields.includes(fieldName));
    runtimeFieldsAudit = runtimeFields;
    resolvedRuntimeFieldsAudit = resolvedRuntimeFields;
    missingRuntimeFieldsAudit = missingRuntimeFields;

    // Generic output-node reliability: avoid publishing obvious placeholder AI text.
    if (outputNode && runtimeFields.length > 0) {
      const upstreamType = getUpstreamNodeTypeFromExecutionGlobal();
      const narrativeFallback = pickPrimaryNarrativeStringFromUpstreamOutput(
        upstreamType,
        upstreamPayload
      );
      const replacedFields: string[] = [];
      for (const fieldName of runtimeFields) {
        const fieldDef = runtimeInputSchema[fieldName] as NodeInputField | undefined;
        if (!shouldFillRuntimeAiFromWorkflowIntent(fieldName, fieldDef)) continue;
        const val = (resolvedInputs as Record<string, unknown>)[fieldName];
        if (
          looksPlaceholderLikeValue(val) &&
          typeof narrativeFallback === 'string' &&
          narrativeFallback.trim().length > 0
        ) {
          (resolvedInputs as Record<string, any>)[fieldName] = narrativeFallback;
          replacedFields.push(fieldName);
        }
      }
      if (replacedFields.length > 0) {
        outputFallbackUsed = true;
        outputFallbackReason = `placeholder_like_runtime_ai:${replacedFields.join(',')}`;
      }
    }
  }

  return {
    resolvedInputs,
    runtimeFieldsAudit,
    resolvedRuntimeFieldsAudit,
    missingRuntimeFieldsAudit,
    outputFallbackUsed,
    outputFallbackReason,
  };
}

/**
 * Get previous node output from nodeOutputs cache.
 * ✅ UNIVERSAL FIX: Returns the most recently set non-empty, non-meta entry.
 * Skips entries where isEffectivelyEmptyUpstreamPayload returns true so that
 * meta/trigger-only payloads set after real node output do not shadow the real output.
 */
function getPreviousNodeOutput(nodeOutputs: LRUNodeOutputsCache): any {
  const META_KEYS = ['$json', 'json', 'trigger', 'input'];
  // First try: most recent non-meta entry
  const entry = nodeOutputs.getMostRecentOutputEntry(META_KEYS);
  if (entry && !isEffectivelyEmptyUpstreamPayload(entry.value)) {
    return entry.value;
  }
  // Second try: scan all non-meta entries for the first non-empty one
  const allEntries = nodeOutputs.getAllEntries(META_KEYS);
  const nonEmpty = allEntries.find(e => !isEffectivelyEmptyUpstreamPayload(e.value));
  if (nonEmpty) return nonEmpty.value;
  // Final fallback: return whatever the most recent entry has (let caller decide)
  return entry?.value;
}

/**
 * Map resolved AI value to input schema fields
 */
function mapResolvedValueToSchema(
  resolvedValue: any,
  inputSchema: any,
  mode: 'message' | 'message+json' | 'json'
): Record<string, any> {
  const mapped: Record<string, any> = {};
  
  if (mode === 'message') {
    const messageField = pickPrimaryMessageLikeField(inputSchema);
    
    if (messageField) {
      mapped[messageField] = resolvedValue;
    } else {
      // Use first required field or first field
      const firstField = Object.keys(inputSchema)[0];
      if (firstField) {
        mapped[firstField] = resolvedValue;
      }
    }
  } else if (mode === 'message+json') {
    // For message+json mode, map message and data fields
    if (typeof resolvedValue === 'object' && resolvedValue !== null) {
      const messageField = pickPrimaryMessageLikeField(inputSchema);
      
      if (messageField && resolvedValue.message) {
        mapped[messageField] = resolvedValue.message;
      }
      
      // Map data fields
      if (resolvedValue.data && typeof resolvedValue.data === 'object') {
        Object.assign(mapped, resolvedValue.data);
      }
    }
  } else {
    // For json mode, map all fields from resolved value
    if (typeof resolvedValue === 'object' && resolvedValue !== null) {
      Object.assign(mapped, resolvedValue);
      
      // If the resolver LLM put wrong/short text in long_body fields but upstream has a richer
      // narrative (from registry outputSchema or longest top-level string), prefer upstream.
      // Must run before title_like backfill from body. No regex / no hardcoded node names.
      const previousForBody = (global as any).lastPreviousOutput;
      const upstreamType = getUpstreamNodeTypeFromExecutionGlobal();
      const primaryNarrative = pickPrimaryNarrativeStringFromUpstreamOutput(
        upstreamType,
        previousForBody
      );
      if (primaryNarrative && primaryNarrative.length >= 40) {
        const fp = primaryNarrative.slice(0, Math.min(80, primaryNarrative.length));
        for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
          const def = fieldDef as { role?: string; type?: string };
          const isLongBody =
            def.role === 'long_body' ||
            (fieldName.toLowerCase() === 'body' && (def.type === 'string' || def.type === 'expression'));
          if (!isLongBody) continue;
          const cur = mapped[fieldName];
          if (typeof cur !== 'string') continue;
          const curTrim = cur.trim();
          const hasUpstreamFingerprint = fp.length >= 20 && curTrim.includes(fp.slice(0, 20));
          if (!hasUpstreamFingerprint && primaryNarrative.length > curTrim.length * 1.1) {
            mapped[fieldName] = primaryNarrative;
            console.log(
              `[DynamicExecutor] ✅ Replaced ${fieldName} with registry-derived upstream narrative (resolver text did not match upstream fingerprint)`
            );
          }
        }
      }

      // HTTP Request body: prefer registry-derived primary string from upstream, then from resolved object.
      if (inputSchema.body && !mapped.body) {
        const previousOutput = (global as any).lastPreviousOutput;
        const uType = getUpstreamNodeTypeFromExecutionGlobal();
        const fromUpstream = pickPrimaryNarrativeStringFromUpstreamOutput(uType, previousOutput);
        if (fromUpstream) {
          mapped.body = { message: fromUpstream };
          console.log('[DynamicExecutor] ✅ Mapped primary upstream narrative to HTTP Request body');
        } else if (typeof resolvedValue === 'object' && resolvedValue !== null) {
          const fromResolved = pickPrimaryNarrativeStringFromUpstreamOutput(undefined, resolvedValue);
          if (fromResolved) {
            mapped.body = { message: fromResolved };
            console.log('[DynamicExecutor] ✅ Mapped primary string from resolved value to HTTP Request body');
          } else if (resolvedValue.body) {
            mapped.body = resolvedValue.body;
          }
        }
        if (!mapped.body && previousOutput && typeof previousOutput === 'object') {
          mapped.body = previousOutput;
          console.log('[DynamicExecutor] ✅ Using entire previous output as HTTP Request body');
        }
      }

      // Registry-driven: fill empty title_like from first line of a mapped long_body / text sibling (json mode).
      const titleLikeFields = Object.keys(inputSchema).filter((f) => {
        const def = inputSchema[f] as { role?: string };
        return def?.role === 'title_like';
      });
      const bodyLikeFields = Object.keys(inputSchema).filter((f) => {
        const def = inputSchema[f] as { role?: string };
        const fl = f.toLowerCase();
        return (
          def?.role === 'long_body' ||
          fl.includes('body') ||
          fl.includes('message') ||
          fl.includes('text') ||
          fl.includes('content')
        );
      });
      for (const tf of titleLikeFields) {
        const tv = mapped[tf];
        if (typeof tv === 'string' && tv.trim().length > 0) continue;
        for (const bf of bodyLikeFields) {
          const bv = mapped[bf];
          if (typeof bv === 'string' && bv.trim().length > 0) {
            const firstLine = bv.split(/\r?\n/)[0].trim().slice(0, 100);
            if (firstLine) mapped[tf] = firstLine;
            break;
          }
        }
      }
    }
  }
  
  // Fill in any missing required fields with defaults
  for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
    const field = fieldDef as any; // Type assertion for NodeInputField
    if (!(fieldName in mapped)) {
      if (field.required && field.default !== undefined) {
        mapped[fieldName] = field.default;
      }
    }
  }
  
  return mapped;
}

/**
 * Fallback: Resolve inputs from config (backward compatibility)
 */
function resolveInputsFromConfig(
  inputSchema: any,
  config: Record<string, any>,
  nodeOutputs: LRUNodeOutputsCache
): Record<string, any> {
  const resolved: Record<string, any> = {};
  
  // For each field in input schema, resolve from config
  for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
    const field = fieldDef as any; // Type assertion for NodeInputField
    const configValue = config[fieldName];
    
    if (configValue === undefined || configValue === null) {
      // Use default if available
      if (field.default !== undefined) {
        resolved[fieldName] = field.default;
      }
      continue;
    }
    
    // If it's a template expression, resolve it (legacy support)
    if (typeof configValue === 'string' && configValue.includes('{{')) {
      resolved[fieldName] = resolveTemplateExpression(configValue, nodeOutputs);
    } else {
      resolved[fieldName] = configValue;
    }
  }
  
  return resolved;
}

/**
 * Resolve input values from upstream nodes using template expressions (LEGACY - kept for fallback)
 */
function resolveInputsFromUpstream(
  inputSchema: any,
  config: Record<string, any>,
  nodeOutputs: LRUNodeOutputsCache,
  currentNodeId: string
): Record<string, any> {
  return resolveInputsFromConfig(inputSchema, config, nodeOutputs);
}

/**
 * Resolve template expression like {{$json.field}} or {{$json.items[].Column}}
 * 
 * ✅ CORE ARCHITECTURE: Uses universal template resolver
 * This ensures consistent template resolution across ALL nodes
 */
function resolveTemplateExpression(
  template: string,
  nodeOutputs: LRUNodeOutputsCache
): any {
  // ✅ Use universal template resolver (single source of truth)
  const { resolveUniversalTemplate } = require('../utils/universal-template-resolver');
  return resolveUniversalTemplate(template, nodeOutputs);
}

/**
 * Get nested value from object using dot notation or array access
 */
function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    
    // Handle array access: items[].Column
    if (part.includes('[]')) {
      const [arrayKey, ...rest] = part.split('[]');
      if (Array.isArray(current[arrayKey])) {
        // For array access, return the array itself (filtering handled separately)
        current = current[arrayKey];
        if (rest.length > 0) {
          // Continue with remaining path on first element
          const remainingPath = rest.join('[]') + (parts.slice(parts.indexOf(part) + 1).join('.'));
          if (current.length > 0) {
            return getNestedValue(current[0], remainingPath);
          }
        }
        return current;
      }
    } else {
      current = current[part];
    }
  }
  
  return current;
}

/**
 * Validate output against output schema
 */
function validateOutputAgainstSchema(
  output: any,
  outputSchema: any
): { valid: boolean; warnings?: string[] } {
  const warnings: string[] = [];
  
  if (!outputSchema || typeof outputSchema !== 'object') {
    return { valid: true }; // No schema to validate against
  }
  
  const defaultPort = (outputSchema as any).default;
  if (!defaultPort || typeof defaultPort !== 'object') {
    return { valid: true }; // No default port schema
  }
  
  const expectedType = defaultPort.schema?.type;
  if (!expectedType) {
    return { valid: true }; // No type in schema
  }
  
  const actualType = Array.isArray(output) ? 'array' : typeof output;
  
  if (expectedType === 'object' && actualType !== 'object') {
    warnings.push(`Expected object output, got ${actualType}`);
  } else if (expectedType === 'array' && !Array.isArray(output)) {
    warnings.push(`Expected array output, got ${actualType}`);
  }
  
  return {
    valid: warnings.length === 0,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
