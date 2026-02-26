# Quick Test Start Guide

## 🚀 Start Testing Immediately

### Option 1: Run All Tests
```bash
cd worker
npx ts-node scripts/test-workflow-generation.ts
```

### Option 2: Run High Priority Tests Only
```bash
npx ts-node scripts/test-workflow-generation.ts --priority=high
```

### Option 3: Test Specific Category
```bash
# Test triggers
npx ts-node scripts/test-workflow-generation.ts --category=triggers

# Test logic nodes
npx ts-node scripts/test-workflow-generation.ts --category=logic

# Test CRM integrations
npx ts-node scripts/test-workflow-generation.ts --category=crm

# Test communication nodes
npx ts-node scripts/test-workflow-generation.ts --category=communication
```

## 📋 Test Prompts by Node Type

### Triggers
1. **Webhook**: "When I receive a POST request to my webhook endpoint, extract the customer email and name from the request body, then create a new contact in HubSpot."
2. **Chat Trigger**: "When a user sends a chat message asking about product pricing, use AI to generate a response and send it back via Slack."
3. **Form**: "When someone submits my contact form with their name, email, and message, save the data to Airtable and send a confirmation email via Gmail."
4. **Schedule**: "Every Monday at 9 AM, fetch new leads from Pipedrive, filter for high-value opportunities, and send a summary report to my Slack channel."
5. **HTTP Request**: "Make an HTTP GET request to fetch user data from an API, then process the response and update a Notion database."

### Logic Nodes
1. **If/Else**: "When a new lead comes in via webhook, check if their company size is over 100 employees. If yes, create a deal in HubSpot. If no, just add them as a contact."
2. **Switch**: "When a form is submitted, check the inquiry type. If it's 'sales', route to HubSpot. If it's 'support', route to Zoho. If it's 'partnership', route to Pipedrive. Otherwise, send to Slack."
3. **Set Variable**: "Extract the customer's full name from a webhook, split it into first and last name, then create a contact in HubSpot with those fields."
4. **Merge**: "Fetch customer data from HubSpot and their order history from an HTTP API, merge both datasets, then send a complete report to Slack."
5. **Wait**: "When a new deal is created in HubSpot, wait 24 hours, then check if the deal status changed. If not, send a reminder to Slack."
6. **Limit**: "Fetch the latest 10 contacts from HubSpot, process each one, and send summaries to Slack."
7. **Aggregate**: "Fetch all deals from Pipedrive, group them by stage, calculate total value per stage, and send a summary report to Gmail."
8. **Sort**: "Get all contacts from Zoho, sort them by last contact date (newest first), take the top 5, and add them to a ClickUp task list."
9. **JavaScript/Code**: "When a webhook receives order data, use JavaScript to calculate the total price including tax (8.5%), format it as currency, then save to Airtable."
10. **NoOp**: "When a webhook is received, log the data, pass it through unchanged, then send to HubSpot."

### AI & HTTP
1. **AI Chat Model**: "When a customer sends a message via webhook, use AI to analyze the sentiment, generate a personalized response, and send it back via Telegram."
2. **HTTP Request**: "Every hour, make an HTTP GET request to check API status, if it returns an error, send an alert to Slack and create a task in ClickUp."

### CRM Integrations
1. **HubSpot**: "When a new contact form is submitted, create a contact in HubSpot, then if the contact's company has more than 50 employees, create a deal with value $5000."
2. **Zoho**: "Every morning at 8 AM, fetch all leads from Zoho that were created yesterday, filter for qualified leads, and send a summary email via Outlook."
3. **Pipedrive**: "When a deal stage changes in Pipedrive via webhook, update the deal notes, calculate the expected close date (30 days from now), and sync to Notion."
4. **Notion**: "When a new row is added to my Notion database, extract the task name and due date, create a corresponding task in ClickUp, and send a confirmation to Slack."
5. **Airtable**: "When a customer signs up via form, add them to Airtable, wait 1 hour, then if they haven't verified their email, send a reminder via Gmail."
6. **ClickUp**: "Every Friday at 5 PM, fetch all incomplete tasks from ClickUp, sort them by priority, aggregate by assignee, and send a weekly report to each team member via Slack."

### Communication Nodes
1. **Gmail**: "When I receive an email in Gmail with subject containing 'URGENT', forward it to my Slack channel and create a task in ClickUp."
2. **Slack**: "When a high-value deal is created in HubSpot (over $10,000), send a formatted message to the #sales Slack channel with deal details and create a calendar event in Google Calendar."
3. **Telegram**: "When a form is submitted with a support request, use AI to categorize it, then send a notification to the appropriate Telegram channel based on category."
4. **Outlook**: "Every Monday morning, fetch this week's meetings from Google Calendar, send a summary email via Outlook to the team, and post the same summary to LinkedIn."
5. **Google Calendar**: "When a new contact is added to HubSpot, schedule a follow-up meeting in Google Calendar for 3 days later, and send a calendar invite via Gmail."

### Complex Workflows
1. **Sales Pipeline**: "When a new lead comes in via webhook, create a contact in HubSpot. If the lead score is over 50, create a deal, add a task in ClickUp, send a Slack notification, and schedule a follow-up in Google Calendar. If the score is under 50, just add them to Airtable and send a welcome email via Gmail."
2. **Multi-Integration Sync**: "Every day at 6 PM, fetch all new deals from Pipedrive, sync them to HubSpot, update the corresponding Notion database, send a summary to Slack, and if any deal is over $50,000, also post to LinkedIn and create a task in ClickUp."
3. **AI-Powered Routing**: "When a customer sends a message via chat trigger, use AI to analyze the intent, if it's a sales inquiry route to HubSpot and notify Slack, if it's support route to Zoho and create a ClickUp task, otherwise use AI to generate a response and send via Telegram."

## ✅ What to Validate

For each generated workflow, check:

1. **Structure**
   - [ ] Has exactly one trigger node
   - [ ] All nodes are connected
   - [ ] No orphan nodes
   - [ ] Proper data flow

2. **Nodes**
   - [ ] Expected nodes are generated
   - [ ] No "custom" node types
   - [ ] Correct node count

3. **Configuration**
   - [ ] All required fields filled
   - [ ] Template expressions correct: `{{node.field}}`
   - [ ] Credentials referenced properly

4. **Logic**
   - [ ] If/Else conditions valid
   - [ ] Switch cases complete
   - [ ] Loops have limits
   - [ ] Merge waits for inputs

## 🐛 Common Issues to Watch

1. **Missing Nodes** - Expected node not generated
2. **Wrong Node Types** - Using "custom" instead of specific types
3. **Broken Connections** - Nodes not properly wired
4. **Empty Fields** - Required fields have placeholders
5. **Template Errors** - Wrong field references

## 📊 Expected Results

- **Total Tests**: 31
- **Categories**: 6 (Triggers, Logic, AI/HTTP, CRM, Communication, Complex)
- **Node Coverage**: All listed nodes tested

## 🎯 Priority Testing Order

1. Start with **high priority** tests (most common use cases)
2. Test **triggers** first (foundation)
3. Test **logic nodes** (core functionality)
4. Test **integrations** (CRM, communication)
5. Test **complex workflows** (real-world scenarios)

## 💡 Tips

- Run tests one category at a time
- Save results for comparison
- Fix issues incrementally
- Test with sample data after generation
- Document any bugs found
