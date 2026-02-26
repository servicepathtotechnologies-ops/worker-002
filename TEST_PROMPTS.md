# 5 Test Prompts for Workflow Generation

Use these prompts to test the autonomous workflow builder. Each prompt tests different aspects of the system.

## Test 1: Simple Form to Sheets
**Prompt:**
```
When a form is submitted with name and email, save it to Google Sheets in a sheet called 'Submissions'.
```

**Expected:**
- **Complexity:** Simple
- **Nodes:** `form`, `google_sheets`
- **Credentials:** `google_sheets`
- **Tests:** Basic linear flow, form trigger, data storage

---

## Test 2: Scheduled API Check with Conditional Alert
**Prompt:**
```
Every hour, check the status of https://api.example.com/health. If the status is not 'ok', send a Slack message to #alerts with the error message.
```

**Expected:**
- **Complexity:** Medium
- **Nodes:** `schedule`, `http_request`, `if`, `slack`
- **Credentials:** `slack`
- **Tests:** Scheduled trigger, HTTP requests, conditional logic, notifications

---

## Test 3: Webhook to Multiple Integrations
**Prompt:**
```
When a webhook receives a new customer signup (with fields: name, email, company), create a contact in HubSpot, add a row to Airtable in the 'Customers' table, and send a welcome email via Gmail.
```

**Expected:**
- **Complexity:** Medium
- **Nodes:** `webhook`, `hubspot`, `airtable`, `gmail`
- **Credentials:** `hubspot`, `airtable`, `gmail`
- **Tests:** Webhook trigger, multi-destination branching, CRM integration

---

## Test 4: Complex Multi-Step with Logic
**Prompt:**
```
Every Monday at 9 AM, fetch all open GitHub issues from repo 'myorg/myproject'. Filter issues that are labeled 'bug' and have been open for more than 7 days. For each matching issue, create a task in ClickUp with high priority, add it to a Notion database called 'Critical Bugs', and notify the team on Telegram channel #urgent-bugs.
```

**Expected:**
- **Complexity:** Complex
- **Nodes:** `schedule`, `github`, `filter`, `clickup`, `notion`, `telegram`
- **Credentials:** `github`, `clickup`, `notion`, `telegram`
- **Tests:** Complex scheduling, data filtering, multi-service integration, conditional processing

---

## Test 5: Chat Trigger with AI Processing
**Prompt:**
```
When someone sends a message in a Telegram group asking for a summary, use an AI chat model to generate a concise summary of the message and reply back to the group.
```

**Expected:**
- **Complexity:** Simple
- **Nodes:** `chat_trigger`, `ai_chat_model`, `telegram`
- **Credentials:** `telegram`
- **Tests:** Chat trigger, AI integration, response generation

---

## How to Test

### Option 1: Using the Frontend UI
1. Open the workflow wizard in your browser
2. Paste any of the prompts above
3. Observe the generated workflow
4. Verify:
   - Correct nodes are selected
   - All nodes are connected
   - Field mappings use `{{field}}` syntax
   - Required credentials are identified

### Option 2: Using the API (if worker is running)
```bash
curl -X POST http://localhost:3001/api/generate-workflow \
  -H "Content-Type: application/json" \
  -d '{"prompt": "YOUR_PROMPT_HERE"}'
```

### Option 3: Start Worker Service First
```bash
cd worker
npm run dev
```

Then test using the frontend or API.

---

## What to Observe

For each test, check:

1. **Node Selection**
   - Are the expected node types present?
   - Are nodes in the correct order?
   - Are there any unexpected nodes?

2. **Connections**
   - Are all nodes connected?
   - Do connections flow logically?
   - Are there any orphan nodes?

3. **Configuration**
   - Are field mappings using `{{field}}` syntax?
   - Are required fields filled?
   - Are there any placeholders?

4. **Credentials**
   - Are all required credentials identified?
   - Are credentials correctly mapped to nodes?

5. **Validation**
   - Does the workflow pass validation?
   - Are there any errors or warnings?

6. **Execution Readiness**
   - Would the workflow execute successfully?
   - Are all dependencies satisfied?

---

## Expected Results Summary

| Test | Complexity | Node Count | Connection Count | Credentials |
|------|-----------|------------|------------------|-------------|
| 1    | Simple    | 2          | 1                | 1           |
| 2    | Medium    | 4          | 3                | 1           |
| 3    | Medium    | 4          | 3                | 3           |
| 4    | Complex   | 6+         | 5+               | 4           |
| 5    | Simple    | 3          | 2                | 1           |

---

## Troubleshooting

**If workflows don't generate:**
- Check if Ollama service is running
- Verify environment variables are set
- Check worker service logs

**If nodes are missing:**
- Verify node library includes the expected types
- Check if node resolution is working
- Review workflow builder logs

**If connections are invalid:**
- Check node output/input compatibility
- Verify data flow mapping
- Review validation errors
