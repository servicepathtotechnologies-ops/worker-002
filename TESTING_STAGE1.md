# Stage 1 Testing Guide - Summarize Layer

## Overview
This guide helps you test Stage 1 (Summarize Layer) with 15 real-world workflow use cases to verify:
1. ✅ Keywords are extracted correctly (no false positives, no missing nodes)
2. ✅ Variations include required keywords naturally in text
3. ✅ Keywords are returned in result for frontend display
4. ✅ No hardcoded logic is used (100% registry-based)

## Test Cases

### WORKFLOW 1: AI Omni-Channel Lead Capture & CRM Qualification
**Prompt:** "Capture leads from website, qualify using AI, store in CRM, notify sales, and respond automatically."

**Expected Keywords:** `webhook`, `ai_chat_model`, `salesforce`, `slack_message`, `google_gmail`

**What to Check:**
- [ ] At least 4-5 keywords extracted
- [ ] Variations mention AI qualification, CRM storage, notifications
- [ ] Keywords field populated in each variation
- [ ] Keywords naturally integrated in variation text

---

### WORKFLOW 2: Multi-Channel Social Media AI Content Engine
**Prompt:** "Generate AI content daily and post automatically on all social platforms."

**Expected Keywords:** `schedule`, `ai_chat_model`, `linkedin`, `twitter`, `facebook`

**What to Check:**
- [ ] Schedule trigger extracted
- [ ] AI node extracted (ai_chat_model or similar)
- [ ] At least one social platform extracted (linkedin, twitter, facebook, instagram)
- [ ] Variations mention "daily" and "social platforms"
- [ ] Keywords field shows extracted node types

---

### WORKFLOW 3: AI Customer Support Ticket Automation
**Prompt:** "Automatically respond to support tickets and escalate critical ones."

**Expected Keywords:** `webhook`, `freshdesk`, `ai_chat_model`, `switch`, `slack_message`

**What to Check:**
- [ ] Support system extracted (freshdesk, intercom, etc.)
- [ ] AI node for auto-response
- [ ] Conditional logic node (switch or if_else)
- [ ] Notification node for escalation

---

### WORKFLOW 4: E-commerce Order Processing
**Prompt:** "When an order is placed, process payment, update inventory, notify warehouse."

**Expected Keywords:** `webhook`, `stripe`, `mysql`, `slack_message`

**What to Check:**
- [ ] Payment processor extracted (stripe, paypal)
- [ ] Database node for inventory
- [ ] Notification node for warehouse

---

### WORKFLOW 5: DevOps CI/CD Monitoring
**Prompt:** "Monitor repos and notify team on failures."

**Expected Keywords:** `github`, `if_else`, `slack_message`

**What to Check:**
- [ ] Repository node extracted (github, gitlab)
- [ ] Conditional logic for failure detection
- [ ] Notification node

---

### WORKFLOW 6: Enterprise Data Sync & Reporting
**Prompt:** "Sync CRM, DB, and spreadsheets daily and generate reports."

**Expected Keywords:** `interval`, `database_read`, `google_sheets`, `airtable`

**What to Check:**
- [ ] Schedule trigger (interval or schedule)
- [ ] Database node
- [ ] Spreadsheet nodes (google_sheets, airtable)

---

### WORKFLOW 7: Multi-CRM Sales Funnel
**Prompt:** "Manage leads across multiple CRMs and move them through funnel stages."

**Expected Keywords:** `zoho_crm`, `pipedrive`, `if_else`

**What to Check:**
- [ ] Multiple CRM nodes extracted
- [ ] Conditional logic for funnel stages

---

### WORKFLOW 8: AI Document Processing
**Prompt:** "Upload contracts, extract data, summarize, store in cloud."

**Expected Keywords:** `read_binary_file`, `ai_chat_model`, `dropbox`

**What to Check:**
- [ ] File read node
- [ ] AI node for summarization
- [ ] Cloud storage node

---

### WORKFLOW 9: Real-Time Chatbot
**Prompt:** "Build AI chatbot that remembers users and can call APIs."

**Expected Keywords:** `chat_trigger`, `ai_agent`, `memory`, `http_request`

**What to Check:**
- [ ] Chat trigger extracted
- [ ] AI agent (not just ai_chat_model)
- [ ] Memory node
- [ ] HTTP request for APIs

---

### WORKFLOW 10: Payment Reconciliation
**Prompt:** "Reconcile all payments daily and flag mismatches."

**Expected Keywords:** `interval`, `stripe`, `paypal`, `if_else`

**What to Check:**
- [ ] Schedule trigger
- [ ] Payment processors
- [ ] Conditional logic for mismatches

---

### WORKFLOW 11: Email & Calendar Automation
**Prompt:** "Auto-schedule meetings from emails and update calendar."

**Expected Keywords:** `google_gmail`, `google_calendar`

**What to Check:**
- [ ] Email node (gmail, outlook)
- [ ] Calendar node

---

### WORKFLOW 12: SaaS User Lifecycle
**Prompt:** "Track new users, onboarding, churn risk and engagement."

**Expected Keywords:** `form`, `database_write`, `ai_chat_model`

**What to Check:**
- [ ] Form trigger
- [ ] Database node
- [ ] AI node for churn analysis

---

### WORKFLOW 13: Webhook Orchestrator
**Prompt:** "Route incoming webhooks to multiple services conditionally."

**Expected Keywords:** `webhook`, `switch`, `http_post`

**What to Check:**
- [ ] Webhook trigger
- [ ] Switch node for routing
- [ ] HTTP post for services

---

### WORKFLOW 14: Data Migration
**Prompt:** "Migrate legacy data into modern systems."

**Expected Keywords:** `split_in_batches`, `postgresql`, `mongodb`

**What to Check:**
- [ ] Batch processing node
- [ ] Source and destination databases

---

### WORKFLOW 15: Error Recovery System
**Prompt:** "Detect workflow errors, retry, notify, and auto-recover."

**Expected Keywords:** `error_trigger`, `error_handler`, `slack_message`

**What to Check:**
- [ ] Error trigger
- [ ] Error handler
- [ ] Notification node

---

## How to Test

### Option 1: Manual Testing via API
1. Start the backend server
2. Call the `/api/clarify-intent` endpoint with each prompt
3. Check the response for:
   - `mandatoryNodeTypes`: Extracted keywords
   - `promptVariations[].keywords`: Keywords in each variation
   - `promptVariations[].prompt`: Variation text with keywords naturally integrated

### Option 2: Automated Testing
Run the test script:
```bash
cd worker
npm run test:stage1
# or
ts-node scripts/test-stage1.ts
```

### Option 3: Frontend Testing
1. Open the workflow builder UI
2. Enter each prompt in the input field
3. Check the prompt variations displayed
4. Verify keywords are shown as tags below each variation
5. Verify keywords are naturally integrated in variation text

## Success Criteria

For each test case, verify:

✅ **Keyword Extraction:**
- At least 2-3 keywords extracted (more for complex workflows)
- Expected keywords are present (or semantically equivalent)
- No false positives (generic words like "store", "notify" only if context matches)

✅ **Variation Generation:**
- 4 variations generated
- Each variation includes extracted keywords naturally in text
- Keywords field populated with node types

✅ **No Hardcoded Logic:**
- No hardcoded node type checks in code
- All logic uses `unifiedNodeRegistry`
- Examples in prompts use `extractedNodeTypes` dynamically

✅ **Natural Integration:**
- Keywords appear naturally in variation sentences
- Not just "Use X node" but "Use X to do Y"
- Data flow shown: "Data flows from X → Y → Z"

## Expected Results

- **Pass Rate:** 80%+ (12/15 workflows should pass)
- **Keyword Accuracy:** 70%+ of expected keywords found
- **Variation Quality:** All variations have keywords integrated naturally
- **No Errors:** No crashes or exceptions during testing

## Troubleshooting

If keywords are not extracted:
1. Check if node keywords are in the registry
2. Verify keyword extraction confidence threshold (should be 0.85+)
3. Check semantic grouping (might be selecting one node per category)

If variations don't include keywords:
1. Check AI prompt instructions
2. Verify `extractedNodeTypes` are passed to AI
3. Check validation logic

If hardcoded logic found:
1. Search for specific node type strings in code
2. Verify all examples use `extractedNodeTypes`
3. Check registry-based matching
