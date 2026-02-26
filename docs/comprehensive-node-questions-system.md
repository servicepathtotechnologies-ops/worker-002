# Comprehensive Node Questions System

## Overview

The Comprehensive Node Questions System ensures that **credentials and operations are asked for EVERY node** in the workflow, not just specific ones like HubSpot. This system generates questions for all nodes systematically, including credentials, operations, and configuration fields.

## Architecture

### Components

1. **`comprehensive-node-questions-generator.ts`**
   - Generates questions for ALL nodes in the workflow
   - Categorizes questions: `credential`, `operation`, `configuration`
   - Orders questions by `askOrder` (0 = credentials, 1 = operations, 2+ = configuration)

2. **Integration in `generate-workflow.ts`**
   - Generates comprehensive questions after workflow graph creation
   - Merges comprehensive questions into `discoveredInputs` for frontend
   - Returns `comprehensiveQuestions` array for advanced use cases

### Question Flow

```
Workflow Generation
    ↓
Generate Workflow Graph (nodes + edges)
    ↓
Discover Credentials (all nodes)
    ↓
Generate Comprehensive Questions (all nodes)
    ├── Credential Questions (askOrder: 0)
    ├── Operation Questions (askOrder: 1)
    └── Configuration Questions (askOrder: 2+)
    ↓
Merge into discoveredInputs
    ↓
Return to Frontend
```

## Question Categories

### 1. Credential Questions (askOrder: 0)
- **When**: Asked first for every node that requires credentials
- **Fields**: `credentialId`, `apiKey`, `apiToken`, `webhookUrl`, etc.
- **Format**: `cred_<nodeId>_<fieldName>`
- **Example**: `cred_node123_credentialId`

### 2. Operation Questions (askOrder: 1)
- **When**: Asked after credentials, for nodes with `operation` field
- **Fields**: `operation` (with select options)
- **Format**: `op_<nodeId>_<fieldName>`
- **Example**: `op_node123_operation` with options: `['get', 'create', 'update', 'delete']`

### 3. Configuration Questions (askOrder: 2+)
- **When**: Asked after operations, for other required fields
- **Fields**: `properties`, `data`, `resource`, `objectId`, etc.
- **Format**: `config_<nodeId>_<fieldName>`
- **Example**: `config_node123_properties` (JSON field)

## Answer Handling

### Answer Format

Answers can be provided in multiple formats:

1. **Comprehensive Question Format**:
   - `cred_<nodeId>_<fieldName>` → Applied to `node.config[fieldName]`
   - `op_<nodeId>_<fieldName>` → Applied to `node.config[fieldName]`
   - `config_<nodeId>_<fieldName>` → Applied to `node.config[fieldName]`

2. **Legacy Format** (still supported):
   - `req_<nodeId>_<fieldName>` → Applied to `node.config[fieldName]`
   - Direct field names: `credentialId`, `operation` → Applied to matching nodes

### JSON Field Formatting

JSON fields (like `properties` for HubSpot) are automatically formatted:
- String JSON is parsed and re-stringified for proper formatting
- Objects/arrays are validated and formatted
- Ensures proper JSON structure in node configs

## Example: HubSpot Contact Creation

### Workflow Prompt
```
When I receive a POST request to my webhook endpoint, extract the customer email and name from the request body, then create a new contact in HubSpot.
```

### Generated Questions (in order)

1. **Credential Question** (askOrder: 0)
   - ID: `cred_hubspot_node_credentialId`
   - Text: "Which HubSpot connection should we use for 'HubSpot'?"
   - Type: `credential`
   - Category: `credential`

2. **Operation Question** (askOrder: 1)
   - ID: `op_hubspot_node_operation`
   - Text: "What operation should 'HubSpot' perform?"
   - Type: `select`
   - Category: `operation`
   - Options: `['get', 'getMany', 'create', 'update', 'delete', 'search']`

3. **Resource Question** (askOrder: 2)
   - ID: `config_hubspot_node_resource`
   - Text: "Which HubSpot object are we working with?"
   - Type: `select`
   - Category: `configuration`
   - Options: `['contact', 'company', 'deal', 'ticket']`

4. **Properties Question** (askOrder: 5, depends on operation='create')
   - ID: `config_hubspot_node_properties`
   - Text: "What properties should we set?"
   - Type: `json`
   - Category: `configuration`
   - Example: `{ "email": "{{$json.email}}", "firstname": "{{$json.name}}" }`

### Answer Application

When user provides answers:
```json
{
  "cred_hubspot_node_credentialId": "cred_123",
  "op_hubspot_node_operation": "create",
  "config_hubspot_node_resource": "contact",
  "config_hubspot_node_properties": "{\"email\": \"{{$json.email}}\", \"firstname\": \"{{$json.name}}\"}"
}
```

Applied to node config:
```json
{
  "credentialId": "cred_123",
  "operation": "create",
  "resource": "contact",
  "properties": {
    "email": "{{$json.email}}",
    "firstname": "{{$json.name}}"
  }
}
```

## Frontend Integration

### Response Structure

```typescript
{
  phase: 'ready',
  workflow: { nodes, edges },
  discoveredInputs: [
    // Merged from comprehensiveQuestions (operations + config)
    {
      id: 'op_node123_operation',
      nodeId: 'node123',
      nodeType: 'hubspot',
      fieldName: 'operation',
      category: 'operation',
      askOrder: 1,
      options: [...],
      ...
    },
    {
      id: 'config_node123_properties',
      nodeId: 'node123',
      nodeType: 'hubspot',
      fieldName: 'properties',
      category: 'configuration',
      askOrder: 5,
      type: 'json',
      ...
    }
  ],
  discoveredCredentials: [
    // Credentials (not merged, shown separately)
    {
      provider: 'hubspot',
      type: 'api_key',
      vaultKey: 'hubspot',
      displayName: 'HubSpot API Key',
      nodeIds: ['node123'],
      ...
    }
  ],
  comprehensiveQuestions: [
    // Full comprehensive questions array (for advanced use)
    ...
  ]
}
```

### Display Order

Frontend displays questions in this order:
1. **Credentials** (from `discoveredCredentials`) - OAuth buttons or credential selectors
2. **Operations** (from `discoveredInputs` where `category === 'operation'`) - Select dropdowns
3. **Configuration** (from `discoveredInputs` where `category === 'configuration'`) - Text inputs, textareas, JSON editors

## Benefits

1. **Complete Coverage**: Every node gets credential and operation questions
2. **Proper Ordering**: Questions asked in logical sequence (credentials → operations → config)
3. **JSON Formatting**: JSON fields properly formatted and validated
4. **Backward Compatible**: Legacy answer formats still supported
5. **Frontend Ready**: Questions merged into existing `discoveredInputs` structure

## Testing

To test the system:

1. Create a workflow with multiple nodes (e.g., Webhook → Extract → HubSpot)
2. Check that questions are generated for ALL nodes
3. Verify credentials are asked for each node that needs them
4. Verify operations are asked for nodes with operation fields
5. Submit answers and verify they're applied correctly to node configs
6. Check JSON fields are properly formatted

## Future Enhancements

- [ ] Conditional questions based on operation selection
- [ ] Smart defaults based on workflow context
- [ ] Question dependencies and validation
- [ ] Multi-step question flows for complex nodes
