# Node Duplicate Fixes

## Issues Fixed

### 1. Gmail Node Duplicate ✅

**Problem**: 
- Two Gmail nodes existed: `gmail` (simplified) and `google_gmail` (full-featured)
- `gmail` was a duplicate/subset of `google_gmail`
- User wanted to use `google_gmail` as the main node

**Solution**:
- ✅ **Removed** `createGmailSchema()` method completely
- ✅ **Removed** registration of `gmail` node from `initializeSchemas()`
- ✅ **Updated** `google_gmail` node to include all patterns from `gmail`:
  - Added keywords: `'email'`, `'send email'`, `'mail'` to catch more variations
  - Enhanced `whenToUse` to include email sending context
  - Added use cases for email reading and searching
- ✅ **Updated** `node-type-resolver.ts` to map `'gmail'` → `'google_gmail'`
  - All aliases now point to `google_gmail` as the canonical type

**Result**:
- `google_gmail` is now the **single, main Gmail node**
- Supports all operations: `send`, `list`, `get`, `search`
- Resolver automatically maps `'gmail'` → `'google_gmail'`
- No duplicate nodes

### 2. AI Service Node Verification ✅

**Problem**: 
- User wanted to verify `ai_service` exists and ensure patterns are correct
- Check if `ai_agent` should be the main node instead

**Solution**:
- ✅ **Verified** `ai_service` exists and is properly registered
- ✅ **Enhanced** `ai_service` keywords to include more patterns:
  - Added: `'ai'`, `'llm'`, `'openai'`, `'ai model'`
  - This ensures LLM-generated types like `"ai"` resolve to `ai_service`
- ✅ **Clarified** distinction between `ai_service` and `ai_agent`:
  - `ai_service`: Simple AI text processing (summarize, analyze, extract)
  - `ai_agent`: Complex AI workflows with memory, tools, and reasoning
- ✅ **Updated** `ai_agent` to clarify when NOT to use it:
  - Added: "Simple AI text processing (use ai_service)"
  - Added: "Direct AI model calls (use ai_chat_model or ai_service)"

**Result**:
- `ai_service` is the **main node for simple AI processing**
- `ai_agent` is for **complex AI agent workflows**
- Both nodes are distinct and serve different purposes
- Patterns are properly separated and enhanced

## Changes Made

### Files Modified

1. **`worker/src/services/nodes/node-library.ts`**:
   - Removed `createGmailSchema()` method (lines ~2126-2239)
   - Removed `this.addSchema(this.createGmailSchema())` from initialization
   - Enhanced `google_gmail` keywords and use cases
   - Enhanced `ai_service` keywords to include `'ai'`, `'llm'`, `'openai'`
   - Clarified `ai_agent` vs `ai_service` distinction

2. **`worker/src/services/nodes/node-type-resolver.ts`**:
   - Updated alias mapping: `'gmail'` → `'google_gmail'`
   - Removed duplicate `'gmail'` entry
   - All email-related aliases now point to `google_gmail`

## Node Resolution

### Gmail Resolution
```
"gmail" → "google_gmail" (via alias)
"email" → "google_gmail" (via alias)
"send email" → "google_gmail" (via alias)
"mail" → "google_gmail" (via alias)
```

### AI Service Resolution
```
"ai" → "ai_service" (via alias)
"llm" → "ai_service" (via alias)
"openai" → "ai_service" (via alias)
"ai_service" → "ai_service" (exact match)
```

## Verification

✅ **Type Check**: Passes
✅ **No Duplicates**: `gmail` node removed
✅ **Main Nodes**: `google_gmail` and `ai_service` are the canonical nodes
✅ **Resolver**: Properly maps aliases to canonical types
✅ **Patterns**: Enhanced keywords and use cases

## Summary

- **Removed**: `gmail` node (duplicate)
- **Maintained**: `google_gmail` as the single Gmail node
- **Enhanced**: `ai_service` with more keywords
- **Clarified**: Distinction between `ai_service` and `ai_agent`
- **Updated**: Resolver to map `gmail` → `google_gmail`

All changes maintain backward compatibility through the resolver system.
