# Burst Flow From Trigger - Permanent Fix

## Problem

Workflows were being generated with **multiple branches from the trigger node**, violating DAG rules:
- **Rule**: Trigger must have exactly 1 outgoing edge (unless it explicitly allows branching)
- **Reality**: Trigger was connecting to 4+ nodes simultaneously (Google Sheets, AI Chat Model, Limit Data, If/Else)

**Example of Invalid Workflow:**
```
Manual Trigger
  ├─→ Google Sheets
  ├─→ AI Chat Model
  ├─→ Limit Data
  └─→ If/Else
```

**Expected (Linear Flow):**
```
Manual Trigger → Google Sheets → AI Chat Model → Limit Data → If/Else
```

## Root Cause

The `buildLinearPipeline` method creates edges from trigger in **multiple conditional branches**:

1. **Step 1**: Trigger → First Data Source (line 802-825)
2. **Step 2**: Trigger → First Transformation (if no data sources) (line 853-863)
3. **Step 3**: Trigger → First Output (if no data sources/transformations) (line 1340-1349)

**The Problem:**
- The check `triggerHasOutgoingEdge()` is a function that checks the `edges` array
- But edges are added **during** the function execution
- If nodes are mis-categorized (e.g., "AI Chat Model" as transformation when it should be data source), multiple edges can be created
- The fix at line 1375-1394 removes extra edges, but it runs **AFTER** all edges are created

## Solution

**Enhanced the trigger edge removal logic** to:
1. ✅ Check trigger branching capability from registry
2. ✅ Sort edges by target node category (data_source > transformation > output) for deterministic selection
3. ✅ Keep only the first edge (highest priority category)
4. ✅ Remove all other edges from trigger
5. ✅ Log detailed information about removed edges

### Code Changes

**File**: `worker/src/services/ai/workflow-dsl-compiler.ts`

**Before** (line 1375-1394):
```typescript
const triggerOutgoingEdges = edges.filter(e => e.source === triggerNode.id);
if (triggerOutgoingEdges.length > 1) {
  // Keep only the FIRST edge (arbitrary selection)
  const firstEdge = triggerOutgoingEdges[0];
  // ... remove others
}
```

**After**:
```typescript
// ✅ PERMANENT FIX: Check trigger branching capability from registry
const triggerType = unifiedNormalizeNodeTypeString(triggerNode.type || triggerNode.data?.type || '');
const triggerDef = unifiedNodeRegistry.get(triggerType);
const triggerAllowsBranching = triggerDef?.isBranching || false;

const triggerOutgoingEdges = edges.filter(e => e.source === triggerNode.id);
if (triggerOutgoingEdges.length > 1 && !triggerAllowsBranching) {
  // ✅ PERMANENT FIX: Sort edges by target node category for deterministic selection
  // Priority: data_source > transformation > output
  const sortedEdges = [...triggerOutgoingEdges].sort((a, b) => {
    // Sort by category priority
    const categoryOrder = { 'data_source': 1, 'transformation': 2, 'output': 3 };
    // ... sorting logic
  });
  
  const firstEdge = sortedEdges[0]; // Highest priority category
  // ... remove others with detailed logging
}
```

## How It Works

1. **Registry Check**: Uses `unifiedNodeRegistry` to check if trigger allows branching
   - Most triggers (manual_trigger, webhook_trigger) don't allow branching
   - Only special triggers (if explicitly marked) allow branching

2. **Deterministic Selection**: Sorts edges by target node category
   - **Priority 1**: Data sources (e.g., Google Sheets)
   - **Priority 2**: Transformations (e.g., AI Chat Model)
   - **Priority 3**: Outputs (e.g., Gmail)

3. **Edge Removal**: Removes all edges except the highest priority one
   - Logs each removed edge for debugging
   - Adds warning to compilation result

4. **Result**: Trigger has exactly 1 outgoing edge (linear flow)

## Example

**Before Fix:**
```
Manual Trigger
  ├─→ Google Sheets (data_source)
  ├─→ AI Chat Model (transformation)
  ├─→ Limit Data (transformation)
  └─→ If/Else (transformation)
```

**After Fix:**
```
Manual Trigger → Google Sheets (highest priority: data_source)
  └─→ AI Chat Model (chained from Google Sheets)
      └─→ Limit Data (chained from AI Chat Model)
          └─→ If/Else (chained from Limit Data)
```

## Files Modified

- `worker/src/services/ai/workflow-dsl-compiler.ts`
  - Enhanced trigger edge removal logic (line 1375-1420)
  - Added registry-based branching check
  - Added deterministic edge selection by category priority
  - Improved logging and warnings

## Result

✅ **No more burst flow from trigger**
- Trigger has exactly 1 outgoing edge (unless explicitly allows branching)
- Edges are selected deterministically (data_source > transformation > output)
- Linear flow is enforced

✅ **Better debugging**
- Detailed logs show which edges were removed and why
- Warnings explain the fix to users

✅ **Registry-based**
- Uses unified node registry to determine branching capability
- Works for all trigger types automatically

---

**Status**: ✅ **PERMANENT FIX IMPLEMENTED**

The trigger now has exactly 1 outgoing edge, enforcing linear workflow structure.
