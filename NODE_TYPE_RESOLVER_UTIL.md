# Node Type Resolver Utility

## Problem

Workflow builder generates node types like `"gmail"` but the node library registers `"google_gmail"` and `"email"`. This causes:
- Critical node validation failures
- Node lookup failures
- Workflow execution errors

## Solution

Created a **`resolveNodeType()` utility function** that wraps the `NodeTypeResolver` service for easy use throughout the codebase.

## Implementation

### 1. Utility Function (`node-type-resolver-util.ts`) ✅

**File**: `worker/src/core/utils/node-type-resolver-util.ts`

**Features**:
- Simple `resolveNodeType(name, debug)` function
- Wraps `NodeTypeResolver.resolve()`
- Handles null checks
- Debug logging support
- Returns canonical node type

**Usage**:
```typescript
import { resolveNodeType } from './core/utils/node-type-resolver-util';

const canonicalType = resolveNodeType('gmail'); // Returns 'google_gmail'
const canonicalType2 = resolveNodeType('ai'); // Returns 'ai_service'
```

**Functions**:
- `resolveNodeType(nodeType, debug?)`: Resolve single node type
- `resolveNodeTypes(nodeTypes, debug?)`: Resolve multiple node types
- `nodeTypeExists(nodeType, debug?)`: Check if node type exists after resolution

### 2. Node Alias Map ✅

**Already exists in**: `worker/src/services/nodes/node-type-resolver.ts`

**Key Aliases**:
```typescript
{
  'google_gmail': ['gmail', 'google_mail', 'email', 'gmail_send', 'send_email', 'mail'],
  'ai_service': ['ai', 'openai', 'llm', 'ai_node', 'ai_processor', 'ai_model', 'ai_chat'],
  'openai_gpt': ['gpt', 'gpt4', 'gpt3', 'openai', 'chatgpt'],
  'google_sheets': ['sheets', 'gsheets', 'google_sheet', 'spreadsheet'],
  // ... 50+ more alias mappings
}
```

### 3. Integration Points ✅

#### A. Node Library (`node-library.ts`)
**File**: `worker/src/services/nodes/node-library.ts`

**Changes**:
- `getSchema()` now resolves node types before lookup
- Logs resolution: `"Resolved 'gmail' → 'google_gmail'"`
- Critical node checks use resolver

**Before**:
```typescript
getSchema(nodeType: string) {
  return this.schemas.get(nodeType); // ❌ Fails for 'gmail'
}
```

**After**:
```typescript
getSchema(nodeType: string) {
  // Step 1: Try direct lookup
  let schema = this.schemas.get(nodeType);
  if (schema) return schema;
  
  // Step 2: Resolve alias
  const resolvedType = resolveNodeType(nodeType, false);
  if (resolvedType !== nodeType) {
    schema = this.schemas.get(resolvedType);
    if (schema) {
      console.log(`Resolved "${nodeType}" → "${resolvedType}"`);
      return schema;
    }
  }
  
  return undefined;
}
```

#### B. Server Startup (`index.ts`)
**File**: `worker/src/index.ts`

**Changes**:
- Critical node checks resolve aliases
- `'gmail'` → `'google_gmail'` automatically

**Before**:
```typescript
const criticalNodes = ['ai_service', 'gmail', 'google_gmail']; // ❌ 'gmail' not found
```

**After**:
```typescript
const criticalNodes = [
  'ai_service',
  resolveNodeType('gmail', true), // ✅ Resolves to 'google_gmail'
  'google_gmail'
].filter((node, index, arr) => arr.indexOf(node) === index); // Remove duplicates
```

#### C. Node Schema Registry (`node-schema-registry.ts`)
**File**: `worker/src/core/contracts/node-schema-registry.ts`

**Changes**:
- Critical node verification uses resolver
- Gmail check uses resolved type

**Before**:
```typescript
const gmailSchema = this.get('gmail'); // ❌ Not found
```

**After**:
```typescript
const gmailResolved = resolveNodeType('gmail', false);
const gmailSchema = this.get(gmailResolved); // ✅ Uses 'google_gmail'
```

### 4. Debug Logs ✅

**Example Logs**:
```
[resolveNodeType] Resolved "gmail" → "google_gmail" (alias)
[NodeLibrary] ✅ Resolved "gmail" → "google_gmail" for schema lookup
[ServerStartup] ✅ Critical node registered: google_gmail
```

## Benefits

1. **Automatic Resolution**: Aliases resolved automatically
2. **No Breaking Changes**: Existing code works with aliases
3. **Debug Logging**: Clear visibility into resolutions
4. **Centralized Logic**: Single source of truth for node type resolution
5. **Easy to Use**: Simple function call, no complex setup

## Example Scenarios

### Scenario 1: Workflow Builder Generates "gmail"
**Input**: `nodeType = "gmail"`
**Resolution**:
1. `resolveNodeType("gmail")` called
2. Resolver finds alias: `"gmail"` → `"google_gmail"`
3. Returns: `"google_gmail"`
4. Log: `"Resolved 'gmail' → 'google_gmail' (alias)"`

### Scenario 2: Critical Node Check
**Input**: `criticalNodes = ['gmail']`
**Resolution**:
1. `resolveNodeType('gmail', true)` called (debug enabled)
2. Resolves to `'google_gmail'`
3. Check: `registry.get('google_gmail')` ✅ Found
4. Log: `"✅ Critical node registered: google_gmail"`

### Scenario 3: Node Schema Lookup
**Input**: `nodeLibrary.getSchema('gmail')`
**Resolution**:
1. `getSchema('gmail')` called
2. Direct lookup fails
3. Resolves: `'gmail'` → `'google_gmail'`
4. Lookup: `schemas.get('google_gmail')` ✅ Found
5. Log: `"Resolved 'gmail' → 'google_gmail'"`

## Files Modified

1. **`worker/src/core/utils/node-type-resolver-util.ts`** (NEW):
   - Created utility function `resolveNodeType()`
   - Added `resolveNodeTypes()` for batch resolution
   - Added `nodeTypeExists()` helper

2. **`worker/src/services/nodes/node-library.ts`**:
   - Enhanced `getSchema()` to use resolver
   - Updated critical node checks to use resolver

3. **`worker/src/index.ts`**:
   - Updated critical node checks to resolve aliases

4. **`worker/src/core/contracts/node-schema-registry.ts`**:
   - Updated critical node verification to use resolver
   - Updated gmail-specific check to use resolved type

## Verification

✅ **Type Check**: Passes
✅ **Resolver Integration**: Works in all key locations
✅ **Debug Logging**: Enabled for critical checks
✅ **Backward Compatible**: Existing code still works

## Usage

The resolver is now used automatically in:
- Node library schema lookups
- Critical node validation
- Server startup checks
- Node schema registry

**No manual calls needed** - it's integrated into the core lookup functions.
