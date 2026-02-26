# Workflow DSL System

A Domain-Specific Language (DSL) system that acts as an intermediate representation between StructuredIntent and Workflow Graph.

## Pipeline

```
prompt → intent → DSL → workflow graph
```

**Key Rule**: LLM cannot generate workflow graph directly. It must go through DSL.

## Architecture

### Components

1. **DSLGenerator** (`workflow-dsl.ts`)
   - Converts `StructuredIntent` to `WorkflowDSL`
   - Categorizes actions into data sources, transformations, outputs
   - Builds execution order
   - Validates DSL structure

2. **WorkflowDSLCompiler** (`workflow-dsl-compiler.ts`)
   - Compiles `WorkflowDSL` to `Workflow` graph
   - Creates nodes from DSL definitions
   - Creates edges based on execution order
   - Validates node types against NodeLibrary
   - Uses schema-driven connection resolver

3. **ProductionWorkflowBuilder** (updated)
   - Uses DSL as intermediate step
   - Enforces DSL → Graph pipeline
   - Prevents direct graph generation

## DSL Structure

```typescript
interface WorkflowDSL {
  trigger: DSLTrigger;              // Workflow trigger
  dataSources: DSLDataSource[];    // Data sources (read operations)
  transformations: DSLTransformation[]; // Transformations (AI processing)
  outputs: DSLOutput[];            // Output actions (write operations)
  executionOrder: DSLExecutionStep[]; // Deterministic execution order
  conditions?: DSLCondition[];     // Conditional logic
  metadata?: {...};                 // Metadata
}
```

### DSL Trigger

```typescript
interface DSLTrigger {
  type: 'manual_trigger' | 'schedule' | 'webhook' | 'form' | 'chat_trigger';
  config?: {
    interval?: 'hourly' | 'daily' | 'weekly' | 'monthly';
    schedule?: string; // Cron expression
    cron?: string;
  };
}
```

### DSL Data Source

```typescript
interface DSLDataSource {
  id: string;
  type: string; // Node type (e.g., 'google_sheets', 'database')
  operation: 'read' | 'fetch' | 'get' | 'query';
  config?: Record<string, any>;
  description?: string;
}
```

### DSL Transformation

```typescript
interface DSLTransformation {
  id: string;
  type: string; // Node type (e.g., 'text_summarizer', 'ollama_llm')
  operation: 'summarize' | 'analyze' | 'classify' | 'translate' | 'extract' | 'transform' | 'process';
  input?: {
    sourceId: string; // ID of data source or previous transformation
    field?: string; // Specific field to transform
  };
  config?: Record<string, any>;
  description?: string;
}
```

### DSL Output

```typescript
interface DSLOutput {
  id: string;
  type: string; // Node type (e.g., 'gmail', 'slack_message')
  operation: 'send' | 'write' | 'create' | 'update' | 'notify';
  input?: {
    sourceId: string; // ID of data source or transformation
    field?: string; // Specific field to output
  };
  config?: Record<string, any>;
  description?: string;
}
```

### DSL Execution Step

```typescript
interface DSLExecutionStep {
  stepId: string;
  stepType: 'trigger' | 'data_source' | 'transformation' | 'output' | 'condition';
  stepRef: string; // Reference to trigger/dataSource/transformation/output/condition ID
  dependsOn?: string[]; // Step IDs this step depends on
  order: number; // Execution order (0 = first)
}
```

## Usage

### Generate DSL from Intent

```typescript
import { dslGenerator } from './workflow-dsl';

const dsl = dslGenerator.generateDSL(structuredIntent, originalPrompt);

// Validate DSL
const validation = dslGenerator.validateDSL(dsl);
if (!validation.valid) {
  console.error('DSL validation failed:', validation.errors);
}
```

### Compile DSL to Workflow

```typescript
import { workflowDSLCompiler } from './workflow-dsl-compiler';

const result = workflowDSLCompiler.compile(dsl);

if (result.success) {
  const workflow = result.workflow;
  console.log(`Workflow: ${workflow.nodes.length} nodes, ${workflow.edges.length} edges`);
} else {
  console.error('Compilation failed:', result.errors);
}
```

### Complete Pipeline

```typescript
// 1. Prompt → StructuredIntent (via IntentStructurer)
const structuredIntent = await intentStructurer.structureIntent(userPrompt);

// 2. StructuredIntent → DSL (via DSLGenerator)
const dsl = dslGenerator.generateDSL(structuredIntent, userPrompt);

// 3. DSL → Workflow Graph (via WorkflowDSLCompiler)
const compilationResult = workflowDSLCompiler.compile(dsl);

if (compilationResult.success) {
  const workflow = compilationResult.workflow;
  // Use workflow
}
```

## Benefits

1. **Deterministic**: DSL is a structured, deterministic representation
2. **Validatable**: DSL can be validated before compilation
3. **Traceable**: DSL provides clear traceability from intent to graph
4. **Type-Safe**: DSL enforces type safety before graph generation
5. **LLM Isolation**: LLM cannot generate graph directly - must go through DSL

## Validation

DSL validation checks:
- Trigger exists and is valid
- Execution order is non-empty
- Step references are valid
- Dependencies are valid
- Transformations have input sources
- Outputs have input sources

## Example

### Input: StructuredIntent

```json
{
  "trigger": "manual_trigger",
  "actions": [
    {
      "type": "google_sheets",
      "operation": "read",
      "config": { "sheetId": "..." }
    },
    {
      "type": "text_summarizer",
      "operation": "summarize"
    },
    {
      "type": "gmail",
      "operation": "send",
      "config": { "to": "..." }
    }
  ]
}
```

### Output: WorkflowDSL

```json
{
  "trigger": {
    "type": "manual_trigger"
  },
  "dataSources": [
    {
      "id": "ds_0",
      "type": "google_sheets",
      "operation": "read"
    }
  ],
  "transformations": [
    {
      "id": "tf_1",
      "type": "text_summarizer",
      "operation": "summarize",
      "input": {
        "sourceId": "ds_0"
      }
    }
  ],
  "outputs": [
    {
      "id": "out_2",
      "type": "gmail",
      "operation": "send",
      "input": {
        "sourceId": "tf_1"
      }
    }
  ],
  "executionOrder": [
    {
      "stepId": "step_trigger",
      "stepType": "trigger",
      "stepRef": "trigger",
      "order": 0
    },
    {
      "stepId": "step_ds_0",
      "stepType": "data_source",
      "stepRef": "ds_0",
      "dependsOn": ["step_trigger"],
      "order": 1
    },
    {
      "stepId": "step_tf_1",
      "stepType": "transformation",
      "stepRef": "tf_1",
      "dependsOn": ["step_ds_0"],
      "order": 2
    },
    {
      "stepId": "step_out_2",
      "stepType": "output",
      "stepRef": "out_2",
      "dependsOn": ["step_tf_1"],
      "order": 3
    }
  ]
}
```

### Output: Workflow Graph

```typescript
{
  nodes: [
    { id: "...", type: "manual_trigger", ... },
    { id: "...", type: "google_sheets", ... },
    { id: "...", type: "text_summarizer", ... },
    { id: "...", type: "gmail", ... }
  ],
  edges: [
    { source: "trigger", target: "google_sheets", ... },
    { source: "google_sheets", target: "text_summarizer", ... },
    { source: "text_summarizer", target: "gmail", ... }
  ]
}
```

## Integration

The DSL system is integrated into `ProductionWorkflowBuilder`:

```typescript
// STEP 1: Generate DSL from StructuredIntent
const dsl = dslGenerator.generateDSL(intent, originalPrompt);

// STEP 2: Validate DSL
const dslValidation = dslGenerator.validateDSL(dsl);

// STEP 3: Compile DSL to Workflow Graph
const dslCompilationResult = workflowDSLCompiler.compile(dsl);

// STEP 4: Continue with workflow validation and processing
```

## Security

- **LLM Isolation**: LLM cannot generate workflow graph directly
- **Type Validation**: All node types validated against NodeLibrary
- **Schema Validation**: All connections validated using schema-driven resolver
- **DSL Validation**: DSL validated before compilation

## Future Enhancements

1. **DSL Serialization**: Save/load DSL as JSON
2. **DSL Versioning**: Support DSL versioning for backward compatibility
3. **DSL Optimization**: Optimize DSL before compilation
4. **DSL Visualization**: Visualize DSL structure
5. **DSL Testing**: Unit tests for DSL generation and compilation
