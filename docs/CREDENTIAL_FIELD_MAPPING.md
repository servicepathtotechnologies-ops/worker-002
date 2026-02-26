# Credential Field Mapping System

## Overview

This document explains how credential input field IDs from questions/answers map to node config properties. **Credentials are NOT passed via node connections/edges** - they are injected directly into the node's `config` object.

---

## 🔗 Mapping System Architecture

### Input Format → Node Config Mapping

| Input Field ID Format | Node Config Property | Example |
|----------------------|---------------------|---------|
| `req_<nodeId>_credentialId` | `config.credentialId` | `req_step_hubspot_123_credentialId` → `config.credentialId` |
| `cred_<nodeId>_credentialId` | `config.credentialId` | `cred_step_hubspot_123_credentialId` → `config.credentialId` |
| `<nodeId>_credentialId` | `config.credentialId` | `step_hubspot_123_credentialId` → `config.credentialId` |
| `credentialId` | `config.credentialId` | `credentialId` → `config.credentialId` |
| `req_<nodeId>_<fieldName>` | `config.<fieldName>` | `req_step_hubspot_123_apiKey` → `config.apiKey` |
| `cred_<nodeId>_<fieldName>` | `config.<fieldName>` | `cred_step_hubspot_123_apiKey` → `config.apiKey` |

---

## 📋 Implementation Details

### 1. Question Answer Format

**Question IDs are generated with prefixes:**
- `cred_<nodeId>_<fieldName>` - Credential-related fields
- `op_<nodeId>_<fieldName>` - Operation fields
- `config_<nodeId>_<fieldName>` - Configuration fields
- `resource_<nodeId>_<fieldName>` - Resource fields

**Example:**
```json
{
  "cred_step_hubspot_123_credentialId": "hubspot_connection_1",
  "op_step_hubspot_123_operation": "create",
  "resource_step_hubspot_123_resource": "contact"
}
```

### 2. Field Extraction Logic

**File:** `worker/src/api/attach-inputs.ts`

```typescript
// ✅ COMPREHENSIVE: Handle question ID formats (cred_*, op_*, config_*, resource_*)
// Format: {prefix}_{nodeId}_{fieldName}
if (key.startsWith(`cred_${node.id}_`) || 
    key.startsWith(`op_${node.id}_`) || 
    key.startsWith(`config_${node.id}_`) ||
    key.startsWith(`resource_${node.id}_`)) {
  // Extract field name by removing prefix and nodeId
  const prefix = key.match(/^(cred_|op_|config_|resource_)/)?.[0] || '';
  const afterPrefix = key.substring(prefix.length); // Remove "cred_", "op_", etc.
  const nodeIdPrefix = `${node.id}_`;
  if (afterPrefix.startsWith(nodeIdPrefix)) {
    fieldName = afterPrefix.substring(nodeIdPrefix.length); // Get everything after nodeId_
  }
}

// ✅ LEGACY: Handle nodeId_fieldName format
else if (key.startsWith(`${node.id}_`)) {
  fieldName = key.substring(node.id.length + 1);
}
```

### 3. Credential ID Mapping

**File:** `worker/src/services/workflow-lifecycle-manager.ts`

```typescript
// ✅ CRITICAL: Check for explicit credentialId field from question answers
// Questions use field: 'credentialId', so answers come as 'credentialId' or 'req_<nodeId>_credentialId'
const credentialIdKey = Object.keys(credentials).find(key => 
  key.toLowerCase() === 'credentialid' ||
  key.toLowerCase().endsWith('_credentialid') ||
  key.toLowerCase() === `req_${node.id}_credentialid` ||
  key.toLowerCase() === `${node.id}_credentialid`
);

if (credentialIdKey) {
  const credentialIdValue = extractCredentialValue(credentials[credentialIdKey]);
  if (credentialIdValue) {
    config.credentialId = credentialIdValue; // ✅ Direct mapping to node config
    updated = true;
  }
}
```

### 4. Field Name Mapping Priority

**Priority Order:**
1. **Connector `credentialFieldName`** (e.g., HubSpot uses `apiKey`)
2. **Direct field match** (e.g., `credentialId` → `config.credentialId`)
3. **Schema-based matching** (matches credential names to schema fields)

**File:** `worker/src/services/workflow-lifecycle-manager.ts`

```typescript
// ✅ PRIORITY 1: Use credentialFieldName from connector if specified (data-driven mapping)
// This takes precedence - HubSpot uses credentialFieldName: 'apiKey'
if (credentialContract.credentialFieldName && allFields.includes(credentialContract.credentialFieldName)) {
  config[credentialContract.credentialFieldName] = credentialValue;
  updated = true;
}

// ✅ PRIORITY 2: If credentialId field exists in schema, also set it (for reference)
if (allFields.includes('credentialId') && !config.credentialId) {
  config.credentialId = credentialValue;
  updated = true;
}
```

---

## 🔄 Complete Flow Example

### Step 1: Question Generation
```json
{
  "field": "credentialId",
  "nodeId": "step_hubspot_123",
  "questionId": "req_step_hubspot_123_credentialId"
}
```

### Step 2: User Answer
```json
{
  "req_step_hubspot_123_credentialId": "hubspot_connection_1"
}
```

### Step 3: Field Extraction
```typescript
// In attach-inputs.ts
const key = "req_step_hubspot_123_credentialId";
const nodeId = "step_hubspot_123";
const fieldName = key.substring(`req_${nodeId}_`.length); // "credentialId"
```

### Step 4: Config Application
```typescript
// In workflow-lifecycle-manager.ts
config.credentialId = "hubspot_connection_1";
// Result: node.data.config.credentialId = "hubspot_connection_1"
```

### Step 5: Final Node Structure
```json
{
  "id": "step_hubspot_123",
  "type": "hubspot",
  "data": {
    "config": {
      "credentialId": "hubspot_connection_1",
      "resource": "contact",
      "operation": "create"
    }
  }
}
```

---

## 📊 Supported Input Formats

### Format 1: Comprehensive Question IDs
```json
{
  "cred_step_hubspot_123_credentialId": "hubspot_connection_1",
  "op_step_hubspot_123_operation": "create",
  "resource_step_hubspot_123_resource": "contact"
}
```

### Format 2: Legacy Node ID Prefix
```json
{
  "step_hubspot_123_credentialId": "hubspot_connection_1",
  "step_hubspot_123_operation": "create"
}
```

### Format 3: Direct Field Names (Global)
```json
{
  "credentialId": "hubspot_connection_1",
  "operation": "create"
}
```

### Format 4: Request Prefix Format
```json
{
  "req_step_hubspot_123_credentialId": "hubspot_connection_1",
  "req_step_hubspot_123_operation": "create"
}
```

---

## 🎯 Special Cases

### Case 1: OAuth Nodes
OAuth nodes should **NOT** receive credential fields as inputs. They are handled via OAuth button flow.

```typescript
// In attach-inputs.ts
if (isOAuthNode(nodeType)) {
  // OAuth connectors should never receive credential fields as inputs
  // They are handled via OAuth button flow
  continue;
}
```

### Case 2: AuthType Selection
`authType` is a selection indicator, not a config value.

```typescript
// In attach-inputs.ts
if (fieldNameLower === 'authtype' || fieldName === 'authType') {
  // Store authType selection but don't apply it to config
  // The actual credential value will be applied based on the selected type
  continue; // Don't apply authType to config
}
```

### Case 3: Credential Value Fields
Credential value fields (apiKey, accessToken, credentialId) are only allowed from comprehensive questions.

```typescript
// In attach-inputs.ts
const isFromComprehensiveQuestion = key.startsWith(`cred_${node.id}_`) || 
                                     key.startsWith(`op_${node.id}_`) || 
                                     key.startsWith(`config_${node.id}_`) ||
                                     key.startsWith(`resource_${node.id}_`);

const isCredentialValueField = 
  (fieldNameLower === 'apikey' || fieldNameLower === 'api_key') ||
  (fieldNameLower === 'accesstoken' || fieldNameLower === 'access_token') ||
  (fieldNameLower === 'credentialid' || fieldNameLower === 'credential_id');

if (isCredentialValueField && !isFromComprehensiveQuestion) {
  // Reject credential fields that aren't from comprehensive questions
  continue;
}
```

---

## 🔍 Field Mapping Examples

### Example 1: HubSpot Node
```typescript
// Input
{
  "cred_step_hubspot_123_credentialId": "hubspot_connection_1",
  "op_step_hubspot_123_operation": "create",
  "resource_step_hubspot_123_resource": "contact"
}

// Node Config (after mapping)
{
  "credentialId": "hubspot_connection_1",
  "operation": "create",
  "resource": "contact"
}
```

### Example 2: Google Sheets Node
```typescript
// Input
{
  "config_step_sheets_456_spreadsheetId": "1abc123def456",
  "config_step_sheets_456_range": "A1:B10"
}

// Node Config (after mapping)
{
  "spreadsheetId": "1abc123def456",
  "range": "A1:B10"
}
```

### Example 3: Slack Node
```typescript
// Input
{
  "cred_step_slack_789_credentialId": "slack_webhook_1",
  "config_step_slack_789_channel": "#general"
}

// Node Config (after mapping)
{
  "credentialId": "slack_webhook_1",
  "channel": "#general"
}
```

---

## ✅ Validation Rules

1. **Field Name Must Exist in Schema**
   - Field name must be in `schema.configSchema.required` or `schema.configSchema.optional`
   - Invalid fields are rejected

2. **Node ID Must Match**
   - Input field ID must contain the correct node ID
   - Format: `{prefix}_{nodeId}_{fieldName}`

3. **Credential Fields Require Comprehensive Questions**
   - Credential value fields (apiKey, accessToken, credentialId) must come from comprehensive questions
   - Direct credential injection should use `attach-credentials` endpoint

4. **OAuth Nodes Skip Credential Fields**
   - OAuth nodes should not receive credential fields as inputs
   - They are handled via OAuth button flow

---

## 📝 Summary

**Key Points:**
1. ✅ Credentials are **NOT** passed via node connections/edges
2. ✅ Credentials are injected directly into `node.data.config`
3. ✅ Multiple input formats are supported (comprehensive, legacy, direct)
4. ✅ Field mapping uses priority: connector field name → direct match → schema match
5. ✅ Special handling for OAuth nodes, authType, and credential value fields

**Mapping Flow:**
```
Question ID (cred_<nodeId>_credentialId)
    ↓
Field Extraction (credentialId)
    ↓
Schema Validation (field exists in schema)
    ↓
Config Application (config.credentialId = value)
    ↓
Node Updated (node.data.config.credentialId)
```

---

*Last Updated: 2024*
*For related documentation, see:*
- `credential-system-complete-summary.md`
- `credential-flow-verification.md`
- `comprehensive-node-questions-system.md`
