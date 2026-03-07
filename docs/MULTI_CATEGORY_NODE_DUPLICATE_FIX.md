# Multi-Category Node Duplicate Fix

## 🚨 Issue Identified

**Problem**: Nodes with multiple categories (e.g., `ai_agent` with both `transformation` and `terminal` capabilities) were being added to multiple DSL categories, causing duplicate nodes in the workflow.

**User Observation**: "AI Agent is again came even though AI Chat Model is present in the workflow. As I see that AI agent having capability as transformation + terminal so the nodes with multiple categories might add after DSL is this is the issue"

**Root Cause**: 
- `ai_agent` has capabilities: `['ai_processing', 'transformation', 'llm', 'terminal']`
- `ai_chat_model` has capabilities: `['ai_processing', 'transformation', 'llm', 'summarize', 'analyze', 'terminal']`
- Both have BOTH `transformation` AND `terminal` capabilities
- The DSL generator was checking categories separately and could add the same node to both `transformations` and `outputs` arrays

---

## ✅ Solution Applied

### Fix Location
**File**: `worker/src/services/ai/workflow-dsl.ts` (lines 736-847)

### What Changed
Added a **duplicate check BEFORE categorization** to prevent nodes from being added to multiple categories:

```typescript
// ✅ CRITICAL FIX: Check if node type already exists in any category
// Nodes with multiple capabilities (e.g., ai_agent with transformation + terminal) should only be added once
const normalizedActionType = unifiedNormalizeNodeTypeString(actionType);
const alreadyInTransformations = transformations.some(tf => unifiedNormalizeNodeTypeString(tf.type) === normalizedActionType);
const alreadyInOutputs = outputs.some(out => unifiedNormalizeNodeTypeString(out.type) === normalizedActionType);
const alreadyInDataSources = dataSources.some(ds => unifiedNormalizeNodeTypeString(ds.type) === normalizedActionType);

if (alreadyInTransformations || alreadyInOutputs || alreadyInDataSources) {
  const existingCategory = alreadyInTransformations ? 'transformation' : (alreadyInOutputs ? 'output' : 'data_source');
  console.log(`[DSLGenerator] ⚠️  Node type "${actionType}" already exists as ${existingCategory}, skipping duplicate addition to prevent multi-category duplicates`);
  categorized = true; // Mark as categorized to skip fallback
  // Skip to next action (don't add to any category)
} else {
  // ... categorization logic (OUTPUT → TRANSFORMATION → DATASOURCE)
}
```

### How It Works
1. **Before categorization**: Check if node type already exists in ANY category (`transformations`, `outputs`, or `dataSources`)
2. **If duplicate found**: Skip adding to any category, mark as categorized
3. **If not duplicate**: Proceed with normal categorization logic

---

## 📊 Impact

### ✅ Fixed:
- **No more duplicate nodes** when nodes have multiple categories
- **Prevents multi-category duplicates** (e.g., `ai_agent` in both transformations and outputs)
- **Works for ALL nodes** with multiple capabilities, not just AI nodes

### 🎯 Example Scenarios

**Before Fix**:
- `ai_agent` could be added to `transformations` array
- Then same `ai_agent` could be added to `outputs` array
- Result: **DUPLICATE** nodes in workflow

**After Fix**:
- `ai_agent` added to `transformations` array
- When checking `outputs`, duplicate check detects it already exists
- Result: **NO DUPLICATE** - node only exists once

---

## 🔍 Technical Details

### Node Capabilities
```typescript
// From node-capability-registry-dsl.ts
this.setCapabilities('ai_agent', ['ai_processing', 'transformation', 'llm', 'terminal']);
this.setCapabilities('ai_chat_model', ['ai_processing', 'transformation', 'llm', 'summarize', 'analyze', 'terminal']);
```

### Categorization Priority
The DSL generator checks categories in this order:
1. **OUTPUT** (terminal operations) - checked first
2. **TRANSFORMATION** (processing operations) - checked second
3. **DATASOURCE** (read operations) - checked third

### Duplicate Detection
- Uses `unifiedNormalizeNodeTypeString()` to normalize node types for comparison
- Checks all three categories: `transformations`, `outputs`, `dataSources`
- Prevents same node type from being added to multiple categories

---

## 🎯 Summary

**Problem**: Nodes with multiple categories (transformation + terminal) were being added to multiple DSL categories, causing duplicates.

**Solution**: Added duplicate check BEFORE categorization to prevent nodes from being added to multiple categories.

**Result**: Nodes with multiple capabilities are now only added once, preventing duplicate nodes in workflows.

---

## 🔗 Related Files

- `worker/src/services/ai/workflow-dsl.ts` - Fixed duplicate check
- `worker/src/services/ai/node-capability-registry-dsl.ts` - Defines node capabilities
- `worker/src/core/utils/unified-node-type-normalizer.ts` - Normalizes node types for comparison
