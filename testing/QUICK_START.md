# Quick Start Guide - Webhook Testing

## Quick Commands

### Windows (PowerShell)
```powershell
# Navigate to testing folder
cd worker\testing

# Trigger a webhook
.\trigger-webhook.ps1 -WebhookUrl "YOUR_WEBHOOK_URL" -PayloadFile "payloads\test-1.1-webhook-contact.json"

# With verbose output
.\trigger-webhook.ps1 -WebhookUrl "YOUR_WEBHOOK_URL" -PayloadFile "payloads\test-1.1-webhook-contact.json" -Verbose
```

### Linux/Mac (Bash)
```bash
# Navigate to testing folder
cd worker/testing

# Trigger a webhook
./trigger-webhook.sh "YOUR_WEBHOOK_URL" "payloads/test-1.1-webhook-contact.json"

# With verbose output
./trigger-webhook.sh "YOUR_WEBHOOK_URL" "payloads/test-1.1-webhook-contact.json" --verbose
```

### Using cURL (Any Platform)
```bash
curl -X POST "YOUR_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d @payloads/test-1.1-webhook-contact.json
```

## Test Case Quick Reference

| Test | File | Description |
|------|------|-------------|
| 1.1 | `test-1.1-webhook-contact.json` | Basic contact (email, name) |
| 2.1 | `test-2.1-webhook-lead-company-size.json` | Lead with company size > 100 |
| 2.1 (small) | `test-2.1-webhook-lead-company-size-small.json` | Lead with company size < 100 |
| 2.3 | `test-2.3-webhook-full-name.json` | Full name for splitting |
| 2.5 | `test-2.5-webhook-deal-created.json` | Deal creation |
| 2.9 | `test-2.9-webhook-order-data.json` | Order with subtotal |
| 2.11 | `test-2.11-webhook-passthrough.json` | Generic passthrough data |
| 3.1 | `test-3.1-webhook-customer-message.json` | Customer message for AI |
| 4.3 | `test-4.3-webhook-pipedrive-deal.json` | Pipedrive deal stage change |
| 4.4 | `test-4.4-webhook-notion-database.json` | Notion database row |
| 5.1 | `test-5.1-webhook-gmail-urgent.json` | Gmail with URGENT subject |
| 7.1 | `test-7.1-webhook-lead-score.json` | Lead with score > 50 |
| 7.1 (low) | `test-7.1-webhook-lead-score-low.json` | Lead with score < 50 |
| 7.4 | `test-7.4-webhook-order-error.json` | Order data for error testing |

## Testing Workflow

1. **Create workflow** in your application using the test prompt
2. **Get webhook URL** from the created workflow
3. **Choose payload file** from the table above
4. **Trigger webhook** using one of the methods above
5. **Check workflow execution** in your application logs
6. **Verify results** match expected behavior

## Example: Testing Test 1.1

```powershell
# 1. Create workflow with prompt:
# "When I receive a POST request to my webhook endpoint, extract the customer email and name from the request body, then create a new contact in HubSpot."

# 2. Get webhook URL (e.g., https://your-domain.com/webhook/abc123)

# 3. Trigger webhook
.\trigger-webhook.ps1 -WebhookUrl "https://your-domain.com/webhook/abc123" -PayloadFile "payloads\test-1.1-webhook-contact.json"

# 4. Check if HubSpot contact was created
```

## Tips

- **Edit payloads** to test different scenarios (edge cases, boundary values)
- **Use verbose mode** to see request/response details
- **Check logs** after each trigger to debug issues
- **Test both branches** of If/Else conditions (e.g., company size > 100 and < 100)
