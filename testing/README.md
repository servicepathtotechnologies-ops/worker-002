# Webhook Testing Suite

This folder contains webhook payload files and trigger scripts for testing workflows from the comprehensive node testing suite.

## Structure

- `payloads/` - JSON payload files for each webhook test case
- `trigger-webhook.ps1` - PowerShell script to trigger webhooks
- `trigger-webhook.sh` - Bash script for Linux/Mac users

## How to Use

### 1. Get Your Webhook URL

After creating a workflow with a webhook trigger, you'll receive a webhook URL. It typically looks like:
```
https://your-domain.com/webhook/abc123xyz
```

### 2. Trigger a Webhook

#### Using PowerShell (Windows):
```powershell
.\trigger-webhook.ps1 -WebhookUrl "https://your-domain.com/webhook/abc123xyz" -PayloadFile "payloads/test-1.1-webhook-contact.json"
```

#### Using Bash (Linux/Mac):
```bash
./trigger-webhook.sh "https://your-domain.com/webhook/abc123xyz" "payloads/test-1.1-webhook-contact.json"
```

#### Using cURL directly:
```bash
curl -X POST "https://your-domain.com/webhook/abc123xyz" \
  -H "Content-Type: application/json" \
  -d @payloads/test-1.1-webhook-contact.json
```

## Test Cases

### Test 1.1: Webhook Contact
**File:** `payloads/test-1.1-webhook-contact.json`
**Description:** Basic webhook with email and name for HubSpot contact creation

### Test 2.1: Webhook Lead with Company Size
**File:** `payloads/test-2.1-webhook-lead-company-size.json`
**Description:** Webhook with company size for If/Else condition testing

### Test 2.3: Webhook Full Name
**File:** `payloads/test-2.3-webhook-full-name.json`
**Description:** Webhook with full name for name splitting test

### Test 2.5: Webhook Deal Created
**File:** `payloads/test-2.5-webhook-deal-created.json`
**Description:** Webhook for deal creation with status tracking

### Test 2.9: Webhook Order Data
**File:** `payloads/test-2.9-webhook-order-data.json`
**Description:** Order data with subtotal for tax calculation test

### Test 2.11: Webhook Pass Through
**File:** `payloads/test-2.11-webhook-passthrough.json`
**Description:** Generic webhook data for NoOp node testing

### Test 3.1: Webhook Customer Message
**File:** `payloads/test-3.1-webhook-customer-message.json`
**Description:** Customer message for AI sentiment analysis

### Test 4.3: Webhook Pipedrive Deal Stage
**File:** `payloads/test-4.3-webhook-pipedrive-deal.json`
**Description:** Pipedrive deal stage change webhook

### Test 4.4: Webhook Notion Database
**File:** `payloads/test-4.4-webhook-notion-database.json`
**Description:** Notion database row addition webhook

### Test 5.1: Webhook Gmail Email
**File:** `payloads/test-5.1-webhook-gmail-urgent.json`
**Description:** Gmail email webhook with URGENT subject

### Test 7.1: Webhook Lead with Score
**File:** `payloads/test-7.1-webhook-lead-score.json`
**Description:** Lead webhook with lead score for complex pipeline

### Test 7.4: Webhook Order Data (Error Handling)
**File:** `payloads/test-7.4-webhook-order-error.json`
**Description:** Order data for error handling and retry testing

## Customizing Payloads

You can edit any JSON file in the `payloads/` folder to customize the test data. Make sure to maintain the structure expected by your workflow.

## Testing Tips

1. **Test with different values**: Edit payloads to test edge cases (e.g., company size = 100, lead score = 50)
2. **Check workflow logs**: Monitor your workflow execution logs to see how data flows
3. **Validate outputs**: Verify that downstream nodes receive the correct data
4. **Test error cases**: Try invalid data to test error handling

## Notes

- All webhook payloads use POST method
- Content-Type is `application/json`
- Timestamps in payloads are examples - adjust as needed
- IDs are placeholder values - replace with real IDs if needed
