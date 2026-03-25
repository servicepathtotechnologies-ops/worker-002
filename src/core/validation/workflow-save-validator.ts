/**
 * Workflow Save-Time Validator
 * 
 * Validates workflows before saving to ensure they are executable.
 * This prevents saving invalid workflows that would fail at runtime.
 */

import type { Workflow } from '../types/ai-types';
import { unifiedGraphOrchestrator } from '../orchestration/unified-graph-orchestrator';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { resolveEffectiveFieldFillMode } from '../utils/fill-mode-resolver';
import { isStructuralOwnership } from '../utils/field-ownership';

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
    const config = (node.data?.config || {}) as Record<string, unknown>;
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
      const missing =
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '') ||
        (Array.isArray(value) && value.length === 0) ||
        (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0);

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
  edges: WorkflowEdge[]
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

  // 3. Validate node configurations (registry + fill-mode aware)
  for (const node of nodes) {
    const nodeType = node.data?.type || node.type;
    const config = node.data?.config || {};
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

    // Backward-compatible specific warning retained until old payloads are fully migrated.
    if (nodeType === 'if_else' && config.conditions && !Array.isArray(config.conditions)) {
      warnings.push(`If/Else node "${node.data?.label || node.id}" has conditions in wrong format (should be array)`);
    }

    // Add more node-specific validations as needed
  }

  const readiness = validateStructuralReadiness(nodes, { strict: false });
  warnings.push(...readiness.warnings);

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
  edges: WorkflowEdge[]
): { nodes: WorkflowNode[]; edges: WorkflowEdge[]; migrationsApplied: string[] } {
  const migrationsApplied: string[] = [];
  
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
  
  if (triggerNodes.length > 1) {
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

    // Migrate If/Else conditions format
    if (nodeType === 'if_else') {
      if (config.condition && !config.conditions) {
        // Old format: condition (string) -> convert to conditions array
        const conditionStr = typeof config.condition === 'string' ? config.condition : String(config.condition);
        if (conditionStr.trim()) {
          config.conditions = [{ expression: conditionStr.trim() }];
          migrationsApplied.push(`Migrated If/Else node "${node.data?.label || node.id}" from condition to conditions array`);
        }
      } else if (config.conditions && !Array.isArray(config.conditions)) {
        // Handle case where conditions is sent as string or object
        if (typeof config.conditions === 'string') {
          config.conditions = [{ expression: config.conditions }];
          migrationsApplied.push(`Migrated If/Else node "${node.data?.label || node.id}" from string conditions to array`);
        } else if (typeof config.conditions === 'object' && config.conditions !== null) {
          const conditionsObj = config.conditions as Record<string, unknown>;
          if (conditionsObj.expression) {
            config.conditions = [config.conditions];
            migrationsApplied.push(`Migrated If/Else node "${node.data?.label || node.id}" from object conditions to array`);
          }
        }
      }
    }

    return {
      ...node,
      data: {
        ...node.data,
        config,
      },
    };
  });
  
  // ✅ STEP 4: Build node ID set for edge validation
  const validNodeIds = new Set(normalizedNodes.map(n => n.id));
  
  // ✅ STEP 5: Deduplicate and validate edges
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
  if (hasSwitchWithCases) {
    try {
      const wf: Workflow = { nodes: finalNodes as any, edges: finalEdges as any };
      const rec = unifiedGraphOrchestrator.reconcileWorkflow(wf);
      finalNodes = rec.workflow.nodes as any;
      finalEdges = rec.workflow.edges as any;
      migrationsApplied.push('reconciled_switch_graph');
    } catch (e) {
      console.warn('[NormalizeWorkflow] switch reconcile skipped:', e);
    }
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
