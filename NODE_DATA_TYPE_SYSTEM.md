# Node Data Type System

## Overview

The Node Data Type System enforces type compatibility between workflow nodes. Each node declares its input and output types, and the system validates connections before allowing them.

## Data Types

### Defined Types

- **`text`**: String data
- **`array`**: Array of items (e.g., rows from Google Sheets)
- **`object`**: JSON object (e.g., API responses)
- **`binary`**: Binary data (files, images, etc.)
- **`any`**: Wildcard type (accepts any input)

## Node Type Declarations

Each node declares:
- **`inputType`**: What type(s) of data it accepts
- **`outputType`**: What type of data it produces

### Example Node Type Info

```typescript
{
  nodeType: 'google_sheets',
  inputType: DataType.ANY,  // No input required
  outputType: DataType.ARRAY // Produces array of rows
}

{
  nodeType: 'text_summarizer',
  inputType: [DataType.TEXT, DataType.ARRAY], // Can accept both
  outputType: DataType.TEXT // Produces text summary
}

{
  nodeType: 'google_gmail',
  inputType: [DataType.TEXT, DataType.OBJECT], // Email body/text
  outputType: DataType.TEXT // Output actions typically don't produce data
}
```

## Type Compatibility Rules

### Direct Compatibility

- **Exact match**: `text` → `text` ✅
- **Array match**: `array` → `[text, array]` ✅ (target accepts array)
- **Wildcard**: `any` → `text` ✅ (source accepts any)

### Auto-Transformation

The system can automatically transform types when possible:

1. **array → text**: Join array items or stringify
2. **object → text**: JSON.stringify
3. **array → object**: Take first item or wrap
4. **text → array**: Split or parse
5. **object → array**: Wrap in array

### Incompatible Types

If transformation is not possible, the connection is rejected:

- **array → gmail** ❌ (gmail requires text/object, cannot transform array directly)
- **binary → text** ❌ (binary cannot be transformed to text without explicit conversion)

## Validation Process

### STEP 1: Type Validation

Before connecting nodes, the system validates type compatibility:

```typescript
const compatibility = checkTypeCompatibility(
  sourceNode.outputType,  // e.g., DataType.ARRAY
  targetNode.inputType    // e.g., [DataType.TEXT, DataType.OBJECT]
);
```

### STEP 2: Auto-Transformation

If types are incompatible but transformation is possible:

1. Create transform node (e.g., `format`, `transform`)
2. Insert between source and target
3. Update edges: `source → transform → target`

### STEP 3: Rejection

If transformation is not possible:
- Add error to compilation result
- Reject workflow
- Return explanation to user

## Integration

### Location: `deterministic-workflow-compiler.ts` (STEP 6.6)

**Applied After**:
- Execution ordering (STEP 6.5)

**Applied Before**:
- Workflow validation (STEP 7)

```typescript
// STEP 6.6: Validate and fix type compatibility
const typeValidation = validateWorkflowTypes(workflow.nodes, workflow.edges);

if (!typeValidation.valid) {
  // Attempt auto-transformation
  if (typeValidation.suggestedTransforms.length > 0) {
    const transformResult = nodeDataTypeSystem.autoTransformWorkflow(
      workflow.nodes,
      workflow.edges,
      typeValidation.suggestedTransforms
    );
    workflow = { ...workflow, ...transformResult };
  }
}
```

## Examples

### Example 1: Valid Connection

**Workflow**:
```
google_sheets (output: array) → text_summarizer (input: [text, array]) → google_gmail (input: [text, object])
```

**Validation**:
- ✅ `array` → `[text, array]` (compatible)
- ✅ `text` → `[text, object]` (compatible)

**Result**: ✅ Valid workflow

### Example 2: Auto-Transformation

**Workflow** (incorrect):
```
google_sheets (output: array) → google_gmail (input: [text, object])
```

**Validation**:
- ❌ `array` → `[text, object]` (incompatible, but can transform)

**Auto-Transform**:
```
google_sheets → format (array → text) → google_gmail
```

**Result**: ✅ Valid workflow with transform node

### Example 3: Rejection

**Workflow** (incorrect):
```
binary_data (output: binary) → text_summarizer (input: [text, array])
```

**Validation**:
- ❌ `binary` → `[text, array]` (incompatible, cannot transform)

**Result**: ❌ Workflow rejected

## Type Inference

The system automatically infers node types from node schemas:

### Data Producers
- **Google Sheets**: `outputType: ARRAY`
- **Database**: `outputType: ARRAY`
- **HTTP Request**: `outputType: OBJECT`

### Data Transformers
- **Text Summarizer**: `inputType: [TEXT, ARRAY]`, `outputType: TEXT`
- **Classifier**: `inputType: [TEXT, OBJECT]`, `outputType: OBJECT`
- **Transform**: `inputType: ANY`, `outputType: TEXT`

### Output Actions
- **Gmail**: `inputType: [TEXT, OBJECT]`, `outputType: TEXT`
- **Slack**: `inputType: [TEXT, OBJECT]`, `outputType: TEXT`
- **Database Write**: `inputType: [ARRAY, OBJECT]`, `outputType: OBJECT`

## Benefits

1. **Type Safety**: Prevents invalid connections at compile time
2. **Auto-Fix**: Automatically inserts transform nodes when possible
3. **Clear Errors**: Provides clear error messages for incompatible types
4. **Deterministic**: Same workflow always produces same type validation result

## Type Registry

The system maintains a registry of all node types and their type information:

```typescript
const typeInfo = nodeDataTypeSystem.getNodeTypeInfo('google_sheets');
// Returns: { nodeType: 'google_sheets', inputType: ANY, outputType: ARRAY }
```

## Integration with Capability Registry

The `CapabilityRegistry` also uses the same `DataType` enum:

```typescript
import { DataType } from './node-data-type-system';

export interface NodeCapability {
  nodeType: string;
  inputType: DataType | DataType[];
  outputType: DataType;
  // ...
}
```

This ensures consistency across the system.
