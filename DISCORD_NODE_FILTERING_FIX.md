# 🔧 Discord Node Filtering Fix - Multi-Layer Defense

## Problem

Discord node is still appearing in workflows even when:
- User selected variation only mentions "Slack"
- Explicit extraction should detect `slack_message`
- Blocked nodes should include `discord`

## Root Cause

Discord was being added at multiple points in the pipeline:
1. **`determineRequiredNodes`** - May detect Discord from SimpleIntent
2. **`addImplicitNodes`** - Only filters when ADDING nodes, not existing ones
3. **`buildStructuredIntent`** - Doesn't filter blocked nodes at all

## Solution: Multi-Layer Defense

### Layer 1: Filter After `determineRequiredNodes`
**Location**: `intent-aware-planner.ts` (line 98-107)

Filters blocked nodes immediately after initial node detection:

```typescript
// ✅ CRITICAL FIX: Filter blocked nodes BEFORE enforcing mandatory nodes
if (blockedNodeTypes && blockedNodeTypes.size > 0) {
  const beforeFilter = nodeRequirements.length;
  nodeRequirements = nodeRequirements.filter(node => {
    if (blockedNodeTypes.has(node.type)) {
      console.log(`[IntentAwarePlanner] 🚫 Filtering out blocked node: ${node.type}`);
      return false;
    }
    return true;
  });
}
```

### Layer 2: Final Filter Before `buildStructuredIntent`
**Location**: `intent-aware-planner.ts` (line 122-135)

Final safety net after all implicit nodes are added:

```typescript
// ✅ CRITICAL FIX: Filter blocked nodes from completeNodes before building StructuredIntent
let finalNodes = completeNodes;
if (blockedNodeTypes && blockedNodeTypes.size > 0) {
  finalNodes = finalNodes.filter(node => {
    if (blockedNodeTypes.has(node.type)) {
      console.log(`[IntentAwarePlanner] 🚫 Final filter: Removing blocked node: ${node.type}`);
      return false;
    }
    return true;
  });
}
```

### Layer 3: Filter in `buildStructuredIntent`
**Location**: `intent-aware-planner.ts` (line 1390-1411)

Filters blocked nodes when building actions:

```typescript
private buildStructuredIntent(
  nodes: NodeRequirement[],
  executionOrder: string[],
  intent: SimpleIntent,
  blockedNodeTypes?: Set<string> // ✅ CRITICAL: Pass blocked nodes to filter
): StructuredIntent {
  // ✅ CRITICAL FIX: Filter blocked nodes before categorizing
  let filteredNodes = nodes;
  if (blockedNodeTypes && blockedNodeTypes.size > 0) {
    filteredNodes = nodes.filter(node => {
      if (blockedNodeTypes.has(node.type)) {
        console.log(`[IntentAwarePlanner] 🚫 buildStructuredIntent: Filtering out blocked node: ${node.type}`);
        return false;
      }
      return true;
    });
  }
  // ... rest of method uses filteredNodes
}
```

## Flow After Fix

```
1. User selects variation: "Finalize by sending results via Slack"
   ↓
2. Extract explicit nodes: slack_message ✅
   ↓
3. Derive blocked nodes: discord, telegram, etc. ✅
   ↓
4. determineRequiredNodes() → May detect discord ❌
   ↓
5. **LAYER 1**: Filter blocked nodes → discord removed ✅
   ↓
6. addImplicitNodes() → Adds slack_message ✅
   ↓
7. **LAYER 2**: Final filter → discord removed (safety net) ✅
   ↓
8. **LAYER 3**: buildStructuredIntent() → Filters blocked nodes ✅
   ↓
9. Final StructuredIntent: Only slack_message ✅
```

## Verification

After this fix, Discord should NOT appear in workflows when:
- User explicitly selects Slack in variation
- Blocked nodes include Discord
- All three filtering layers are active

## Debug Logs

Look for these logs to verify filtering is working:
- `[IntentAwarePlanner] 🚫 Filtering out blocked node: discord`
- `[IntentAwarePlanner] ✅ Filtered X blocked node(s) from nodeRequirements`
- `[IntentAwarePlanner] 🚫 Final filter: Removing blocked node: discord`
- `[IntentAwarePlanner] 🚫 buildStructuredIntent: Filtering out blocked node: discord`
