# Pipeline Orchestrator - Mandatory Confirmation Refactor

## Overview

Refactored the pipeline orchestrator to enforce mandatory workflow confirmation. The pipeline now pauses after workflow building and requires user confirmation before continuing with repair, normalization, and execution.

## New Pipeline Flow

```
prompt
→ intent_structurer
→ intent_validator
→ intent_auto_expander (if low confidence)
→ workflow_builder (builds structure, NO EXECUTION)
→ confirmation_stage (NEW REQUIRED STEP - PAUSES HERE)
→ [USER CONFIRMATION REQUIRED]
→ repair (only after confirmation)
→ normalize (only after confirmation)
→ credential_detection
→ credential_injection
→ policy_enforcement
→ ai_validator
```

## State Machine

### States

1. **STATE_WORKFLOW_BUILT**
   - Workflow has been built but not yet sent for confirmation
   - Initial state after workflow building

2. **STATE_WAITING_CONFIRMATION**
   - Workflow sent to user and waiting for confirmation
   - Pipeline is paused at this state

3. **STATE_CONFIRMED**
   - User has confirmed the workflow
   - Pipeline continues with post-confirmation steps

4. **STATE_REJECTED**
   - User has rejected the workflow
   - Pipeline stops, workflow is not executed

### State Transitions

```
STATE_WORKFLOW_BUILT
  ↓ (markWaitingForConfirmation)
STATE_WAITING_CONFIRMATION
  ↓ (user confirms)
STATE_CONFIRMED
  ↓ (continuePipelineAfterConfirmation)
[Continue with repair, normalize, etc.]

STATE_WAITING_CONFIRMATION
  ↓ (user rejects)
STATE_REJECTED
[Pipeline stops]
```

## Implementation

### 1. WorkflowConfirmationManager

**File**: `worker/src/services/ai/workflow-confirmation-manager.ts`

Manages confirmation state and transitions:

```typescript
export enum WorkflowState {
  STATE_WORKFLOW_BUILT = 'STATE_WORKFLOW_BUILT',
  STATE_WAITING_CONFIRMATION = 'STATE_WAITING_CONFIRMATION',
  STATE_CONFIRMED = 'STATE_CONFIRMED',
  STATE_REJECTED = 'STATE_REJECTED',
}
```

**Key Methods**:
- `createConfirmationRequest()`: Creates confirmation request
- `markWaitingForConfirmation()`: Transitions to waiting state
- `submitConfirmation()`: Submits user response
- `isConfirmed()`: Checks if workflow is confirmed
- `isRejected()`: Checks if workflow is rejected

### 2. Pipeline Orchestrator Changes

**File**: `worker/src/services/ai/workflow-pipeline-orchestrator.ts`

#### Modified `executePipeline()` Method

**Before Confirmation Stage**:
- STEP 1: Intent Structurer
- STEP 1.5: Intent Validator
- STEP 1.6: Similarity Calculation
- STEP 1.65: Confidence Scoring
- STEP 1.7: Intent Auto Expander (if needed)
- STEP 2: Workflow Structure Builder
- STEP 3: **Workflow Builder (builds structure, NO EXECUTION)**

**Confirmation Stage (NEW)**:
- STEP 4: **Confirmation Stage - Pipeline pauses here**
  - Creates confirmation request
  - Generates workflow explanation
  - Marks workflow as waiting for confirmation
  - Returns with `waitingForConfirmation: true`

**After Confirmation** (via `continuePipelineAfterConfirmation()`):
- STEP 5: Repair Engine
- STEP 6: Normalize
- STEP 7: Credential Detection
- STEP 8: Credential Injection
- STEP 9: Policy Enforcement
- STEP 10: AI Validator

#### New `continuePipelineAfterConfirmation()` Method

```typescript
async continuePipelineAfterConfirmation(
  workflowId: string,
  confirmed: boolean,
  existingCredentials?: Record<string, any>,
  providedCredentials?: Record<string, Record<string, any>>,
  options?: {
    mode?: 'analyze' | 'build';
    onProgress?: (step: number, stepName: string, progress: number, details?: any) => void;
  }
): Promise<PipelineResult>
```

**Flow**:
1. Get confirmation request
2. Submit confirmation response
3. If rejected: Return rejection state
4. If confirmed: Continue with post-confirmation steps
   - Repair
   - Normalize
   - Credential detection
   - Credential injection
   - Policy enforcement
   - AI validation

### 3. PipelineResult Interface Updates

```typescript
export interface PipelineResult {
  // ... existing fields ...
  
  /**
   * Workflow state (state machine)
   */
  workflowState?: WorkflowState;
  
  /**
   * Workflow ID for confirmation tracking
   */
  workflowId?: string;
  
  /**
   * Confirmation request (if waiting for confirmation)
   */
  confirmationRequest?: WorkflowConfirmationRequest;
  
  /**
   * Whether pipeline is waiting for user confirmation
   */
  waitingForConfirmation?: boolean;
}
```

## Rules

### 1. Workflow Builder MUST NOT Execute

- Workflow builder only builds structure (nodes and edges)
- No workflow execution happens before confirmation
- Workflow is sent to confirmation stage as-is

### 2. Always Send Workflow + Explanation to Confirmation Stage

- Workflow (nodes and edges)
- Explanation (includes expanded intent, confidence score, recommendations)
- Pipeline context (original prompt, structured intent, etc.)

### 3. Pipeline Pauses Until User Response

- Pipeline returns immediately after confirmation stage
- `waitingForConfirmation: true` flag indicates pause
- Frontend must call `continuePipelineAfterConfirmation()` after user responds

### 4. Only After Approval Continue Pipeline

- If user confirms: Call `continuePipelineAfterConfirmation()` with `confirmed: true`
- If user rejects: Call `continuePipelineAfterConfirmation()` with `confirmed: false`
- Pipeline continues only after confirmation

## API Usage

### Initial Pipeline Execution

```typescript
const result = await pipelineOrchestrator.executePipeline(
  userPrompt,
  existingCredentials,
  providedCredentials,
  { mode: 'build' }
);

if (result.waitingForConfirmation) {
  // Show confirmation UI to user
  // Display: result.workflow, result.confirmationRequest.explanation
  // Wait for user response
}
```

### After User Confirmation

```typescript
// User confirms
const confirmedResult = await pipelineOrchestrator.continuePipelineAfterConfirmation(
  result.workflowId!,
  true, // confirmed
  existingCredentials,
  providedCredentials,
  { mode: 'build' }
);

if (confirmedResult.success) {
  // Workflow is ready for execution
  // confirmedResult.workflow contains final workflow
}
```

### After User Rejection

```typescript
// User rejects
const rejectedResult = await pipelineOrchestrator.continuePipelineAfterConfirmation(
  result.workflowId!,
  false, // rejected
  existingCredentials,
  providedCredentials,
  { mode: 'build' }
);

// rejectedResult.workflowState === WorkflowState.STATE_REJECTED
// Pipeline stops, workflow is not executed
```

## Workflow Explanation

The confirmation stage includes a detailed explanation:

```
**Expanded Intent**:
[If available, shows expanded interpretation]

**Workflow Summary**:
- Trigger: manual_trigger
- Nodes: 3
- Edges: 2

**Confidence Score**: 85.0%

**Recommendations**:
- Provide more specific details about the workflow goal

**Nodes**:
1. Manual Trigger (manual_trigger)
2. Google Sheets (google_sheets)
3. Gmail (google_gmail)
```

## Benefits

1. **Mandatory Confirmation**: All workflows require user confirmation before execution
2. **No Silent Execution**: Workflow builder never executes workflows
3. **Clear State Management**: State machine tracks workflow lifecycle
4. **User Control**: Users can review and approve/reject workflows
5. **Transparent Process**: Detailed explanation helps users understand the workflow

## Migration Notes

### Breaking Changes

- `executePipeline()` now returns early at confirmation stage
- New method `continuePipelineAfterConfirmation()` required for post-confirmation steps
- `PipelineResult` includes new fields: `workflowState`, `workflowId`, `confirmationRequest`, `waitingForConfirmation`

### Frontend Changes Required

1. Check `result.waitingForConfirmation` flag
2. Display confirmation UI with workflow and explanation
3. Call `continuePipelineAfterConfirmation()` after user responds
4. Handle confirmed and rejected states

## Testing

### Test Case 1: Normal Flow
1. Execute pipeline → Returns at confirmation stage
2. User confirms → Pipeline continues
3. Workflow is normalized and ready

### Test Case 2: User Rejection
1. Execute pipeline → Returns at confirmation stage
2. User rejects → Pipeline stops
3. Workflow state is `STATE_REJECTED`

### Test Case 3: Workflow Builder Does Not Execute
1. Execute pipeline → Workflow built
2. Verify no execution happens before confirmation
3. Workflow structure is sent to confirmation stage
