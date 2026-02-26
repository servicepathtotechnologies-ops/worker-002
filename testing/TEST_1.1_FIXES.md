# Test 1.1 Fixes Applied

## Issues Fixed

### 1. ✅ Conditional Detection False Positive
**Problem:** "When I receive..." was being detected as conditional logic
**Fix:** Added pattern matching to distinguish trigger "when" from conditional "when"
**Location:** `workflow-builder.ts` lines 2593-2643

### 2. ✅ Data Extraction Detection
**Problem:** "extract" keyword was not triggering set_variable node
**Fix:** Added detection for data extraction patterns
**Location:** `workflow-builder.ts` lines 2600-2612

### 3. ⚠️ Still Need to Fix: Field Mapping
**Problem:** HubSpot Properties field not getting email and name from webhook
**Status:** Need to ensure set_variable extracts fields and maps to HubSpot

## Expected Workflow After Fixes

```
webhook (trigger)
  ↓
set_variable (extract email and name from {{webhook.body.email}} and {{webhook.body.name}})
  ↓
hubspot (create contact with Properties: {"email": "{{$json.email}}", "firstname": "{{$json.name}}"})
```

## How to Verify HubSpot Data

After the workflow runs successfully, check HubSpot:

1. **Via HubSpot UI:**
   - Go to Contacts → All Contacts
   - Look for the contact with the email/name from your test payload

2. **Via API:**
   ```bash
   curl -X GET "https://api.hubapi.com/crm/v3/objects/contacts?limit=10" \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json"
   ```

3. **Check Execution Logs:**
   - In the workflow execution, check Node #3 (HubSpot) output
   - Should show the created contact ID and properties

## Test Payload

Use: `worker/testing/payloads/test-1.1-webhook-contact.json`
```json
{
  "email": "john.doe@example.com",
  "name": "John Doe"
}
```

## Next Steps

1. Test the workflow again with the same prompt
2. Verify if_else node is NOT added
3. Verify set_variable node IS added
4. Verify HubSpot Properties field is populated correctly
5. Check HubSpot account for the created contact
