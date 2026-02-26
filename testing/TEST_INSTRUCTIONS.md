# HubSpot Contact Creation Test

## Test Workflow JSON
Use the file: `test-hubspot-create-contact-workflow.json`

## Test Webhook Payload
Use the file: `test-webhook-payload.json`

## How to Test

### Option 1: Using the API directly

1. **Import the workflow** (if your API supports it):
   ```bash
   curl -X POST http://localhost:8080/api/workflows \
     -H "Content-Type: application/json" \
     -d @test-hubspot-create-contact-workflow.json
   ```

2. **Get the webhook URL** from the workflow (after it's created)

3. **Trigger the webhook**:
   ```bash
   curl -X POST "YOUR_WEBHOOK_URL" \
     -H "Content-Type: application/json" \
     -d @test-webhook-payload.json
   ```

### Option 2: Using PowerShell (Windows)

```powershell
# Trigger webhook
$webhookUrl = "YOUR_WEBHOOK_URL"
$payload = Get-Content -Path "test-webhook-payload.json" -Raw

Invoke-RestMethod -Uri $webhookUrl `
  -Method POST `
  -ContentType "application/json" `
  -Body $payload
```

### Option 3: Using the testing scripts

```bash
# Using the existing trigger script
cd worker/testing
./trigger-webhook.sh YOUR_WEBHOOK_URL test-webhook-payload.json
```

## Expected Result

1. **Webhook receives** the payload with `email` and `name`
2. **set_variable node extracts** email and name from webhook body
3. **HubSpot node creates** a contact with:
   - Email: `test.contact@example.com`
   - First Name: `Test User`
4. **Log output** shows the created contact data

## Verify in HubSpot

1. Go to HubSpot → Contacts
2. Search for: `test.contact@example.com`
3. You should see the newly created contact with:
   - Email: test.contact@example.com
   - First Name: Test User

## Troubleshooting

### If contact is not created:

1. **Check credentials**: Verify the API key and access token are correct
2. **Check Properties field**: Should be:
   ```json
   {
     "email": "{{$json.email}}",
     "firstname": "{{$json.name}}"
   }
   ```
3. **Check operation**: Should be `"create"` not `"get"`
4. **Check resource**: Should be `"contact"`
5. **Check execution logs**: Look for errors in the workflow execution

### Common Issues:

- **Properties field empty**: The auto-population might not have run. Manually set it.
- **Operation is "Get"**: Change it to "Create" in the node config
- **Credentials not working**: Verify the API key has permissions to create contacts

## Test Payload Variations

You can test with different data:

```json
{
  "email": "john.doe@example.com",
  "name": "John Doe"
}
```

```json
{
  "email": "jane.smith@example.com",
  "name": "Jane Smith"
}
```
