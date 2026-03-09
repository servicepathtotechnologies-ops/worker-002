# Universal Fix: Selected Structured Prompt Flow

## Problem Statement
The selected structured prompt (from summarize layer) should be the **ONLY** prompt used throughout the entire workflow generation process. The original user prompt should be preserved but not used for analysis, validation, or workflow generation.

## Current Issues
1. ❌ Original prompt is used in many places instead of selected structured prompt
2. ❌ No clear separation between original prompt and selected structured prompt
3. ❌ Pipeline context doesn't track selected structured prompt
4. ❌ Validation and analysis use original prompt instead of selected structured prompt

## Solution: Universal Prompt Flow Architecture

### Core Principle
```
Original User Prompt → Summarize Layer → Selected Structured Prompt → ALL WORKFLOW GENERATION
                                                                    ↓
                                                          (Original prompt preserved but not used)
```

### Changes Required

#### 1. Pipeline Context Enhancement
- Add `selectedStructuredPrompt: string` to `PipelineContext`
- Keep `original_prompt: string` for reference only
- All analysis/validation uses `selectedStructuredPrompt`

#### 2. API Layer (`generate-workflow.ts`)
- Accept `selectedStructuredPrompt` in request body
- Store original prompt separately
- Pass `selectedStructuredPrompt` to pipeline (not original)

#### 3. Pipeline Orchestrator (`workflow-pipeline-orchestrator.ts`)
- Accept `selectedStructuredPrompt` parameter
- Use `selectedStructuredPrompt` for ALL operations:
  - Prompt understanding
  - Intent extraction
  - Planning
  - Building
  - Validation
- Store original prompt in context for reference only

#### 4. Prompt Understanding Service
- Use `selectedStructuredPrompt` instead of `original_prompt`
- Detect structured prompts correctly

#### 5. Intent Extractor
- Use `selectedStructuredPrompt` for intent extraction

#### 6. Intent Aware Planner
- Use `selectedStructuredPrompt` for planning

#### 7. Workflow Builder
- Use `selectedStructuredPrompt` for workflow generation

#### 8. Workflow Lifecycle Manager
- Accept and pass `selectedStructuredPrompt` through pipeline

#### 9. All Validators
- Use `selectedStructuredPrompt` for validation

## Implementation Checklist

- [ ] Fix TypeScript error: Add `mandatoryNodeTypes` to options interface
- [ ] Add `selectedStructuredPrompt` to `PipelineContext`
- [ ] Update `workflow-pipeline-orchestrator.executePipeline()` to accept `selectedStructuredPrompt`
- [ ] Update `workflow-pipeline-orchestrator.executePipelineInternal()` to use `selectedStructuredPrompt`
- [ ] Update `prompt-understanding-service.understandPrompt()` calls to use `selectedStructuredPrompt`
- [ ] Update `intent-extractor.extractIntent()` calls to use `selectedStructuredPrompt`
- [ ] Update `intent-aware-planner.planWorkflow()` calls to use `selectedStructuredPrompt`
- [ ] Update `workflow-builder.generateFromPrompt()` calls to use `selectedStructuredPrompt`
- [ ] Update `workflow-lifecycle-manager.generateWorkflowGraph()` to accept and pass `selectedStructuredPrompt`
- [ ] Update `generate-workflow.ts` API to accept and pass `selectedStructuredPrompt`
- [ ] Update all validation calls to use `selectedStructuredPrompt`
- [ ] Ensure original prompt is preserved but not used
- [ ] Add logging to track prompt usage
- [ ] Test with selected structured prompt flow

## Files to Modify

1. `worker/src/services/ai/workflow-pipeline-orchestrator.ts`
2. `worker/src/services/workflow-lifecycle-manager.ts`
3. `worker/src/api/generate-workflow.ts`
4. `worker/src/services/ai/prompt-understanding-service.ts` (already uses structured prompt detection)
5. `worker/src/services/ai/intent-extractor.ts`
6. `worker/src/services/ai/intent-aware-planner.ts`
7. `worker/src/services/ai/workflow-builder.ts`
8. All validator services

## Testing Requirements

1. ✅ Original prompt preserved in context
2. ✅ Selected structured prompt used for all analysis
3. ✅ Selected structured prompt used for all validation
4. ✅ Selected structured prompt used for workflow generation
5. ✅ No references to original prompt in workflow generation logic
6. ✅ Logging shows correct prompt usage
