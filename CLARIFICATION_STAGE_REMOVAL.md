# Clarification Stage Removal

## Overview

Removed the legacy clarification stage from the workflow generation pipeline. Vague prompts are now automatically handled by `intent_auto_expander` instead of asking clarification questions.

## Changes Made

### 1. Removed Clarification Fields from StructuredIntent

**File**: `worker/src/services/ai/intent-structurer.ts`

- Removed `clarification_required?: boolean;`
- Removed `clarification_questions?: string[];`

### 2. Removed Clarification Generation from IntentStructurer

**File**: `worker/src/services/ai/intent-structurer.ts`

- Removed vague prompt detection that returned clarification questions
- Removed `generateClarificationQuestions()` method
- Changed behavior: Vague prompts now return minimal intent (will be expanded by `intent_auto_expander`)

### 3. Removed Clarification Checks from IntentCompletenessValidator

**File**: `worker/src/services/ai/intent-completeness-validator.ts`

- Removed `clarificationRequired` and `clarificationQuestions` from `IntentCompletenessResult`
- Removed abstract pattern detection (`abstractPatterns` array and `detectAbstractPrompt()` method)
- Removed domain intent handler clarification checks
- Changed behavior: Incomplete intents return `complete: false` but don't block - `intent_auto_expander` handles them

### 4. Removed Clarification Checks from Pipeline Orchestrator

**File**: `worker/src/services/ai/workflow-pipeline-orchestrator.ts`

- Removed `clarificationRequired` and `clarificationQuestions` from `PipelineResult`
- Removed check for `structuredIntent.clarification_required`
- Removed early return for clarification requests
- Updated intent completeness validation to not block pipeline (warnings only)

### 5. Updated Pipeline Flow

**New Pipeline Flow**:
```
prompt
→ intent_structurer (extracts structured intent)
→ intent_completeness_validator (validates, doesn't block)
→ intent_auto_expander (expands vague/incomplete intents)
→ node_type_normalization_service (validates node types)
→ workflow_structure_builder (builds structure)
→ workflow_builder (builds workflow)
→ confirmation_stage (user confirms workflow)
```

**Old Pipeline Flow** (removed):
```
prompt
→ intent_structurer
→ [CLARIFICATION STAGE] ← REMOVED
→ intent_validator
→ workflow_builder
→ confirmation_stage
```

## Key Behavioral Changes

1. **Vague Prompts**: No longer ask clarification questions. Instead, `intent_auto_expander` automatically adds assumptions based on the prompt.

2. **Incomplete Intents**: No longer block the pipeline. `intent_auto_expander` fills in missing information.

3. **Abstract Domain Prompts**: No longer ask clarification questions. `intent_auto_expander` handles them automatically.

4. **Invalid Node Types**: No longer ask clarification questions. `nodeTypeNormalizationService` normalizes them.

## Migration Notes

- All code paths that checked `clarification_required` or `clarification_questions` have been removed
- Frontend code that handles `STATE_2_CLARIFICATION_ACTIVE` should be updated to skip that state
- The pipeline now always proceeds to `intent_auto_expander` for vague/incomplete prompts

## Testing

- Test with vague prompts (e.g., "create a workflow")
- Test with incomplete intents (missing trigger or actions)
- Test with abstract domain prompts (e.g., "create a CRM workflow")
- Verify that `intent_auto_expander` is called for all vague/incomplete cases
- Verify that no clarification questions are generated
