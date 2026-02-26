# Priority-Based Workflow Loading System

## Overview

The system now loads and matches workflows using a **priority-based approach** to ensure the most relevant, real-world workflows are checked first and preferred during matching.

---

## Priority Levels

### Priority 1: Modern Workflow Examples (Highest Priority)
- **Source**: `modern_workflow_examples.json`
- **Count**: 40 workflows
- **Priority Boost**: +10% similarity score boost
- **Use Case**: Real-world business scenarios, production-tested patterns
- **Examples**: Sales agents, CRM workflows, customer support automation

### Priority 2: High-Value Training Workflows
- **Source**: `workflow_training_dataset_300.json` (subset)
- **Count**: Variable (based on category and complexity)
- **Priority Boost**: +5% similarity score boost
- **Categories**: CRM, Sales, AI Agent, AI Processing, Multi-Step, Integration, Automation, Customer Support, HR, Marketing
- **Complexity**: Complex or Medium workflows in high-value categories
- **Use Case**: Most commonly requested workflow patterns

### Priority 3: Medium-Value Training Workflows
- **Source**: `workflow_training_dataset_300.json` (subset)
- **Count**: Variable (based on category and complexity)
- **Priority Boost**: +2% similarity score boost
- **Categories**: Data Sync, Transformation, Conditional, Scheduled, Form Processing, Webhook, Data Processing
- **Complexity**: Complex workflows in medium-value categories, or any complexity in medium-value categories
- **Use Case**: Frequently used workflow patterns

### Priority 4: Standard Training Workflows
- **Source**: `workflow_training_dataset_300.json` (subset)
- **Count**: Variable (remaining workflows)
- **Priority Boost**: 0% (base score only)
- **Categories**: Notification, API Integration, Error Handling, Social Media, and others
- **Complexity**: Simple workflows in standard categories
- **Use Case**: Comprehensive coverage of all node types and patterns

---

## How Priority Works

### 1. Loading Order
Workflows are loaded in priority order:
1. **Priority 1** workflows loaded first (modern examples - 40 workflows)
2. **Priority 2** workflows loaded second (high-value training - variable count)
3. **Priority 3** workflows loaded third (medium-value training - variable count)
4. **Priority 4** workflows loaded last (standard training - variable count)
5. Array is sorted by priority (Priority 1 → Priority 2 → Priority 3 → Priority 4)

### 2. Matching Process
When matching a user prompt:

1. **All workflows are scored** using:
   - Structural matching (60%): Trigger type + action types
   - AI-based description matching (40%): Semantic similarity

2. **Priority boost applied**:
   - Priority 1 workflows: Base score + 10% boost
   - Priority 2 workflows: Base score + 5% boost
   - Priority 3 workflows: Base score + 2% boost
   - Priority 4 workflows: Base score only (0% boost)

3. **Final sorting**:
   - Primary: Final score (descending)
   - Tiebreaker: Priority level (ascending - lower number wins)

### 3. Example Scenario

**User Prompt**: "create a sales agent"

**Workflow A** (Priority 1 - Modern Example):
- Base similarity: 85%
- Priority boost: +10%
- **Final score: 95%** ✅ Selected

**Workflow B** (Priority 2 - High-Value Training, CRM category):
- Base similarity: 88%
- Priority boost: +5%
- **Final score: 93%** ❌ Not selected

**Workflow C** (Priority 3 - Medium-Value Training):
- Base similarity: 90%
- Priority boost: +2%
- **Final score: 92%** ❌ Not selected

**Workflow D** (Priority 4 - Standard Training):
- Base similarity: 92%
- Priority boost: 0%
- **Final score: 92%** ❌ Not selected

Even though other workflows have higher base similarity, Workflow A wins due to highest priority boost.

---

## Benefits

1. **Real-world patterns prioritized**: Modern examples (production-tested) are preferred
2. **Better matching**: Priority boost ensures relevant modern workflows are selected
3. **Maintains quality**: Training dataset still available for comprehensive coverage
4. **Transparent logging**: Priority and source are logged for debugging

---

## Logging Output

When matching, you'll see:
```
[WorkflowStructureBuilder] Checking 330 sample workflows for matching (priority-based)...
[WorkflowStructureBuilder]   Priority 1 (modern examples): 40
[WorkflowStructureBuilder]   Priority 2 (high-value training): 85
[WorkflowStructureBuilder]   Priority 3 (medium-value training): 120
[WorkflowStructureBuilder]   Priority 4 (standard training): 85
[WorkflowStructureBuilder] Best match: modern_workflow_001 (score: 95.0% (base: 85.0% + priority boost: 10.0%), priority: 1 [modern], source: modern_examples)
[WorkflowStructureBuilder]   Goal: "create a sales agent"
```

---

## Configuration

Priority levels are set in `workflow-training-service.ts`:
- Priority 1: Modern examples (`_priority: 1`)
- Priority 2: High-value training workflows (CRM, AI Agent, Multi-Step, etc.)
- Priority 3: Medium-value training workflows (Data Sync, Transformation, etc.)
- Priority 4: Standard training workflows (Notification, API Integration, etc.)

Priority classification is based on:
- **Category**: High-value categories (CRM, Sales, AI Agent) → Priority 2
- **Category**: Medium-value categories (Data Sync, Transformation) → Priority 3
- **Category**: Standard categories (Notification, API Integration) → Priority 4
- **Complexity**: Complex workflows get priority boost within their category

Priority boost is configured in `workflow-structure-builder.ts`:
- Priority 1 boost: `+10%` (0.10)
- Priority 2 boost: `+5%` (0.05)
- Priority 3 boost: `+2%` (0.02)
- Priority 4 boost: `0%` (0.00)

---

## Last Updated
2026-02-19 - Priority-based loading implemented ✅
