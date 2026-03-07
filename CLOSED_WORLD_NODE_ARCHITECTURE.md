# Closed-World Node Architecture - Production-Grade Fix

## 🎯 Goal

Enforce a **closed-world node architecture** where:
- Only nodes defined in NodeLibrary are valid
- LLM cannot invent node types
- Registry is a deterministic lookup table (no resolution, no fallback)
- Unknown node types are rejected BEFORE registry

## ✅ Changes Implemented

### 1. **Created Canonical Node Types Authority**

**File**: `worker/src/services/nodes/node-library.ts`

**Added**:
- `getAllCanonicalTypes()` - Returns only canonical types (excludes aliases)
- `isCanonicalType()` - Type guard for canonical types
- `CANONICAL_NODE_TYPES` - Exported constant (single source of truth)
- `isValidCanonicalNodeType()` - Type guard function

**Impact**: Single source of truth for all valid node types.

---

### 2. **Removed All Resolution Logic from Registry**

**File**: `worker/src/core/registry/unified-node-registry.ts`

**Removed**:
- ❌ `normalizeNodeType()` lookup
- ❌ `resolveAlias()` method
- ❌ `resolveNodeType()` fallback
- ❌ Dynamic alias caching (`aliasMap`)
- ❌ All imports for normalization/resolution

**Changed**:
- `get()` method now does **direct lookup only**:
  ```typescript
  get(nodeType: string): UnifiedNodeDefinition | undefined {
    // ✅ STRICT: Direct lookup only - no resolution, no fallback
    return this.definitions.get(nodeType);
  }
  ```

**Impact**: Registry is now deterministic and predictable.

---

### 3. **Added Strict Pre-Validation Gate**

**File**: `worker/src/core/utils/node-authority.ts` (NEW)

**Functions**:
- `assertValidNodeType()` - Throws if node type is invalid
- `assertValidNodeTypes()` - Validates multiple types
- `isValidNodeType()` - Non-throwing check
- `getValidNodeTypes()` - Returns all valid types

**Usage**:
```typescript
// BEFORE registry access
assertValidNodeType(nodeType); // Throws if invalid
const definition = registry.get(nodeType); // Guaranteed to exist
```

**Impact**: Invalid node types are caught BEFORE registry.

---

### 4. **Updated Registry Validation**

**File**: `worker/src/core/registry/unified-node-registry.ts`

**Changed**: `validateConfig()` now validates node type BEFORE lookup:
```typescript
validateConfig(nodeType: string, config: Record<string, any>) {
  // ✅ STRICT: Validate canonical type first
  if (!isValidCanonicalNodeType(nodeType)) {
    return {
      valid: false,
      errors: [`[NodeAuthority] Invalid node type: "${nodeType}"...`]
    };
  }
  
  const definition = this.get(nodeType);
  // ...
}
```

**Impact**: Registry never sees invalid node types.

---

### 5. **Updated Dynamic Executor**

**File**: `worker/src/core/execution/dynamic-node-executor.ts`

**Changed**:
- Removed `normalizeNodeType()` call
- Added strict validation BEFORE registry access
- Removed normalization import

**Impact**: Executor validates node types before execution.

---

### 6. **Added Startup Integrity Check**

**File**: `worker/src/core/registry/unified-node-registry.ts`

**Added**: `validateIntegrity()` method that:
- Checks every canonical type has a UnifiedNodeDefinition
- Throws error on mismatch (stops boot)
- Logs success message

**Impact**: Catches initialization failures immediately.

---

## 🛡️ Architecture Guarantees

### Before (Unsafe)
```typescript
// ❌ BAD: Multiple resolution layers
registry.get('gmail')
  → Try direct lookup
  → Try normalized lookup
  → Try alias lookup
  → Try global resolver
  → Cache dynamic alias
  → Return undefined (if all fail)
```

### After (Production-Grade)
```typescript
// ✅ GOOD: Strict validation + direct lookup
assertValidNodeType('gmail'); // Throws if invalid
registry.get('google_gmail'); // Direct lookup only
```

---

## 📊 Validation Flow

### New Architecture

```
LLM Output
  ↓
assertValidNodeType(nodeType) ← STRICT GATE
  ↓ (if valid)
Registry.get(nodeType) ← DETERMINISTIC LOOKUP
  ↓
Execute
```

### Old Architecture (Removed)

```
LLM Output
  ↓
Registry.get(nodeType)
  ↓
Try direct lookup
  ↓
Try normalized lookup
  ↓
Try alias lookup
  ↓
Try global resolver
  ↓
Cache dynamic alias
  ↓
Return undefined (if all fail) ← UNSAFE
```

---

## 🚨 Breaking Changes

**⚠️ IMPORTANT**: This is a breaking architectural change.

**Before**:
- Registry attempted fuzzy resolution
- Unknown node types could reach registry
- Fallback behavior existed

**After**:
- Registry is strict lookup only
- Unknown node types rejected BEFORE registry
- No fallback behavior

**Migration Required**:
1. All node types must be canonical before registry access
2. Use `assertValidNodeType()` before calling registry methods
3. Update LLM schemas to use `CANONICAL_NODE_TYPES` enum

---

## ✅ Result

- ❌ **No more** "Node type 'X' not found in registry" from invalid types
- ❌ **No more** fuzzy resolution chaos
- ❌ **No more** dynamic alias learning
- ❌ **No more** LLM hallucinated node types
- ❌ **No more** registry-level repair logic

- ✅ **Deterministic registry**: Direct lookup only
- ✅ **Strict validation**: Invalid types rejected before registry
- ✅ **Closed-world architecture**: Only canonical types allowed
- ✅ **Startup integrity**: All canonical types verified on boot
- ✅ **Single source of truth**: `CANONICAL_NODE_TYPES` constant

---

## 🎯 Next Steps (Required)

1. **Update LLM Schemas**:
   - Change `nodeType` from `string` to `enum: CANONICAL_NODE_TYPES`
   - Remove free-text node type generation

2. **Update All Callers**:
   - Add `assertValidNodeType()` before registry access
   - Remove any normalization/resolution before registry

3. **Add Tests**:
   - Test invalid node types are rejected
   - Test canonical types work correctly
   - Test startup integrity check

---

## 📁 Files Modified

1. `worker/src/services/nodes/node-library.ts` - Added canonical types export
2. `worker/src/core/registry/unified-node-registry.ts` - Removed resolution logic
3. `worker/src/core/utils/node-authority.ts` - NEW: Strict validation
4. `worker/src/core/execution/dynamic-node-executor.ts` - Added strict validation

---

**Last Updated**: Closed-world architecture implementation complete
**Status**: ✅ **READY FOR PRODUCTION** (after LLM schema updates)
