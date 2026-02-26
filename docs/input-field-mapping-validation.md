# Input Field Mapping & Template Expression Validation

## Overview

The workflow builder now ensures that all input field values are correctly formatted with template expressions (`{{$json.field}}`) and validated against previous node outputs for proper data flow.

## Key Features

### 1. **Correct Template Format**

All input field values now use the correct template format:
- **From previous nodes**: `{{$json.fieldName}}`
- **From trigger**: `{{input.fieldName}}`

**Before:**
```typescript
{
  to: "{{email}}",           // ❌ Missing $json prefix
  subject: "{{subject}}",    // ❌ Missing $json prefix
  body: "{{message}}"       // ❌ Missing $json prefix
}
```

**After:**
```typescript
{
  to: "{{$json.email}}",           // ✅ Correct format
  subject: "{{$json.subject}}",   // ✅ Correct format
  body: "{{$json.message}}"        // ✅ Correct format
}
```

### 2. **Automatic Field Mapping**

The system automatically maps input fields to previous node outputs:

```typescript
// Example: Gmail node after HubSpot node
// HubSpot outputs: { email: "user@example.com", name: "John" }
// Gmail node automatically maps:
{
  to: "{{$json.email}}",        // Maps to HubSpot's email field
  subject: "Welcome {{$json.name}}", // Maps to HubSpot's name field
  body: "Hi {{$json.name}}..."   // Maps to HubSpot's name field
}
```

### 3. **Type Validation**

The system validates that data types are compatible:

```typescript
// ✅ Valid: string → string
previousNode.output.email (string) → gmail.to (string)

// ✅ Valid: string → email (email is string subtype)
previousNode.output.email (string) → gmail.to (email)

// ⚠️ Warning: number → string (converted)
previousNode.output.count (number) → slack.message (string)

// ❌ Invalid: object → email (cannot convert)
previousNode.output.data (object) → gmail.to (email)
```

### 4. **Field Reference Validation**

All template expressions are validated to ensure:
- The referenced field exists in upstream nodes
- The field path is correct
- The data type is compatible

## Implementation

### Core Components

1. **`input-field-mapper.ts`**
   - Maps input fields to previous node outputs
   - Generates correct template expressions
   - Validates type compatibility

2. **`template-expression-validator.ts`**
   - Validates all template expressions in node configs
   - Checks field references exist
   - Fixes incorrect template formats

3. **`workflow-builder.ts`** (Updated)
   - Uses `{{$json.field}}` format consistently
   - Validates mappings during workflow generation
   - Ensures data flow correctness

### Usage Example

```typescript
import { inputFieldMapper } from './input-field-mapper';
import { validateTemplateExpressions } from './template-expression-validator';

// Map input field
const mapping = inputFieldMapper.mapInputField(
  'to',                    // Field name
  'email',                 // Field type
  gmailNode,               // Target node
  hubspotNode,             // Previous node
  allNodes,                // All nodes
  nodeIndex                // Current index
);

// Result:
// {
//   field: 'to',
//   value: '{{$json.email}}',
//   sourceNodeId: 'hubspot_123',
//   sourceNodeType: 'hubspot',
//   sourceField: 'email',
//   sourceType: 'string',
//   targetType: 'email',
//   valid: true
// }

// Validate all template expressions
const validation = validateTemplateExpressions(
  gmailNode,
  hubspotNode,
  allNodes,
  nodeIndex
);

if (!validation.valid) {
  console.error('Template validation errors:', validation.errors);
}
```

## Node Output Fields

The system knows what fields each node type outputs:

### Triggers
- **webhook**: `body`, `headers`, `queryParams`, `method`
- **form**: `fields`, `submission`, `submittedAt`
- **chat_trigger**: `message`, `userId`, `sessionId`
- **manual_trigger**: `inputData`, `data`

### AI Nodes
- **ai_agent**: `response_text`, `response_json`, `response_markdown`
- **chat_model**: `text`, `response`, `content`

### CRM Nodes
- **hubspot**: `record`, `records`, `contact`, `company`, `deal`
- **zoho_crm**: `record`, `records`, `data`
- **pipedrive**: `deal`, `person`, `organization`
- **notion**: `page`, `pages`, `database`
- **airtable**: `record`, `records`
- **clickup**: `task`, `tasks`

### Communication Nodes
- **google_gmail**: `sentMessage`, `messageId`, `messages`
- **slack_message**: `message`, `ts`, `channel`
- **telegram**: `message`, `messageId`, `chatId`
- **outlook**: `sentMessage`, `messageId`
- **google_calendar**: `event`, `eventId`, `events`

### Social/Dev Nodes
- **linkedin**: `post`, `postId`, `urn`
- **github**: `issue`, `pullRequest`, `repository`
- **twitter**: `tweet`, `tweetId`
- **instagram**: `post`, `postId`, `mediaId`
- **facebook**: `post`, `postId`
- **youtube**: `video`, `videoId`, `playlist`
- **whatsapp_cloud**: `message`, `messageId`, `to`

## Semantic Field Matching

The system uses semantic matching to find the right field:

```typescript
// Field name: "email" or "to"
// Matches: email, to, recipient, userEmail, contactEmail

// Field name: "message" or "text"
// Matches: message, text, content, body, response_text

// Field name: "name"
// Matches: name, firstName, fullName, username

// Field name: "id"
// Matches: id, objectId, recordId, messageId, eventId
```

## Validation Rules

### 1. Required Fields Must Have Values
```typescript
// ✅ Valid
{ to: "{{$json.email}}" }

// ❌ Invalid - missing required field
{ to: "" }
```

### 2. Template Expressions Must Reference Valid Fields
```typescript
// ✅ Valid - email exists in previous node
{ to: "{{$json.email}}" }

// ❌ Invalid - unknownField doesn't exist
{ to: "{{$json.unknownField}}" }
```

### 3. Type Compatibility
```typescript
// ✅ Valid - compatible types
{ count: "{{$json.number}}" }  // number → string (converted)

// ⚠️ Warning - may need conversion
{ email: "{{$json.data}}" }   // object → email (needs extraction)
```

## Integration with Workflow Builder

The workflow builder automatically:

1. **Maps all required fields** to previous node outputs
2. **Uses correct template format** (`{{$json.field}}`)
3. **Validates type compatibility** before assignment
4. **Falls back to defaults** if no match found
5. **Validates entire workflow** after generation

### Example Workflow Generation

```typescript
// User prompt: "When form is submitted, create HubSpot contact, then send Gmail"

// Step 1: Form Trigger
formNode = {
  type: 'form',
  outputs: ['fields', 'submission']
}

// Step 2: HubSpot (creates contact)
hubspotNode = {
  type: 'hubspot',
  config: {
    operation: 'create',
    resource: 'contact',
    properties: {
      email: "{{$json.fields.email}}",    // ✅ Maps from form.fields
      firstname: "{{$json.fields.name}}"  // ✅ Maps from form.fields
    }
  },
  outputs: ['record', 'contact']
}

// Step 3: Gmail (sends email)
gmailNode = {
  type: 'google_gmail',
  config: {
    operation: 'send',
    to: "{{$json.email}}",                 // ✅ Maps from HubSpot.record.email
    subject: "Welcome {{$json.firstname}}", // ✅ Maps from HubSpot.record.firstname
    body: "Hi {{$json.firstname}}..."     // ✅ Maps from HubSpot.record.firstname
  }
}
```

## Validation Functions

### Validate Single Node
```typescript
import { validateTemplateExpressions } from './template-expression-validator';

const validation = validateTemplateExpressions(
  node,
  previousNode,
  allNodes,
  nodeIndex
);

if (!validation.valid) {
  console.error('Errors:', validation.errors);
  console.warn('Warnings:', validation.warnings);
}
```

### Validate Entire Workflow
```typescript
import { validateWorkflowTemplateExpressions } from './template-expression-validator';

const workflowValidation = validateWorkflowTemplateExpressions(
  workflow.nodes,
  workflow.edges
);

if (!workflowValidation.valid) {
  console.error('Workflow validation errors:', workflowValidation.errors);
}
```

### Fix Template Expressions
```typescript
import { fixTemplateExpressions } from './template-expression-validator';

// Fix incorrect formats
const fixedConfig = fixTemplateExpressions({
  to: "{{email}}",        // ❌ Wrong format
  subject: "{{subject}}"  // ❌ Wrong format
});

// Result:
// {
//   to: "{{$json.email}}",      // ✅ Fixed
//   subject: "{{$json.subject}}"  // ✅ Fixed
// }
```

## Best Practices

1. **Always use `{{$json.field}}`** for previous node outputs
2. **Use `{{input.field}}`** for trigger/initial data
3. **Validate before execution** to catch errors early
4. **Check field mappings** to ensure correct data flow
5. **Use semantic matching** for flexible field resolution

## Error Handling

### Common Errors

1. **Field Not Found**
   ```
   Error: Field "email" not found in any upstream node outputs
   ```
   **Solution**: Check previous node outputs or add the field

2. **Type Mismatch**
   ```
   Error: Type mismatch: object cannot be assigned to email
   ```
   **Solution**: Extract specific field from object (e.g., `{{$json.data.email}}`)

3. **Invalid Template Format**
   ```
   Warning: Template expression "{{email}}" should use $json prefix: {{$json.email}}
   ```
   **Solution**: Use `fixTemplateExpressions()` to auto-fix

## Summary

✅ **All input fields use correct template format** (`{{$json.field}}`)  
✅ **Fields are automatically mapped** from previous nodes  
✅ **Type compatibility is validated** before assignment  
✅ **Field references are validated** against upstream outputs  
✅ **Entire workflow is validated** for data flow correctness  

The AI workflow building agent now ensures that data correctly passes through nodes with proper template expressions and validation.

---

*Last Updated: 2026-02-16*
