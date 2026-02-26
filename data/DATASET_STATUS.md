# Workflow Dataset Status

## Current Active Datasets

### Primary Dataset
- **File**: `workflow_training_dataset_300.json`
- **Workflows**: 290 unique workflows
- **Status**: ✅ Active (highest priority)
- **Path**: `worker/data/workflow_training_dataset_300.json`

### Additional Dataset
- **File**: `modern_workflow_examples.json`
- **Workflows**: 40 unique workflows
- **Status**: ✅ Active (always loaded)
- **Path**: `worker/data/modern_workflow_examples.json`

### Total Available for AI Matching
**330 unique workflows** (290 + 40)

---

## Duplicate Files (Backed Up)

### `workflow_training_dataset_100.json`
- **Status**: ⚠️ Backed up (all 100 workflows are duplicates)
- **Backup**: `workflow_training_dataset_100.json.backup`
- **Reason**: All workflows in this file exist in `workflow_training_dataset_300.json`
- **Action**: Not loaded (300-file takes priority)

### `workflow_training_dataset.json`
- **Status**: ⚠️ Has JSON syntax error
- **Reason**: Not loaded (300-file takes priority)
- **Note**: Can be fixed if needed, but not currently used

---

## Path Configuration

The system loads datasets in this priority order:
1. `training/workflows/expanded-dataset.json` (if exists - repo-level)
2. `worker/data/workflow_training_dataset_300.json` ✅ **Currently Active**
3. `worker/data/workflow_training_dataset_100.json` (skipped - duplicates)
4. `worker/data/workflow_training_dataset.json` (skipped - has error)

Modern examples are always loaded from:
- `worker/data/modern_workflow_examples.json` ✅ **Always Active**

---

## AI Matching Process

When a user prompt is provided:
1. **330 workflows** are loaded via `workflowTrainingService.getAllWorkflows()`
2. Each workflow is scored using:
   - **Structural matching (60%)**: Trigger type + action types
   - **AI-based description matching (40%)**: Compares prompt with workflow `goal`, `use_case`, `userPrompt`, `category`
3. Best match is selected if similarity ≥ **75% threshold**

---

## Last Updated
- Duplicate check: 2026-02-19
- All paths verified and correct ✅
