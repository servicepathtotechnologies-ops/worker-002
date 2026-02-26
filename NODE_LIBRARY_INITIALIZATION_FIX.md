# NodeLibrary Initialization Order Fix

## Problem

NodeLibrary constructor was calling `resolveNodeType()` which requires NodeTypeResolver to be initialized, causing a circular dependency crash:

```
Error: NodeTypeResolver: NodeLibrary not initialized. Call setNodeLibrary() after NodeLibrary is created.
```

## Root Cause

1. **NodeLibrary constructor** (line 75) called `resolveNodeType('gmail', true)` to verify critical nodes
2. **resolveNodeType()** requires NodeTypeResolver to be initialized
3. **NodeTypeResolver** requires NodeLibrary to be initialized (circular dependency)
4. **Crash** during NodeLibrary construction

## Solution

### 1. Removed resolveNodeType() from Constructor

**Before:**
```typescript
const { resolveNodeType } = require('../../core/utils/node-type-resolver-util');
const criticalNodes = [
  'ai_service',
  resolveNodeType('gmail', true), // ❌ Causes circular dependency
  'google_gmail'
];
```

**After:**
```typescript
// NOTE: Do NOT use resolveNodeType() here - it causes circular dependency
// Check canonical node types directly (resolver will be initialized later)
const criticalNodes = [
  'ai_service',
  'google_gmail', // ✅ Canonical type (gmail alias registered as virtual type)
];
```

### 2. Made getSchema() Safe for Initialization

**Before:**
```typescript
// Step 2: Resolve node type alias
const { resolveNodeType } = require('../../core/utils/node-type-resolver-util');
const resolvedType = resolveNodeType(nodeType, false);
```

**After:**
```typescript
// Step 3: Try resolver as fallback (only if resolver is initialized)
// NOTE: This is safe because resolver is initialized AFTER NodeLibrary constructor completes
try {
  const { resolveNodeType } = require('../../core/utils/node-type-resolver-util');
  const resolvedType = resolveNodeType(nodeType, false);
  // ... resolution logic
} catch (error) {
  // Resolver not initialized yet - this is okay during NodeLibrary construction
  // Virtual node types should handle most cases
}
```

### 3. Initialization Order

The correct initialization order is now:

```
1. NodeLibrary constructor runs
   ├─ initializeSchemas() - Register all canonical schemas
   ├─ Verify critical nodes (using direct lookups, NO resolver)
   ├─ registerVirtualNodeTypes() - Register aliases (gmail → google_gmail)
   └─ initializeNodeTypeResolver() - Inject NodeLibrary into resolver
       └─ resolver.setNodeLibrary(this)

2. NodeTypeResolver ready to use ✅
```

## Key Changes

1. ✅ **Removed** `resolveNodeType()` call from constructor
2. ✅ **Added** try-catch in `getSchema()` to handle resolver not initialized
3. ✅ **Virtual node types** handle alias resolution during initialization
4. ✅ **Resolver** only used at runtime, not during initialization

## Runtime Behavior

- **During initialization**: Virtual node types (aliases) are registered directly, so `getSchema('gmail')` finds `google_gmail` schema without needing resolver
- **After initialization**: Resolver can be used for fuzzy matching and advanced resolution
- **Safety**: All resolver calls are wrapped in try-catch to prevent crashes

## Files Modified

1. `worker/src/services/nodes/node-library.ts`
   - Removed `resolveNodeType()` from constructor (line 75)
   - Made `getSchema()` safe with try-catch (line 170-184)

## Verification

- ✅ TypeScript compilation passes
- ✅ No circular dependency errors
- ✅ Virtual node types work correctly
- ✅ Resolver initialized after NodeLibrary
