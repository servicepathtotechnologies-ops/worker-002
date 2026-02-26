# Intent Capability Mapper

## Overview

The `IntentCapabilityMapper` extracts required capabilities from normalized prompt and maps them to node types. The workflow builder must only use nodes from the allowed capability list.

## Responsibilities

1. ✅ **Extract required capabilities from normalized prompt:**
   - `data_source` - Data sources (Google Sheets, databases, storage)
   - `transformation` - Transformations (AI processing, data manipulation)
   - `output` - Outputs (email, notifications, webhooks)

2. ✅ **Map capabilities to node types**

3. ✅ **Return allowed node list**

## Example

**User Prompt:**
```
"Get data from Google Sheets, summarize, send email"
```

**Capabilities Extracted:**
- `data_source` → `google_sheets`
- `transformation` → `text_summarizer`
- `output` → `gmail`

**Allowed Nodes:**
```typescript
['manual_trigger', 'google_sheets', 'text_summarizer', 'google_gmail']
```

## API

### Function: `mapIntentToCapabilities(intent) → CapabilityMappingResult`

```typescript
import { mapIntentToCapabilities } from './intent-capability-mapper';
import { StructuredIntent } from './intent-structurer';

const intent: StructuredIntent = {
  trigger: "manual_trigger",
  actions: [
    { type: "google_sheets", operation: "read" },
    { type: "summarize", operation: "process" },
    { type: "gmail", operation: "send" }
  ]
};

const result = mapIntentToCapabilities(intent);
// Returns: { allowedNodes, capabilityMappings, statistics }
```

### Class: `IntentCapabilityMapper`

```typescript
import { IntentCapabilityMapper } from './intent-capability-mapper';

const mapper = new IntentCapabilityMapper();
const result = mapper.mapIntentToCapabilities(intent);
```

## Capability Types

### CapabilityType Enum

```typescript
enum CapabilityType {
  DATA_SOURCE = 'data_source',
  TRANSFORMATION = 'transformation',
  OUTPUT = 'output',
  TRIGGER = 'trigger',
  CONDITION = 'condition',
}
```

## Capability Mapping

### Data Source Capabilities

Maps to data source nodes:
- **Google Services**: `google_sheets`, `google_drive`
- **Databases**: `postgresql`, `mysql`, `mongodb`, `database_read`
- **Storage**: `aws_s3`, `dropbox`, `storage_read`
- **Other**: `airtable`, `notion`, `csv`, `excel`

**Detection Rules:**
- Action type contains data source keywords
- Operation is `read`, `get`, or `fetch`
- Node category includes `data`, `source`, `database`, or `storage`

### Transformation Capabilities

Maps to transformation nodes:
- **AI/ML**: `text_summarizer`, `ollama`, `openai_gpt`, `anthropic_claude`, `google_gemini`
- **Data Transformations**: `transform`, `format`, `parse`, `filter`, `map`, `reduce`

**Detection Rules:**
- Action type contains `summarize`, `classify`, `ai`, `llm`, `process`
- Operation is `process`, `transform`, or `analyze`
- Node category includes `transform`, `process`, `ai`, or `ml`

### Output Capabilities

Maps to output nodes:
- **Email**: `google_gmail`
- **Communication**: `slack_message`, `discord`, `telegram`
- **Notifications**: `notification`
- **Webhooks**: `webhook_response`
- **HTTP/API**: `http_request`

**Detection Rules:**
- Action type contains output keywords (`gmail`, `email`, `slack`, `notification`, `webhook`)
- Operation is `send`, `write`, or `post`
- Node category includes `output`, `communication`, or `notification`

## CapabilityMappingResult

```typescript
interface CapabilityMappingResult {
  allowedNodes: string[];              // List of allowed node types
  capabilityMappings: CapabilityMapping[];  // Detailed capability mappings
  statistics: {
    dataSourceCount: number;            // Number of data source capabilities
    transformationCount: number;       // Number of transformation capabilities
    outputCount: number;               // Number of output capabilities
    triggerCount: number;              // Number of trigger capabilities
    conditionCount: number;            // Number of condition capabilities
  };
}
```

## CapabilityMapping

```typescript
interface CapabilityMapping {
  capability: CapabilityType;           // Type of capability
  nodeTypes: string[];                  // Node types that satisfy this capability
  source: string;                       // Which action/intent element this came from
}
```

## Usage Examples

### Example 1: Data Source + Transformation + Output

```typescript
const intent: StructuredIntent = {
  trigger: "manual_trigger",
  actions: [
    { type: "google_sheets", operation: "read" },
    { type: "summarize", operation: "process" },
    { type: "gmail", operation: "send" }
  ]
};

const result = mapIntentToCapabilities(intent);

// Result:
// {
//   allowedNodes: ['manual_trigger', 'google_sheets', 'text_summarizer', 'google_gmail'],
//   capabilityMappings: [
//     { capability: 'trigger', nodeTypes: ['manual_trigger'], source: 'trigger: manual_trigger' },
//     { capability: 'data_source', nodeTypes: ['google_sheets'], source: 'action: google_sheets (read)' },
//     { capability: 'transformation', nodeTypes: ['text_summarizer'], source: 'action: summarize (process)' },
//     { capability: 'output', nodeTypes: ['google_gmail'], source: 'action: gmail (send)' }
//   ],
//   statistics: {
//     dataSourceCount: 1,
//     transformationCount: 1,
//     outputCount: 1,
//     triggerCount: 1,
//     conditionCount: 0
//   }
// }
```

### Example 2: Multiple Data Sources

```typescript
const intent: StructuredIntent = {
  trigger: "manual_trigger",
  actions: [
    { type: "google_sheets", operation: "read" },
    { type: "postgresql", operation: "read" },
    { type: "gmail", operation: "send" }
  ]
};

const result = mapIntentToCapabilities(intent);

// Result:
// {
//   allowedNodes: ['manual_trigger', 'google_sheets', 'postgresql', 'google_gmail'],
//   capabilityMappings: [
//     { capability: 'data_source', nodeTypes: ['google_sheets'], source: 'action: google_sheets (read)' },
//     { capability: 'data_source', nodeTypes: ['postgresql'], source: 'action: postgresql (read)' },
//     { capability: 'output', nodeTypes: ['google_gmail'], source: 'action: gmail (send)' }
//   ],
//   statistics: {
//     dataSourceCount: 2,
//     transformationCount: 0,
//     outputCount: 1,
//     triggerCount: 1,
//     conditionCount: 0
//   }
// }
```

### Example 3: AI Processing

```typescript
const intent: StructuredIntent = {
  trigger: "manual_trigger",
  actions: [
    { type: "google_sheets", operation: "read" },
    { type: "ai_processing", operation: "analyze" },
    { type: "slack", operation: "send" }
  ]
};

const result = mapIntentToCapabilities(intent);

// Result:
// {
//   allowedNodes: ['manual_trigger', 'google_sheets', 'ollama', 'slack_message'],
//   capabilityMappings: [
//     { capability: 'data_source', nodeTypes: ['google_sheets'], source: 'action: google_sheets (read)' },
//     { capability: 'transformation', nodeTypes: ['ollama'], source: 'action: ai_processing (analyze)' },
//     { capability: 'output', nodeTypes: ['slack_message'], source: 'action: slack (send)' }
//   ],
//   statistics: {
//     dataSourceCount: 1,
//     transformationCount: 1,
//     outputCount: 1,
//     triggerCount: 1,
//     conditionCount: 0
//   }
// }
```

## Integration

The `IntentCapabilityMapper` is integrated into the workflow structure builder:

**Location**: `workflow-structure-builder.ts` (STEP 0)

**Applied Before**:
- Workflow structure building (STEP 1)
- Node selection (STEP 2)
- Missing node addition (STEP 3)

**Usage**:
```typescript
// In workflow structure builder (STEP 0)
const { mapIntentToCapabilities } = await import('./intent-capability-mapper');
const capabilityMapping = mapIntentToCapabilities(intent);
const allowedNodeTypes = new Set(capabilityMapping.allowedNodes);

// Filter intent actions to allowed nodes only
intent.actions = intent.actions.filter(action => {
  const normalized = normalizeNodeType({ type: 'custom', data: { type: action.type } });
  return allowedNodeTypes.has(normalized);
});

// Add missing nodes (only from allowed list)
structure = this.addMissingNodes(structure, intent, allowedNodeTypes);
```

## Benefits

1. **Capability-Based Mapping**: Maps user intent to high-level capabilities
2. **Node Type Constraints**: Ensures workflow builder only uses allowed nodes
3. **Intent Compliance**: Workflow matches user requirements exactly
4. **Automatic Filtering**: Filters out nodes not in capability list
5. **Detailed Statistics**: Provides capability breakdown for analysis

## Differences from IntentConstraintEngine

| Feature | IntentConstraintEngine | IntentCapabilityMapper |
|---------|----------------------|----------------------|
| **Focus** | Node-level constraints | Capability-level mapping |
| **Output** | Required node types | Allowed node types + capabilities |
| **Usage** | Validation/constraints | Node selection filtering |
| **Level** | Low-level (nodes) | High-level (capabilities) |

## Capability Detection Rules

### Data Source Detection

1. Action type contains data source keywords:
   - `google_sheets`, `sheets`, `google_drive`, `drive`
   - `postgres`, `postgresql`, `mysql`, `mongodb`, `database`
   - `s3`, `aws s3`, `dropbox`, `storage`
   - `airtable`, `notion`, `csv`, `excel`

2. Operation is `read`, `get`, or `fetch`

3. Node category includes `data`, `source`, `database`, or `storage`

### Transformation Detection

1. Action type contains transformation keywords:
   - `summarize`, `summary`, `classify`, `ai`, `llm`, `process`
   - `transform`, `format`, `parse`, `filter`, `map`, `reduce`

2. Operation is `process`, `transform`, or `analyze`

3. Node category includes `transform`, `process`, `ai`, or `ml`

### Output Detection

1. Action type contains output keywords:
   - `gmail`, `email`, `send_email`
   - `slack`, `discord`, `telegram`
   - `notification`, `notify`
   - `webhook`, `http`, `api`, `request`

2. Operation is `send`, `write`, or `post`

3. Node category includes `output`, `communication`, or `notification`
