# Intent Confidence Scoring System

## Overview

The Intent Confidence Scoring System computes confidence scores for structured intents and triggers expansion when confidence is low (< 0.9). This ensures that abstract or incomplete intents are properly expanded before workflow generation.

## Architecture

### Components

1. **IntentConfidenceScorer** (`worker/src/services/ai/intent-confidence-scorer.ts`)
   - Computes confidence scores based on multiple factors
   - Provides detailed analysis and recommendations

2. **Pipeline Integration** (`worker/src/services/ai/workflow-pipeline-orchestrator.ts`)
   - Integrates confidence scoring after intent validation
   - Triggers expansion based on confidence threshold
   - Stores pipeline context with all intent processing state

## Confidence Score Calculation

### Factors (Weighted)

1. **Semantic Similarity** (40%)
   - Similarity to sample workflows
   - Range: 0-1
   - Default: 0.5 if not provided

2. **Node Match Coverage** (30%)
   - Percentage of node types that exist in NodeLibrary
   - Range: 0-1
   - Penalty for unresolved node types

3. **Missing Fields Penalty** (20%)
   - Percentage of required fields that are present
   - Required fields: `trigger`, `actions`
   - Range: 0-1

4. **Vague Keywords Penalty** (10%)
   - Presence of vague keywords reduces confidence
   - Vague keywords: agent, workflow, automation, sales, crm, marketing, etc.
   - Penalty: 0 keywords = 1.0, 1 keyword = 0.9, 2 keywords = 0.8, 3+ keywords = 0.6

### Final Score

```typescript
confidence_score = 
  (semantic_similarity * 0.4) +
  (node_match_coverage * 0.3) +
  (missing_fields_penalty * 0.2) +
  (vague_keywords_penalty * 0.1)
```

## Pipeline Flow

### Step 1.5: Intent Validation
- Validates intent completeness
- Checks for concrete actions/data sources

### Step 1.6: Similarity Calculation
- Calculates semantic similarity to sample workflows
- Used as input for confidence scoring

### Step 1.65: Confidence Scoring (NEW)
- Computes confidence score
- Analyzes node coverage, missing fields, vague keywords
- Generates recommendations

### Step 1.7: Intent Expansion
- **If confidence < 0.9**: Triggers expansion
- **If confidence >= 0.9**: Skips expansion (but still requires confirmation)
- Expansion enriches intent, never replaces it

## Pipeline Context

The pipeline context stores all intent processing state:

```typescript
interface PipelineContext {
  original_prompt: string;
  structured_intent: StructuredIntent;
  expanded_intent?: ExpandedIntent;
  confidence_score: number;
  requires_confirmation: boolean;
  confidence_breakdown?: IntentConfidenceScore;
}
```

## Expansion Behavior

### When Confidence < 0.9

1. **Trigger Expansion**
   - Calls `intentAutoExpander.expandIntent()`
   - Generates safe, concrete interpretation
   - Attaches `expanded_intent` to pipeline context
   - Sets `requires_confirmation = true`

2. **Auto-Confirmation**
   - If `AUTO_CONFIRM_EXPANDED_INTENT=true`: Auto-confirms and continues
   - Otherwise: Blocks and requires user confirmation

### When Confidence >= 0.9

1. **Skip Expansion**
   - No expansion needed
   - Still requires confirmation before execution
   - Sets `requires_confirmation = true`

## Expansion Rules

### Critical: Expansion Never Replaces User Intent

The expansion system:
- ✅ **Enriches** the intent with assumptions
- ✅ **Preserves** the original prompt
- ✅ **Preserves** the structured intent
- ✅ **Adds** expanded interpretation as additional context
- ❌ **Never replaces** the original intent

### Example

**Original Prompt**: "Create a sales workflow"

**Structured Intent**:
```json
{
  "trigger": "manual_trigger",
  "actions": []
}
```

**Expanded Intent** (enrichment):
```
**Workflow Goal**: Automate sales processes including lead management and follow-up
**Assumed Trigger**: Manual trigger or schedule (daily)
**Assumed Actions**:
1. Read leads from CRM (HubSpot)
2. Send follow-up emails via Gmail
3. Update lead status in CRM
**Assumed Services**: HubSpot CRM, Gmail
```

**Result**: Original intent is preserved, expansion adds context for workflow generation.

## API Response

The `PipelineResult` includes:

```typescript
{
  success: boolean;
  workflow?: Workflow;
  structuredIntent?: StructuredIntent;
  pipelineContext?: PipelineContext;  // NEW
  expandedIntent?: ExpandedIntent;
  errors: string[];
  warnings: string[];
  // ...
}
```

## Confidence Score Breakdown

```typescript
interface IntentConfidenceScore {
  confidence_score: number;  // 0-1
  factors: {
    semantic_similarity: number;
    node_match_coverage: number;
    missing_fields_penalty: number;
    vague_keywords_penalty: number;
  };
  analysis: {
    unresolved_node_types: string[];
    missing_fields: string[];
    vague_keywords_found: string[];
    recommendations: string[];
  };
}
```

## Usage Example

```typescript
// In pipeline orchestrator
const confidenceScore = await intentConfidenceScorer.computeConfidence(
  structuredIntent,
  userPrompt,
  similarityScore
);

if (confidenceScore.confidence_score < 0.9) {
  // Trigger expansion
  const expandedIntent = await intentAutoExpander.expandIntent(...);
  requiresConfirmation = true;
}

// Store in pipeline context
const pipelineContext: PipelineContext = {
  original_prompt: userPrompt,
  structured_intent: structuredIntent,
  expanded_intent: expandedIntent || undefined,
  confidence_score: confidenceScore.confidence_score,
  requires_confirmation: requiresConfirmation,
  confidence_breakdown: confidenceScore,
};
```

## Benefits

1. **Proactive Expansion**: Low confidence triggers expansion before workflow generation
2. **Transparent Scoring**: Detailed breakdown of confidence factors
3. **Preserved Intent**: Original intent never replaced, only enriched
4. **Better UX**: Clear recommendations for improving confidence
5. **Context Preservation**: Full pipeline context available for debugging and UX

## Testing

### Test Case 1: High Confidence (>= 0.9)
**Input**: "Read data from Google Sheets and send to Slack"
**Expected**: 
- Confidence >= 0.9
- No expansion
- Still requires confirmation

### Test Case 2: Low Confidence (< 0.9)
**Input**: "Create a sales workflow"
**Expected**:
- Confidence < 0.9
- Expansion triggered
- Expanded intent generated
- Requires confirmation

### Test Case 3: Unresolved Node Types
**Input**: Intent with node type "ai_service" (should be "ai")
**Expected**:
- Node coverage < 1.0
- Lower confidence score
- Recommendations include unresolved node types

### Test Case 4: Missing Fields
**Input**: Intent without trigger or actions
**Expected**:
- Missing fields penalty applied
- Lower confidence score
- Recommendations include missing fields

### Test Case 5: Vague Keywords
**Input**: "Automate my workflow with an agent"
**Expected**:
- Vague keywords penalty applied
- Lower confidence score
- Recommendations suggest replacing vague keywords
