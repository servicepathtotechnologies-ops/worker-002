# 🔧 LLM Schema Implementation Guide

## 📋 Quick Summary

**Problem**: LLM can generate invalid node types (like "gmail" instead of "google_gmail")  
**Solution**: Add post-processing validation that rejects invalid types immediately  
**Why**: Ollama doesn't support structured output, so we validate after generation

---

## 🎯 What to Implement

### Step 1: Add Import

**File**: `worker/src/services/ai/workflow-builder.ts`  
**Location**: Top of file (with other imports)

```typescript
import { CANONICAL_NODE_TYPES } from '../../services/nodes/node-library';
```

### Step 2: Add Validation Function

**File**: `worker/src/services/ai/workflow-builder.ts`  
**Location**: After `generateStructure()` method (around line 4350)

```typescript
/**
 * ✅ STRICT ARCHITECTURE: Validate LLM-generated node types
 * 
 * This ensures LLM cannot generate invalid node types.
 * Invalid types are rejected immediately (fail-fast).
 */
private validateLLMGeneratedNodeTypes(parsed: any): void {
  const invalidTypes: string[] = [];
  
  // Validate trigger
  if (parsed.trigger && !CANONICAL_NODE_TYPES.includes(parsed.trigger)) {
    invalidTypes.push(`trigger: "${parsed.trigger}"`);
  }
  
  // Validate all steps
  if (parsed.steps && Array.isArray(parsed.steps)) {
    parsed.steps.forEach((step: any, index: number) => {
      const stepType = step.type || step.nodeType;
      if (stepType && !CANONICAL_NODE_TYPES.includes(stepType)) {
        invalidTypes.push(`step${index + 1} (${step.id || 'unknown'}): "${stepType}"`);
      }
    });
  }
  
  // ✅ FAIL-FAST: Throw error if any invalid types found
  if (invalidTypes.length > 0) {
    const sampleTypes = CANONICAL_NODE_TYPES.slice(0, 10).join(', ');
    throw new Error(
      `[LLM Schema Validation] ❌ Invalid node types generated: ${invalidTypes.join(', ')}. ` +
      `Only canonical types from NodeLibrary are allowed. ` +
      `Valid types (sample): ${sampleTypes}... ` +
      `Total valid types: ${CANONICAL_NODE_TYPES.length}. ` +
      `This indicates LLM generated invalid node types. Workflow generation aborted.`
    );
  }
  
  console.log(`✅ [LLM Schema Validation] All node types are canonical (${parsed.steps?.length || 0} steps validated)`);
}
```

### Step 3: Call Validation After JSON Parsing

**File**: `worker/src/services/ai/workflow-builder.ts`  
**Location**: After `parsed = JSON.parse(cleanJson);` (around line 4324)

**Find this code**:
```typescript
parsed = JSON.parse(cleanJson);
```

**Add after it**:
```typescript
parsed = JSON.parse(cleanJson);

// ✅ STRICT ARCHITECTURE: Validate all node types are canonical
// This ensures LLM cannot generate invalid node types
this.validateLLMGeneratedNodeTypes(parsed);
```

---

## ✅ Result

After implementation:

1. **LLM generates workflow** → JSON with node types
2. **JSON parsed** → `parsed` object created
3. **Validation runs** → Checks all node types against `CANONICAL_NODE_TYPES`
4. **If invalid** → **THROWS ERROR** immediately (fail-fast)
5. **If valid** → Continues with workflow generation

**Example**:
- ❌ LLM generates: `{"trigger": "manual_trigger", "steps": [{"type": "gmail"}]}`
- ✅ Validation detects: `"gmail"` is not in `CANONICAL_NODE_TYPES`
- ✅ **THROWS ERROR**: `Invalid node types generated: step1: "gmail"`
- ✅ Workflow generation **ABORTED**

---

## 🧪 Testing

After implementation, test with:

1. **Valid types** → Should pass validation
2. **Invalid types** → Should throw error immediately
3. **Mixed valid/invalid** → Should throw error listing all invalid types

---

## 📝 Summary

**What you're doing**:
- Adding a validation function that checks LLM-generated node types
- Calling it immediately after JSON parsing
- Throwing error if any invalid types found

**Why it works**:
- Catches invalid types **BEFORE** they reach the rest of the system
- Fail-fast behavior (no defensive recovery)
- Programmatic enforcement (not just text instructions)

**Result**: LLM-generated invalid node types are **BLOCKED** at generation time!
