# 🔍 DUPLICATE FUNCTIONALITY ANALYSIS

## ✅ YES - Duplicate Functions/Code Found

After analyzing the codebase, I found **duplicate functionality** in the following areas:

---

## 1. ⚠️ PATTERN MATCHING (3 Files with Similar Functionality)

### Files:
1. **`worker/src/services/nodes/node-library.ts`**
   - Function: `findSchemaByPattern(query: string)`
   - Method: Loose substring matching (`includes()`)
   - Searches: commonPatterns, keywords, aiSelectionCriteria.keywords, useCases, description, label
   - **Status**: ⚠️ **DUPLICATE** - Similar to pattern registry but uses loose matching

2. **`worker/src/core/registry/node-type-pattern-registry.ts`**
   - Function: `matchNodeTypeByPattern(nodeType: string)`
   - Method: **Strict regex patterns with word boundaries** (`\b`)
   - Searches: Explicit patterns + auto-generated patterns (5-10+ per node)
   - **Status**: ✅ **NEW ARCHITECTURE** - Should replace `findSchemaByPattern()`

3. **`worker/src/services/ai/registry-based-node-inference.ts`**
   - Function: `inferNodeTypeFromPrompt(step: string, context?: string)`
   - Method: Loose substring matching (`includes()`)
   - Searches: keywords, description, capabilities
   - **Status**: ⚠️ **DUPLICATE** - Similar pattern matching logic

**Recommendation**: 
- Keep: `node-type-pattern-registry.ts` (new strict pattern matching)
- Review: `node-library.ts.findSchemaByPattern()` - may be redundant
- Review: `registry-based-node-inference.ts` - may need to use pattern registry

---

## 2. ⚠️ NODE TYPE NORMALIZATION (3 Files with Different Purposes)

### Files:
1. **`worker/src/core/utils/node-type-normalizer.ts`**
   - Function: `normalizeNodeType(node: any)` - **Takes node object**
   - Purpose: Handles frontend "custom" type nodes (extracts type from `data.type`)
   - **Status**: ✅ **KEEP** - Different purpose (object normalization)

2. **`worker/src/services/ai/node-type-normalizer.ts`**
   - Function: `normalizeNodeType(nodeType: string)` - **Takes string**
   - Purpose: Normalizes node type **strings** using strict patterns
   - **Status**: ✅ **KEEP** - Different purpose (string normalization)

3. **`worker/src/services/ai/node-type-normalization-service.ts`**
   - Method: `normalizeNodeType(nodeType: string)` - **Takes string**
   - Purpose: Service class with capability resolution, category resolution
   - **Status**: ⚠️ **POTENTIAL DUPLICATE** - Similar to `services/ai/node-type-normalizer.ts`

**Recommendation**:
- Keep: `core/utils/node-type-normalizer.ts` (object normalization - different purpose)
- Keep: `services/ai/node-type-normalizer.ts` (string normalization with patterns)
- Review: `node-type-normalization-service.ts` - may have duplicate logic with `node-type-normalizer.ts`

---

## 3. ⚠️ NODE TYPE RESOLUTION (3 Files with Similar Functionality)

### Files:
1. **`worker/src/services/nodes/node-type-resolver.ts`**
   - Class: `NodeTypeResolver`
   - Method: `resolve(nodeType: string)` and `resolveNodeTypeOnce()`
   - Purpose: Resolves aliases, capabilities, fuzzy matching
   - **Status**: ✅ **KEEP** - Main resolver class

2. **`worker/src/core/utils/node-type-resolver-util.ts`**
   - Function: `resolveNodeType(nodeType: string, debug?: boolean)`
   - Purpose: Wrapper around NodeTypeResolver
   - **Status**: ⚠️ **POTENTIAL DUPLICATE** - Thin wrapper, may be redundant

3. **`worker/src/utils/nodeTypeResolver.ts`**
   - Function: `resolveNodeType(node: WorkflowNode | any)`
   - Purpose: Resolves node objects (not strings) to canonical types
   - **Status**: ✅ **KEEP** - Different purpose (object resolution vs string resolution)

**Recommendation**:
- Keep: `services/nodes/node-type-resolver.ts` (main resolver)
- Keep: `utils/nodeTypeResolver.ts` (object resolution - different purpose)
- Review: `core/utils/node-type-resolver-util.ts` - may be redundant wrapper

---

## 📋 SUMMARY

### Files with Duplicate/Similar Functionality:

1. **Pattern Matching**:
   - ⚠️ `worker/src/services/nodes/node-library.ts` (findSchemaByPattern)
   - ✅ `worker/src/core/registry/node-type-pattern-registry.ts` (NEW - keep)
   - ⚠️ `worker/src/services/ai/registry-based-node-inference.ts` (inferNodeTypeFromPrompt)

2. **Node Type Normalization (String)**:
   - ✅ `worker/src/core/utils/node-type-normalizer.ts` (object normalization - different)
   - ✅ `worker/src/services/ai/node-type-normalizer.ts` (string normalization - keep)
   - ⚠️ `worker/src/services/ai/node-type-normalization-service.ts` (may duplicate string normalization)

3. **Node Type Resolution**:
   - ✅ `worker/src/services/nodes/node-type-resolver.ts` (main resolver - keep)
   - ⚠️ `worker/src/core/utils/node-type-resolver-util.ts` (thin wrapper - may be redundant)
   - ✅ `worker/src/utils/nodeTypeResolver.ts` (object resolution - different purpose)

---

## 🎯 RECOMMENDATIONS

### High Priority (Clear Duplicates):
1. **`node-library.ts.findSchemaByPattern()`** - Review if it can be replaced by `node-type-pattern-registry.ts`
2. **`node-type-normalization-service.ts`** - Review if it duplicates `node-type-normalizer.ts` logic
3. **`node-type-resolver-util.ts`** - Review if thin wrapper is needed

### Medium Priority (Similar Functionality):
1. **`registry-based-node-inference.ts`** - Consider using pattern registry instead of custom matching

### Low Priority (Different Purposes - Keep):
1. **`core/utils/node-type-normalizer.ts`** - Object normalization (different purpose)
2. **`utils/nodeTypeResolver.ts`** - Object resolution (different purpose)

---

## ✅ NEXT STEPS

1. Review usage of each file to determine if duplicates can be removed
2. Consolidate pattern matching to use `node-type-pattern-registry.ts`
3. Consolidate string normalization logic
4. Remove redundant wrapper functions if not needed
