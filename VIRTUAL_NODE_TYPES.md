# Virtual Node Types (Alias Registration)

## Problem

Aliases like `"gmail"`, `"mail"`, and `"ai"` were not recognized as valid node types in the registry, even though they map to canonical types (`"google_gmail"`, `"email"`, `"ai_service"`).

## Solution

Registered virtual node types (aliases) in the node registry so that aliases are treated as valid node types that point to their canonical counterparts.

## Implementation

### 1. Virtual Node Type Registration ✅

**File**: `worker/src/services/nodes/node-library.ts`

**New Method**: `registerVirtualNodeTypes()`

**Purpose**: Register aliases as valid node types in the registry after all canonical schemas are initialized.

**Alias Mappings**:
```typescript
const aliasMappings = [
  { alias: 'gmail', canonical: 'google_gmail' },
  { alias: 'mail', canonical: 'email' },
  { alias: 'ai', canonical: 'ai_service' },
];
```

**Registration Process**:
```typescript
private registerVirtualNodeTypes(): void {
  for (const { alias, canonical } of aliasMappings) {
    // Get canonical schema
    const canonicalSchema = this.schemas.get(canonical);
    
    // Create virtual schema (copy of canonical with alias type)
    const virtualSchema: NodeSchema = {
      ...canonicalSchema,
      type: alias, // Override type to be the alias
      description: `${canonicalSchema.description} (alias: ${canonical})`,
    };
    
    // Register alias as valid node type
    this.schemas.set(alias, virtualSchema);
  }
}
```

### 2. Integration into Initialization ✅

**File**: `worker/src/services/nodes/node-library.ts`

**Changes**:
- Called after all canonical schemas are initialized
- Runs before logging registered nodes
- Ensures aliases are available immediately

**Initialization Flow**:
```typescript
constructor() {
  this.initializeSchemas(); // Register all canonical schemas
  
  // Register virtual node types (aliases) after canonical schemas
  this.registerVirtualNodeTypes();
  
  // Log all registered nodes (includes aliases)
  this.logAllRegisteredNodes();
}
```

### 3. Enhanced getSchema() Method ✅

**File**: `worker/src/services/nodes/node-library.ts`

**Changes**:
- Direct lookup now includes virtual node types
- Virtual node types are treated as valid node types
- No resolution needed for registered aliases

**Before**:
```typescript
getSchema(nodeType: string) {
  let schema = this.schemas.get(nodeType); // ❌ "gmail" not found
  if (!schema) {
    // Try resolution...
  }
}
```

**After**:
```typescript
getSchema(nodeType: string) {
  let schema = this.schemas.get(nodeType); // ✅ "gmail" found (virtual type)
  if (schema) {
    return schema; // Returns virtual schema pointing to google_gmail
  }
  // Fallback to resolution for unregistered aliases...
}
```

### 4. Helper Methods ✅

**New Methods**:
- `isNodeTypeRegistered(nodeType)`: Check if node type is registered (canonical or virtual)
- `getCanonicalType(nodeType)`: Get canonical type for a virtual node type

**Usage**:
```typescript
nodeLibrary.isNodeTypeRegistered('gmail'); // Returns true
nodeLibrary.getCanonicalType('gmail'); // Returns 'google_gmail'
```

## Benefits

1. **Aliases as Valid Types**: `"gmail"`, `"mail"`, `"ai"` are now valid node types
2. **Direct Lookup**: No resolution needed for registered aliases
3. **Registry Consistency**: Aliases appear in `getRegisteredNodeTypes()`
4. **Backward Compatible**: Existing resolution logic still works as fallback
5. **Clear Logging**: Virtual types logged during registration

## Example Scenarios

### Scenario 1: Direct Lookup of Alias
**Input**: `nodeLibrary.getSchema('gmail')`
**Process**:
1. Direct lookup: `schemas.get('gmail')` → ✅ Found (virtual type)
2. Returns virtual schema (points to `google_gmail`)
3. No resolution needed

### Scenario 2: Registry Check
**Input**: `nodeLibrary.isNodeTypeRegistered('gmail')`
**Process**:
1. Check: `schemas.has('gmail')` → ✅ True
2. Returns: `true` (virtual type is registered)

### Scenario 3: Get Canonical Type
**Input**: `nodeLibrary.getCanonicalType('gmail')`
**Process**:
1. Lookup in alias mappings: `'gmail'` → `'google_gmail'`
2. Returns: `'google_gmail'`

### Scenario 4: Registered Node Types List
**Input**: `nodeLibrary.getRegisteredNodeTypes()`
**Output**: Includes both canonical and virtual types:
```
['ai', 'ai_service', 'email', 'gmail', 'google_gmail', ...]
```

## Files Modified

1. **`worker/src/services/nodes/node-library.ts`**:
   - Added `registerVirtualNodeTypes()` method
   - Integrated into constructor initialization
   - Added `isNodeTypeRegistered()` helper
   - Added `getCanonicalType()` helper
   - Enhanced `getSchema()` to support virtual types

## Verification

✅ **Type Check**: Passes
✅ **Alias Registration**: `gmail`, `mail`, `ai` registered
✅ **Direct Lookup**: Aliases found without resolution
✅ **Registry Integration**: Aliases appear in registered types list
✅ **Backward Compatible**: Resolution still works as fallback

## Usage

The registry now automatically:
1. Registers virtual node types (aliases) after canonical schemas
2. Treats aliases as valid node types
3. Returns virtual schemas for alias lookups
4. Includes aliases in registered node types list

**No manual intervention needed** - aliases are registered automatically on startup.
