# Auto-Confirmation Disabled

## Overview

All auto-confirmation and auto-skip behaviors have been disabled. The confirmation step must always appear and the frontend must wait for explicit user approval before proceeding.

## Changes Made

### 1. Pipeline Orchestrator (`worker/src/services/ai/workflow-pipeline-orchestrator.ts`)

**Removed:**
- `AUTO_CONFIRM_EXPANDED_INTENT` environment variable logic
- `FAST_MODE` auto-confirmation when confidence > 0.95
- Auto-confirmation branch that continued pipeline execution

**Updated:**
- `requiresConfirmation` is now always set to `true`
- Pipeline always pauses at confirmation stage
- Always creates confirmation request and waits for user approval
- Removed auto-confirm branch that skipped confirmation

### 2. AutonomousAgentWizard (`ctrl_checks/src/components/workflow/AutonomousAgentWizard.tsx`)

**Removed:**
- Auto-continue logic when no questions returned
- Auto-skip confirmation when no credentials needed
- Auto-confirm understanding logic
- Auto-proceed to building after confirmation

**Updated:**
- Always shows confirmation step regardless of credentials
- User must explicitly click "Build Workflow" button
- No automatic progression after confirmation

### 3. State Manager (`ctrl_checks/src/lib/workflow-generation-state.ts`)

**Updated:**
- Removed auto-confirmation comments
- Added notes that auto-confirmation is disabled
- User must explicitly confirm workflow

## Behavior Changes

### Before
- Workflows could auto-confirm in FAST_MODE with high confidence
- Expanded intents could auto-confirm if `AUTO_CONFIRM_EXPANDED_INTENT=true`
- Frontend could auto-skip confirmation if no credentials needed
- Frontend could auto-continue if no questions returned

### After
- **Always** requires user confirmation
- **Never** auto-confirms workflows
- **Always** shows confirmation step
- **Always** waits for explicit user approval

## Pipeline Flow

```
prompt
→ intent_structurer
→ intent_validator
→ intent_auto_expander
→ workflow_builder
→ confirmation_stage (ALWAYS PAUSES HERE)
→ [USER MUST EXPLICITLY CONFIRM]
→ continue pipeline
```

## User Experience

1. User submits prompt
2. Workflow is built
3. **Confirmation step always appears**
4. User must explicitly click "Confirm" or "Build Workflow"
5. Only after explicit confirmation does pipeline continue

## Configuration

- `AUTO_CONFIRM_EXPANDED_INTENT` - No longer used (removed)
- `WORKFLOW_EXECUTION_MODE` - FAST_MODE no longer auto-confirms
- All workflows require explicit user confirmation

## Testing

- Test with high confidence workflows - should still require confirmation
- Test with no credentials - should still require confirmation
- Test with expanded intents - should still require confirmation
- Verify confirmation step always appears
- Verify no automatic progression after confirmation
