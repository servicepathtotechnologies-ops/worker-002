# Root Fix: Universal Keyword Extraction (No Hardcoding)

## Current Status Analysis

### ✅ UNIVERSAL (Already Implemented):
1. **`mapKeywordsToNodeTypes()`** - Uses `AliasKeywordCollector` (universal)
2. **`extractNodesFromVariationKeywords()`** - Uses `AliasKeywordCollector` (universal)
3. **`extractKeywordsFromPrompt()`** - Uses `AliasKeywordCollector` (universal)
4. **`AliasKeywordCollector`** - Collects from ALL nodes in registry (universal)

### ❌ HARDCODED (Needs Root Fix):
1. **Line 358-360** in `summarize-layer.ts`: Hardcoded node keywords list for validation
2. **Line 487, 493** in `summarize-layer.ts`: Hardcoded node names in regex patterns
3. **Line 500-511** in `summarize-layer.ts`: Hardcoded node detection in outputNodes extraction
4. **Line 5158-5159** in `workflow-builder.ts`: Hardcoded platform/CRM node lists

## Root Fix Strategy

Replace ALL hardcoded node lists with **universal registry-based lookups** using:
- `AliasKeywordCollector.getAllAliasKeywords()` - For keyword matching
- `nodeCapabilityRegistryDSL.isOutput()` - For output node detection
- `unifiedNodeRegistry.getAllTypes()` - For all node types
- `nodeLibrary.getRegisteredNodeTypes()` - For registered node types

## Implementation Plan

### Fix 1: Replace Hardcoded Node Keywords List (Line 358-360)
**Current (Hardcoded):**
```typescript
const nodeKeywords = ['google_sheets', 'google_gmail', 'gmail', 'slack', 'slack_message', 
                     'manual_trigger', 'webhook', 'ai_chat_model', 'ai_service', 'hubspot', 
                     'salesforce', 'zoho_crm', 'discord', 'email', 'trigger'];
```

**Fixed (Universal):**
```typescript
// ✅ UNIVERSAL: Get all node keywords from registry
const allKeywordData = this.keywordCollector.getAllAliasKeywords();
const nodeKeywords = allKeywordData.map(kd => kd.keyword);
```

### Fix 2: Replace Hardcoded OR/Either Patterns (Line 487, 493)
**Current (Hardcoded):**
```typescript
if (promptLower.match(/\bor\s+(zoho_crm|salesforce|slack_message|google_gmail|gmail|slack|hubspot|pipedrive)/i))
```

**Fixed (Universal):**
```typescript
// ✅ UNIVERSAL: Get all output node keywords dynamically
const outputNodeKeywords = this.getOutputNodeKeywords();
const outputKeywordsPattern = outputNodeKeywords.join('|');
if (promptLower.match(new RegExp(`\\bor\\s+(${outputKeywordsPattern})`, 'i')))
```

### Fix 3: Replace Hardcoded Output Node Detection (Line 500-511)
**Current (Hardcoded):**
```typescript
if (prompt.includes('zoho_crm')) return 'zoho_crm';
if (prompt.includes('salesforce')) return 'salesforce';
// ... etc
```

**Fixed (Universal):**
```typescript
// ✅ UNIVERSAL: Detect output nodes using registry
const detectedNode = this.detectNodeTypeFromPrompt(prompt, 'output');
return detectedNode;
```

### Fix 4: Replace Hardcoded Platform/CRM Lists (Line 5158-5159 in workflow-builder.ts)
**Current (Hardcoded):**
```typescript
const isPlatformNode = ['linkedin', 'twitter', 'instagram', 'facebook'].includes(stepType);
const isCrmNode = ['hubspot', 'salesforce', 'airtable', 'clickup', 'notion', 'zoho_crm', 'pipedrive'].includes(stepType);
```

**Fixed (Universal):**
```typescript
// ✅ UNIVERSAL: Check node category from registry
const nodeDef = unifiedNodeRegistry.get(stepType);
const isPlatformNode = nodeDef?.category === 'social' || nodeDef?.tags?.includes('platform');
const isCrmNode = nodeDef?.category === 'crm' || nodeDef?.tags?.includes('crm');
```

## Benefits

1. **Universal:** Works for ALL nodes automatically
2. **Maintainable:** No hardcoded lists to update
3. **Extensible:** New nodes automatically supported
4. **Consistent:** Single source of truth (registry)

## Summary

**The keyword extraction logic IS universal** (uses `AliasKeywordCollector`), but there are **hardcoded node lists** in validation/fallback logic that need to be replaced with registry-based lookups.

**Root fix needed:** Replace hardcoded lists with universal registry lookups.
