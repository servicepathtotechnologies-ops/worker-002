# Pipeline Error Recovery

## Overview

Added comprehensive error recovery to the workflow generation pipeline. If workflow building fails at any stage, the pipeline gracefully handles the error, returns an explanation to the UI, sets state to `STATE_REJECTED`, and allows regeneration.

## Error Recovery Points

### 1. Workflow Structure Building (STEP 2)

**Location**: `workflowStructureBuilder.buildStructure()`

**Error Handling**:
- Wraps structure building in try-catch
- Catches errors from structure building
- Returns error explanation to UI
- Sets state to `STATE_REJECTED`
- Sets `canRegenerate: true` to allow retry

**Error Message**: "Failed to build workflow structure: {error}. This may be due to invalid node types, missing required information, or an internal error. You can try regenerating the workflow with a more specific prompt."

### 2. Structure Normalization (STEP 2.1)

**Location**: `nodeTypeNormalizationService.validateAndNormalizeStructure()`

**Error Handling**:
- Wraps normalization in try-catch
- Catches validation errors
- Returns error explanation to UI
- Sets state to `STATE_REJECTED`
- Sets `canRegenerate: true` to allow retry

**Error Message**: "Failed to validate workflow structure: {error}. Some node types may be invalid or incompatible. You can try regenerating the workflow."

### 3. Workflow Conversion (STEP 3)

**Location**: `convertStructureToWorkflow()`

**Error Handling**:
- Wraps conversion in try-catch
- Catches conversion errors
- Returns error explanation to UI
- Sets state to `STATE_REJECTED`
- Sets `canRegenerate: true` to allow retry

**Error Message**: "Failed to convert workflow structure to executable format: {error}. The workflow structure may be invalid or incomplete. You can try regenerating the workflow with a more detailed prompt."

### 4. Final Workflow Normalization (STEP 3.1)

**Location**: `nodeTypeNormalizationService.validateAndNormalizeWorkflow()`

**Error Handling**:
- Wraps normalization in try-catch
- Catches validation errors
- Returns error explanation to UI
- Sets state to `STATE_REJECTED`
- Sets `canRegenerate: true` to allow retry

**Error Message**: "Failed to validate final workflow: {error}. Some node types may be invalid or incompatible. You can try regenerating the workflow with different node types."

### 5. Explanation Generation (STEP 3.5)

**Location**: `workflowExplanationService.generateExplanation()`

**Error Handling**:
- Wraps explanation generation in try-catch
- Non-critical error - continues with basic explanation
- Logs warning but doesn't fail pipeline
- Uses fallback basic explanation

### 6. Top-Level Pipeline Error Handler

**Location**: Main try-catch in `executePipeline()`

**Error Handling**:
- Catches any unhandled errors
- Returns comprehensive error explanation
- Sets state to `STATE_REJECTED`
- Sets `canRegenerate: true` to allow retry

**Error Message**: "Pipeline execution failed: {error}. This may be due to an internal error, invalid input, or system issue. You can try regenerating the workflow."

## Updated PipelineResult Interface

Added new fields to `PipelineResult`:

```typescript
export interface PipelineResult {
  // ... existing fields ...
  
  /**
   * Error explanation for UI (human-readable error message)
   */
  errorExplanation?: string;
  
  /**
   * Whether workflow can be regenerated (allows retry)
   */
  canRegenerate?: boolean;
}
```

## WorkflowConfirmationManager Updates

Added `markRejected()` method:

```typescript
async markRejected(workflowId: string, reason?: string): Promise<void>
```

- Creates or updates confirmation request with `STATE_REJECTED` state
- Stores error reason in explanation field
- Creates rejection response for tracking
- Allows error tracking and recovery

## Error Recovery Flow

```
Workflow Build Attempt
  ↓
[Error Occurs]
  ↓
Catch Error
  ↓
Generate Error Explanation
  ↓
Mark Workflow as STATE_REJECTED
  ↓
Return PipelineResult with:
  - success: false
  - errorExplanation: "Human-readable error message"
  - canRegenerate: true
  - workflowState: STATE_REJECTED
  ↓
UI Displays Error
  ↓
User Can Regenerate Workflow
```

## Benefits

1. **No Pipeline Crashes**: All errors are caught and handled gracefully
2. **User-Friendly Errors**: Human-readable error explanations returned to UI
3. **State Management**: Workflow state properly set to `STATE_REJECTED`
4. **Regeneration Support**: `canRegenerate` flag allows UI to offer retry
5. **Error Tracking**: Rejection responses stored for debugging/analytics

## Testing

- Test with invalid node types - should return error explanation
- Test with incomplete structure - should return error explanation
- Test with conversion errors - should return error explanation
- Test with normalization errors - should return error explanation
- Verify `canRegenerate` is always `true` on errors
- Verify `workflowState` is always `STATE_REJECTED` on errors
- Verify pipeline doesn't crash on any error
