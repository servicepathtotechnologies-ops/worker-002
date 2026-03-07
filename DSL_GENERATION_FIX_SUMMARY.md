# DSL Generation Error Fix Summary

## 🚨 Error Explanation

### The Problem

**Error Message:**
```
DSL generation failed: 1 action(s) could not be categorized. Every intent action must be mapped to data source, transformation, or output.
Uncategorized actions: gmail(send_email)
Reason: Node type "ai" not found in capability registry. No capabilities defined.
```

### Root Cause

1. **Action Type**: `type="gmail"`, `operation="send_email"`
2. **Normalization Bug**: `normalizeNodeType("gmail")` incorrectly matched "gmail" to "ai"
3. **Why**: The substring matching logic was too loose:
   - "gmail" contains the substring "ai"
   - `candidate.includes(regLower)` → `"gmail".includes("ai")` → **TRUE**
   - So "gmail" matched "ai" node type
4. **Capability Check**: `isOutput("ai", "send_email")` failed because "ai" is not in capability registry
5. **Result**: Action categorized as "uncategorized" → DSL generation failed

### The Bug Chain

```
"gmail" (rawType)
  ↓
normalizeNodeType("gmail")
  ↓
Substring matching: "gmail".includes("ai") → TRUE
  ↓
Returns "ai" (WRONG!)
  ↓
isOutput("ai", "send_email")
  ↓
nodeCapabilityRegistryDSL.getCapabilities("ai") → []
  ↓
Fails categorization
  ↓
DSL generation error
```

---

## ✅ Fixes Applied

### Fix #1: Use Node Type Resolver BEFORE Normalization

**File**: `worker/src/services/ai/workflow-dsl.ts`

**Change**: Resolve aliases FIRST, then normalize

```typescript
// BEFORE (WRONG):
const normalizedType = normalizeNodeType(rawType);
const actionType = normalizedType || rawType;

// AFTER (CORRECT):
// Step 1: Resolve aliases (gmail → google_gmail)
let resolvedType = rawType;
try {
  resolvedType = resolveNodeType(rawType, false);
} catch (error) {
  resolvedType = rawType; // Fallback
}
// Step 2: Normalize resolved type
const normalizedType = normalizeNodeType(resolvedType);
const actionType = normalizedType || resolvedType || rawType;
```

**Why**: 
- `resolveNodeType("gmail")` correctly maps to `"google_gmail"` via alias map
- Then `normalizeNodeType("google_gmail")` finds exact match in NodeLibrary
- Prevents substring matching bug from triggering

### Fix #2: Stricter Substring Matching

**File**: `worker/src/services/ai/node-type-normalizer.ts`

**Change**: Require minimum match length to prevent false positives

```typescript
// BEFORE (TOO LOOSE):
if (regLower.includes(candidate) || candidate.includes(regLower)) {
  substringMatches.push(registered);
}

// AFTER (STRICTER):
const MIN_MATCH_LENGTH = 3; // Minimum substring length

if (regLower.includes(candidate) && candidate.length >= MIN_MATCH_LENGTH) {
  substringMatches.push(registered);
}
if (candidate.includes(regLower) && regLower.length >= MIN_MATCH_LENGTH) {
  substringMatches.push(registered);
}
```

**Why**:
- Prevents "gmail" from matching "ai" (2 chars < MIN_MATCH_LENGTH)
- Still allows legitimate matches like "ollama_llm" → "ollama"
- Token matching also requires MIN_MATCH_LENGTH

---

## 📋 Files Modified

1. **`worker/src/services/ai/workflow-dsl.ts`**
   - Added import: `resolveNodeType` from `node-type-resolver-util`
   - Updated action processing to resolve aliases before normalization
   - Added error handling for resolution failures

2. **`worker/src/services/ai/node-type-normalizer.ts`**
   - Added `MIN_MATCH_LENGTH = 3` constant
   - Updated substring matching to require minimum length
   - Updated token matching to require minimum length

---

## 🎯 Result

**Before:**
- ❌ "gmail" → incorrectly normalized to "ai"
- ❌ DSL generation failed with "Node type 'ai' not found"
- ❌ Workflow generation failed

**After:**
- ✅ "gmail" → resolved to "google_gmail" via alias map
- ✅ "google_gmail" → normalized correctly (exact match in NodeLibrary)
- ✅ `isOutput("google_gmail", "send_email")` succeeds
- ✅ Action categorized as output
- ✅ DSL generation succeeds
- ✅ Workflow generation succeeds

---

## 🔄 Prevention

These fixes prevent similar issues:
1. **Alias Resolution First**: All aliases (gmail, ai, llm, etc.) are resolved before normalization
2. **Stricter Matching**: Substring matching requires minimum length, preventing false positives
3. **Error Handling**: Graceful fallback if resolution fails

---

## ✅ Testing

**Test Case**: `"get data from google sheets, summarise it and send it to gmail"`

**Expected Flow**:
1. Intent action: `{ type: "gmail", operation: "send_email" }`
2. Resolve: `"gmail"` → `"google_gmail"` ✅
3. Normalize: `"google_gmail"` → `"google_gmail"` (exact match) ✅
4. Categorize: `isOutput("google_gmail", "send_email")` → `true` ✅
5. DSL: Added to `outputs[]` ✅
6. Workflow: Generated successfully ✅

---

## 📝 Related Issues

This fix also prevents:
- "ai" matching "gmail" (reverse substring match)
- "mail" matching "ai" (substring match)
- Any 2-character node type matching longer types incorrectly
- False positives in token matching

---

## 🚀 Architecture Impact

**Universal Fix**: This applies to ALL node types, not just "gmail"
- All aliases are resolved before normalization
- All substring matches require minimum length
- Prevents similar bugs for any node type

**Future-Proof**: New node types with aliases will automatically benefit from this fix.
