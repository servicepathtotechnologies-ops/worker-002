# HubSpot Credentials & Questions Fix

## Problem

Previously, the system was only asking for API Key for HubSpot nodes, but it should ask for:
1. **Credential Type** (API Key OR OAuth Access Token OR Stored Credential)
2. **Credential Value** (based on selected type)
3. **Resource** (contact, company, deal, ticket)
4. **Operation** (get, create, update, delete, search)
5. **Properties** (JSON field for create/update operations)

## Solution Implemented

### 1. Enhanced Credential Question Generation

**File:** `comprehensive-node-questions-generator.ts`

**Changes:**
- Added detection for nodes that support multiple credential types (API Key + OAuth Access Token)
- When both are available, first asks for **credential type selection**
- Then asks for the actual credential value based on selection

**Code:**
```typescript
// Detects if node supports multiple auth methods
const hasApiKey = allFields.some(f => f.toLowerCase() === 'apikey');
const hasAccessToken = allFields.some(f => f.toLowerCase() === 'accesstoken');
const hasCredentialId = allFields.some(f => f.toLowerCase() === 'credentialid');

// If multiple methods available, ask for type first
if ((hasApiKey && hasAccessToken) || (hasApiKey && hasCredentialId) || (hasAccessToken && hasCredentialId)) {
  // Generate credential type question
  const credentialTypeQuestion = {
    id: `cred_${nodeId}_authType`,
    text: `Which authentication method should we use for "${nodeLabel}"?`,
    type: 'select',
    options: [
      { label: 'Use Stored Credential', value: 'credentialId' },
      { label: 'API Key', value: 'apiKey' },
      { label: 'OAuth Access Token', value: 'accessToken' }
    ],
    askOrder: 0
  };
}
```

### 2. Added Resource Question Generation

**New Function:** `generateResourceQuestions()`

**Purpose:**
- Detects nodes with `resource`, `module`, or `object` fields
- Generates resource selection question
- Gets options from node-question-order system or schema

**Question Order:**
- Credentials: askOrder 0
- **Resources: askOrder 1** (NEW)
- Operations: askOrder 2
- Configuration: askOrder 3+

### 3. Enhanced Answer Application

**File:** `generate-workflow.ts`

**Changes:**
- Handles `authType` selection
- Applies credential value to correct field based on auth type
- Properly formats JSON fields (properties)
- Handles resource and operation answers

**Code:**
```typescript
// Handle authType selection
if (fieldName === 'authType') {
  nodeConfig._authType = value; // Store selected auth type
}

// Apply credential value to correct field
if (key.startsWith(`cred_${node.id}_apiKey`)) {
  nodeConfig.apiKey = value;
} else if (key.startsWith(`cred_${node.id}_accessToken`)) {
  nodeConfig.accessToken = value;
} else if (key.startsWith(`cred_${node.id}_credentialId`)) {
  nodeConfig.credentialId = value;
}
```

## Question Flow for HubSpot

### Complete Question Sequence:

1. **Credential Type** (askOrder: 0)
   ```
   Question: "Which authentication method should we use for 'HubSpot'?"
   Type: select
   Options:
     - Use Stored Credential (credentialId)
     - API Key (apiKey)
     - OAuth Access Token (accessToken)
   ```

2. **Credential Value** (askOrder: 0.5)
   ```
   If "API Key" selected:
     Question: "What is your HubSpot API Key for 'HubSpot'?"
     Type: text
     Field: apiKey
   
   If "OAuth Access Token" selected:
     Question: "What is your HubSpot OAuth Access Token for 'HubSpot'?"
     Type: text
     Field: accessToken
   
   If "Stored Credential" selected:
     Question: "Which HubSpot connection should we use for 'HubSpot'?"
     Type: credential
     Field: credentialId
   ```

3. **Resource** (askOrder: 1)
   ```
   Question: "Which HubSpot resource are we working with?"
   Type: select
   Options:
     - Contact (contact)
     - Company (company)
     - Deal (deal)
     - Ticket (ticket)
   Field: resource
   ```

4. **Operation** (askOrder: 2)
   ```
   Question: "What operation should 'HubSpot' perform?"
   Type: select
   Options:
     - Get record (get)
     - List records (getMany)
     - Create record (create)
     - Update record (update)
     - Delete record (delete)
     - Search records (search)
   Field: operation
   ```

5. **Properties** (askOrder: 5, conditional)
   ```
   Question: "What properties should we set?"
   Type: json
   Field: properties
   Condition: operation === 'create' || operation === 'update'
   Example: { "email": "{{$json.email}}", "firstname": "{{$json.name}}" }
   ```

## Testing

See `comprehensive-questions-testing-guide.md` for detailed testing instructions.

### Quick Test:

1. **Submit Prompt:**
   ```
   When I receive a POST request to my webhook endpoint, extract the customer email and name from the request body, then create a new contact in HubSpot.
   ```

2. **Verify Questions Appear:**
   - ✅ Credential Type question
   - ✅ Credential Value question
   - ✅ Resource question
   - ✅ Operation question
   - ✅ Properties question (after selecting "create")

3. **Answer Questions:**
   - Select "API Key" for auth type
   - Enter API key: `HUBSPOT_API_KEY_REPLACE_ME`
   - Select "contact" for resource
   - Select "create" for operation
   - Enter properties: `{"email": "{{$json.email}}", "firstname": "{{$json.name}}"}`

4. **Verify Node Config:**
   ```json
   {
     "apiKey": "HUBSPOT_API_KEY_REPLACE_ME",
     "resource": "contact",
     "operation": "create",
     "properties": {
       "email": "{{$json.email}}",
       "firstname": "{{$json.name}}"
     }
   }
   ```

## Universal Application

This fix applies to **ALL nodes**, not just HubSpot:

- **CRM Nodes:** HubSpot, Zoho, Salesforce, Pipedrive, etc.
- **Any node with multiple credential types:** Will ask for credential type first
- **Any node with resource/module field:** Will ask for resource selection
- **Any node with operation field:** Will ask for operation selection

## Files Modified

1. `worker/src/services/ai/comprehensive-node-questions-generator.ts`
   - Enhanced `generateCredentialQuestions()` to detect multiple auth methods
   - Added `generateResourceQuestions()` function
   - Updated question ordering

2. `worker/src/api/generate-workflow.ts`
   - Enhanced answer application to handle authType
   - Added support for resource questions
   - Improved JSON field formatting

3. `worker/docs/comprehensive-questions-testing-guide.md`
   - Complete testing guide
   - Debugging commands
   - Common issues & solutions

## Next Steps

1. **Test with HubSpot** (see testing guide)
2. **Test with other CRM nodes** (Zoho, Salesforce, etc.)
3. **Verify all questions appear in correct order**
4. **Verify answers are properly applied**
5. **Test JSON field formatting**

## Debugging

If questions don't appear:

1. **Check Console Logs:**
   ```
   [ComprehensiveQuestions] Processing node <nodeId> (type: hubspot)
   [ComprehensiveQuestions] Added credential type question for hubspot
   [ComprehensiveQuestions] Added resource question for hubspot.resource
   [ComprehensiveQuestions] Added operation question for hubspot.operation
   ```

2. **Verify Node Schema:**
   - Check if node has `apiKey`, `accessToken`, `credentialId` fields
   - Check if node has `resource` field
   - Check if node has `operation` field

3. **Check Question Generation:**
   ```typescript
   console.log('[DEBUG] Questions generated:', comprehensiveQuestions.questions);
   ```

4. **Verify Answer Application:**
   ```typescript
   console.log('[DEBUG] Node config after answers:', nodeConfig);
   ```
