# Comprehensive Node Questions Testing Guide

## Overview

This guide helps you test the comprehensive node questions system to ensure that **credentials, resources, and operations are asked for EVERY node** in the workflow.

## Testing Checklist

### ✅ Test 1: HubSpot Node - Complete Flow

**Test Prompt:**
```
When I receive a POST request to my webhook endpoint, extract the customer email and name from the request body, then create a new contact in HubSpot.
```

**Expected Questions (in order):**

1. **Credential Type** (askOrder: 0)
   - ID: `cred_<nodeId>_authType`
   - Question: "Which authentication method should we use for 'HubSpot'?"
   - Type: `select`
   - Options: 
     - "Use Stored Credential" (value: `credentialId`)
     - "API Key" (value: `apiKey`)
     - "OAuth Access Token" (value: `accessToken`)

2. **Credential Value** (askOrder: 0.5)
   - ID: `cred_<nodeId>_credentialId` OR `cred_<nodeId>_apiKey` OR `cred_<nodeId>_accessToken`
   - Question: Based on selected auth type
   - Type: `credential` (for credentialId) or `text` (for apiKey/accessToken)

3. **Resource** (askOrder: 1)
   - ID: `resource_<nodeId>_resource`
   - Question: "Which HubSpot resource are we working with?"
   - Type: `select`
   - Options: `['contact', 'company', 'deal', 'ticket']`

4. **Operation** (askOrder: 2)
   - ID: `op_<nodeId>_operation`
   - Question: "What operation should 'HubSpot' perform?"
   - Type: `select`
   - Options: `['get', 'getMany', 'create', 'update', 'delete', 'search']`

5. **Properties** (askOrder: 5, conditional on operation='create' or 'update')
   - ID: `config_<nodeId>_properties`
   - Question: "What properties should we set?"
   - Type: `json`
   - Example: `{ "email": "{{$json.email}}", "firstname": "{{$json.name}}" }`

**Test Steps:**
1. Submit the prompt
2. Check that all 5 questions appear in the correct order
3. Answer each question:
   - Select "API Key" for auth type
   - Enter API key: `HUBSPOT_API_KEY_REPLACE_ME`
   - Select "contact" for resource
   - Select "create" for operation
   - Enter properties: `{"email": "{{$json.email}}", "firstname": "{{$json.name}}"}`
4. Verify answers are applied to node config:
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

---

### ✅ Test 2: HubSpot with OAuth Access Token

**Test Prompt:**
```
Create a new deal in HubSpot when a form is submitted.
```

**Expected Questions:**
1. Credential Type → Select "OAuth Access Token"
2. OAuth Access Token → Enter token
3. Resource → Select "deal"
4. Operation → Select "create"
5. Properties → Enter deal properties

**Test Steps:**
1. Submit prompt
2. Select "OAuth Access Token" for auth type
3. Enter access token: `your-oauth-token`
4. Select "deal" for resource
5. Select "create" for operation
6. Enter properties: `{"dealname": "New Deal", "amount": "1000"}`
7. Verify config has `accessToken` (not `apiKey`)

---

### ✅ Test 3: Multiple Nodes - Webhook → Extract → HubSpot

**Test Prompt:**
```
When I receive a POST request to my webhook endpoint, extract the customer email and name from the request body, then create a new contact in HubSpot.
```

**Expected Questions for Each Node:**

**Webhook Node:**
- No credentials needed (trigger node)

**Extract Node:**
- No credentials needed (data transformation)

**HubSpot Node:**
- Credential Type (API Key / OAuth / Stored)
- Credential Value
- Resource (contact/company/deal/ticket)
- Operation (get/create/update/delete/search)
- Properties (if create/update)

**Test Steps:**
1. Submit prompt
2. Verify questions are asked ONLY for HubSpot node
3. Answer all HubSpot questions
4. Verify workflow is created with all nodes properly configured

---

### ✅ Test 4: Other CRM Nodes (Zoho, Salesforce, etc.)

**Test Prompt:**
```
Create a new lead in Zoho CRM when form is submitted.
```

**Expected Questions:**
1. Credential Type (if supports multiple)
2. Credential Value
3. Module/Resource (Zoho uses "module")
4. Operation
5. Data/Properties

**Test Steps:**
1. Submit prompt
2. Verify questions follow same pattern as HubSpot
3. Answer all questions
4. Verify node config is properly set

---

### ✅ Test 5: JSON Field Formatting

**Test Prompt:**
```
Create a HubSpot contact with email and name from webhook.
```

**Test Steps:**
1. Submit prompt
2. When asked for properties, enter:
   ```json
   {"email": "{{$json.email}}", "firstname": "{{$json.name}}"}
   ```
3. Verify the JSON is properly formatted in node config:
   ```json
   {
     "properties": {
       "email": "{{$json.email}}",
       "firstname": "{{$json.name}}"
     }
   }
   ```
4. Check that it's valid JSON (not a string)

---

## Debugging Commands

### Check Generated Questions

Add this to your workflow generation endpoint response:
```typescript
console.log('[DEBUG] Comprehensive Questions:', JSON.stringify(comprehensiveQuestions.questions, null, 2));
```

### Check Node Config After Answers

Add this after applying answers:
```typescript
console.log('[DEBUG] Node Config After Answers:', JSON.stringify(nodeConfig, null, 2));
```

### Verify Question Order

Check that questions are sorted correctly:
```typescript
const sortedQuestions = comprehensiveQuestions.questions.sort((a, b) => a.askOrder - b.askOrder);
console.log('[DEBUG] Questions in order:', sortedQuestions.map(q => ({
  id: q.id,
  askOrder: q.askOrder,
  category: q.category,
  fieldName: q.fieldName
})));
```

---

## Common Issues & Solutions

### Issue 1: Only API Key is Asked (Not OAuth Option)

**Problem:** Credential type question not appearing

**Solution:**
1. Check if node schema has both `apiKey` and `accessToken` fields
2. Verify `generateCredentialQuestions` detects both fields
3. Check that `hasApiKey && hasAccessToken` condition is true

**Debug:**
```typescript
console.log('[DEBUG] HubSpot fields:', {
  hasApiKey: allFields.some(f => f.toLowerCase() === 'apikey'),
  hasAccessToken: allFields.some(f => f.toLowerCase() === 'accesstoken'),
  hasCredentialId: allFields.some(f => f.toLowerCase() === 'credentialid')
});
```

### Issue 2: Resource Question Not Appearing

**Problem:** Resource question missing

**Solution:**
1. Check if node has `resource`, `module`, or `object` field
2. Verify `generateResourceQuestions` is called
3. Check that field is in required or optional fields

**Debug:**
```typescript
console.log('[DEBUG] Resource field check:', {
  hasResource: allFields.some(f => f.toLowerCase() === 'resource'),
  resourceField: allFields.find(f => f.toLowerCase() === 'resource'),
  configValue: config.resource
});
```

### Issue 3: Operation Question Not Appearing

**Problem:** Operation question missing

**Solution:**
1. Check if node has `operation` field
2. Verify `generateOperationQuestions` is called
3. Check that operation options are loaded from node-question-order

**Debug:**
```typescript
console.log('[DEBUG] Operation field check:', {
  hasOperation: allFields.some(f => f.toLowerCase() === 'operation'),
  operationField: allFields.find(f => f.toLowerCase() === 'operation'),
  configValue: config.operation,
  questionConfig: getQuestionConfig(nodeType)
});
```

### Issue 4: Answers Not Applied to Node Config

**Problem:** Answers provided but not saved to node config

**Solution:**
1. Check answer format matches question ID format
2. Verify answer application logic handles all question types
3. Check that JSON fields are properly formatted

**Debug:**
```typescript
console.log('[DEBUG] Answer application:', {
  answerKey: key,
  nodeId: node.id,
  fieldName: fieldName,
  value: value,
  applied: updated
});
```

---

## Testing Workflow

### Step-by-Step Testing Process

1. **Start with Simple Test**
   - Test HubSpot node alone
   - Verify all questions appear
   - Verify answers are applied

2. **Test Credential Types**
   - Test API Key selection
   - Test OAuth Access Token selection
   - Test Stored Credential selection

3. **Test Resource Selection**
   - Test each resource option
   - Verify resource is saved correctly

4. **Test Operation Selection**
   - Test each operation
   - Verify conditional questions appear (e.g., properties for create/update)

5. **Test JSON Fields**
   - Test properties field
   - Verify JSON formatting
   - Verify template variables work

6. **Test Multiple Nodes**
   - Test workflow with multiple nodes
   - Verify questions for each node
   - Verify no duplicate questions

7. **Test Edge Cases**
   - Test with pre-filled values
   - Test with missing fields
   - Test with invalid JSON

---

## Expected Console Logs

When working correctly, you should see:

```
[ComprehensiveQuestions] Generating questions for 3 nodes
[ComprehensiveQuestions] Processing node node123 (type: hubspot)
[ComprehensiveQuestions] Added credential type question for hubspot (supports multiple auth methods)
[ComprehensiveQuestions] Added credential question for hubspot.credentialId
[ComprehensiveQuestions] Added resource question for hubspot.resource
[ComprehensiveQuestions] Added operation question for hubspot.operation
[ComprehensiveQuestions] Added configuration question for hubspot.properties
[ComprehensiveQuestions] Generated 5 questions for node node123 (hubspot)
[GenerateWorkflow] Generated 5 comprehensive questions for all nodes
[PhasedRefine] Applied authType = apiKey to node node123 (HubSpot)
[PhasedRefine] Applied apiKey = HUBSPOT_API_KEY_REPLACE_ME to node node123 (HubSpot)
[PhasedRefine] Applied resource = contact to node node123 (HubSpot)
[PhasedRefine] Applied operation = create to node node123 (HubSpot)
[PhasedRefine] Applied properties (JSON) = {"email":"{{$json.email}}","firstname":"{{$json.name}}"}}... to node node123 (HubSpot)
```

---

## Success Criteria

✅ **Test Passes If:**
1. All questions appear in correct order (credentials → resource → operation → config)
2. Credential type question appears when node supports multiple auth methods
3. Resource question appears for CRM nodes
4. Operation question appears for nodes with operation field
5. Answers are properly applied to node configs
6. JSON fields are properly formatted
7. No duplicate questions
8. Questions only appear for nodes that need them

---

## Next Steps After Testing

1. **Fix Any Issues Found**
   - Update question generation logic
   - Fix answer application
   - Improve error handling

2. **Add More Node Types**
   - Test with other CRM nodes
   - Test with other node categories
   - Verify universal coverage

3. **Optimize Question Flow**
   - Reduce redundant questions
   - Improve question text
   - Add helpful descriptions

4. **Document Findings**
   - Update this guide with findings
   - Document any edge cases
   - Create node-specific guides
