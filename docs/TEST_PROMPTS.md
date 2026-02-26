# Test Prompts for Comprehensive Question System

## 🎯 Purpose
These prompts are designed to test and verify that:
1. ✅ Questions are asked for ALL nodes (credentials, resources, operations, configuration)
2. ✅ Questions are grouped by node (all questions for one node before moving to next)
3. ✅ Field names match schema correctly
4. ✅ Values are saved to node properties correctly
5. ✅ All node types work correctly

---

## Test Prompt 1: Simple Single Node Workflow
**Purpose:** Test basic question generation and input attachment for a single integration node.

### Prompt:
```
When I receive a POST request to my webhook endpoint, extract the customer email and name from the request body, then create a new contact in HubSpot.
```

### Expected Behavior:
1. **Workflow Generated:**
   - Webhook trigger node
   - HubSpot node

2. **Questions Asked (in order):**
   - **Webhook Node:**
     - Question 1: "What is the path for 'Webhook'?" (text)
     - Question 2: "What is the httpMethod for 'Webhook'?" (select: GET, POST, PUT, DELETE)
   
   - **HubSpot Node:**
     - Question 1: "Which authentication method should we use for 'HubSpot'?" (select: API Key, OAuth Access Token, Stored Credential)
     - Question 2: "What is your HubSpot API Key for 'HubSpot'?" (text) - if API Key selected
     - Question 3: "Which HubSpot resource are we working with?" (select: contact, company, deal, etc.)
     - Question 4: "What HubSpot operation should 'HubSpot' perform?" (select: create, get, update, delete)
     - Question 5: "What properties should 'HubSpot' use?" (json/textarea)

3. **Verification Steps:**
   - ✅ All questions appear in step-by-step wizard
   - ✅ "Next" button works (smooth scrolling)
   - ✅ "Previous" button works
   - ✅ "Continue Building" appears only on last question
   - ✅ After answering all questions, values are saved to node properties
   - ✅ Check HubSpot node properties: `apiKey`, `resource`, `operation`, `properties` are filled

---

## Test Prompt 2: Multi-Node Workflow with Different Node Types
**Purpose:** Test question generation across multiple node types (trigger, integration, communication).

### Prompt:
```
When I receive a form submission, save the form data to Airtable, then send a Slack notification with the submission details.
```

### Expected Behavior:
1. **Workflow Generated:**
   - Form trigger node
   - Airtable node
   - Slack node

2. **Questions Asked (in order):**
   - **Form Node:**
     - Question 1: "What is the form title for 'Form'?" (text)
     - Question 2: "What fields should 'Form' have?" (json/textarea)
   
   - **Airtable Node:**
     - Question 1: "Which authentication method should we use for 'Airtable'?" (select: API Key, Stored Credential)
     - Question 2: "What is your Airtable API Key for 'Airtable'?" (text) - if API Key selected
     - Question 3: "What is the Airtable baseId for 'Airtable'?" (text)
     - Question 4: "What is the Airtable tableId for 'Airtable'?" (text)
     - Question 5: "What Airtable operation should 'Airtable' perform?" (select: create, get, update, delete)
   
   - **Slack Node:**
     - Question 1: "Which authentication method should we use for 'Slack'?" (select: Bot Token, OAuth Access Token, Stored Credential)
     - Question 2: "What is your Slack Bot Token for 'Slack'?" (text) - if Bot Token selected
     - Question 3: "What is the Slack channel for 'Slack'?" (text)
     - Question 4: "What message should 'Slack' send?" (textarea)

3. **Verification Steps:**
   - ✅ Questions are grouped by node (all Form questions, then all Airtable questions, then all Slack questions)
   - ✅ Each node's questions are asked consecutively
   - ✅ After answering all questions, check node properties:
     - Form node: `formTitle`, `fields` are filled
     - Airtable node: `apiKey`, `baseId`, `tableId`, `operation` are filled
     - Slack node: `botToken`, `channel`, `message` are filled

---

## Test Prompt 3: Complex Workflow with Logic and Multiple Integrations
**Purpose:** Test question generation for complex workflows with logic nodes and multiple integrations.

### Prompt:
```
When I receive a POST request to my webhook endpoint, extract the email from the request body. If the email contains "@company.com", create a contact in HubSpot and send them a welcome email via Gmail. Otherwise, just log the email to a Google Sheet.
```

### Expected Behavior:
1. **Workflow Generated:**
   - Webhook trigger node
   - If/Else node (conditional logic)
   - HubSpot node (true branch)
   - Gmail node (true branch)
   - Google Sheets node (false branch)

2. **Questions Asked (in order):**
   - **Webhook Node:**
     - Question 1: "What is the path for 'Webhook'?" (text)
     - Question 2: "What is the httpMethod for 'Webhook'?" (select)
   
   - **If/Else Node:**
     - Question 1: "What conditions should 'If/Else' check?" (textarea/json)
   
   - **HubSpot Node:**
     - Question 1: "Which authentication method should we use for 'HubSpot'?" (select)
     - Question 2: "What is your HubSpot API Key for 'HubSpot'?" (text)
     - Question 3: "Which HubSpot resource are we working with?" (select)
     - Question 4: "What HubSpot operation should 'HubSpot' perform?" (select)
     - Question 5: "What properties should 'HubSpot' use?" (json/textarea)
   
   - **Gmail Node:**
     - Question 1: "Which authentication method should we use for 'Gmail'?" (select: OAuth Access Token, Stored Credential)
     - Question 2: "What is your Gmail OAuth Access Token for 'Gmail'?" (text) - if OAuth selected
     - Question 3: "What Gmail operation should 'Gmail' perform?" (select: send, get)
     - Question 4: "What is the recipient email for 'Gmail'?" (text)
     - Question 5: "What is the email subject for 'Gmail'?" (text)
     - Question 6: "What body should 'Gmail' send?" (textarea)
   
   - **Google Sheets Node:**
     - Question 1: "Which authentication method should we use for 'Google Sheets'?" (select: OAuth Access Token, Stored Credential)
     - Question 2: "What is your Google Sheets OAuth Access Token for 'Google Sheets'?" (text) - if OAuth selected
     - Question 3: "What is the Google Sheets spreadsheetId for 'Google Sheets'?" (text)
     - Question 4: "What Google Sheets operation should 'Google Sheets' perform?" (select: append, read, update)
     - Question 5: "What data should 'Google Sheets' use?" (json/textarea)

3. **Verification Steps:**
   - ✅ Questions are grouped by node (all questions for one node before moving to next)
   - ✅ Node order: Webhook → If/Else → HubSpot → Gmail → Google Sheets
   - ✅ After answering all questions, check node properties:
     - Webhook: `path`, `httpMethod` are filled
     - If/Else: `conditions` are filled
     - HubSpot: `apiKey`, `resource`, `operation`, `properties` are filled
     - Gmail: `accessToken` (or `credentialId`), `operation`, `to`, `subject`, `body` are filled
     - Google Sheets: `accessToken` (or `credentialId`), `spreadsheetId`, `operation`, `data` are filled

---

## 🧪 Testing Checklist

For each test prompt, verify:

### Question Generation:
- [ ] All required questions are asked
- [ ] Questions are grouped by node (not mixed)
- [ ] Questions appear in correct order (credentials → resources → operations → config)
- [ ] Step-by-step wizard works (one question at a time)
- [ ] "Next" button scrolls smoothly
- [ ] "Previous" button works
- [ ] "Continue Building" appears only on last question

### Field Name Matching:
- [ ] Field names in questions match schema field names exactly
- [ ] No field name mismatches or errors
- [ ] All field names are correctly extracted from question IDs

### Input Attachment:
- [ ] After answering questions, values are saved to node properties
- [ ] Check node properties in workflow editor:
  - [ ] Credentials are saved (apiKey, accessToken, credentialId)
  - [ ] Resources are saved (resource, baseId, tableId, spreadsheetId)
  - [ ] Operations are saved (operation)
  - [ ] Configuration fields are saved (properties, message, subject, etc.)
- [ ] No fields are missing or empty (unless optional)
- [ ] JSON fields are properly formatted

### Node-Specific Verification:

**HubSpot:**
- [ ] `apiKey` or `accessToken` or `credentialId` is filled
- [ ] `resource` is filled (contact, company, deal)
- [ ] `operation` is filled (create, get, update, delete)
- [ ] `properties` is filled (JSON format)

**Airtable:**
- [ ] `apiKey` or `credentialId` is filled
- [ ] `baseId` is filled
- [ ] `tableId` is filled
- [ ] `operation` is filled

**Slack:**
- [ ] `botToken` or `accessToken` or `credentialId` is filled
- [ ] `channel` is filled
- [ ] `message` is filled

**Gmail:**
- [ ] `accessToken` or `credentialId` is filled
- [ ] `operation` is filled
- [ ] `to` is filled
- [ ] `subject` is filled
- [ ] `body` is filled

**Google Sheets:**
- [ ] `accessToken` or `credentialId` is filled
- [ ] `spreadsheetId` is filled (URL normalized to ID if needed)
- [ ] `operation` is filled
- [ ] `data` or `values` is filled

**Webhook:**
- [ ] `path` is filled
- [ ] `httpMethod` is filled

**Form:**
- [ ] `formTitle` is filled
- [ ] `fields` is filled (JSON format)

---

## 📝 Notes

1. **Question Order:** Questions should be grouped by node, then sorted by `askOrder` within each node:
   - Credentials (askOrder: 0-0.5)
   - Resources (askOrder: 1)
   - Operations (askOrder: 2)
   - Configuration (askOrder: 3+)

2. **Field Name Consistency:** Field names in questions must match schema field names exactly (case-sensitive).

3. **Node Properties:** After answering all questions and clicking "Continue Building", check the workflow editor to verify all node properties are filled correctly.

4. **Error Handling:** If a field is not found in schema, it should be logged as a warning but not break the workflow.

5. **Special Cases:**
   - Slack: `text` field maps to `message` field
   - Gmail: `messageId` only required for 'get' operation
   - Google services: URLs are normalized to IDs

---

## ✅ Success Criteria

All three test prompts should:
1. ✅ Generate workflows with correct nodes
2. ✅ Ask all required questions for each node
3. ✅ Group questions by node (not mixed)
4. ✅ Save all answers to correct node properties
5. ✅ Work correctly for all node types

If all three prompts pass, the comprehensive question system is working correctly! 🎉
