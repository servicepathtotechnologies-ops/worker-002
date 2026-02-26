# Fallback Workflow Generation Patch

## Issue

**Current Behavior:**
- System creates fallback workflow (`manual_trigger → set_variable`) whenever workflow generation fails
- Fallback silently replaces intended workflow without clear indication
- No distinction between different failure scenarios

**Desired Behavior:**
- Only create fallback if expansion + generation both fail
- Do not silently replace intended workflow
- Clear indication when fallback is used

## Implementation

### Files Modified

1. **`worker/src/api/generate-workflow.ts`**
   - Modified catch block to check expansion and generation failures
   - Only creates fallback if both failed
   - Returns error instead of silent fallback in other cases

2. **`worker/src/services/workflow-lifecycle-manager.ts`**
   - Preserves pipeline result (including `expandedIntent`) in error for fallback detection

### Changes

#### 1. Track Pipeline Result in Errors

**File**: `worker/src/services/workflow-lifecycle-manager.ts`

```typescript
if (!pipelineResult.success || !pipelineResult.workflow) {
  const reason = (pipelineResult.errors && pipelineResult.errors.length > 0)
    ? pipelineResult.errors.join(', ')
    : 'Unknown error';
  // ✅ Preserve pipeline result (including expandedIntent) for fallback detection
  const error: any = new Error(`Pipeline failed: ${reason}`);
  error.pipelineResult = pipelineResult; // Attach pipeline result to error
  throw error;
}
```

#### 2. Check Expansion and Generation Failures

**File**: `worker/src/api/generate-workflow.ts`

```typescript
} catch (error: any) {
  // ✅ NEW BEHAVIOR: Only create fallback if expansion + generation both failed
  const pipelineResult = error?.pipelineResult || pipelineResultFromError || (lifecycleResult as any)?.analysis || null;
  const hasExpansionAttempted = pipelineResult?.expandedIntent !== undefined;
  const hasExpansionFailed = hasExpansionAttempted && pipelineResult?.expandedIntent?.requires_confirmation === true;
  const hasGenerationFailed = !lifecycleResult?.workflow || lifecycleResult.workflow.nodes.length === 0;
  
  // Only create fallback if BOTH expansion and generation failed
  const shouldCreateFallback = hasExpansionFailed && hasGenerationFailed;
  
  if (shouldCreateFallback) {
    // Create fallback workflow with clear indication
    // ...
  } else {
    // Return error instead of silent fallback
    // ...
  }
}
```

#### 3. Preserve Pipeline Result in Lifecycle Manager Calls

**File**: `worker/src/api/generate-workflow.ts`

```typescript
let lifecycleResult: any;
let pipelineResultFromError: any = null;
try {
  lifecycleResult = await workflowLifecycleManager.generateWorkflowGraph(...);
} catch (lifecycleError: any) {
  // ✅ Preserve pipeline result from error for fallback detection
  if (lifecycleError?.pipelineResult) {
    pipelineResultFromError = lifecycleError.pipelineResult;
  }
  throw lifecycleError; // Re-throw to be caught by outer catch
}
```

## Logic Explanation

### Fallback Conditions

**Fallback is created ONLY if:**
1. ✅ Expansion was attempted (`expandedIntent` exists in pipeline result)
2. ✅ Expansion failed (`expandedIntent.requires_confirmation === true`)
3. ✅ Generation failed (`!workflow || workflow.nodes.length === 0`)

**Fallback is NOT created if:**
- ❌ Only expansion failed (generation succeeded)
- ❌ Only generation failed (expansion succeeded or not attempted)
- ❌ Neither expansion nor generation was attempted

### Response Format

**When Fallback is Created:**
```json
{
  "success": true,
  "workflow": { /* fallback workflow */ },
  "message": "⚠️  Workflow generation failed. This is a minimal fallback workflow...",
  "isFallback": true,
  "errors": [...],
  "warnings": [...],
  "expandedIntent": { /* expansion info */ }
}
```

**When Fallback is NOT Created:**
```json
{
  "success": false,
  "error": "Workflow generation failed",
  "message": "Failed to generate workflow. Please try again...",
  "details": "...",
  "errors": [...],
  "warnings": [...],
  "expandedIntent": { /* expansion info if available */ }
}
```

## Benefits

1. **No Silent Replacement**: Fallback only created when both expansion and generation fail
2. **Clear Indication**: `isFallback: true` flag and warning message
3. **Better Error Handling**: Returns proper error when fallback conditions not met
4. **Preserves Context**: Includes `expandedIntent` in response for debugging

## Testing

### Test Case 1: Both Expansion and Generation Fail
**Input**: Abstract prompt that fails expansion and generation
**Expected**: Fallback workflow created with `isFallback: true`

### Test Case 2: Only Generation Fails
**Input**: Concrete prompt that passes expansion but fails generation
**Expected**: Error returned, no fallback

### Test Case 3: Only Expansion Fails
**Input**: Abstract prompt that fails expansion but generation succeeds
**Expected**: No fallback (generation succeeded)

### Test Case 4: Both Succeed
**Input**: Normal prompt
**Expected**: Normal workflow, no fallback
