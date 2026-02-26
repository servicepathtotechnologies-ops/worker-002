# Comprehensive Node Testing Suite
## Real-World Automation Workflow Testing

This document contains test prompts designed to exercise all available nodes in realistic automation scenarios. Each test includes:
- **Prompt**: Natural language user request
- **Expected Nodes**: Which nodes should be generated
- **Validation Points**: What to check in the generated workflow
- **Edge Cases**: Potential issues to watch for

---

## 🎯 TEST CATEGORIES

### 1. TRIGGER NODES
### 2. LOGIC & FLOW CONTROL NODES
### 3. AI & HTTP NODES
### 4. CRM INTEGRATIONS
### 5. COMMUNICATION NODES
### 6. DATA PROCESSING NODES
### 7. COMPLEX MULTI-NODE WORKFLOWS

---

## 1. TRIGGER NODES

### Test 1.1: Webhook Trigger
**Prompt:**
```
When I receive a POST request to my webhook endpoint, extract the customer email and name from the request body, then create a new contact in HubSpot.
```

**Expected Nodes:**
- `webhook` (trigger)
- `set_variable` or `set` (extract email/name)
- `hubspot` (create contact)

**Validation:**
- ✅ Webhook configured with POST method
- ✅ Email and name extracted from `{{webhook.body.email}}` and `{{webhook.body.name}}`
- ✅ HubSpot node receives extracted data
- ✅ All required HubSpot fields filled

---

### Test 1.2: Chat Trigger
**Prompt:**
```
When a user sends a chat message asking about product pricing, use AI to generate a response and send it back via Slack.
```

**Expected Nodes:**
- `chat_trigger` (trigger)
- `ai_chat_model` or `openai_gpt` (generate response)
- `slack_message` (send response)

**Validation:**
- ✅ Chat trigger configured
- ✅ AI model receives chat message input
- ✅ Slack receives AI response
- ✅ Proper data flow: chat → AI → Slack

---

### Test 1.3: Form Trigger
**Prompt:**
```
When someone submits my contact form with their name, email, and message, save the data to Airtable and send a confirmation email via Gmail.
```

**Expected Nodes:**
- `form` (trigger)
- `airtable` (save data)
- `google_gmail` (send email)

**Validation:**
- ✅ Form trigger configured
- ✅ Form fields mapped: `{{form.name}}`, `{{form.email}}`, `{{form.message}}`
- ✅ Airtable receives all form data
- ✅ Gmail sends confirmation with form data

---

### Test 1.4: Schedule Trigger
**Prompt:**
```
Every Monday at 9 AM, fetch new leads from Pipedrive, filter for high-value opportunities, and send a summary report to my Slack channel.
```

**Expected Nodes:**
- `schedule` (trigger with cron: `0 9 * * 1`)
- `pipedrive` (fetch leads)
- `filter` (filter high-value)
- `slack_message` (send report)

**Validation:**
- ✅ Schedule configured with correct cron expression
- ✅ Pipedrive query configured
- ✅ Filter condition properly set
- ✅ Slack message includes filtered data

---

### Test 1.5: HTTP Request (as trigger alternative)
**Prompt:**
```
Make an HTTP GET request to fetch user data from an API, then process the response and update a Notion database.
```

**Expected Nodes:**
- `manual_trigger` or `webhook` (trigger)
- `http_request` (GET request)
- `notion` (update database)

**Validation:**
- ✅ HTTP request configured with GET method and URL
- ✅ Response parsed correctly
- ✅ Notion receives processed data
- ✅ Error handling if API fails

---

## 2. LOGIC & FLOW CONTROL NODES

### Test 2.1: If/Else Node
**Prompt:**
```
When a new lead comes in via webhook, check if their company size is over 100 employees. If yes, create a deal in HubSpot. If no, just add them as a contact.
```

**Expected Nodes:**
- `webhook` (trigger)
- `if_else` (check company size)
- `hubspot` (create deal - true branch)
- `hubspot` (create contact - false branch)

**Validation:**
- ✅ If/Else condition: `{{webhook.body.companySize}} > 100`
- ✅ True branch connects to deal creation
- ✅ False branch connects to contact creation
- ✅ Both branches properly configured

---

### Test 2.2: Switch Node
**Prompt:**
```
When a form is submitted, check the inquiry type. If it's "sales", route to HubSpot. If it's "support", route to Zoho. If it's "partnership", route to Pipedrive. Otherwise, send to Slack.
```

**Expected Nodes:**
- `form` (trigger)
- `switch` (route by inquiry type)
- `hubspot` (sales case)
- `zoho_crm` (support case)
- `pipedrive` (partnership case)
- `slack_message` (default case)

**Validation:**
- ✅ Switch configured with `{{form.inquiryType}}`
- ✅ Cases: "sales", "support", "partnership"
- ✅ Default case to Slack
- ✅ Each branch properly connected

---

### Test 2.3: Set Variable Node
**Prompt:**
```
Extract the customer's full name from a webhook, split it into first and last name, then create a contact in HubSpot with those fields.
```

**Expected Nodes:**
- `webhook` (trigger)
- `set_variable` or `set` (extract and split name)
- `hubspot` (create contact)

**Validation:**
- ✅ Set node extracts `{{webhook.body.fullName}}`
- ✅ First name: `{{fullName.split(' ')[0]}}`
- ✅ Last name: `{{fullName.split(' ')[1]}}`
- ✅ HubSpot receives firstName and lastName

---

### Test 2.4: Merge Node
**Prompt:**
```
Fetch customer data from HubSpot and their order history from an HTTP API, merge both datasets, then send a complete report to Slack.
```

**Expected Nodes:**
- `manual_trigger` (trigger)
- `hubspot` (fetch customer)
- `http_request` (fetch orders)
- `merge` (combine data)
- `slack_message` (send report)

**Validation:**
- ✅ HubSpot and HTTP request run in parallel
- ✅ Merge waits for both inputs
- ✅ Merge combines objects/arrays correctly
- ✅ Slack receives merged data

---

### Test 2.5: Wait Node
**Prompt:**
```
When a new deal is created in HubSpot, wait 24 hours, then check if the deal status changed. If not, send a reminder to Slack.
```

**Expected Nodes:**
- `webhook` or `schedule` (trigger)
- `hubspot` (get deal)
- `wait` (24 hours)
- `hubspot` (check deal status)
- `if_else` (check if changed)
- `slack_message` (send reminder)

**Validation:**
- ✅ Wait configured for 24 hours (86400 seconds)
- ✅ Second HubSpot call uses deal ID from first
- ✅ If/Else checks status change
- ✅ Reminder only sent if status unchanged

---

### Test 2.6: Limit Node
**Prompt:**
```
Fetch the latest 10 contacts from HubSpot, process each one, and send summaries to Slack.
```

**Expected Nodes:**
- `schedule` or `manual_trigger` (trigger)
- `hubspot` (fetch contacts)
- `limit` (limit to 10)
- `loop` or processing node
- `slack_message` (send summaries)

**Validation:**
- ✅ Limit set to 10 items
- ✅ Applied to HubSpot results array
- ✅ Loop processes limited array
- ✅ Slack receives 10 summaries max

---

### Test 2.7: Aggregate Node
**Prompt:**
```
Fetch all deals from Pipedrive, group them by stage, calculate total value per stage, and send a summary report to Gmail.
```

**Expected Nodes:**
- `schedule` or `manual_trigger` (trigger)
- `pipedrive` (fetch deals)
- `aggregate` (group by stage)
- `set_variable` or `javascript` (calculate totals)
- `google_gmail` (send report)

**Validation:**
- ✅ Aggregate groups by `{{deal.stage}}`
- ✅ Calculates sum of `{{deal.value}}`
- ✅ Output structure: `{stage: string, totalValue: number}[]`
- ✅ Gmail receives formatted report

---

### Test 2.8: Sort Node
**Prompt:**
```
Get all contacts from Zoho, sort them by last contact date (newest first), take the top 5, and add them to a ClickUp task list.
```

**Expected Nodes:**
- `schedule` or `manual_trigger` (trigger)
- `zoho_crm` (fetch contacts)
- `sort` (sort by date)
- `limit` (top 5)
- `clickup` (add to task list)

**Validation:**
- ✅ Sort configured: `{{contact.lastContactDate}}` descending
- ✅ Limit applied after sort
- ✅ ClickUp receives 5 contacts
- ✅ Data flow: Zoho → Sort → Limit → ClickUp

---

### Test 2.9: Code/JavaScript Node
**Prompt:**
```
When a webhook receives order data, use JavaScript to calculate the total price including tax (8.5%), format it as currency, then save to Airtable.
```

**Expected Nodes:**
- `webhook` (trigger)
- `javascript` or `code` (calculate total)
- `airtable` (save data)

**Validation:**
- ✅ JavaScript code: `const total = input.subtotal * 1.085`
- ✅ Formatting: `total.toFixed(2)`
- ✅ Airtable receives calculated total
- ✅ Code handles edge cases (null, undefined)

---

### Test 2.10: Function & Function Item Nodes
**Prompt:**
```
Create a reusable function that formats customer addresses, then use it to format addresses from HubSpot contacts before sending to Slack.
```

**Expected Nodes:**
- `manual_trigger` (trigger)
- `function` (define formatter)
- `hubspot` (fetch contacts)
- `function_item` (apply function)
- `slack_message` (send formatted)

**Validation:**
- ✅ Function defined with address formatting logic
- ✅ Function item calls function with HubSpot data
- ✅ Output: formatted address string
- ✅ Slack receives formatted addresses

---

### Test 2.11: NoOp Node
**Prompt:**
```
When a webhook is received, log the data, pass it through unchanged, then send to HubSpot.
```

**Expected Nodes:**
- `webhook` (trigger)
- `log_output` (log data)
- `noop` (pass through)
- `hubspot` (create contact)

**Validation:**
- ✅ NoOp doesn't modify data
- ✅ Input equals output
- ✅ HubSpot receives original webhook data
- ✅ Useful for debugging/placeholder

---

## 3. AI & HTTP NODES

### Test 3.1: AI Chat Model
**Prompt:**
```
When a customer sends a message via webhook, use AI to analyze the sentiment, generate a personalized response, and send it back via Telegram.
```

**Expected Nodes:**
- `webhook` (trigger)
- `ai_chat_model` or `openai_gpt` (analyze & respond)
- `telegram` (send response)

**Validation:**
- ✅ AI model receives customer message
- ✅ Prompt includes sentiment analysis instruction
- ✅ Response generated
- ✅ Telegram sends AI response
- ✅ Model configured (GPT-4, Claude, etc.)

---

### Test 3.2: HTTP Request
**Prompt:**
```
Every hour, make an HTTP GET request to check API status, if it returns an error, send an alert to Slack and create a task in ClickUp.
```

**Expected Nodes:**
- `schedule` or `interval` (trigger - hourly)
- `http_request` (GET status)
- `if_else` (check response)
- `slack_message` (alert)
- `clickup` (create task)

**Validation:**
- ✅ HTTP request configured with URL
- ✅ Error handling for failed requests
- ✅ If/Else checks response status
- ✅ Both Slack and ClickUp triggered on error

---

## 4. CRM INTEGRATIONS

### Test 4.1: HubSpot
**Prompt:**
```
When a new contact form is submitted, create a contact in HubSpot, then if the contact's company has more than 50 employees, create a deal with value $5000.
```

**Expected Nodes:**
- `form` (trigger)
- `hubspot` (create contact)
- `if_else` (check company size)
- `hubspot` (create deal)

**Validation:**
- ✅ HubSpot contact created with form data
- ✅ Company size checked: `{{hubspot.companySize}} > 50`
- ✅ Deal created with value 5000
- ✅ Deal associated with contact

---

### Test 4.2: Zoho CRM
**Prompt:**
```
Every morning at 8 AM, fetch all leads from Zoho that were created yesterday, filter for qualified leads, and send a summary email via Outlook.
```

**Expected Nodes:**
- `schedule` (trigger - 8 AM daily)
- `zoho_crm` (fetch leads)
- `filter` (qualified leads)
- `outlook` (send email)

**Validation:**
- ✅ Schedule: `0 8 * * *`
- ✅ Zoho query filters by date
- ✅ Filter condition: `{{lead.status}} === 'qualified'`
- ✅ Outlook email includes filtered leads

---

### Test 4.3: Pipedrive
**Prompt:**
```
When a deal stage changes in Pipedrive via webhook, update the deal notes, calculate the expected close date (30 days from now), and sync to Notion.
```

**Expected Nodes:**
- `webhook` (trigger)
- `pipedrive` (update deal)
- `set_variable` or `date_time` (calculate date)
- `notion` (sync data)

**Validation:**
- ✅ Webhook receives Pipedrive event
- ✅ Deal updated with notes
- ✅ Date calculated: `new Date(Date.now() + 30*24*60*60*1000)`
- ✅ Notion receives deal with close date

---

### Test 4.4: Notion
**Prompt:**
```
When a new row is added to my Notion database, extract the task name and due date, create a corresponding task in ClickUp, and send a confirmation to Slack.
```

**Expected Nodes:**
- `webhook` or `schedule` (trigger)
- `notion` (read database)
- `set_variable` (extract fields)
- `clickup` (create task)
- `slack_message` (confirmation)

**Validation:**
- ✅ Notion database query configured
- ✅ Task name: `{{notion.name}}`
- ✅ Due date: `{{notion.dueDate}}`
- ✅ ClickUp task created with extracted data
- ✅ Slack confirms creation

---

### Test 4.5: Airtable
**Prompt:**
```
When a customer signs up via form, add them to Airtable, wait 1 hour, then if they haven't verified their email, send a reminder via Gmail.
```

**Expected Nodes:**
- `form` (trigger)
- `airtable` (add record)
- `wait` (1 hour)
- `airtable` (check verification status)
- `if_else` (check if verified)
- `google_gmail` (send reminder)

**Validation:**
- ✅ Airtable record created with form data
- ✅ Wait: 3600 seconds
- ✅ Airtable query checks verification field
- ✅ If/Else: `{{airtable.verified}} === false`
- ✅ Gmail sends reminder only if not verified

---

### Test 4.6: ClickUp
**Prompt:**
```
Every Friday at 5 PM, fetch all incomplete tasks from ClickUp, sort them by priority, aggregate by assignee, and send a weekly report to each team member via Slack.
```

**Expected Nodes:**
- `schedule` (trigger - Friday 5 PM)
- `clickup` (fetch tasks)
- `filter` (incomplete tasks)
- `sort` (by priority)
- `aggregate` (by assignee)
- `loop` (iterate assignees)
- `slack_message` (send report)

**Validation:**
- ✅ Schedule: `0 17 * * 5`
- ✅ ClickUp filters: `status !== 'complete'`
- ✅ Sort: priority descending
- ✅ Aggregate groups by `{{task.assignee}}`
- ✅ Loop sends individual reports

---

## 5. COMMUNICATION NODES

### Test 5.1: Gmail
**Prompt:**
```
When I receive an email in Gmail with subject containing "URGENT", forward it to my Slack channel and create a task in ClickUp.
```

**Expected Nodes:**
- `webhook` or `schedule` (trigger)
- `google_gmail` (read emails)
- `filter` (subject contains "URGENT")
- `slack_message` (forward)
- `clickup` (create task)

**Validation:**
- ✅ Gmail query: subject contains "URGENT"
- ✅ Filter condition properly set
- ✅ Slack receives email content
- ✅ ClickUp task includes email details

---

### Test 5.2: Slack
**Prompt:**
```
When a high-value deal is created in HubSpot (over $10,000), send a formatted message to the #sales Slack channel with deal details and create a calendar event in Google Calendar.
```

**Expected Nodes:**
- `webhook` or `schedule` (trigger)
- `hubspot` (fetch deals)
- `filter` (value > $10,000)
- `slack_message` (send to #sales)
- `google_calendar` (create event)

**Validation:**
- ✅ Filter: `{{deal.value}} > 10000`
- ✅ Slack message formatted with deal fields
- ✅ Google Calendar event created
- ✅ Event includes deal details

---

### Test 5.3: Telegram
**Prompt:**
```
When a form is submitted with a support request, use AI to categorize it, then send a notification to the appropriate Telegram channel based on category.
```

**Expected Nodes:**
- `form` (trigger)
- `ai_chat_model` (categorize)
- `switch` (route by category)
- `telegram` (send to channel)

**Validation:**
- ✅ AI categorizes: "technical", "billing", "general"
- ✅ Switch routes by category
- ✅ Telegram sends to correct channel
- ✅ Message includes form data

---

### Test 5.4: Outlook
**Prompt:**
```
Every Monday morning, fetch this week's meetings from Google Calendar, send a summary email via Outlook to the team, and post the same summary to LinkedIn.
```

**Expected Nodes:**
- `schedule` (trigger - Monday morning)
- `google_calendar` (fetch events)
- `filter` (this week)
- `outlook` (send email)
- `linkedin` (post summary)

**Validation:**
- ✅ Schedule: `0 9 * * 1`
- ✅ Google Calendar filters by date range
- ✅ Outlook email formatted
- ✅ LinkedIn post includes meeting summary

---

### Test 5.5: Google Calendar
**Prompt:**
```
When a new contact is added to HubSpot, schedule a follow-up meeting in Google Calendar for 3 days later, and send a calendar invite via Gmail.
```

**Expected Nodes:**
- `webhook` or `schedule` (trigger)
- `hubspot` (get contact)
- `set_variable` or `date_time` (calculate date)
- `google_calendar` (create event)
- `google_gmail` (send invite)

**Validation:**
- ✅ Date calculated: 3 days from now
- ✅ Google Calendar event created
- ✅ Event includes contact details
- ✅ Gmail sends calendar invite

---

## 6. DATA PROCESSING NODES

### Test 6.1: Complex Data Pipeline
**Prompt:**
```
Fetch customer data from HubSpot, aggregate sales by region, sort by total revenue, limit to top 5 regions, format as a report using JavaScript, and send to Slack.
```

**Expected Nodes:**
- `schedule` or `manual_trigger` (trigger)
- `hubspot` (fetch customers)
- `aggregate` (by region)
- `sort` (by revenue)
- `limit` (top 5)
- `javascript` (format report)
- `slack_message` (send)

**Validation:**
- ✅ Aggregate groups by `{{customer.region}}`
- ✅ Sort: revenue descending
- ✅ Limit: 5 items
- ✅ JavaScript formats as markdown/table
- ✅ Slack receives formatted report

---

## 7. COMPLEX MULTI-NODE WORKFLOWS

### Test 7.1: Complete Sales Pipeline
**Prompt:**
```
When a new lead comes in via webhook, create a contact in HubSpot. If the lead score is over 50, create a deal, add a task in ClickUp, send a Slack notification, and schedule a follow-up in Google Calendar. If the score is under 50, just add them to Airtable and send a welcome email via Gmail.
```

**Expected Nodes:**
- `webhook` (trigger)
- `hubspot` (create contact)
- `if_else` (check lead score)
- **True branch:**
  - `hubspot` (create deal)
  - `clickup` (add task)
  - `slack_message` (notification)
  - `google_calendar` (follow-up)
- **False branch:**
  - `airtable` (add record)
  - `google_gmail` (welcome email)

**Validation:**
- ✅ HubSpot contact created first
- ✅ If/Else: `{{hubspot.leadScore}} > 50`
- ✅ True branch: all 4 nodes executed
- ✅ False branch: 2 nodes executed
- ✅ All nodes properly connected

---

### Test 7.2: Multi-Integration Sync
**Prompt:**
```
Every day at 6 PM, fetch all new deals from Pipedrive, sync them to HubSpot, update the corresponding Notion database, send a summary to Slack, and if any deal is over $50,000, also post to LinkedIn and create a task in ClickUp.
```

**Expected Nodes:**
- `schedule` (trigger - 6 PM daily)
- `pipedrive` (fetch deals)
- `hubspot` (sync deals)
- `notion` (update database)
- `merge` (combine results)
- `slack_message` (summary)
- `filter` (deals > $50k)
- `linkedin` (post)
- `clickup` (create task)

**Validation:**
- ✅ Schedule: `0 18 * * *`
- ✅ Pipedrive → HubSpot → Notion flow
- ✅ Merge combines sync results
- ✅ Slack receives summary
- ✅ Filter: `{{deal.value}} > 50000`
- ✅ LinkedIn and ClickUp only for high-value deals

---

### Test 7.3: AI-Powered Workflow
**Prompt:**
```
When a customer sends a message via chat trigger, use AI to analyze the intent, if it's a sales inquiry route to HubSpot and notify Slack, if it's support route to Zoho and create a ClickUp task, otherwise use AI to generate a response and send via Telegram.
```

**Expected Nodes:**
- `chat_trigger` (trigger)
- `ai_chat_model` (analyze intent)
- `switch` (route by intent)
- **Case 1 (sales):**
  - `hubspot` (create lead)
  - `slack_message` (notify)
- **Case 2 (support):**
  - `zoho_crm` (create ticket)
  - `clickup` (create task)
- **Default:**
  - `ai_chat_model` (generate response)
  - `telegram` (send response)

**Validation:**
- ✅ AI analyzes intent first
- ✅ Switch routes by intent type
- ✅ Each case properly configured
- ✅ Default case uses AI for response

---

### Test 7.4: Error Handling & Retry
**Prompt:**
```
When a webhook receives order data, try to create a record in Airtable. If it fails, retry 3 times with a 5-second wait between attempts. If all retries fail, send an error alert to Slack and create a task in ClickUp to investigate.
```

**Expected Nodes:**
- `webhook` (trigger)
- `error_handler` (retry logic)
- `airtable` (create record)
- `if_else` (check success)
- `slack_message` (error alert)
- `clickup` (create task)

**Validation:**
- ✅ Error handler configured: 3 retries, 5-second wait
- ✅ Airtable wrapped in error handler
- ✅ If/Else checks for failure
- ✅ Slack and ClickUp only on final failure

---

## 🧪 TESTING CHECKLIST

For each test prompt, validate:

### Structure Validation
- [ ] Workflow has exactly one trigger node
- [ ] All nodes are connected (no orphans)
- [ ] No circular dependencies
- [ ] Data flows correctly (output → input)

### Node Configuration
- [ ] All required fields are filled (no placeholders)
- [ ] Template expressions use correct syntax: `{{node.field}}`
- [ ] Node types match expected types (no "custom" nodes)
- [ ] Credentials are properly referenced

### Logic Validation
- [ ] If/Else conditions are valid expressions
- [ ] Switch cases cover all scenarios
- [ ] Loops have proper limits
- [ ] Merge waits for all inputs
- [ ] Wait durations are reasonable

### Integration Validation
- [ ] CRM nodes have proper resource/operation selected
- [ ] Communication nodes have recipients configured
- [ ] HTTP requests have valid URLs and methods
- [ ] AI models have proper prompts

### Data Flow Validation
- [ ] Input fields reference previous node outputs
- [ ] Data types are compatible
- [ ] Arrays are handled correctly
- [ ] Objects are properly accessed

---

## 🐛 COMMON BUGS TO WATCH FOR

1. **Missing Nodes**: Prompts mention integrations but nodes aren't generated
2. **Wrong Node Types**: Using "custom" or incorrect node names
3. **Broken Connections**: Nodes not properly wired
4. **Empty Required Fields**: Placeholders like "TODO" or empty strings
5. **Incorrect Template Syntax**: Wrong field references like `{{node.field}}` vs `{{node.output.field}}`
6. **Logic Errors**: If/Else conditions that always true/false
7. **Data Type Mismatches**: Trying to use arrays where objects expected
8. **Missing Error Handling**: No retry logic for API calls
9. **Infinite Loops**: Loops without proper limits
10. **Orphan Nodes**: Nodes not reachable from trigger

---

## 📊 TEST EXECUTION PLAN

1. **Run each test prompt** through the workflow generator
2. **Validate structure** - Check node count, connections, trigger
3. **Validate configuration** - Check all required fields
4. **Validate logic** - Check conditions, loops, merges
5. **Validate integrations** - Check CRM/communication nodes
6. **Test execution** - Run workflow with sample data
7. **Document results** - Record pass/fail and issues found

---

## 🎯 PRIORITY TESTS

Start with these high-priority tests that cover the most common use cases:

1. **Test 1.1** - Webhook → HubSpot (basic integration)
2. **Test 2.1** - If/Else with HubSpot (conditional logic)
3. **Test 4.1** - HubSpot with conditions (CRM + logic)
4. **Test 5.2** - Slack + Google Calendar (communication)
5. **Test 7.1** - Complete sales pipeline (complex workflow)

---

## 📝 NOTES

- All prompts are written from a user's perspective (natural language)
- Each test exercises multiple nodes to catch integration issues
- Edge cases are included (error handling, filtering, sorting)
- Real-world scenarios are prioritized over edge cases
- Validation focuses on executable workflows, not just structure
