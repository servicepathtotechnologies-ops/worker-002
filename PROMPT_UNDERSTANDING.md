# Prompt Understanding Service

## Overview

The Prompt Understanding Service improves understanding of vague prompts by inferring typical workflows, asking clarification when confidence is low, and never guessing tools blindly or auto-confirming without user approval.

## Features

1. **Infer Typical Workflows**: Uses LLM to infer common workflow patterns from vague prompts
2. **Confidence-Based Clarification**: Asks clarification if confidence < 0.8
3. **No Blind Guessing**: Only infers workflows that make logical sense
4. **No Auto-Confirmation**: Always requires user approval

## Example

### Input: Vague Prompt
```
"sales agent"
```

### Output: Understanding Result
```typescript
{
  inferredIntent: {
    trigger: "manual_trigger",
    actions: [
      { type: "hubspot", operation: "read", description: "Read sales data from HubSpot" },
      { type: "google_gmail", operation: "send", description: "Send follow-up email" }
    ],
    requires_credentials: ["hubspot", "google_gmail"]
  },
  confidence: 0.65,
  missingFields: ["data_source", "output_action"],
  clarificationQuestions: [
    "What actions should this workflow perform?",
    "Where should the workflow get data from?",
    "What should the workflow do with the results?"
  ],
  requiresClarification: true,
  reasoning: "Inferred typical sales agent workflow: read CRM data and send follow-up emails"
}
```

## Integration

### Location: `workflow-pipeline-orchestrator.ts` (STEP 0.5)

**Applied Before**:
- Intent structuring (STEP 1)

**Flow**:
1. Analyze prompt for vagueness
2. Infer typical workflow if vague
3. Calculate confidence score
4. If confidence < 0.8:
   - Return inferred intent with clarification questions
   - Require user confirmation
   - Do not proceed to workflow building
5. If confidence >= 0.8:
   - Use inferred intent
   - Continue to workflow building

## Vagueness Detection

The service detects vague prompts by checking:

1. **Single word or generic term**: "sales", "marketing", "agent"
2. **Low word count**: <= 3 words
3. **Missing action verbs**: No clear action (get, fetch, send, etc.)
4. **Missing data sources**: No mention of Sheets, database, API, etc.

## Workflow Inference

### LLM-Based Inference

Uses Ollama orchestrator to infer typical workflows:

```typescript
const systemPrompt = `You are a workflow inference engine. Your task is to infer a typical workflow from a vague user prompt.

Rules:
1. NEVER guess tools blindly - only infer workflows that make logical sense
2. Use common patterns and best practices
3. Infer typical workflows based on the prompt context
4. If the prompt is too vague, infer a minimal, safe workflow
5. Always include a trigger (default to manual_trigger if unclear)`;
```

### Validation

- Validates trigger types (manual_trigger, schedule, webhook, etc.)
- Validates node types against available nodes
- Removes invalid nodes from inference
- Clamps confidence to [0, 1]

## Confidence Calculation

Confidence is calculated based on:

1. **Inference confidence**: Base confidence from LLM
2. **Missing fields penalty**: -0.15 per missing field
3. **No actions penalty**: -0.3 if no actions inferred
4. **Only trigger penalty**: -0.2 if only trigger inferred

**Formula**:
```
confidence = inference.confidence 
           - (missingFields.length * 0.15)
           - (noActions ? 0.3 : 0)
           - (onlyTrigger ? 0.2 : 0)
```

## Clarification Questions

Questions are generated based on missing fields:

- **Missing actions**: "What actions should this workflow perform?"
- **Missing data source**: "Where should the workflow get data from?"
- **Missing output action**: "What should the workflow do with the results?"
- **Missing trigger**: "When should this workflow run?"

Context-specific questions:
- **Sales-related**: "What specific sales tasks should be automated?"
- **Marketing-related**: "What marketing activities should be automated?"

## Return Values

### PromptUnderstandingResult

```typescript
interface PromptUnderstandingResult {
  inferredIntent: StructuredIntent;
  confidence: number;
  missingFields: string[];
  clarificationQuestions?: string[];
  requiresClarification: boolean;
  reasoning: string;
}
```

### Pipeline Result (Low Confidence)

When confidence < 0.8, pipeline returns:

```typescript
{
  success: false,
  structuredIntent: inferredIntent,
  errors: [],
  warnings: [`Low confidence (X%) - clarification required`],
  requiresCredentials: false,
  clarificationRequired: true,
  clarificationQuestions: [...],
  pipelineContext: {
    original_prompt: "...",
    structured_intent: inferredIntent,
    confidence_score: 0.65,
    requires_confirmation: true,
    clarification_questions: [...],
    missing_fields: [...],
    inference_reasoning: "..."
  },
  confidenceScore: {
    confidence_score: 0.65,
    analysis: {
      completeness: 0.6,
      clarity: 0.65,
      recommendations: [...]
    }
  }
}
```

## Benefits

1. **Better Understanding**: Infers workflows from vague prompts
2. **Confidence-Based**: Only proceeds with high confidence
3. **No Blind Guessing**: Only infers logical workflows
4. **User Control**: Always requires approval for low confidence
5. **Clear Communication**: Provides clarification questions

## Examples

### Example 1: Vague Prompt (Low Confidence)

**Input**: `"sales agent"`

**Analysis**:
- Single word → vague
- Missing action verbs → vague
- Missing data sources → vague

**Inference**:
- Trigger: `manual_trigger`
- Actions: `[hubspot.read, google_gmail.send]`
- Confidence: 0.65

**Result**: Requires clarification

### Example 2: Specific Prompt (High Confidence)

**Input**: `"Get data from Google Sheets, summarize it, send email"`

**Analysis**:
- Has action verbs → not vague
- Has data source → not vague
- Has output action → not vague

**Inference**:
- Trigger: `manual_trigger`
- Actions: `[google_sheets.read, text_summarizer.summarize, google_gmail.send]`
- Confidence: 0.95

**Result**: Proceeds to workflow building

### Example 3: Medium Confidence

**Input**: `"automate sales follow-up"`

**Analysis**:
- Has action verb → not vague
- Missing data source → vague
- Missing output action → vague

**Inference**:
- Trigger: `manual_trigger`
- Actions: `[hubspot.read, google_gmail.send]`
- Confidence: 0.75

**Result**: Requires clarification (confidence < 0.8)

## Implementation Details

### Vagueness Analysis

```typescript
private analyzeVagueness(prompt: string): {
  isVague: boolean;
  indicators: string[];
  wordCount: number;
}
```

### Workflow Inference

```typescript
private async inferTypicalWorkflow(
  prompt: string,
  vaguenessAnalysis: {...}
): Promise<WorkflowInference>
```

### Confidence Calculation

```typescript
private calculateConfidence(
  inference: WorkflowInference,
  missingFields: string[]
): number
```

### Clarification Questions

```typescript
private generateClarificationQuestions(
  intent: StructuredIntent,
  missingFields: string[],
  originalPrompt: string
): string[]
```
