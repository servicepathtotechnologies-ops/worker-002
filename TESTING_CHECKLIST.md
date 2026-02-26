# Testing Checklist for Workflow Builder Enhancements

This checklist verifies that all enhancements are working correctly:

## 1. 🧠 Final System Prompt Verification

### Test 1.1: Prompt File Exists
- [ ] Verify `FINAL_WORKFLOW_SYSTEM_PROMPT.md` exists in `worker/src/services/ai/`
- [ ] Verify prompt contains explicit node list
- [ ] Verify prompt forbids "custom" nodes
- [ ] Verify prompt includes examples

### Test 1.2: Prompt Loading Priority
- [ ] Verify `getWorkflowGenerationSystemPrompt()` prioritizes FINAL prompt
- [ ] Check console logs show: "Using FINAL workflow generation prompt"
- [ ] Verify fallback chain: FINAL → ULTIMATE → PRODUCTION → WORKFLOW_GENERATION

## 2. 🔧 Integration Enforcement Upgrade

### Test 2.1: Empty AI Response Handling
- [ ] Mock an empty AI response (no nodes/steps)
- [ ] Verify fallback triggers: `buildWorkflowProgrammatically()` is called
- [ ] Verify workflow is generated with detected integrations
- [ ] Check console logs: "AI returned empty nodes – falling back to programmatic generation"

### Test 2.2: Invalid Node Types Handling
- [ ] Mock AI response with invalid node types (e.g., "custom", "invalid_node")
- [ ] Verify invalid nodes are filtered out
- [ ] Verify fallback triggers if all nodes are invalid
- [ ] Check console logs: "All AI nodes/steps were invalid – falling back to programmatic generation"

### Test 2.3: Missing Integration Enforcement
- [ ] Test prompt: "When a new contact is added to HubSpot, create a record in Google Sheets and notify the sales team on Slack"
- [ ] Mock AI response missing one integration (e.g., missing "slack")
- [ ] Verify missing integration is added programmatically
- [ ] Verify connection is created for added node
- [ ] Check console logs: "Integration slack missing – adding node programmatically"

### Test 2.4: Integration Detection
- [ ] Test prompt mentions: HubSpot, Google Sheets, Gmail, Slack
- [ ] Verify `detectIntegrations()` returns: `['hubspot', 'google_sheets', 'gmail', 'slack']`
- [ ] Verify all detected integrations appear in workflow nodes

## 3. ✅ Node Library Initialization Check

### Test 3.1: Library Verification on Startup
- [ ] Verify `verifyNodeLibraryInitialization()` is called in constructor
- [ ] Check console logs on startup show verification results
- [ ] Verify all required integrations are registered

### Test 3.2: Missing Integration Detection
- [ ] Temporarily remove an integration from `node-library.ts` (e.g., comment out `createHubSpotSchema()`)
- [ ] Restart the service
- [ ] Verify error log: "Missing integrations: hubspot"
- [ ] Restore the integration

### Test 3.3: Schema Access Verification
- [ ] Test `nodeLibrary.getSchema('hubspot')` returns non-null object
- [ ] Test `nodeLibrary.getSchema('slack')` returns non-null object
- [ ] Test `nodeLibrary.getSchema('google_sheets')` returns non-null object
- [ ] Test `nodeLibrary.getSchema('gmail')` returns non-null object
- [ ] Test `nodeLibrary.getSchema('invalid')` returns undefined

## 4. 🧪 End-to-End Workflow Generation Tests

### Test 4.1: HubSpot → Google Sheets → Slack Workflow
**Prompt**: "When a new contact is added to HubSpot, create a record in Google Sheets and notify the sales team on Slack."

**Expected Results**:
- [ ] Trigger: `webhook` (detected from "when a new contact is added")
- [ ] Nodes include: `hubspot`, `google_sheets`, `slack`
- [ ] All nodes have valid types (no "custom")
- [ ] Connections are created: trigger → hubspot → google_sheets, hubspot → slack
- [ ] Required credentials: `['hubspot', 'google_sheets', 'slack']`
- [ ] Workflow passes validation

### Test 4.2: Schedule → HTTP → Airtable Workflow
**Prompt**: "Every day at 9am, fetch a random quote from api.quotable.io and save it to an Airtable base."

**Expected Results**:
- [ ] Trigger: `schedule` (detected from "every day at 9am")
- [ ] Nodes include: `schedule`, `http_request`, `airtable`
- [ ] Schedule config has cron: `"0 9 * * *"`
- [ ] HTTP request has URL: `"https://api.quotable.io/random"`
- [ ] Required credentials: `['airtable']`
- [ ] Workflow passes validation

### Test 4.3: Form → AI → Gmail Workflow
**Prompt**: "When a user submits a form, use AI to analyze the content and send an email via Gmail."

**Expected Results**:
- [ ] Trigger: `form` (detected from "form submission")
- [ ] Nodes include: `form`, `ai_chat_model` (or `ai_agent`), `gmail`
- [ ] All nodes have valid types
- [ ] Connections: form → ai → gmail
- [ ] Required credentials: `['gmail']` (AI may not need credentials)
- [ ] Workflow passes validation

## 5. 🔍 Validation Tests

### Test 5.1: Node Type Validation
- [ ] Verify "custom" nodes are rejected
- [ ] Verify invalid node types are filtered out
- [ ] Verify valid node types pass validation

### Test 5.2: Connection Validation
- [ ] Verify all connections reference valid node IDs
- [ ] Verify no orphan nodes (all nodes connected)
- [ ] Verify no circular dependencies
- [ ] Verify trigger connects to first node

### Test 5.3: Required Fields Validation
- [ ] Verify all required config fields are filled
- [ ] Verify template syntax is used: `{{previous_node.output.field}}`
- [ ] Verify no empty required fields

## 6. 📊 Integration Detection Tests

### Test 6.1: Trigger Detection
- [ ] "When a new contact is added to HubSpot" → `webhook`
- [ ] "Every day at 9am" → `schedule`
- [ ] "When a user submits a form" → `form`
- [ ] "Chat message received" → `chat_trigger`
- [ ] Default → `manual_trigger`

### Test 6.2: Integration Detection Patterns
- [ ] "HubSpot" → detects `hubspot`
- [ ] "Google Sheets" → detects `google_sheets`
- [ ] "Gmail" → detects `gmail`
- [ ] "Slack" → detects `slack`
- [ ] "Airtable" → detects `airtable`
- [ ] "Notion" → detects `notion`
- [ ] "Zoho CRM" → detects `zoho`
- [ ] "Pipedrive" → detects `pipedrive`

## 7. 🚨 Error Handling Tests

### Test 7.1: AI Service Unavailable
- [ ] Mock AI service failure
- [ ] Verify fallback to programmatic generation
- [ ] Verify workflow is still generated

### Test 7.2: Invalid JSON Response
- [ ] Mock invalid JSON from AI
- [ ] Verify error handling
- [ ] Verify fallback triggers

### Test 7.3: Partial AI Response
- [ ] Mock AI response with some valid nodes and some invalid
- [ ] Verify valid nodes are kept
- [ ] Verify invalid nodes are removed
- [ ] Verify missing integrations are added

## 8. ✅ Final Validation Checklist

After all tests pass, verify:

- [ ] All console logs show correct behavior
- [ ] No "custom" nodes in generated workflows
- [ ] All mentioned integrations appear in workflows
- [ ] All workflows pass validation
- [ ] Node library verification passes on startup
- [ ] Integration enforcement works for all test cases
- [ ] Fallback generation works when AI fails

## Running the Tests

1. **Unit Tests**: Run individual test cases using your test framework
2. **Integration Tests**: Test full workflow generation with real prompts
3. **Manual Tests**: Use the API to generate workflows and verify results

## Test Prompts

Use these prompts for testing:

1. "When a new contact is added to HubSpot, create a record in Google Sheets and notify the sales team on Slack."
2. "Every day at 9am, fetch a random quote from api.quotable.io and save it to an Airtable base."
3. "When a user submits a form, use AI to analyze the content and send an email via Gmail."
4. "If a new lead is added to Pipedrive, check if they're from the US, and if so, add them to Notion and send a Slack notification."
5. "Schedule a daily task to fetch data from a REST API and save it to Google Sheets."

## Expected Console Output

When everything works correctly, you should see:

```
✅ [Node Library Check] All X required integrations are registered
✅ Using FINAL workflow generation prompt (explicit node list and mandatory integration inclusion)
🚨 [Integration Detection] Detected HUBSPOT integration requirement
🚨 [Integration Detection] Detected GOOGLE_SHEETS integration requirement
🚨 [Integration Detection] Detected SLACK integration requirement
✅ [Integration Enforcement] Added SLACK node with type: slack (validated in library)
✅ [STRUCTURE VALIDATION] All X steps validated successfully
```
