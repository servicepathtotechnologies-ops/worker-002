# 🔍 Root Cause Analysis: Nodes from Other Variants Appearing in Workflow

## Problem Statement

**User selects a variation that only mentions:**
- "Start the workflow with manual_trigger to initiate automation. Process through Google Sheets. Finalize the workflow by sending results via Slack."

**But the generated workflow contains:**
- `schedule` (not in selected variation)
- `google_sheets` ✅ (correct)
- `ai_chat_model` (not explicitly in selected variation)
- `discord` ❌ (NOT in selected variation - this is the problem!)
- `log_output` (auto-injected)
- `slack_message` ✅ (correct)

## Root Causes Identified

### Root Cause #1: `nodeResolver.resolvePrompt` Not Receiving Blocked Nodes

**Location**: `workflow-pipeline-orchestrator.ts` (line 586)

**Issue**: `nodeResolver.resolvePrompt` was called WITHOUT `blockedNodeTypes` option, so it detected Discord from the selected variation text even though it should have been blocked.

**Fix Applied**: ✅ Pass `blockedNodeTypes` to `nodeResolver.resolvePrompt`

```typescript
// BEFORE (WRONG):
const resolution = nodeResolver.resolvePrompt(selectedStructuredPrompt, originalPrompt);

// AFTER (CORRECT):
const resolution = nodeResolver.resolvePrompt(selectedStructuredPrompt, originalPrompt, {
  explicitNodeTypes: explicitNodeTypes,
  blockedNodeTypes: blockedNodeTypes,
});
```

### Root Cause #2: Transformation Detection Using Original Prompt

**Location**: `production-workflow-builder.ts` (line 264)

**Issue**: `transformationDetector.detectTransformations(originalPrompt)` was using the original prompt instead of the selected variation, potentially detecting transformations (and nodes) that aren't in the selected variation.

**Fix Applied**: ✅ Use `selectedStructuredPrompt` for transformation detection

```typescript
// BEFORE (WRONG):
const transformationDetection = transformationDetector.detectTransformations(originalPrompt);

// AFTER (CORRECT):
const promptForTransformationDetection = options?.selectedStructuredPrompt || originalPrompt;
const transformationDetection = transformationDetector.detectTransformations(promptForTransformationDetection);
```

### Root Cause #3: DSL Generator Using Original Prompt for "User Explicit" Check

**Location**: `workflow-dsl.ts` (line 936)

**Issue**: The DSL generator checks if a node is "user explicit" by searching the `originalPrompt` instead of the `selectedStructuredPrompt`. This can mark nodes as "user explicit" even if they're not in the selected variation.

**Fix Applied**: ✅ Use `selectedStructuredPrompt` from options for "user explicit" check

```typescript
// BEFORE (WRONG):
const isUserExplicit = originalPrompt && (
  originalPrompt.toLowerCase().includes(actionType.toLowerCase()) ||
  originalPrompt.toLowerCase().includes(rawType.toLowerCase())
);

// AFTER (CORRECT):
const promptToCheck = (options as any)?.selectedStructuredPrompt || originalPrompt || '';
const isUserExplicit = promptToCheck && (
  promptToCheck.toLowerCase().includes(actionType.toLowerCase()) ||
  promptToCheck.toLowerCase().includes(rawType.toLowerCase())
);
```

### Root Cause #4: `selectedStructuredPrompt` Not Passed to Production Builder

**Location**: `workflow-pipeline-orchestrator.ts` (line 1238) and `production-workflow-builder.ts`

**Issue**: `buildProductionWorkflow` was called with `selectedStructuredPrompt` as the second parameter (which should be `originalPrompt`), but the `selectedStructuredPrompt` wasn't passed in `BuildOptions`, so downstream components couldn't use it.

**Fix Applied**: ✅ Pass `selectedStructuredPrompt` in `BuildOptions`

```typescript
// BEFORE (WRONG):
buildResult = await buildProductionWorkflow(structuredIntent, selectedStructuredPrompt, {
  // ... options without selectedStructuredPrompt
});

// AFTER (CORRECT):
buildResult = await buildProductionWorkflow(structuredIntent, originalPrompt, {
  // ... options
  selectedStructuredPrompt: selectedStructuredPrompt, // ✅ Pass selected variation
});
```

## Where Nodes Are Being Added

### 1. Node Resolution (PRIMARY ISSUE - FIXED)
- **File**: `workflow-pipeline-orchestrator.ts` → `node-resolver.ts`
- **When**: During explicit node extraction from selected variation
- **Problem**: `nodeResolver.resolvePrompt` was detecting Discord from the selected variation text because blocked nodes weren't passed
- **Fix**: ✅ Pass `blockedNodeTypes` to `nodeResolver.resolvePrompt`

### 2. Transformation Detection (SECONDARY ISSUE - FIXED)
- **File**: `production-workflow-builder.ts` → `transformation-detector.ts`
- **When**: Before DSL generation
- **Problem**: Using `originalPrompt` instead of `selectedStructuredPrompt`
- **Fix**: ✅ Use `selectedStructuredPrompt` for transformation detection

### 3. DSL Generation (TERTIARY ISSUE - FIXED)
- **File**: `workflow-dsl.ts`
- **When**: During DSL generation from StructuredIntent
- **Problem**: Checking "user explicit" using `originalPrompt` instead of `selectedStructuredPrompt`
- **Fix**: ✅ Use `selectedStructuredPrompt` from options for "user explicit" check

### 4. Intent-Aware Planner (POTENTIAL ISSUE)
- **File**: `intent-aware-planner.ts`
- **When**: Adding implicit nodes
- **Status**: ✅ Already filters blocked nodes (fixed in previous implementation)

## Flow After Fixes

### Correct Flow:
```
1. User selects variation: "Start the workflow with manual_trigger... Process through Google Sheets... Finalize by sending results via Slack."
   ↓
2. Extract explicit nodes: slack_message ✅
   ↓
3. Derive blocked nodes: discord, telegram, gmail, etc. ✅
   ↓
4. nodeResolver.resolvePrompt(selectedVariation, originalPrompt, { blockedNodeTypes })
   - Detects: google_sheets, slack_message ✅
   - Blocks: discord ❌ (filtered out)
   ↓
5. transformationDetector.detectTransformations(selectedStructuredPrompt)
   - Detects transformations from selected variation only ✅
   ↓
6. DSL generation uses selectedStructuredPrompt for "user explicit" check ✅
   ↓
7. Final workflow: google_sheets → ai_chat_model → slack_message → log_output ✅
```

## Verification Checklist

After fixes, verify:
- ✅ No `discord` node when `slack_message` is explicit
- ✅ Only nodes from selected variation appear in workflow
- ✅ Transformation detection uses selected variation
- ✅ "User explicit" check uses selected variation
- ✅ Blocked nodes are filtered at all stages

## Summary

**The main issue was**: `nodeResolver.resolvePrompt` was not receiving `blockedNodeTypes`, so it detected Discord from the selected variation text even though it should have been blocked when Slack is explicit.

**Additional issues**:
- Transformation detection using original prompt
- DSL generator using original prompt for "user explicit" check
- `selectedStructuredPrompt` not passed to production builder

**All fixes applied**: ✅
1. Pass `blockedNodeTypes` to `nodeResolver.resolvePrompt`
2. Use `selectedStructuredPrompt` for transformation detection
3. Use `selectedStructuredPrompt` for "user explicit" check in DSL generator
4. Pass `selectedStructuredPrompt` in `BuildOptions`
