# 🔍 ERROR ANALYSIS AND FIXES

## Issues Identified

### 1. ❌ **log_output Execution Error**

**Error Message:**
```
[ExecuteNode] ❌ Node type "log_output" execution failed. 
Registry-only mode enabled. All nodes must be in UnifiedNodeRegistry.
```

**Root Cause:**
- `log_output` exists in `NodeLibrary` but is NOT being registered in `UnifiedNodeRegistry`
- The registry initialization might be failing silently during conversion
- The error occurs because the execution engine checks `UnifiedNodeRegistry` first, and if not found, throws this error

**Why It Happens:**
- `UnifiedNodeRegistry.initializeFromNodeLibrary()` iterates through all schemas
- If conversion fails for any schema, it logs an error but continues
- `log_output` might have a schema structure that causes conversion to fail silently

---

### 2. ❌ **Duplicate Gmail Nodes**

**Problem:**
- Workflow has TWO Gmail nodes instead of one
- One is likely `gmail` (alias) and one is `google_gmail` (canonical)

**Root Cause:**
- Workflow generation creates nodes from DSL actions
- If DSL has both "gmail" and "google_gmail" actions, both get created
- Deduplication logic runs AFTER node creation, but might not catch aliases properly
- The deduplication checks canonical types, but if one node is created as "gmail" and another as "google_gmail", they might not be deduplicated correctly

**Why It Happens:**
- Node type normalization happens at different stages
- Some nodes might be created before normalization
- Deduplication logic might not be running early enough

---

### 3. ❌ **Missing Credential Questions**

**Problem:**
- Google Sheets: `spreadsheetId` and `sheetName` are NOT being asked
- Gmail: `recipientEmails` is NOT being asked

**Root Cause:**
- `comprehensive-node-questions-generator.ts` only asks for fields that match credential patterns:
  - API keys (`apiKey`, `api_key`)
  - OAuth tokens (`accessToken`, `refreshToken`)
  - URLs (`baseUrl`, `apiUrl`, `endpoint`)
  - Credential IDs (`credentialId`)
- `spreadsheetId`, `sheetName`, and `recipientEmails` don't match these patterns
- They're treated as "configuration" fields, which are AI-generated, not user-provided

**Why It Happens:**
- The credential detection logic is too strict
- It only matches specific patterns (apiKey, token, url, etc.)
- Fields like `spreadsheetId` (resource identifier) and `recipientEmails` (user input) should be asked but aren't detected

---

### 4. ❌ **Stop and Error Node - Missing Auto-Generated Error Message**

**Problem:**
- `stop_and_error` node has empty `errorMessage` field
- AI should auto-generate this based on context (e.g., "Validation failed", "Login failed")

**Root Cause:**
- Workflow builder's `generateIntelligentDefault()` function doesn't handle `errorMessage` field specifically
- It only handles generic fields like `message`, `text`, `content`
- `errorMessage` needs context-aware generation based on:
  - Upstream node (e.g., if_else condition)
  - Workflow intent
  - Node label/description

**Why It Happens:**
- No specific logic for `stop_and_error.errorMessage`
- Generic field inference doesn't work well for error messages
- Needs context from workflow structure (e.g., what condition failed)

---

## 🔧 FIXES

### Fix 1: Ensure log_output is Registered in UnifiedNodeRegistry

**Solution:**
- Verify `log_output` schema conversion doesn't fail
- Add explicit check for `log_output` in registry initialization
- Ensure all nodes from NodeLibrary are successfully converted

### Fix 2: Improve Deduplication Logic

**Solution:**
- Run deduplication EARLIER in workflow generation
- Normalize ALL node types to canonical forms BEFORE deduplication
- Check both `node.type` and `node.data.type` for duplicates
- Use `resolveNodeType()` to ensure aliases are resolved before comparison

### Fix 3: Expand Credential Field Detection

**Solution:**
- Add `spreadsheetId`, `sheetName` to credential detection (resource identifiers)
- Add `recipientEmails`, `to`, `from` to credential detection (user-provided email addresses)
- Create a new category: "resource_identifier" for fields like spreadsheetId, documentId, etc.
- These should be asked from users, not AI-generated

### Fix 4: Auto-Generate Error Messages for stop_and_error

**Solution:**
- Add specific logic in `generateIntelligentDefault()` for `errorMessage`
- Infer error message from:
  - Upstream node type (if_else → "Condition failed")
  - Node label (if contains "login" → "Login failed")
  - Workflow context
- Generate contextual error messages like "Validation failed", "Login failed", etc.
