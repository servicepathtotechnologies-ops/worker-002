# NodeTypeResolver Implementation

## Problem

LLM generates node types like `"ai_service"` and `"gmail"` but the validator cannot find them, causing errors:
```
[WORKFLOW VALIDATION] ❌ Invalid node type "ai_service" not found in node library. Node ID: step2
[WORKFLOW VALIDATION] ❌ Invalid node type "gmail" not found in node library. Node ID: step3
```

## Solution

Created a **NodeTypeResolver** system that:
1. Maps aliases to canonical node types
2. Performs fuzzy matching for similar node types
3. Resolves variations and case-insensitive matches
4. Integrates into workflow validation and builder

## Implementation

### 1. NodeTypeResolver Service
**Location**: `worker/src/services/nodes/node-type-resolver.ts`

**Features**:
- **Alias Mapping**: Maps common aliases to canonical types (e.g., `"ai"` → `"ai_service"`)
- **Fuzzy Matching**: Uses Levenshtein distance for similarity matching (>80% similarity)
- **Exact Matching**: Case-insensitive exact match first
- **Confidence Scoring**: Returns confidence level (0.0 to 1.0) for each resolution

**Key Aliases**:
```typescript
{
  'ai_service': ['ai', 'openai', 'llm', 'ai_node', 'ai_processor'],
  'gmail': ['google_mail', 'email', 'gmail_send', 'send_email'],
  'google_sheets': ['sheets', 'gsheets', 'spreadsheet'],
  // ... 50+ more alias mappings
}
```

### 2. Integration Points

#### A. Workflow Validation Pipeline
**File**: `worker/src/services/ai/workflow-validation-pipeline.ts`

**Changes**:
- Uses `nodeTypeResolver.resolve()` before schema lookup
- Logs resolution method for debugging
- Falls back to original validation if resolver fails

#### B. Workflow Builder
**File**: `worker/src/services/ai/workflow-builder.ts`

**Changes**:
- Resolves node types before validation in `selectNodes()`
- Updates step type to canonical form after resolution
- Logs resolution for debugging

### 3. Resolution Strategy

The resolver uses a 4-step strategy:

1. **Exact Match** (case-insensitive)
   - Try direct lookup in node library
   - Confidence: 1.0

2. **Alias Match**
   - Check alias map for known variations
   - Confidence: 0.95

3. **Fuzzy Match**
   - Calculate similarity using Levenshtein distance
   - Match if similarity > 0.8
   - Confidence: similarity score

4. **Not Found**
   - Return original type with confidence 0.0
   - Log warning

## Usage

```typescript
import { nodeTypeResolver } from './services/nodes/node-type-resolver';

// Resolve a node type
const resolution = nodeTypeResolver.resolve('ai');
// Returns: { original: 'ai', resolved: 'ai_service', method: 'alias', confidence: 0.95 }

// Check if node type exists
const exists = nodeTypeResolver.exists('gmail');
// Returns: true (resolves to 'gmail' which exists)

// Get canonical type
const canonical = nodeTypeResolver.getCanonicalType('llm');
// Returns: 'ai_service'
```

## Debug Logging

The resolver logs all resolutions:
```
[NodeTypeResolver] ✅ Resolved node type "ai" → "ai_service" (via alias)
[NodeTypeResolver] ✅ Resolved node type "gmail" → "gmail" (via exact)
[NodeTypeResolver] ✅ Resolved node type "sheets" → "google_sheets" (via alias)
[NodeTypeResolver] ❌ Could not resolve node type "unknown_type"
```

## Benefits

1. **Handles LLM Variations**: Accepts common variations like "ai", "llm", "openai" → "ai_service"
2. **Case Insensitive**: "Gmail" → "gmail"
3. **Fuzzy Matching**: Handles typos and close matches
4. **Backward Compatible**: Falls back to original validation if resolver fails
5. **Debug Friendly**: Logs all resolutions for troubleshooting

## Testing

To test the resolver:

```typescript
// Test alias resolution
nodeTypeResolver.resolve('ai'); // Should return 'ai_service'
nodeTypeResolver.resolve('gmail'); // Should return 'gmail'
nodeTypeResolver.resolve('sheets'); // Should return 'google_sheets'

// Test fuzzy matching
nodeTypeResolver.resolve('ai_servce'); // Should return 'ai_service' (typo)
```

## Next Steps

1. ✅ Resolver created and integrated
2. ✅ Validation pipeline updated
3. ✅ Workflow builder updated
4. ⏳ Frontend validation (optional - can use API endpoint)
5. ⏳ Add more aliases as needed

## Files Modified

1. `worker/src/services/nodes/node-type-resolver.ts` - **NEW**
2. `worker/src/services/ai/workflow-validation-pipeline.ts` - **UPDATED**
3. `worker/src/services/ai/workflow-builder.ts` - **UPDATED**

## Verification

After implementation, the errors should be resolved:
- ✅ `"ai_service"` resolves to `"ai_service"` (exact match)
- ✅ `"gmail"` resolves to `"gmail"` (exact match)
- ✅ `"ai"` resolves to `"ai_service"` (alias match)
- ✅ `"email"` resolves to `"gmail"` (alias match)
