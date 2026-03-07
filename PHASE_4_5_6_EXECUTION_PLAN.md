# PHASE 4, 5, 6 EXECUTION PLAN

## PHASE 4: SAFE DELETION OF DEAD CODE AND DUPLICATES

### 4.1 Analysis Summary

#### ✅ KEEP (Active Systems)
1. **Alias Resolvers** - NOT duplicates, serve different purposes:
   - `comprehensive-alias-resolver.ts` - Used by legacy builder (keep until legacy removed)
   - `node-type-resolver.ts` - Core implementation (KEEP)
   - `node-type-resolver-util.ts` - Wrapper (KEEP - most widely used)
   - `nodeTypeResolver.ts` - Object resolution (KEEP - different purpose)

2. **Normalizers** - Different purposes:
   - `core/utils/node-type-normalizer.ts` - Object normalization (KEEP)
   - `services/ai/node-type-normalizer.ts` - String normalization (KEEP)
   - `services/ai/node-type-normalization-service.ts` - Service with capability resolution (KEEP)

3. **Execution** - Correct architecture:
   - `executeNodeLegacy` - Used via adapter pattern (KEEP - correct architecture)
   - `executeViaLegacyExecutor` - Adapter (KEEP - correct pattern)
   - `node-execution-stubs.ts` - Migration tracking (KEEP - documentation)

#### ❌ SAFE TO REMOVE (After Verification)

1. **Unused/Dead Files** (Need verification):
   - `worker/src/core/registry/node-execution-stubs.ts` - Check if actually used
   - Any test files for deleted validators

2. **Legacy Builder** (After migration):
   - `agenticWorkflowBuilder` usage - Remove after full migration to production builder
   - `comprehensive-alias-resolver.ts` - Remove when legacy builder removed

### 4.2 Deletion Strategy

**Step 1**: Verify no imports of deleted validators
**Step 2**: Remove any test files for deleted validators
**Step 3**: Verify `node-execution-stubs.ts` usage
**Step 4**: Document remaining legacy paths (for future migration)

---

## PHASE 5: ZERO-TRUST ENFORCEMENT

### 5.1 Current Architecture Analysis

#### ✅ CORRECT: Single-Path Execution
- **Entry**: `executeNode()` → `executeNodeDynamically()` → `unifiedNodeRegistry.get()` → `definition.execute()`
- **Legacy Path**: Only accessible via `executeViaLegacyExecutor` (adapter pattern - CORRECT)
- **No Bypass**: All nodes must go through registry

#### ✅ CORRECT: Alias Resolution
- **Canonical**: `node-type-resolver-util.ts` → `node-type-resolver.ts`
- **Usage**: 20+ files use canonical resolver
- **Legacy**: `comprehensive-alias-resolver.ts` only used by legacy builder

#### ✅ CORRECT: Validation
- **Primary**: `workflow-validator.ts` (consolidated)
- **Final**: `final-workflow-validator.ts` (final check)
- **Schema**: `schema-based-validator.ts` (registry-based)
- **No Duplicates**: Validators consolidated

### 5.2 Zero-Trust Enforcement Points

#### 5.2.1 Alias Resolution - Single Source
**Current**: ✅ Already single source (`node-type-resolver-util.ts`)
**Action**: Document canonical resolver, ensure all code uses it

#### 5.2.2 Validation - Single Source
**Current**: ✅ Already consolidated
**Action**: Verify no bypass paths

#### 5.2.3 Node Type Access - Single Source
**Current**: ✅ `UnifiedNodeRegistry` is single source
**Action**: Verify no direct node library access bypasses registry

#### 5.2.4 Execution - Single Path
**Current**: ✅ Registry-only execution
**Action**: Verify `executeNodeLegacy` only accessible via adapter

### 5.3 Enforcement Implementation

1. **Add Runtime Checks**: Verify single-path execution
2. **Add Validation Guards**: Fail-fast on bypass attempts
3. **Document Canonical Paths**: Clear documentation of single sources
4. **Remove Feature Flags**: Remove `useNewPipeline` flag (always use new pipeline)

---

## PHASE 6: STRUCTURAL INTEGRITY VERIFICATION

### 6.1 Verification Checklist

- [ ] No file exists without being referenced
- [ ] No duplicate utilities remain
- [ ] No legacy workflow format remains
- [ ] No duplicate alias resolution exists
- [ ] No duplicate schema validation exists
- [ ] No runtime path ambiguity exists
- [ ] All enforcement is fail-fast
- [ ] No silent correction without logging
- [ ] No console warnings replacing thrown errors

### 6.2 Verification Methods

1. **Import Analysis**: Verify all files are imported
2. **Execution Path Tracing**: Verify single execution path
3. **Validation Path Tracing**: Verify single validation path
4. **Type Resolution Tracing**: Verify single resolution path
5. **Build Verification**: Ensure build passes
6. **Runtime Verification**: Ensure deterministic runtime

---

## EXECUTION ORDER

1. **PHASE 4**: Safe deletion (verify first, then delete)
2. **PHASE 5**: Zero-trust enforcement (add guards, document)
3. **PHASE 6**: Verification (check all requirements)
