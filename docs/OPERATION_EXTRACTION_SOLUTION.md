# Operation Extraction Solution

## Problem Analysis

### Root Cause
The DSL generator was failing to correctly categorize nodes because operations were missing or incorrectly extracted from user prompts. This caused:
- `google_gmail` with operation `"send"` being categorized as DATASOURCE (using default `"read"`)
- DSL validation failing: "WorkflowDSL missing outputs array or outputs is empty"

### Why Operations Were Missing

1. **Intent Extraction Layer** (IntentStructurer/IntentAwarePlanner):
   - Uses LLM to extract operations from prompt
   - Operations might be missing if LLM doesn't extract them correctly
   - IntentAwarePlanner tries to match verbs to schema operations, but defaults to category-based if confidence is low

2. **DSL Generator Layer** (workflow-dsl.ts):
   - Line 715: `const operation = action.operation || 'read';` - **defaulted to 'read' if missing**
   - This was the critical bug: it should infer from prompt context instead of defaulting

## Solution Architecture

### Three-Layer Operation Inference

**Priority Order:**
1. **Intent Operation** (from StructuredIntent) - Highest priority
2. **Prompt Keywords** (contextual inference) - Medium priority  
3. **Schema Default** (from node schema) - Fallback

### Implementation

#### 1. Operation Inference Method (`inferOperationFromPromptContext`)

Located in: `worker/src/services/ai/workflow-dsl.ts`

**Step 1: Check Prompt Keywords Near Node Type**
- Extracts 50-character context window around node type mention
- Looks for operation keywords:
  - **Write/Output**: `send`, `post`, `write`, `create`, `update`, `notify`, `deliver`, `publish`, `share`
  - **Read/DataSource**: `read`, `get`, `fetch`, `retrieve`, `pull`, `extract`, `grab`, `obtain`
  - **Transform**: `transform`, `process`, `analyze`, `summarize`, `classify`, `translate`, `generate`

**Step 2: Node Type Context Heuristics**
- **Email nodes** (gmail, email, mail): Default to `"send"` if prompt mentions send/post/notify
- **Data source nodes** (sheets, database, db): Default to `"read"` unless prompt mentions write/create

**Step 3: Schema Default Operation**
- Extracts from `schema.configSchema.optional.operation.examples[0]` or `default`

**Step 4: Category-Based Fallback**
- Uses capability registry to determine category:
  - Output nodes → `"send"`
  - Transformation nodes → `"transform"`
  - Data source nodes → `"read"`

#### 2. Integration Point

**Location**: `worker/src/services/ai/workflow-dsl.ts` (line ~763)

```typescript
// ✅ CRITICAL FIX: Infer operation from prompt context if missing
// Priority: 1. Intent operation → 2. Prompt keywords → 3. Schema default
let operation = action.operation;
if (!operation) {
  operation = this.inferOperationFromPromptContext(
    actionType,
    rawType,
    originalPrompt || '',
    finalSchema
  );
  console.log(`[DSLGenerator] 🔍 Inferred operation "${operation}" for "${actionType}" from prompt context`);
}
```

## How It Works

### Example: "get data from google sheets, summarise it and send it to gmail"

**Before Fix:**
1. Intent extraction: `google_gmail` with operation `"send"` ✅
2. DSL generator: Operation missing → defaults to `"read"` ❌
3. Categorization: `"read"` → DATASOURCE ❌
4. Result: 0 outputs → Validation fails ❌

**After Fix:**
1. Intent extraction: `google_gmail` with operation `"send"` ✅
2. DSL generator: Operation missing → **infers from prompt**:
   - Finds "send it to gmail" in prompt
   - Detects `"send"` keyword near `"gmail"`
   - Returns `"send"` ✅
3. Categorization: `"send"` → OUTPUT ✅
4. Result: 1 output → Validation passes ✅

### Example: "read data from sheets and send email"

**Operation Inference:**
- `google_sheets`: Prompt has `"read"` → operation = `"read"` ✅
- `google_gmail`: Prompt has `"send"` → operation = `"send"` ✅

## Benefits

1. **Universal**: Works for ALL nodes, not hardcoded patches
2. **Context-Aware**: Uses prompt keywords, not just schema defaults
3. **Fallback Chain**: Multiple layers ensure operation is always found
4. **Intent Preservation**: Prioritizes intent operation when available
5. **No Breaking Changes**: Only activates when operation is missing

## Testing

### Test Cases

1. **"send email to gmail"**
   - Expected: `google_gmail` with operation `"send"` → OUTPUT ✅

2. **"get data from sheets"**
   - Expected: `google_sheets` with operation `"read"` → DATASOURCE ✅

3. **"summarize data and send to slack"**
   - Expected: `ai_chat_model` with operation `"transform"` → TRANSFORMATION ✅
   - Expected: `slack_message` with operation `"send"` → OUTPUT ✅

4. **"read sheets, process, write to database"**
   - Expected: `google_sheets` with operation `"read"` → DATASOURCE ✅
   - Expected: `postgresql` with operation `"write"` → OUTPUT ✅

## Future Enhancements

1. **Enhanced Verb Matching**: Use semantic similarity for verb-to-operation matching
2. **Multi-Operation Support**: Handle nodes that support multiple operations
3. **Operation Validation**: Validate inferred operations against schema before use
4. **Confidence Scoring**: Return confidence scores for inferred operations

## Related Files

- `worker/src/services/ai/workflow-dsl.ts` - Main implementation
- `worker/src/services/ai/intent-aware-planner.ts` - Intent extraction
- `worker/src/services/ai/intent-structurer.ts` - Legacy intent structurer
- `worker/src/core/contracts/pipeline-stage-contracts.ts` - DSL validation

## Summary

The solution ensures operations are correctly inferred from prompt context when missing, preventing categorization errors and ensuring DSL validation passes. It uses a multi-layer fallback approach that prioritizes intent operations, then prompt keywords, then schema defaults.
