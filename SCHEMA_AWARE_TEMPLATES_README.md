# Schema-Aware Template Generation

## Overview

The Schema-Aware Template Generation system prevents invalid template expressions like `{{$json.body}}` when the upstream node doesn't actually output a `"body"` field. Instead, it uses **actual upstream node output schemas** to generate semantically correct template mappings.

## Architecture

### Components

1. **`schema-aware-template-generator.ts`**
   - Generates template mappings using LLM
   - Uses actual upstream node output schemas
   - Returns mappings with confidence scores

2. **`template-validation-gate.ts`**
   - Validates mappings before applying
   - Enforces confidence thresholds
   - Prevents invalid templates from being persisted

3. **Enhanced `input-field-mapper.ts`**
   - Returns field paths, types, and sample values
   - Provides complete schema information for LLM context

4. **Modified `workflow-builder.ts`**
   - Replaces naive template generation
   - Uses schema-aware generation with validation
   - Falls back to naive generation if needed

## How It Works

### Flow

```
1. Get upstream node output schema
   ↓
2. Get target node input requirements
   ↓
3. LLM generates mappings based on actual schemas
   ↓
4. Validation gate checks mappings
   ↓
5. Only approved mappings are applied
   ↓
6. Invalid mappings are rejected (not persisted)
```

### Example

**Before (Naive Generation)**:
```typescript
// Assumes "body" exists in upstream output
mapping['body'] = '{{$json.body}}'; // ❌ May not exist
```

**After (Schema-Aware)**:
```typescript
// Gets actual upstream schema: ['content', 'status', 'headers']
// LLM generates: body → content (semantic match)
mapping['body'] = '{{$json.content}}'; // ✅ Field exists
```

## Feature Flag

The system is controlled by the `ENABLE_SCHEMA_AWARE_TEMPLATES` environment variable:

```bash
# Enable (default)
ENABLE_SCHEMA_AWARE_TEMPLATES=true

# Disable (fallback to naive generation)
ENABLE_SCHEMA_AWARE_TEMPLATES=false
```

## Adding New Node Types

To ensure schema-aware template generation works correctly for new node types:

### 1. Define Output Schema

In `worker/src/core/types/node-output-types.ts`:

```typescript
export const NODE_OUTPUT_SCHEMAS: Record<string, NodeOutputSchema> = {
  your_new_node: {
    type: 'object',
    structure: {
      fields: {
        field1: 'string',
        field2: 'number',
        // ... other fields
      },
    },
  },
};
```

### 2. Update Input Field Mapper

In `worker/src/services/ai/input-field-mapper.ts`, add to `inferOutputFieldsFromNodeType()`:

```typescript
else if (typeLower === 'your_new_node') {
  fields.push('field1', 'field2', 'field3');
}
```

### 3. Test Template Generation

Run unit tests:

```bash
npm test -- schema-aware-mapping.test.ts
npm test -- validation-gate.test.ts
```

## Debug Information

Template generation results are stored in node metadata:

```typescript
node.data._templateGeneration = {
  overallConfidence: 0.95,
  validationScore: 0.92,
  approvedCount: 3,
  rejectedCount: 0,
  notes: [],
  warnings: [],
};
```

Access this in the debug panel to see:
- Which mappings were approved/rejected
- Confidence scores
- Validation reasons
- Warnings

## Validation Rules

### Confidence Thresholds

- **HIGH** (0.8+): Auto-approve
- **MEDIUM** (0.6-0.8): Approve with warning
- **LOW** (0.4-0.6): Reject with warning
- **MINIMUM** (0.3): Absolute minimum, below is rejected

### Validation Checks

1. Source field exists in upstream schema
2. Template format is correct (`{{$json.field}}`)
3. Template references correct source field
4. Type compatibility (if schemas available)
5. Confidence threshold met
6. Not marked as `needsReview`

## Error Handling

- **LLM Failure**: Falls back to naive generation
- **Invalid Mappings**: Rejected, not persisted
- **No Approved Mappings**: Falls back to naive generation
- **Schema Unavailable**: Falls back to naive generation

## Testing

### Unit Tests

```bash
# Test exact match scenario
npm test -- schema-aware-mapping.test.ts -t "exact match"

# Test semantic fallback
npm test -- schema-aware-mapping.test.ts -t "semantic"

# Test validation thresholds
npm test -- validation-gate.test.ts
```

### Manual Testing

1. Create a workflow with two nodes
2. Check node metadata for `_templateGeneration`
3. Verify templates use actual upstream fields
4. Check debug panel for mapping decisions

## Troubleshooting

### Issue: Templates still use invalid fields

**Solution**: Check that `ENABLE_SCHEMA_AWARE_TEMPLATES` is not set to `false`

### Issue: All mappings rejected

**Solution**: Check upstream node output schema is correctly defined

### Issue: LLM generates invalid fields

**Solution**: The validation gate should catch this. Check validation logs.

## Related Files

- `worker/src/services/ai/schema-aware-template-generator.ts` - Core generator
- `worker/src/services/ai/template-validation-gate.ts` - Validation logic
- `worker/src/services/ai/input-field-mapper.ts` - Schema extraction
- `worker/src/services/ai/workflow-builder.ts` - Integration point
- `worker/src/services/ai/template-expression-validator.ts` - Post-write validator (separate)

## Notes

- This system is a **pre-write validator** (prevents invalid templates from being saved)
- `template-expression-validator.ts` is a **post-write validator** (validates at read time)
- Both systems work together for comprehensive validation
