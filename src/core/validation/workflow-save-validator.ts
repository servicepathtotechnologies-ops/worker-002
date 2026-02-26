/**
 * Workflow Save-Time Validator
 * 
 * Validates workflows before saving to ensure they are executable.
 * This prevents saving invalid workflows that would fail at runtime.
 */

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

export interface SaveValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  canSave: boolean; // Whether save should be allowed
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

  // 3. Validate node configurations
  for (const node of nodes) {
    const nodeType = node.data?.type || node.type;
    const config = node.data?.config || {};

    // Validate If/Else conditions
    if (nodeType === 'if_else') {
      if (!config.conditions && !config.condition) {
        errors.push(`If/Else node "${node.data?.label || node.id}" is missing conditions`);
      } else if (config.conditions && !Array.isArray(config.conditions)) {
        // This will be normalized, but warn about it
        warnings.push(`If/Else node "${node.data?.label || node.id}" has conditions in wrong format (should be array)`);
      }
    }

    // Add more node-specific validations as needed
  }

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

  // 5. Validate required node inputs (basic check)
  // Full validation happens at attach-inputs time, but we can check for obvious issues
  for (const node of nodes) {
    const nodeType = node.data?.type || node.type;
    if (nodeType === 'if_else') {
      const config = node.data?.config || {};
      if (config.conditions && Array.isArray(config.conditions)) {
        for (let i = 0; i < config.conditions.length; i++) {
          const cond = config.conditions[i];
          if (typeof cond === 'object' && cond !== null && cond.expression) {
            if (typeof cond.expression !== 'string' || cond.expression.trim() === '') {
              errors.push(`If/Else node "${node.data?.label || node.id}" has empty condition at index ${i}`);
            }
          }
        }
      }
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
    nodes: normalizedNodes,
    edges: normalizedEdges,
    migrationsApplied,
  };
}
