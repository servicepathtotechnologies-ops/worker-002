/**
 * Workflow Save-Time Validator
 * 
 * Validates workflows before saving to ensure they are executable.
 * This prevents saving invalid workflows that would fail at runtime.
 */

import type { Workflow } from '../types/ai-types';
import type { WorkflowBuildManifestV1 } from '../types/workflow-build-manifest';
import { workflowAuthorizedMultisetMatches } from '../utils/workflow-build-manifest-utils';
import { unifiedGraphOrchestrator } from '../orchestration/unified-graph-orchestrator';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { resolveEffectiveFieldFillMode } from '../utils/fill-mode-resolver';
import { isStructuralOwnership } from '../utils/field-ownership';
import {
  normalizeIfElseConfig,
  validateCanonicalIfElseConditions,
} from '../utils/if-else-conditions';
import { normalizeWorkflowFormFieldIdentities } from '../utils/form-field-identity';
import { isEmptyConfigValue } from './registry-field-contract';
import { validateIfElseConditionsAgainstUpstreamForm } from '../orchestration/form-ifelse-binding';
import { extractSwitchCasePortNames } from '../utils/branching-node-ports';

// Workflow types (inline to avoid circular dependencies)
interface WorkflowNode {
  id: string;
  type: string;
  data: {
    label: string;
    type: string;
    category: string;
    config: Record<string, unknown>;
  };
}

/**
 * Check if a node is a trigger node
 * Recognizes nodes by:
 * 1. Category === 'triggers' (any node in triggers category) - PRIMARY METHOD
 * 2. Type includes 'trigger' (chat_trigger, form_trigger, etc.)
 * 3. Known trigger types (schedule, webhook, interval, form, etc.)
 * 
 * This ensures ANY node from the "Triggers" category in the node library is recognized as a trigger.
 */
export function isTriggerNode(node: WorkflowNode): boolean {
  const nodeType = node.data?.type || node.type || '';
  const category = node.data?.category || '';
  
  // ✅ PRIMARY: Check if node is in "triggers" category (any node from triggers category)
  if (category.toLowerCase() === 'triggers' || category.toLowerCase() === 'trigger') {
    return true;
  }
  
  // ✅ SECONDARY: Check if type includes 'trigger'
  if (nodeType.includes('trigger')) {
    return true;
  }
  
  // ✅ TERTIARY: Check known trigger types (fallback for nodes without category)
  const knownTriggerTypes = [
    'manual_trigger',
    'webhook',
    'schedule',
    'chat_trigger',
    'form_trigger',
    'form',
    'workflow_trigger',
    'error_trigger',
    'interval',
    'gmail_trigger',
    'slack_trigger',
    'discord_trigger',
  ];
  
  return knownTriggerTypes.includes(nodeType);
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

/** full: legacy save-time fixes; configOnly: preserve topology (attach-inputs / attach-credentials) */
export interface NormalizeWorkflowForSaveOptions {
  structuralMode?: 'full' | 'configOnly' | 'post_freeze_readonly';
  /** Migration keys already applied to this workflow — used to skip re-running idempotent migrations */
  alreadyApplied?: string[];
}

function hasDirectedCycle(nodes: WorkflowNode[], edges: WorkflowEdge[]): boolean {
  const adjacency = new Map<string, string[]>();
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const id of nodeIds) adjacency.set(id, []);
  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      adjacency.get(edge.source)!.push(edge.target);
    }
  }

  const unvisited = 0;
  const visiting = 1;
  const visited = 2;
  const state = new Map<string, number>();
  for (const id of nodeIds) state.set(id, unvisited);

  const dfs = (id: string): boolean => {
    state.set(id, visiting);
    for (const next of adjacency.get(id) || []) {
      const s = state.get(next) ?? unvisited;
      if (s === visiting) return true;
      if (s === unvisited && dfs(next)) return true;
    }
    state.set(id, visited);
    return false;
  };

  for (const id of nodeIds) {
    if ((state.get(id) ?? unvisited) === unvisited && dfs(id)) {
      return true;
    }
  }
  return false;
}

export interface SaveValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  canSave: boolean; // Whether save should be allowed
}

export function validateStructuralReadiness(
  nodes: WorkflowNode[],
  options?: { strict?: boolean }
): { errors: string[]; warnings: string[] } {
  const strict = !!options?.strict;
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const node of nodes) {
    const nodeType = node.data?.type || node.type;
    const config = (
      nodeType === 'if_else'
        ? normalizeIfElseConfig((node.data?.config || {}) as Record<string, unknown>)
        : (node.data?.config || {})
    ) as Record<string, unknown>;
    const def = unifiedNodeRegistry.get(nodeType);
    if (!def) continue;
    const inputSchema = def.inputSchema || {};
    const requiredFields = def.requiredInputs || [];

    for (const fieldName of requiredFields) {
      const fieldDef = inputSchema[fieldName];
      if (!fieldDef) continue;
      if (!isStructuralOwnership(fieldName, fieldDef)) continue;
      const mode = resolveEffectiveFieldFillMode(fieldName, inputSchema, config as Record<string, any>);
      const value = config[fieldName];
      const missing = isEmptyConfigValue(value);

      if (!missing) continue;

      const runtimeAllowed = fieldDef.fillMode?.supportsRuntimeAI !== false;
      if (mode === 'runtime_ai' && runtimeAllowed) {
        warnings.push(`Node "${node.data?.label || node.id}" defers required field "${fieldName}" to runtime_ai`);
        continue;
      }

      const message = `Node "${node.data?.label || node.id}" missing required structural field "${fieldName}" before execution`;
      if (strict) errors.push(message);
      else warnings.push(message);
    }
  }

  return { errors, warnings };
}

/**
 * Validate workflow before saving
 * Returns errors that block saving and warnings that don't
 */
export function validateWorkflowForSave(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  metadata?: { buildManifest?: WorkflowBuildManifestV1; freezeBoundary?: { frozen?: boolean } },
): SaveValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. CRITICAL: Single trigger validation
  // Use isTriggerNode helper to recognize ALL nodes from triggers category
  const triggerNodes = nodes.filter(n => isTriggerNode(n));

  if (triggerNodes.length === 0) {
    errors.push('Workflow must have exactly one trigger node');
  } else if (triggerNodes.length > 1) {
    errors.push(`Workflow has ${triggerNodes.length} trigger nodes (${triggerNodes.map(n => n.data?.label || n.id).join(', ')}), but should have exactly one`);
  }

  // 2. Validate graph structure
  const nodeIds = new Set(nodes.map(n => n.id));
  const invalidEdges = edges.filter(e => 
    !nodeIds.has(e.source) || !nodeIds.has(e.target)
  );

  if (invalidEdges.length > 0) {
    errors.push(`Found ${invalidEdges.length} edge(s) referencing non-existent nodes`);
  }

  // 2b. Enforce per-branch log terminals: no multi-input log_output fan-in.
  const normalizedTypeById = new Map<string, string>(
    nodes.map((n) => [n.id, String(n.data?.type || n.type || '')])
  );
  const branchingNodeIds = new Set(
    nodes
      .filter((n) => {
        const nt = String(n.data?.type || n.type || '');
        return !!unifiedNodeRegistry.get(nt)?.isBranching;
      })
      .map((n) => n.id)
  );
  const branchTargets = new Set(
    edges.filter((e) => branchingNodeIds.has(e.source)).map((e) => e.target)
  );
  const logNodeIds = nodes
    .filter((n) => String(n.data?.type || n.type || '') === 'log_output')
    .map((n) => n.id);
  if (branchTargets.size > 1 && logNodeIds.length === 1) {
    errors.push(
      `Branching workflow has ${branchTargets.size} branch target(s) but only one log_output terminal. Use one log_output per branch path.`
    );
  }
  for (const logNodeId of logNodeIds) {
    const incoming = edges.filter((e) => e.target === logNodeId);
    const uniqueSources = new Set(incoming.map((e) => e.source));
    if (uniqueSources.size > 1) {
      errors.push(
        `log_output node "${logNodeId}" has ${uniqueSources.size} incoming sources. log_output must be single-input (no branch fan-in).`
      );
    }
    // Soft warning when source is non-merge and log is not a leaf terminal pattern.
    const outgoingFromLog = edges.filter((e) => e.source === logNodeId);
    if (outgoingFromLog.length > 0) {
      warnings.push(`log_output node "${logNodeId}" has outgoing edges; terminal logs should be sinks.`);
    }
    for (const e of incoming) {
      const sourceType = normalizedTypeById.get(e.source) || '';
      const sourceDef = unifiedNodeRegistry.get(sourceType);
      if ((sourceDef?.tags || []).includes('merge')) {
        warnings.push(
          `log_output "${logNodeId}" is fed by merge "${e.source}". Prefer one branch-specific log_output per branch before merge when branch-level observability is required.`
        );
      }
    }
  }

  // 3. Validate node configurations (registry + fill-mode aware)
  for (const node of nodes) {
    const nodeType = node.data?.type || node.type;
    const config =
      (nodeType === 'if_else'
        ? normalizeIfElseConfig((node.data?.config || {}) as Record<string, unknown>)
        : (node.data?.config || {})) as Record<string, unknown>;
    const def = unifiedNodeRegistry.get(nodeType);

    if (def) {
      const requiredFields = def.requiredInputs || [];
      for (const fieldName of requiredFields) {
        const mode = resolveEffectiveFieldFillMode(fieldName, def.inputSchema, config as Record<string, any>);
        const value = (config as Record<string, unknown>)[fieldName];
        const missing =
          value === undefined ||
          value === null ||
          (typeof value === 'string' && value.trim() === '') ||
          (Array.isArray(value) && value.length === 0);
        // Runtime AI ownership means required static value may be intentionally deferred.
        if (missing && mode === 'runtime_ai') {
          warnings.push(
            `Node "${node.data?.label || node.id}" defers required field "${fieldName}" to runtime_ai`
          );
        }
      }

      const configValidation = unifiedNodeRegistry.validateConfig(nodeType, config as Record<string, any>);
      if (!configValidation.valid) {
        errors.push(
          ...configValidation.errors.map(
            (e) => `Node "${node.data?.label || node.id}" (${nodeType}) invalid config: ${e}`
          )
        );
      }
    }

    if (nodeType === 'if_else') {
      const normalizedIfElse = normalizeIfElseConfig(config as Record<string, unknown>);
      const conditionErrors = validateCanonicalIfElseConditions(normalizedIfElse.conditions);
      if (conditionErrors.length > 0) {
        errors.push(
          ...conditionErrors.map(
            (e) => `Node "${node.data?.label || node.id}" (if_else) invalid canonical conditions: ${e}`
          )
        );
      }
    }

    if (nodeType === 'switch') {
      const caseNames = extractSwitchCasePortNames(config as Record<string, any>);
      const nCases = caseNames.length;
      if (nCases >= 2) {
        const outgoing = edges.filter((e) => e.source === node.id);
        const branchOut = outgoing.filter((e) => {
          const t = String((e as { type?: string }).type ?? '');
          return t.length > 0 && t !== 'main';
        });
        if (branchOut.length > 0 && branchOut.length !== nCases) {
          warnings.push(
            `Switch node "${node.data?.label || node.id}" defines ${nCases} case(s) in config but has ${branchOut.length} non-main outgoing edge(s). Align the graph with the switch cases.`
          );
        }
      }
    }

    if (nodeType === 'form') {
      const fields = (config as any).fields;
      if (Array.isArray(fields)) {
        const seen = new Set<string>();
        for (let i = 0; i < fields.length; i++) {
          const field = fields[i] || {};
          const key = String(field.key || field.name || '').trim();
          const label = String(field.label || '').trim();
          if (!key) {
            errors.push(`Form node "${node.data?.label || node.id}" field[${i}] is missing key/name`);
            continue;
          }
          if (key.length > 32) {
            errors.push(`Form node "${node.data?.label || node.id}" field "${key}" exceeds max key length 32`);
          }
          if (!/^[a-z0-9_]+$/.test(key)) {
            errors.push(`Form node "${node.data?.label || node.id}" field "${key}" must use lowercase snake_case`);
          }
          if (seen.has(key)) {
            errors.push(`Form node "${node.data?.label || node.id}" has duplicate field key "${key}"`);
          }
          seen.add(key);
          if (label.length > 40) {
            errors.push(`Form node "${node.data?.label || node.id}" field "${key}" exceeds max label length 40`);
          }
        }
      }
    }

    // Add more node-specific validations as needed
  }

  const readiness = validateStructuralReadiness(nodes, { strict: false });
  warnings.push(...readiness.warnings);

  const ifElseFormBinding = validateIfElseConditionsAgainstUpstreamForm({
    nodes,
    edges,
    metadata: {},
  } as Workflow);
  errors.push(...ifElseFormBinding.errors);

  // 4. Check for cycles (basic check - full cycle detection would require DFS)
  const hasIncomingEdges = new Set(edges.map(e => e.target));
  const hasOutgoingEdges = new Set(edges.map(e => e.source));
  const isolatedNodes = nodes.filter(n => 
    !hasIncomingEdges.has(n.id) && !hasOutgoingEdges.has(n.id) && 
    !isTriggerNode(n) // Use helper to check if node is a trigger
  );

  if (isolatedNodes.length > 0) {
    warnings.push(`Found ${isolatedNodes.length} isolated node(s) that are not connected to the workflow`);
  }

  // 4.5 Strict DAG policy: workflow graph must remain acyclic.
  // Repetition must be represented via loop node semantics, not graph back-edges.
  if (hasDirectedCycle(nodes, edges)) {
    errors.push('Workflow graph contains a cycle. Keep DAG structure and use loop node semantics for repetition.');
  }

  if (metadata?.buildManifest && metadata.freezeBoundary?.frozen) {
    const wf = { nodes, edges } as Workflow;
    const match = workflowAuthorizedMultisetMatches(wf, metadata.buildManifest);
    if (!match.ok) {
      errors.push(match.detail ?? 'Graph does not match persisted build manifest');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    canSave: errors.length === 0, // Only block save if there are errors
  };
}

/**
 * Normalize workflow before validation
 * Applies migrations and fixes common issues
 */
export function normalizeWorkflowForSave(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  options?: NormalizeWorkflowForSaveOptions
): { nodes: WorkflowNode[]; edges: WorkflowEdge[]; migrationsApplied: string[] } {
  const migrationsApplied: string[] = [];
  const structuralMode = options?.structuralMode ?? 'full';
  const configOnly = structuralMode === 'configOnly';
  const postFreezeReadonly = structuralMode === 'post_freeze_readonly';
  const alreadyAppliedSet = new Set<string>(options?.alreadyApplied ?? []);

  // Post-freeze readonly mode: never mutate workflow shape/config.
  if (postFreezeReadonly) {
    return {
      nodes: Array.isArray(nodes) ? [...nodes] : [],
      edges: Array.isArray(edges) ? [...edges] : [],
      migrationsApplied,
    };
  }

  // ✅ STEP 1: Deduplicate nodes by ID (keep first occurrence)
  const nodeMap = new Map<string, WorkflowNode>();
  const duplicateNodeIds: string[] = [];
  
  for (const node of nodes) {
    if (nodeMap.has(node.id)) {
      duplicateNodeIds.push(node.id);
      console.warn(`[NormalizeWorkflow] Found duplicate node ID: ${node.id}, keeping first occurrence`);
    } else {
      nodeMap.set(node.id, node);
    }
  }
  
  if (duplicateNodeIds.length > 0) {
    migrationsApplied.push(`Removed ${duplicateNodeIds.length} duplicate node(s) by ID: ${duplicateNodeIds.join(', ')}`);
  }
  
  let normalizedNodes = Array.from(nodeMap.values());
  
  // ✅ STEP 2: Deduplicate trigger nodes (keep only the first one)
  // Use isTriggerNode helper to recognize ALL nodes from triggers category
  const triggerNodes = normalizedNodes.filter(n => isTriggerNode(n));
  
  if (!configOnly && triggerNodes.length > 1) {
    // Keep the first trigger, remove the rest
    const firstTriggerId = triggerNodes[0].id;
    const removedTriggerIds = triggerNodes.slice(1).map(t => t.id);
    
    normalizedNodes = normalizedNodes.filter(n => 
      !isTriggerNode(n) || n.id === firstTriggerId
    );
    
    // Remove edges connected to removed triggers
    edges = edges.filter(e => 
      !removedTriggerIds.includes(e.source) && !removedTriggerIds.includes(e.target)
    );
    
    migrationsApplied.push(`Removed ${removedTriggerIds.length} duplicate trigger node(s), keeping: ${firstTriggerId}`);
  }
  
  // ✅ STEP 3: Normalize node configurations (migrations)
  normalizedNodes = normalizedNodes.map(node => {
    const nodeType = node.data?.type || node.type;
    const config = { ...(node.data?.config || {}) };

    // Canonicalize If/Else config using the shared contract normalizer.
    const ifelseMigKey = `ifelse_canonicalize_${node.id}`;
    if (nodeType === 'if_else' && !alreadyAppliedSet.has(ifelseMigKey)) {
      const before = JSON.stringify(config);
      const normalized = normalizeIfElseConfig(config as Record<string, unknown>);
      const after = JSON.stringify(normalized);
      Object.assign(config, normalized);
      if (before !== after) {
        migrationsApplied.push(ifelseMigKey);
        console.log(`[NormalizeWorkflow] Applied migration: ${ifelseMigKey}`);
      }
    } else if (nodeType === 'if_else' && alreadyAppliedSet.has(ifelseMigKey)) {
      console.log(`[NormalizeWorkflow] Skipped migration (already applied): ${ifelseMigKey}`);
    }

    return {
      ...node,
      data: {
        ...node.data,
        config,
      },
    };
  });

  // Normalize form field identities globally before edge validation.
  const normalizedWorkflow = normalizeWorkflowFormFieldIdentities({
    nodes: normalizedNodes as any,
    edges: edges as any,
  } as any);
  normalizedNodes = (normalizedWorkflow.nodes || normalizedNodes) as any;
  
  // ✅ STEP 4: Canonicalize branching edge semantics BEFORE edge deduplication.
  // Without this, two outgoing edges from if_else with missing sourceHandle collide on the
  // dedupe key and one branch is silently deleted, causing backend rewire on save.
  try {
    const nodeTypeById = new Map<string, string>(
      normalizedNodes.map((n) => [n.id, String(n.data?.type || n.type || '')])
    );

    // Group outgoing edges by source for branching nodes.
    const outgoingBySource = new Map<string, WorkflowEdge[]>();
    for (const e of edges) {
      if (!outgoingBySource.has(e.source)) outgoingBySource.set(e.source, []);
      outgoingBySource.get(e.source)!.push(e);
    }

    const patched: WorkflowEdge[] = edges.map((e) => ({ ...e }));

    const findInPatched = (id?: string, fallback?: WorkflowEdge) => {
      if (!id) return fallback;
      return patched.find((x) => x.id === id) || fallback;
    };

    for (const [sourceId, outEdges] of outgoingBySource.entries()) {
      const sourceType = (nodeTypeById.get(sourceId) || '').toLowerCase();
      if (!sourceType) continue;

      // if_else: ensure each outgoing edge has explicit sourceHandle 'true'/'false'
      if (sourceType === 'if_else') {
        const normalizedOut = outEdges.map((e) => findInPatched(e.id, e)!);
        const used = new Set<string>();

        // 1) Prefer explicit sourceHandle
        for (const e of normalizedOut) {
          const h = String(e.sourceHandle || '').toLowerCase();
          if (h === 'true' || h === 'false') used.add(h);
        }
        // 2) Fall back to edge "type" if present
        for (const e of normalizedOut) {
          if (e.sourceHandle) continue;
          const t = (e as any).type;
          const tt = typeof t === 'string' ? t.toLowerCase() : '';
          if (tt === 'true' || tt === 'false') {
            e.sourceHandle = tt;
            used.add(tt);
          }
        }
        // 3) If still missing, assign remaining handle deterministically
        for (const e of normalizedOut) {
          const h = String(e.sourceHandle || '').toLowerCase();
          if (h === 'true' || h === 'false') continue;
          const next = used.has('true') ? (used.has('false') ? null : 'false') : 'true';
          if (next) {
            e.sourceHandle = next;
            used.add(next);
          }
        }

        // 4) Keep edge.type consistent with branch handle when available
        for (const e of normalizedOut) {
          const h = String(e.sourceHandle || '').toLowerCase();
          if (h === 'true' || h === 'false') {
            (e as any).type = h;
          }
        }
      }

      // switch: canonicalize to semantic case value handles
      if (sourceType === 'switch') {
        const sourceNode = normalizedNodes.find((n) => n.id === sourceId);
        const switchCasePorts = extractSwitchCasePortNames(
          (sourceNode?.data?.config || {}) as Record<string, any>
        );
        const normalizedOut = outEdges.map((e) => findInPatched(e.id, e)!);
        for (const e of normalizedOut) {
          // When sourceHandle is the generic fallback ('output'/'default'), prefer edge.type
          // which may carry the real semantic case label (e.g. 'failed', 'pending', 'success').
          const rawHandle = String(e.sourceHandle || '');
          const isGenericHandle = !rawHandle || rawHandle === 'output' || rawHandle === 'default';
          const current = String(
            (isGenericHandle ? '' : rawHandle) || (e as any).type || rawHandle
          ).trim();
          if (!current) continue;
          const positionalMatch = /^case_(\d+)$/i.exec(current);
          if (!positionalMatch) {
            // Keep semantic handles as-is, and sync edge.type for deterministic branch matching.
            e.sourceHandle = current;
            (e as any).type = current;
            continue;
          }

          const caseIndex = parseInt(positionalMatch[1], 10) - 1;
          const semanticHandle = switchCasePorts[caseIndex];
          if (semanticHandle) {
            const switchMigKey = `migrated_switch_handle_${sourceId}_case_${caseIndex + 1}_to_${semanticHandle}`;
            if (!alreadyAppliedSet.has(switchMigKey)) {
              e.sourceHandle = semanticHandle;
              (e as any).type = semanticHandle;
              migrationsApplied.push(switchMigKey);
              console.log(`[NormalizeWorkflow] Applied migration: ${switchMigKey}`);
            } else {
              console.log(`[NormalizeWorkflow] Skipped migration (already applied): ${switchMigKey}`);
            }
          } else {
            // Keep positional values only as migration fallback when switch config is not hydrated.
            e.sourceHandle = current;
            (e as any).type = current;
          }
        }
      }
    }

    edges = patched;
  } catch (e) {
    // Non-fatal: normalization continues; downstream orchestrator/validator will surface issues.
    console.warn('[NormalizeWorkflow] Branch edge canonicalization skipped (non-fatal):', e);
  }

  // ✅ STEP 5: Build node ID set for edge validation
  const validNodeIds = new Set(normalizedNodes.map(n => n.id));
  
  // ✅ STEP 6: Deduplicate and validate edges
  const edgeMap = new Map<string, WorkflowEdge>();
  const invalidEdges: string[] = [];
  
  for (const edge of edges) {
    // Validate edge references valid nodes
    if (!validNodeIds.has(edge.source) || !validNodeIds.has(edge.target)) {
      invalidEdges.push(edge.id || `${edge.source}->${edge.target}`);
      console.warn(`[NormalizeWorkflow] Removing invalid edge: ${edge.id} (references non-existent nodes)`);
      continue;
    }
    
    // Deduplicate edges by source, target, and handles
    const key = `${edge.source}::${edge.target}::${edge.sourceHandle || 'default'}::${edge.targetHandle || 'default'}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, edge);
    } else {
      console.warn(`[NormalizeWorkflow] Removing duplicate edge: ${edge.id} (same as ${edgeMap.get(key)?.id})`);
    }
  }
  
  const normalizedEdges = Array.from(edgeMap.values());

  if (invalidEdges.length > 0) {
    migrationsApplied.push(`Removed ${invalidEdges.length} invalid edge(s) referencing non-existent nodes`);
  }
  
  if (edges.length !== normalizedEdges.length) {
    migrationsApplied.push(`Deduplicated ${edges.length - normalizedEdges.length} duplicate edge(s)`);
  }
  
  // ✅ STEP 6: Validate edge structure (prevent first node from connecting to all nodes)
  // This is a sanity check - if a single node has too many outgoing edges, it might indicate corruption
  const outgoingEdgeCount = new Map<string, number>();
  for (const edge of normalizedEdges) {
    outgoingEdgeCount.set(edge.source, (outgoingEdgeCount.get(edge.source) || 0) + 1);
  }
  
  for (const [nodeId, count] of outgoingEdgeCount.entries()) {
    if (count > 10) { // Arbitrary threshold - if a node connects to more than 10 nodes, it's suspicious
      const node = normalizedNodes.find(n => n.id === nodeId);
      const warning = `Node "${node?.data?.label || nodeId}" has ${count} outgoing edges - possible graph corruption`;
      console.warn(`[NormalizeWorkflow] ${warning}`);
      migrationsApplied.push(warning);
    }
  }
  
  // Switch-only: reconcile edges when switch nodes have cases (repair branch wiring without AI)
  let finalNodes = normalizedNodes;
  let finalEdges = normalizedEdges;
  const hasSwitchWithCases = finalNodes.some(n => {
    const t = n.data?.type || n.type;
    if (t !== 'switch') return false;
    const cfg = n.data?.config || {};
    const c = (cfg as { cases?: unknown }).cases;
    return Array.isArray(c) && c.length > 0;
  });
  const switchReconcileMigKey = 'reconciled_switch_graph';
  if (!configOnly && hasSwitchWithCases && !alreadyAppliedSet.has(switchReconcileMigKey)) {
    try {
      const wf: Workflow = { nodes: finalNodes as any, edges: finalEdges as any };
      const rec = unifiedGraphOrchestrator.reconcileWorkflow(wf);
      finalNodes = rec.workflow.nodes as any;
      finalEdges = rec.workflow.edges as any;
      migrationsApplied.push(switchReconcileMigKey);
      console.log(`[NormalizeWorkflow] Applied migration: ${switchReconcileMigKey}`);
    } catch (e) {
      console.warn('[NormalizeWorkflow] switch reconcile skipped:', e);
    }
  } else if (!configOnly && hasSwitchWithCases && alreadyAppliedSet.has(switchReconcileMigKey)) {
    console.log(`[NormalizeWorkflow] Skipped migration (already applied): ${switchReconcileMigKey}`);
  }

  // ✅ TELEMETRY: Structured logging for normalization fixes
  if (migrationsApplied.length > 0) {
    const duplicateTriggersRemoved = triggerNodes.length > 1 ? triggerNodes.length - 1 : 0;
    const orphanNodes = normalizedNodes.filter(n => {
      const hasIncoming = normalizedEdges.some(e => e.target === n.id);
      const hasOutgoing = normalizedEdges.some(e => e.source === n.id);
      const isTrigger = isTriggerNode(n);
      return !hasIncoming && !hasOutgoing && !isTrigger;
    });
    
    const telemetry = {
      timestamp: new Date().toISOString(),
      fixes: {
        duplicateNodesRemoved: duplicateNodeIds.length,
        duplicateTriggersRemoved,
        invalidEdgesRemoved: invalidEdges.length,
        duplicateEdgesRemoved: edges.length - normalizedEdges.length,
        orphanNodesRemoved: orphanNodes.length,
      },
      nodeIds: normalizedNodes.map(n => n.id),
      removedNodeIds: [
        ...duplicateNodeIds,
        ...(triggerNodes.length > 1 ? triggerNodes.slice(1).map(t => t.id) : []),
      ],
      migrationsApplied,
    };
    
    // Log structured telemetry (can be sent to monitoring system)
    console.log('[NormalizeWorkflow] 📊 Telemetry:', JSON.stringify(telemetry, null, 2));
  }

  return {
    nodes: finalNodes,
    edges: finalEdges,
    migrationsApplied,
  };
}
