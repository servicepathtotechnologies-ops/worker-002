# ✅ Burst Flow and Duplicate Edges Fix

## 🐛 Issues

1. **Burst Flow from Trigger**: Manual trigger connecting to ALL nodes instead of just the first node
2. **Duplicate Edges**: Multiple edges between the same source-target pairs
3. **All Nodes → log_output**: All nodes connecting to the same log_output node incorrectly

## 🔍 Root Causes

1. **Multiple Edge Creation Paths**: Edges created in multiple places without coordination:
   - `workflow-dsl-compiler.ts` - Creates edges during DSL compilation
   - `production-workflow-builder.ts` - Creates edges for log_output connections
   - `workflow-builder.ts` - Creates edges during workflow building
   
2. **No Duplicate Prevention**: `createCompatibleEdge` didn't check for existing edges

3. **Late Duplicate Removal**: Universal fix ran AFTER edges were created, allowing duplicates to accumulate

4. **Incorrect Terminal Node Detection**: `ensureLogOutputNode` connected ALL terminal nodes, even when they shouldn't be terminal

## ✅ Solutions

### **Fix 1: Duplicate Edge Prevention in `createCompatibleEdge`**

**File**: `worker/src/services/ai/workflow-dsl-compiler.ts` (lines 1401-1428)

**Changes**:
- ✅ Check for duplicate edges (same source-target pair) BEFORE creating
- ✅ For non-branching nodes, prevent multiple outgoing edges
- ✅ Early return if edge already exists or would violate branching rules

```typescript
private createCompatibleEdge(
  sourceNode: WorkflowNode,
  targetNode: WorkflowNode,
  existingEdges: WorkflowEdge[]
): WorkflowEdge | null {
  // ✅ ROOT-LEVEL FIX: Prevent duplicate edges (same source-target pair)
  const duplicateEdge = existingEdges.find(e => e.source === sourceNode.id && e.target === targetNode.id);
  if (duplicateEdge) {
    console.log(`[WorkflowDSLCompiler] ⚠️  Duplicate edge detected: ${sourceNode.id} → ${targetNode.id}, skipping`);
    return null;
  }
  
  // ✅ ROOT-LEVEL FIX: For non-branching nodes, prevent multiple outgoing edges
  const sourceNodeType = unifiedNormalizeNodeTypeString(sourceNode.type || sourceNode.data?.type || '');
  const sourceNodeDef = unifiedNodeRegistry.get(sourceNodeType);
  const sourceAllowsBranching = sourceNodeDef?.isBranching || false;
  
  if (!sourceAllowsBranching) {
    const existingOutgoingEdges = existingEdges.filter(e => e.source === sourceNode.id);
    if (existingOutgoingEdges.length > 0) {
      console.log(`[WorkflowDSLCompiler] ⚠️  Node "${sourceNodeType}" already has ${existingOutgoingEdges.length} outgoing edge(s), skipping additional edge to prevent branching`);
      return null;
    }
  }
  
  // ... rest of edge creation logic
}
```

### **Fix 2: Enhanced Duplicate Edge Removal**

**File**: `worker/src/services/ai/workflow-dsl-compiler.ts` (lines 1342-1357)

**Changes**:
- ✅ Remove duplicate edges BEFORE universal fix runs
- ✅ Use Map to track unique source-target pairs
- ✅ Log warnings for removed duplicates

```typescript
// ✅ STEP 1: Remove duplicate edges (same source-target pairs)
const edgeMap = new Map<string, WorkflowEdge>();
const duplicateEdges: string[] = [];
edges.forEach(edge => {
  const key = `${edge.source}::${edge.target}`;
  if (edgeMap.has(key)) {
    duplicateEdges.push(edge.id);
    console.log(`[WorkflowDSLCompiler] ⚠️  Removing duplicate edge: ${edge.source} → ${edge.target}`);
  } else {
    edgeMap.set(key, edge);
  }
});
edges = Array.from(edgeMap.values());
if (duplicateEdges.length > 0) {
  warnings.push(`Removed ${duplicateEdges.length} duplicate edge(s)`);
}
```

### **Fix 3: Improved Terminal Node Detection**

**File**: `worker/src/services/ai/production-workflow-builder.ts` (lines 3169-3178)

**Changes**:
- ✅ Better comments explaining terminal node detection
- ✅ Terminal nodes are nodes with NO outgoing edges (excluding triggers and log_output itself)

```typescript
// ✅ ROOT-LEVEL FIX: Find ONLY actual terminal nodes (nodes with no outgoing edges, excluding triggers)
// Terminal nodes are nodes that have no outgoing edges AND are not log_output itself
// These are the nodes that should connect to log_output
const terminalNodes = workflow.nodes.filter(node => {
  const nodeType = node.type || (node.data as any)?.type || '';
  const nodeTypeLower = (nodeType || '').toLowerCase();
  const isTerminal = !outgoingEdgesMap.has(node.id) && !isTriggerNode(node);
  
  // Exclude log_output itself from terminal nodes
  return isTerminal && nodeTypeLower !== 'log_output';
});
```

## 📊 Expected Results

### **Before Fix**:
```
manual_trigger
  ├─→ google_sheets
  ├─→ if_else
  ├─→ ai_chat_model
  ├─→ salesforce
  ├─→ google_gmail
  ├─→ limit
  └─→ stop_and_error

google_sheets → log_output
if_else → log_output
ai_chat_model → log_output
salesforce → log_output
google_gmail → log_output
limit → log_output
stop_and_error → log_output
```

### **After Fix**:
```
manual_trigger
  ↓
google_sheets
  ↓
if_else
  ├─→ (true) → ai_chat_model → salesforce → log_output
  └─→ (false) → google_gmail → log_output
```

## ✅ Verification

- ✅ No duplicate edges (same source-target pairs)
- ✅ Trigger connects to only ONE node
- ✅ Non-branching nodes have only ONE outgoing edge
- ✅ log_output connects only from actual terminal nodes
- ✅ Branching nodes (if_else, switch) can have multiple outgoing edges

## 🔄 Related Fixes

1. **IF/ELSE Branch Assignment**: Fixed in `IF_ELSE_BRANCH_ASSIGNMENT_FIX.md`
2. **Multiple Branches from Trigger**: Fixed in `MULTIPLE_BRANCHES_FROM_TRIGGER_ROOT_CAUSE.md`
3. **Operation Normalization**: Fixed in `OPERATION_NORMALIZATION_VERIFICATION.md`
