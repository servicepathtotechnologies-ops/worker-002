# Question Format Updates for All Nodes

## ✅ Updates Applied

### 1. **Enhanced Provider Name Mapping**

Added comprehensive provider name mapping for ALL node types:

**Triggers:**
- `webhook` → "Webhook"
- `chat_trigger` → "Chat"
- `form` → "Form"
- `schedule` → "Schedule"
- `manual_trigger` → "Manual"
- `interval` → "Interval"

**HTTP/AI:**
- `http_request` → "HTTP Request"
- `ai_agent` → "AI Agent"
- `ai_chat_model` → "AI Chat Model"

**Logic:**
- `if_else` → "If/Else"
- `switch` → "Switch"
- `set_variable` → "Set Variable"
- `function` → "Function"
- `merge` → "Merge"
- `wait` → "Wait"
- `limit` → "Limit"
- `aggregate` → "Aggregate"
- `sort` → "Sort"
- `javascript` → "JavaScript"
- `code` → "Code"
- `function_item` → "Function Item"
- `noop` → "NoOp"

**CRM/Productivity:**
- `hubspot` → "HubSpot"
- `zoho_crm` → "Zoho CRM"
- `pipedrive` → "Pipedrive"
- `notion` → "Notion"
- `airtable` → "Airtable"
- `clickup` → "ClickUp"

**Communication:**
- `google_gmail` → "Gmail"
- `slack_message` → "Slack"
- `telegram` → "Telegram"
- `outlook` → "Outlook"
- `google_calendar` → "Google Calendar"

**Social:**
- `linkedin` → "LinkedIn"
- `github` → "GitHub"
- `whatsapp_cloud` → "WhatsApp"
- `instagram` → "Instagram"
- `facebook` → "Facebook"
- `twitter` → "Twitter"
- `youtube` → "YouTube"

### 2. **Enhanced Credential Question Text**

Credential questions now use provider names:
- ✅ `"What is your HubSpot API Key for "HubSpot"?"`
- ✅ `"What is your Slack OAuth Access Token for "Slack"?"`
- ✅ `"Which Zoho CRM connection should we use for "Zoho CRM"?"`

### 3. **Enhanced Resource Question Text**

Resource questions adapt based on field type:

**For ID Fields** (baseId, tableId, spreadsheetId, etc.):
- ✅ `"What is the Airtable baseId for "Airtable"?"` (text input)
- ✅ `"What is the Google Sheets spreadsheetId for "Google Sheets"?"` (text input)

**For Resource Type Fields** (resource, module, object):
- ✅ `"Which HubSpot resource are we working with?"` (select dropdown)
- ✅ `"Which Zoho CRM module are we working with?"` (select dropdown)

### 4. **Enhanced Operation Question Text**

Operation questions are context-aware:

**CRM Nodes:**
- ✅ `"What HubSpot operation should "HubSpot" perform?"`
- ✅ `"What Zoho CRM operation should "Zoho CRM" perform?"`

**HTTP Nodes:**
- ✅ `"What HTTP method should "HTTP Request" use?"`

**Google/Productivity Nodes:**
- ✅ `"What Google Sheets operation should "Google Sheets" perform?"`
- ✅ `"What Airtable operation should "Airtable" perform?"`

**Social Nodes:**
- ✅ `"What action should "LinkedIn" perform?"`
- ✅ `"What action should "Twitter" perform?"`

**Generic:**
- ✅ `"What operation should "Node Label" perform?"` (fallback)

### 5. **Enhanced Configuration Question Text**

Configuration questions are field-specific:

**Common Fields:**
- ✅ `path` → `"What is the path for "Webhook"?"`
- ✅ `url` → `"What is the url for "HTTP Request"?"`
- ✅ `cron` → `"What is the schedule (cron expression) for "Schedule"?"`
- ✅ `formTitle` → `"What is the form title for "Form"?"`
- ✅ `fields` → `"What fields should "Form" have?"`

**Communication Fields:**
- ✅ `message` → `"What message should "Slack" send?"`
- ✅ `text` → `"What text should "Telegram" send?"`
- ✅ `body` → `"What body should "Email" send?"`
- ✅ `to` → `"What is the recipient email for "Email"?"`
- ✅ `subject` → `"What is the email subject for "Email"?"`
- ✅ `channel` → `"What is the Slack channel for "Slack"?"`
- ✅ `chatId` → `"What is the Telegram chat ID for "Telegram"?"`

**Logic Fields:**
- ✅ `conditions` → `"What conditions should "If/Else" check?"`
- ✅ `code` → `"What code should "JavaScript" execute?"`
- ✅ `javascript` → `"What code should "JavaScript" execute?"`

**ID Fields:**
- ✅ `baseId` → `"What is the baseId for "Airtable"?"`
- ✅ `tableId` → `"What is the tableId for "Airtable"?"`
- ✅ `spreadsheetId` → `"What is the spreadsheetId for "Google Sheets"?"`
- ✅ `documentId` → `"What is the documentId for "Google Docs"?"`
- ✅ `calendarId` → `"What is the calendarId for "Google Calendar"?"`

**Data Fields:**
- ✅ `properties` → `"What properties should "HubSpot" use?"`
- ✅ `data` → `"What data should "Node" use?"`

**Generic Fallback:**
- ✅ `"Please provide {fieldName} for "{nodeLabel}""`

### 6. **Question Type Detection**

Questions automatically determine the correct input type:

**Select Dropdowns:**
- Resource types (contact, company, deal)
- Operations (get, create, update, delete)
- Credential type selection

**Text Inputs:**
- ID fields (baseId, tableId, spreadsheetId)
- API keys, tokens
- URLs, paths
- Email addresses

**Textarea:**
- Message, text, body, content fields
- Code, javascript fields
- Long text fields

**JSON:**
- Properties, data fields
- JSON configuration fields

## Question Format Structure

All questions follow this consistent format:

```typescript
{
  id: "{prefix}_{nodeId}_{fieldName}",  // e.g., "cred_node123_apiKey"
  text: "Context-aware question text",   // Enhanced with provider names
  type: "select" | "text" | "textarea" | "json" | "credential",
  nodeId: "node123",
  nodeType: "hubspot",
  nodeLabel: "HubSpot",
  fieldName: "apiKey",
  category: "credential" | "operation" | "configuration",
  required: true,
  options: [...],  // For select dropdowns
  askOrder: 0-3,   // Order: credentials → resources → operations → config
  description: "Helpful description",
  placeholder: "Enter value..."
}
```

## Examples by Node Type

### Webhook Node
```
Question 1: "What is the path for "Webhook"?" (text, askOrder: 3)
Question 2: "What is the httpMethod for "Webhook"?" (select, askOrder: 3)
```

### Form Trigger Node
```
Question 1: "What is the form title for "Form"?" (text, askOrder: 3)
Question 2: "What fields should "Form" have?" (json/textarea, askOrder: 3)
```

### Schedule Node
```
Question 1: "What is the schedule (cron expression) for "Schedule"?" (text, askOrder: 3)
Question 2: "What is the timezone for "Schedule"?" (text, askOrder: 3)
```

### HTTP Request Node
```
Question 1: "What is the url for "HTTP Request"?" (text, askOrder: 3)
Question 2: "What HTTP method should "HTTP Request" use?" (select, askOrder: 2)
Question 3: "What headers should "HTTP Request" use?" (json, askOrder: 3)
Question 4: "What body should "HTTP Request" send?" (textarea, askOrder: 3)
```

### Slack Node
```
Question 1: "Which authentication method should we use for "Slack"?" (select, askOrder: 0)
Question 2: "What is your Slack Bot Token for "Slack"?" (text, askOrder: 0.5)
Question 3: "What is the Slack channel for "Slack"?" (text, askOrder: 3)
Question 4: "What message should "Slack" send?" (textarea, askOrder: 3)
```

### Telegram Node
```
Question 1: "Which authentication method should we use for "Telegram"?" (select, askOrder: 0)
Question 2: "What is your Telegram Bot Token for "Telegram"?" (text, askOrder: 0.5)
Question 3: "What is the Telegram chat ID for "Telegram"?" (text, askOrder: 3)
Question 4: "What messageType should "Telegram" use?" (select, askOrder: 3)
Question 5: "What message should "Telegram" send?" (textarea, askOrder: 3)
```

### Airtable Node
```
Question 1: "Which authentication method should we use for "Airtable"?" (select, askOrder: 0)
Question 2: "What is your Airtable API Key for "Airtable"?" (text, askOrder: 0.5)
Question 3: "What is the Airtable baseId for "Airtable"?" (text, askOrder: 1)
Question 4: "What is the Airtable tableId for "Airtable"?" (text, askOrder: 1)
Question 5: "What Airtable operation should "Airtable" perform?" (select, askOrder: 2)
```

## Summary

✅ **All node types** now have:
- Proper provider name mapping
- Context-aware question text
- Appropriate input types (select/text/textarea/json)
- Correct question ordering (credentials → resources → operations → config)
- Field-specific placeholders and descriptions

The question format is now **consistent, user-friendly, and context-aware** for all node types!
