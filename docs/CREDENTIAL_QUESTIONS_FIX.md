# Credential Questions Fix - Complete

## Issues Fixed

### 1. ✅ Sanitization Rejecting Comprehensive Question IDs
**Problem**: The `attach-inputs` endpoint was rejecting comprehensive question IDs like `cred_nodeId_apiKey` because they contained "token" or "credential" in the key name.

**Fix**: Updated sanitization to allow comprehensive question IDs (`cred_*`, `op_*`, `config_*`, `resource_*`) before checking for credential keywords.

**File**: `worker/src/api/attach-inputs.ts` (lines 64-86)

### 2. ✅ Frontend Using Wrong Key Format
**Problem**: Frontend was storing values with `nodeId_fieldName` keys, but backend expected comprehensive question IDs like `cred_nodeId_fieldName`.

**Fix**: Updated frontend to use `input.id` (comprehensive question ID) as the key directly when available.

**File**: `ctrl_checks/src/components/workflow/AutonomousAgentWizard.tsx` (lines 2747, 1491-1509)

## Expected Behavior

### For HubSpot Node

When creating a HubSpot workflow, the configuration modal should show:

1. **Authentication Method** (Select dropdown)
   - Question ID: `cred_<nodeId>_authType`
   - Options: "Use Stored Credential", "API Key", "OAuth Access Token"

2. **Credential Value** (Text input or Credential selector)
   - Question ID: `cred_<nodeId>_apiKey` or `cred_<nodeId>_accessToken` or `cred_<nodeId>_credentialId`
   - Based on selected authentication method

3. **Resource** (Select dropdown)
   - Question ID: `resource_<nodeId>_resource`
   - Options: "Contact", "Company", "Deal", "Ticket"

4. **Operation** (Select dropdown)
   - Question ID: `op_<nodeId>_operation`
   - Options: "Get record", "List records", "Create record", "Update record", "Delete record", "Search records"

5. **Properties** (Textarea/JSON) - Conditional
   - Question ID: `config_<nodeId>_properties`
   - Only shown if operation is "create" or "update"

## Testing Checklist

### ✅ Test 1: Verify Questions Appear
1. Create workflow: "Create a new contact in HubSpot"
2. Check configuration modal shows all 5 questions above
3. Verify select dropdowns appear for authType, resource, and operation

### ✅ Test 2: Verify Credential Application
1. Select "API Key" from Authentication Method
2. Enter API key value
3. Select "contact" from Resource
4. Select "create" from Operation
5. Enter properties JSON
6. Click "Continue Building"
7. Check node config has all values:
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

### ✅ Test 3: Verify OAuth Option
1. Select "OAuth Access Token" from Authentication Method
2. Enter access token
3. Verify config has `accessToken` (not `apiKey`)

### ✅ Test 4: Verify Stored Credential Option
1. Select "Use Stored Credential" from Authentication Method
2. Select credential from dropdown
3. Verify config has `credentialId`

## Debugging

### Check Backend Logs

Look for these console logs:
```
[ComprehensiveQuestions] Generating questions for X nodes
[ComprehensiveQuestions] Added credential type question for hubspot
[ComprehensiveQuestions] Added resource question for hubspot.resource
[ComprehensiveQuestions] Added operation question for hubspot.operation
[GenerateWorkflow] Generated X comprehensive questions for all nodes
[GenerateWorkflow] Questions by category: {credential: X, operation: Y, configuration: Z}
[GenerateWorkflow] Input breakdown: {credential: X, operation: Y, configuration: Z, withOptions: X, selectType: Y}
```

### Check Frontend Console

Look for:
```
[Frontend] Selected authType = apiKey for node node123 (key: cred_node123_authType)
[Frontend] Selected resource = contact for node node123 (key: resource_node123_resource)
[Frontend] Selected operation = create for node node123 (key: op_node123_operation)
```

### Check Answer Application

Look for:
```
[AttachInputs] Detected comprehensive question ID: cred_node123_authType -> fieldName: authType
[AttachInputs] Detected comprehensive question ID: cred_node123_apiKey -> fieldName: apiKey
[AttachInputs] Applied resource to node node123 (hubspot)
[AttachInputs] Applied operation to node node123 (hubspot)
[AttachInputs] Applied properties to node node123 (hubspot)
```

## Files Modified

1. `worker/src/api/attach-inputs.ts` - Fixed sanitization to allow comprehensive question IDs
2. `ctrl_checks/src/components/workflow/AutonomousAgentWizard.tsx` - Fixed to use question IDs directly

## Status

✅ **COMPLETE** - All fixes implemented:
- ✅ Sanitization allows comprehensive question IDs
- ✅ Frontend uses question IDs directly
- ✅ Backend processes comprehensive question IDs correctly
- ✅ Credential values are applied to node configs
