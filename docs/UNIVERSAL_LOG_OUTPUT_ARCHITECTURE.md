# Universal Log Output Architecture - Registry-Driven Approach

## 🎯 Objective

Implement `log_output` as **always-final node** using **registry-driven architecture** (no hardcoding).

**Key Principle**: Define workflow-level behaviors in the **registry**, not in workflow builders or policies.

---

## 🏗️ Architecture Design

### **Phase 1: Extend UnifiedNodeDefinition Contract**

**Location**: `worker/src/core/types/unified-node-contract.ts`

**Add new field to `UnifiedNodeDefinition`**:

```typescript
export interface UnifiedNodeDefinition {
  // ... existing fields ...
  
  // ============================================
  // WORKFLOW-LEVEL BEHAVIORS (Registry-Driven)
  // ============================================
  /**
   * Workflow-level behaviors that apply to ALL workflows
   * These are defined in the registry, not hardcoded in builders
   */
  workflowBehavior?: {
    /**
     * Always required in workflows (auto-included even if not in intent)
     * Example: log_output (universal final output)
     */
    alwaysRequired?: boolean;
    
    /**
     * Must be terminal node (no outgoing edges, always last)
     * Example: log_output (must be final node)
     */
    alwaysTerminal?: boolean;
    
    /**
     * Exempt from removal by minimal workflow policy
     * Example: log_output (should never be removed)
     */
    exemptFromRemoval?: boolean;
    
    /**
     * Auto-inject if missing (after workflow building)
     * Example: log_output (inject if not present)
     */
    autoInject?: boolean;
    
    /**
     * Injection priority (lower = higher priority)
     * Example: log_output = 0 (highest priority, inject first)
     */
    injectionPriority?: number;
  };
}
```

---

### **Phase 2: Define Behavior in Registry Override**

**Location**: `worker/src/core/registry/overrides/log-output.ts`

**Update override to define workflow behavior**:

```typescript
export function overrideLogOutput(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  return {
    ...def,
    tags: Array.from(new Set([...(def.tags || []), 'output', 'sink', 'terminal', 'logging'])),
    defaultConfig: enhancedDefaultConfig,
    
    // ✅ UNIVERSAL: Define workflow-level behavior in registry
    workflowBehavior: {
      alwaysRequired: true,        // Always include in workflows
      alwaysTerminal: true,         // Must be last node (no outgoing edges)
      exemptFromRemoval: true,      // Minimal policy can't remove it
      autoInject: true,             // Auto-inject if missing
      injectionPriority: 0,         // Highest priority (inject first)
    },
    
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
```

**Result**: `log_output` behavior is defined **once** in the registry, applies to **all workflows automatically**.

---

### **Phase 3: Registry Query Methods**

**Location**: `worker/src/core/registry/unified-node-registry.ts`

**Add query methods**:

```typescript
export class UnifiedNodeRegistry implements INodeRegistry {
  // ... existing methods ...
  
  /**
   * ✅ UNIVERSAL: Get all nodes with workflow-level behaviors
   * Used by orchestrators, policies, builders to query registry
   */
  getNodesWithBehavior(behavior: keyof NonNullable<UnifiedNodeDefinition['workflowBehavior']>): UnifiedNodeDefinition[] {
    const results: UnifiedNodeDefinition[] = [];
    for (const [type, def] of this.definitions) {
      if (def.workflowBehavior?.[behavior] === true) {
        results.push(def);
      }
    }
    return results;
  }
  
  /**
   * ✅ UNIVERSAL: Check if node has specific workflow behavior
   */
  hasWorkflowBehavior(nodeType: string, behavior: keyof NonNullable<UnifiedNodeDefinition['workflowBehavior']>): boolean {
    const def = this.get(nodeType);
    return def?.workflowBehavior?.[behavior] === true;
  }
  
  /**
   * ✅ UNIVERSAL: Get all always-required nodes (for auto-inclusion)
   */
  getAlwaysRequiredNodes(): UnifiedNodeDefinition[] {
    return this.getNodesWithBehavior('alwaysRequired');
  }
  
  /**
   * ✅ UNIVERSAL: Get all always-terminal nodes (must be last)
   */
  getAlwaysTerminalNodes(): UnifiedNodeDefinition[] {
    return this.getNodesWithBehavior('alwaysTerminal');
  }
  
  /**
   * ✅ UNIVERSAL: Get all exempt-from-removal nodes
   */
  getExemptFromRemovalNodes(): UnifiedNodeDefinition[] {
    return this.getNodesWithBehavior('exemptFromRemoval');
  }
}
```

---

### **Phase 4: Minimal Workflow Policy (Registry-Driven)**

**Location**: `worker/src/services/ai/minimal-workflow-policy.ts`

**Update to query registry instead of hardcoding**:

```typescript
// ❌ OLD WAY (Hardcoded):
if (nodeType === 'log_output') {
  // Never remove
}

// ✅ NEW WAY (Registry-Driven):
const nodeDef = unifiedNodeRegistry.get(nodeType);
if (nodeDef?.workflowBehavior?.exemptFromRemoval) {
  // Never remove - behavior defined in registry
  return { node, violation: null };
}
```

**Implementation**:

```typescript
private removeUnrequiredNodes(
  nodes: WorkflowNode[],
  requiredNodeTypesSet: Set<string>
): { filteredNodes: WorkflowNode[]; violations: PolicyViolation[] } {
  const violations: PolicyViolation[] = [];
  const filteredNodes = nodes.filter(node => {
    const nodeType = unifiedNormalizeNodeType(node);
    
    // ✅ UNIVERSAL: Check registry for exempt-from-removal behavior
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    if (nodeDef?.workflowBehavior?.exemptFromRemoval) {
      // Registry says this node should never be removed
      console.log(`[MinimalWorkflowPolicy] ✅ Preserving ${nodeType} (exempt from removal per registry)`);
      return true;
    }
    
    // ✅ UNIVERSAL: Check if node is always-required (per registry)
    if (nodeDef?.workflowBehavior?.alwaysRequired) {
      // Registry says this node is always required
      requiredNodeTypesSet.add(nodeType);
      console.log(`[MinimalWorkflowPolicy] ✅ Preserving ${nodeType} (always required per registry)`);
      return true;
    }
    
    // Standard removal logic (only if not exempt)
    if (!requiredNodeTypesSet.has(nodeType)) {
      violations.push({
        type: 'forbidden_node',
        nodeId: node.id,
        nodeType,
        reason: `Node "${nodeType}" not required by intent`,
        suggestion: 'Remove node or add to intent',
      });
      return false;
    }
    
    return true;
  });
  
  return { filteredNodes, violations };
}
```

---

### **Phase 5: DSL Generator (Registry-Driven Auto-Inclusion)**

**Location**: `worker/src/services/ai/workflow-dsl.ts`

**Update to query registry for always-required nodes**:

```typescript
// ✅ UNIVERSAL: Get always-required nodes from registry
const alwaysRequiredNodes = unifiedNodeRegistry.getAlwaysRequiredNodes();
for (const nodeDef of alwaysRequiredNodes) {
  // Check if node type already in outputs
  const alreadyInOutputs = finalOutputs.some(o => o.type === nodeDef.type);
  if (!alreadyInOutputs) {
    // Registry says this node is always required - auto-include
    finalOutputs.push({
      id: `out_${stepCounter++}`,
      type: nodeDef.type,
      operation: 'write',
      config: nodeDef.defaultConfig(),
      description: `Auto-included: ${nodeDef.label} (always required per registry)`,
      metadata: {
        autoIncluded: true,
        reason: 'alwaysRequired workflow behavior',
        source: 'registry',
      },
    });
    console.log(`[DSLGenerator] ✅ Auto-included ${nodeDef.type} (always required per registry)`);
  }
}
```

---

### **Phase 6: Orchestrator (Registry-Driven Terminal Enforcement)**

**Location**: `worker/src/core/orchestration/unified-graph-orchestrator.ts`

**Add method to ensure always-terminal nodes are terminal**:

```typescript
/**
 * ✅ UNIVERSAL: Ensure always-terminal nodes are actually terminal
 * Queries registry for nodes with alwaysTerminal behavior
 */
public ensureTerminalNodes(workflow: Workflow): {
  workflow: Workflow;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // ✅ UNIVERSAL: Query registry for always-terminal nodes
  const alwaysTerminalNodes = unifiedNodeRegistry.getAlwaysTerminalNodes();
  const alwaysTerminalTypes = new Set(alwaysTerminalNodes.map(n => n.type));
  
  // Find nodes in workflow that should be terminal
  const terminalNodesInWorkflow = workflow.nodes.filter(node => {
    const nodeType = unifiedNormalizeNodeType(node);
    return alwaysTerminalTypes.has(nodeType);
  });
  
  // Ensure they have no outgoing edges
  for (const node of terminalNodesInWorkflow) {
    const outgoingEdges = workflow.edges.filter(e => e.source === node.id);
    if (outgoingEdges.length > 0) {
      // Registry says this node must be terminal, but it has outgoing edges
      warnings.push(`Node ${node.id} (${unifiedNormalizeNodeType(node)}) should be terminal but has ${outgoingEdges.length} outgoing edge(s)`);
      
      // Remove outgoing edges (registry-driven enforcement)
      workflow = {
        ...workflow,
        edges: workflow.edges.filter(e => e.source !== node.id),
      };
      console.log(`[UnifiedGraphOrchestrator] ✅ Removed ${outgoingEdges.length} outgoing edge(s) from terminal node ${node.id}`);
    }
  }
  
  return { workflow, errors, warnings };
}
```

---

### **Phase 7: Workflow Builder (Registry-Driven Auto-Injection)**

**Location**: `worker/src/services/ai/production-workflow-builder.ts`

**Update `ensureLogOutputNode` to be registry-driven**:

```typescript
/**
 * ✅ UNIVERSAL: Ensure always-required terminal nodes exist
 * Queries registry instead of hardcoding log_output
 */
private async ensureAlwaysRequiredTerminalNodes(workflow: Workflow): Promise<Workflow> {
  // ✅ UNIVERSAL: Query registry for nodes that are both always-required and always-terminal
  const alwaysRequiredTerminalNodes = unifiedNodeRegistry
    .getAlwaysRequiredNodes()
    .filter(def => def.workflowBehavior?.alwaysTerminal === true);
  
  for (const nodeDef of alwaysRequiredTerminalNodes) {
    // Check if node already exists
    const existingNode = workflow.nodes.find(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      return nodeType === nodeDef.type;
    });
    
    if (existingNode) {
      // Node exists - ensure it's terminal (no outgoing edges)
      const outgoingEdges = workflow.edges.filter(e => e.source === existingNode.id);
      if (outgoingEdges.length > 0) {
        // Remove outgoing edges (registry says it must be terminal)
        workflow = {
          ...workflow,
          edges: workflow.edges.filter(e => e.source !== existingNode.id),
        };
        console.log(`[ProductionWorkflowBuilder] ✅ Removed ${outgoingEdges.length} outgoing edge(s) from terminal node ${existingNode.id}`);
      }
      continue;
    }
    
    // Node doesn't exist - inject it (registry says it's always required)
    const newNode: WorkflowNode = {
      id: randomUUID(),
      type: 'custom',
      position: { x: 0, y: 0 },
      data: {
        type: nodeDef.type,
        label: nodeDef.label,
        category: nodeDef.category,
        config: nodeDef.defaultConfig(),
      },
    };
    
    // Find last node in execution order
    const executionOrder = executionOrderManager.initialize(workflow);
    const orderedNodeIds = executionOrderManager.getOrderedNodeIds(executionOrder);
    const lastNodeId = orderedNodeIds[orderedNodeIds.length - 1];
    
    if (lastNodeId) {
      // Inject after last node
      const injectionResult = await unifiedGraphOrchestrator.injectNode(workflow, newNode, {
        type: 'lifecycle',
        position: 'after',
        referenceNodeId: lastNodeId,
        reason: `Auto-injected: ${nodeDef.label} (always required terminal node per registry)`,
      });
      workflow = injectionResult.workflow;
    }
  }
  
  return workflow;
}
```

---

## 📊 Implementation Flow

### **Step 1: Registry Definition** (Single Source of Truth)
```
log_output override → workflowBehavior: { alwaysRequired: true, alwaysTerminal: true, ... }
```

### **Step 2: DSL Generation** (Query Registry)
```
DSL Generator → Query registry.getAlwaysRequiredNodes() → Auto-include log_output
```

### **Step 3: Minimal Policy** (Query Registry)
```
Minimal Policy → Query registry.hasWorkflowBehavior('exemptFromRemoval') → Never remove log_output
```

### **Step 4: Orchestrator** (Query Registry)
```
Orchestrator → Query registry.getAlwaysTerminalNodes() → Ensure log_output has no outgoing edges
```

### **Step 5: Workflow Builder** (Query Registry)
```
Workflow Builder → Query registry.getAlwaysRequiredNodes() → Auto-inject log_output if missing
```

---

## ✅ Benefits

1. **Universal**: Works for **infinite workflows** (no hardcoding)
2. **Registry-Driven**: Behavior defined **once** in registry
3. **Extensible**: Can add more nodes with `alwaysRequired: true` in future
4. **Maintainable**: Change behavior in **one place** (registry override)
5. **Type-Safe**: TypeScript ensures correct usage
6. **Backward Compatible**: Existing workflows continue to work

---

## 🔄 Adding More Universal Nodes

**Future Example**: If we want `error_trigger` to always be present:

```typescript
// In error-trigger override:
workflowBehavior: {
  alwaysRequired: true,
  exemptFromRemoval: true,
  autoInject: true,
  injectionPriority: 1, // Lower priority than log_output (0)
}
```

**Result**: Automatically applies to **all workflows** without code changes.

---

## 🎯 Summary

**This approach**:
- ✅ Defines behavior in **registry** (single source of truth)
- ✅ Queries registry in **all components** (no hardcoding)
- ✅ Works for **infinite workflows** (universal)
- ✅ Extensible to **any node type** (just add to registry)
- ✅ Maintainable (change in **one place**)

**No hardcoding needed** - everything is **registry-driven**.
