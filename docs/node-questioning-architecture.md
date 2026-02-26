# Node Questioning Architecture - User-Friendly Order Guide

## Overview

This document defines the **optimal questioning order** for all workflow nodes to ensure a natural, user-friendly experience. Questions are ordered from most general to most specific, following the pattern:

1. **Credential** (if needed)
2. **Operation** (what action to perform)
3. **Core identifiers** (what resource to act on)
4. **Essential data** (required fields for the operation)
5. **Optional enhancements** (nice-to-have fields)

---

## Questioning Order Principles

### 1. **Credential First** (if external service)
- Ask immediately: "Which [Service] connection should we use?"
- User selects from their saved credentials
- If none exist, prompt to connect

### 2. **Operation Second** (what to do)
- Always ask: "What should we do with [Service]?"
- Provides context for all subsequent questions
- Options: Create, Read, Update, Delete, Search, etc.

### 3. **Target Resource** (what to act on)
- Ask: "Which [resource type] should we work with?"
- Examples: Which contact? Which sheet? Which channel?

### 4. **Essential Data** (required for operation)
- Ask only fields needed for the selected operation
- Skip fields not relevant to current operation

### 5. **Optional Fields** (enhancements)
- Ask last, with clear indication they're optional
- Examples: Formatting, filters, additional metadata

---

## TRIGGER NODES

### 1. Webhook (`webhook`)

**Question Flow:**
```
Q1: What URL path should this webhook listen on?
    → Example: /hubspot-contact-created
    → Field: path
    → Type: string
    → Required: Yes

Q2: Which HTTP methods should we accept?
    → Options: GET, POST, PUT, DELETE, PATCH
    → Field: method
    → Type: select (multi)
    → Required: Yes
    → Default: POST

Q3: Should we verify webhook signatures?
    → Field: verifySignature
    → Type: boolean
    → Required: No
    → Default: false

Q4: (If Q3 = Yes) What is the secret token?
    → Field: secretToken
    → Type: string
    → Required: Conditional
```

**User-Friendly Order:** Path → Method → Security (optional)

---

### 2. Chat Trigger (`chat_trigger`)

**Question Flow:**
```
Q1: Which chat channel or context should trigger this workflow?
    → Field: channel
    → Type: string
    → Required: No
    → Example: #support, @username, general

Q2: Should we filter by specific senders?
    → Field: allowedSenders
    → Type: array
    → Required: No
    → Example: ["user1", "user2"]
```

**User-Friendly Order:** Channel → Filters (optional)

---

### 3. Form Trigger (`form`)

**Question Flow:**
```
Q1: What is the name of this form?
    → Field: name
    → Type: string
    → Required: Yes
    → Example: "Contact Form", "Lead Capture"

Q2: (Optional) Add a description for users
    → Field: description
    → Type: string
    → Required: No

Q3: Define the form fields (JSON schema)
    → Field: schema
    → Type: json
    → Required: Yes
    → Example: {
        "fields": [
          {"name": "email", "type": "email", "required": true},
          {"name": "name", "type": "string", "required": true}
        ]
      }
```

**User-Friendly Order:** Name → Description (optional) → Fields

---

### 4. Schedule (`schedule`)

**Question Flow:**
```
Q1: How often should this workflow run?
    → Field: cron
    → Type: string
    → Required: Yes
    → Examples:
        - "0 9 * * *" (Daily at 9 AM)
        - "0 */6 * * *" (Every 6 hours)
        - "0 0 * * 1" (Every Monday)
    → Helper: Provide cron expression builder UI

Q2: What timezone should we use?
    → Field: timezone
    → Type: select
    → Required: Yes
    → Default: UTC
    → Options: UTC, America/New_York, Europe/London, etc.
```

**User-Friendly Order:** Frequency → Timezone

---

### 5. HTTP Request (`http_request`)

**Note:** This is typically an action node, not a trigger. If used as trigger, treat as webhook.

---

## AI NODES

### 6. AI Chat Model (`ai_chat_model` / `chat_model`)

**Question Flow:**
```
Q1: (If multiple providers) Which AI provider?
    → Field: provider
    → Type: select
    → Required: Conditional
    → Options: Ollama, OpenAI, Anthropic, Google

Q2: Which model should we use?
    → Field: model
    → Type: select
    → Required: No
    → Default: qwen2.5:14b-instruct-q4_K_M
    → Options: qwen2.5:14b-instruct-q4_K_M, qwen2.5:7b-instruct-q4_K_M, qwen2.5-coder:7b-instruct-q4_K_M, gpt-4, claude-3, etc.

Q3: What instruction should we give the AI?
    → Field: prompt
    → Type: string
    → Required: Yes
    → Example: "Summarize the contact notes", "Analyze customer sentiment"

Q4: (Optional) System prompt for context
    → Field: systemPrompt
    → Type: string
    → Required: No
    → Example: "You are a helpful assistant that analyzes customer data"

Q5: (Optional) Response format
    → Field: responseFormat
    → Type: select
    → Required: No
    → Options: text, json, markdown
    → Default: text

Q6: (Optional) Temperature (creativity)
    → Field: temperature
    → Type: number
    → Required: No
    → Default: 0.7
    → Range: 0.0 - 2.0
```

**User-Friendly Order:** Model → Prompt → System Context (optional) → Format (optional) → Advanced (optional)

---

## LOGIC NODES

### 7. If (`if_else`)

**Question Flow:**
```
Q1: What condition should we check?
    → Field: condition
    → Type: string
    → Required: Yes
    → Examples:
        - "contact.lifecycleStage == 'customer'"
        - "{{$json.amount}} > 1000"
        - "email contains '@company.com'"
    → Helper: Expression builder with autocomplete

Q2: (Optional) Description of this condition
    → Field: description
    → Type: string
    → Required: No
    → Example: "Check if contact is a customer"
```

**User-Friendly Order:** Condition → Description (optional)

---

### 8. Switch (`switch`)

**Question Flow:**
```
Q1: Which field should we branch on?
    → Field: field
    → Type: string
    → Required: Yes
    → Example: "contact.source", "deal.stage"

Q2: Define the cases (JSON)
    → Field: cases
    → Type: json
    → Required: Yes
    → Example: {
        "cases": [
          {"value": "website", "label": "From Website"},
          {"value": "referral", "label": "From Referral"},
          {"value": "default", "label": "Other"}
        ]
      }
```

**User-Friendly Order:** Field → Cases

---

### 9. Set (`set` / `set_variable`)

**Question Flow:**
```
Q1: Which fields should we set or override?
    → Field: fields
    → Type: json
    → Required: Yes
    → Example: {
        "status": "new",
        "priority": "high",
        "assignedTo": "{{$json.email}}"
      }
    → Helper: Key-value pair builder
```

**User-Friendly Order:** Fields (single question, multi-field builder)

---

### 10. Function (`function`)

**Question Flow:**
```
Q1: Briefly describe what this function should do
    → Field: description
    → Type: string
    → Required: Yes
    → Example: "Transform contact data into CRM format"

Q2: (Optional) Provide custom code
    → Field: code
    → Type: code
    → Required: No
    → Language: JavaScript/TypeScript
    → Note: If not provided, AI will generate based on description

Q3: (Optional) Timeout in milliseconds
    → Field: timeoutMs
    → Type: number
    → Required: No
    → Default: 30000
```

**User-Friendly Order:** Description → Code (optional) → Timeout (optional)

---

### 11. Merge (`merge`)

**Question Flow:**
```
Q1: How should we merge multiple inputs?
    → Field: strategy
    → Type: select
    → Required: No
    → Options:
        - "concatenate" (for arrays)
        - "firstNonEmpty" (pick first non-empty)
        - "overwrite" (left-to-right object merge)
        - "waitForAll" (wait for all inputs)
    → Default: waitForAll
```

**User-Friendly Order:** Strategy (single question)

---

### 12. Wait (`wait`)

**Question Flow:**
```
Q1: How long should we wait?
    → Field: duration
    → Type: string
    → Required: Yes
    → Examples: "5m", "2h", "1d", "30s"
    → Helper: Natural language parser

Q2: (Alternative) Wait until specific time?
    → Field: until
    → Type: datetime
    → Required: Conditional (if not using duration)
    → Example: "2026-02-16T09:00:00Z"
```

**User-Friendly Order:** Duration → Until (alternative)

---

### 13. Limit (`limit`)

**Question Flow:**
```
Q1: What is the maximum number of items to process?
    → Field: count
    → Type: number
    → Required: Yes
    → Example: 10, 100, 1000
```

**User-Friendly Order:** Count (single question)

---

### 14. Aggregate (`aggregate`)

**Question Flow:**
```
Q1: What operation should we perform?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: sum, avg, min, max, count, groupBy

Q2: Which field should we aggregate on?
    → Field: field
    → Type: string
    → Required: Conditional (not needed for count)
    → Example: "amount", "quantity"

Q3: (If operation = groupBy) Group by which field?
    → Field: groupBy
    → Type: string
    → Required: Conditional
```

**User-Friendly Order:** Operation → Field → Group By (conditional)

---

### 15. Sort (`sort`)

**Question Flow:**
```
Q1: Which field should we sort by?
    → Field: field
    → Type: string
    → Required: Yes
    → Example: "createdAt", "amount", "name"

Q2: Sort direction?
    → Field: direction
    → Type: select
    → Required: No
    → Options: asc, desc
    → Default: asc
```

**User-Friendly Order:** Field → Direction

---

### 16. Code (`code` / `javascript`)

**Question Flow:**
```
Q1: What language?
    → Field: language
    → Type: select
    → Required: No
    → Options: javascript, typescript
    → Default: javascript

Q2: Provide your code snippet
    → Field: snippet
    → Type: code
    → Required: Yes
    → Example: "return items.filter(i => i.active);"
```

**User-Friendly Order:** Language → Code

---

### 17. Function Item (`function_item`)

**Question Flow:**
```
Q1: What should this function do for each item?
    → Field: description
    → Type: string
    → Required: Yes
    → Example: "Add 'processed' flag to each contact"

Q2: (Optional) Custom code for per-item processing
    → Field: code
    → Type: code
    → Required: No
```

**User-Friendly Order:** Description → Code (optional)

---

### 18. NoOp (`noop`)

**Question Flow:**
```
No questions needed - passthrough node
```

---

## CRM NODES

### 19. HubSpot (`hubspot`)

**Question Flow:**
```
Q1: [CREDENTIAL] Which HubSpot connection should we use?
    → Field: credentialId
    → Type: credential-select
    → Required: Yes

Q2: Which HubSpot object are we working with?
    → Field: resource
    → Type: select
    → Required: Yes
    → Options: contact, company, deal, ticket

Q3: What should we do in HubSpot?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: get, getMany, create, update, delete, search

Q4: (If operation = get/update/delete) What is the object ID?
    → Field: objectId
    → Type: string
    → Required: Conditional
    → Example: "12345"

Q5: (If operation = search) What is the search query?
    → Field: searchQuery
    → Type: json
    → Required: Conditional
    → Example: {"property": "email", "operator": "EQ", "value": "test@example.com"}

Q6: (If operation = create/update) What properties should we set?
    → Field: properties
    → Type: json
    → Required: Conditional
    → Example: {"email": "{{$json.email}}", "firstname": "{{$json.name}}"}
```

**User-Friendly Order:** Credential → Resource → Operation → ID/Query/Properties (conditional)

---

### 20. Zoho CRM (`zoho_crm`)

**Question Flow:**
```
Q1: [CREDENTIAL] Which Zoho connection should we use?
    → Field: credentialId
    → Required: Yes

Q2: Which Zoho module are we working with?
    → Field: module
    → Type: string
    → Required: Yes
    → Example: "Leads", "Contacts", "Deals"

Q3: What operation should we perform?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: get, getMany, create, update, delete, search

Q4: (If operation = get/update/delete) Record ID?
    → Field: recordId
    → Type: string
    → Required: Conditional

Q5: (If operation = search) Search criteria?
    → Field: criteria
    → Type: json
    → Required: Conditional

Q6: (If operation = create/update) Record data?
    → Field: data
    → Type: json
    → Required: Conditional
```

**User-Friendly Order:** Credential → Module → Operation → ID/Criteria/Data (conditional)

---

### 21. Pipedrive (`pipedrive`)

**Question Flow:**
```
Q1: [CREDENTIAL] Which Pipedrive connection should we use?
    → Field: credentialId
    → Required: Yes

Q2: Which Pipedrive object are we working with?
    → Field: resource
    → Type: select
    → Required: Yes
    → Options: deal, person, organization

Q3: What operation should we perform?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: get, create, update, delete, search

Q4: (If operation = get/update/delete) Object ID?
    → Field: id
    → Type: string
    → Required: Conditional

Q5: (If operation = create/update) Object data?
    → Field: data
    → Type: json
    → Required: Conditional
```

**User-Friendly Order:** Credential → Resource → Operation → ID/Data (conditional)

---

### 22. Notion (`notion`)

**Question Flow:**
```
Q1: [CREDENTIAL] Which Notion connection should we use?
    → Field: credentialId
    → Required: Yes

Q2: Are we working with a page or database?
    → Field: targetType
    → Type: select
    → Required: Yes
    → Options: page, database

Q3: What operation should we perform?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: getPage, createPage, updatePage, queryDatabase

Q4: (If targetType = page) Page ID?
    → Field: pageId
    → Type: string
    → Required: Conditional

Q5: (If targetType = database) Database ID?
    → Field: databaseId
    → Type: string
    → Required: Conditional

Q6: (If operation = createPage/updatePage) Page properties?
    → Field: properties
    → Type: json
    → Required: Conditional

Q7: (If operation = queryDatabase) Filter criteria?
    → Field: filter
    → Type: json
    → Required: Conditional
```

**User-Friendly Order:** Credential → Target Type → Operation → ID → Properties/Filter (conditional)

---

### 23. Airtable (`airtable`)

**Question Flow:**
```
Q1: [CREDENTIAL] Which Airtable connection should we use?
    → Field: credentialId
    → Required: Yes

Q2: Which Airtable base ID should we use?
    → Field: baseId
    → Type: string
    → Required: Yes
    → Example: "appXXXXXXXXXXXXXX"

Q3: Which table name in that base?
    → Field: table
    → Type: string
    → Required: Yes
    → Example: "Contacts", "Tasks"

Q4: What operation should we perform?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: get, list, create, update, delete

Q5: (If operation = get/update/delete) Record ID?
    → Field: recordId
    → Type: string
    → Required: Conditional

Q6: (If operation = create/update) Record fields?
    → Field: fields
    → Type: json
    → Required: Conditional
    → Example: {"Name": "{{$json.name}}", "Email": "{{$json.email}}"}
```

**User-Friendly Order:** Credential → Base → Table → Operation → ID/Fields (conditional)

---

### 24. ClickUp (`clickup`)

**Question Flow:**
```
Q1: [CREDENTIAL] Which ClickUp connection should we use?
    → Field: credentialId
    → Required: Yes

Q2: Which ClickUp list or space should tasks be created in?
    → Field: listId
    → Type: string
    → Required: Yes
    → Example: "123456789"

Q3: What operation should we perform?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: createTask, updateTask, getTask, listTasks

Q4: (If operation = getTask/updateTask) Task ID?
    → Field: taskId
    → Type: string
    → Required: Conditional

Q5: (If operation = createTask/updateTask) Task data?
    → Field: taskData
    → Type: json
    → Required: Conditional
    → Example: {"name": "{{$json.title}}", "description": "{{$json.description}}"}
```

**User-Friendly Order:** Credential → List → Operation → Task ID/Data (conditional)

---

## COMMUNICATION NODES

### 25. Gmail (`google_gmail`)

**Question Flow:**
```
Q1: [CREDENTIAL] Which Gmail account should we use?
    → Field: credentialId
    → Required: Yes

Q2: What should we do with Gmail?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: send, list, get, search
    → Default: send

Q3: (If operation = send) Who should we send to?
    → Field: to
    → Type: email
    → Required: Conditional
    → Example: "recipient@example.com"

Q4: (If operation = send) What is the subject?
    → Field: subject
    → Type: string
    → Required: Conditional
    → Example: "Welcome to our platform"

Q5: (If operation = send) What is the email body?
    → Field: body
    → Type: string
    → Required: Conditional
    → Example: "Hi {{$json.name}}, welcome aboard!"

Q6: (If operation = get) Message ID?
    → Field: messageId
    → Type: string
    → Required: Conditional

Q7: (If operation = list/search) Search query?
    → Field: query
    → Type: string
    → Required: Conditional
    → Example: "is:unread", "from:example@gmail.com"

Q8: (If operation = list/search) Maximum results?
    → Field: maxResults
    → Type: number
    → Required: No
    → Default: 10
```

**User-Friendly Order:** Credential → Operation → To/Subject/Body (for send) OR Query (for list/search) OR Message ID (for get)

---

### 26. Slack (`slack_message`)

**Question Flow:**
```
Q1: [CREDENTIAL] Which Slack workspace should we use?
    → Field: credentialId
    → Required: Yes

Q2: What should we do?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: send
    → Default: send

Q3: Which Slack channel should we post to?
    → Field: channel
    → Type: string
    → Required: Yes
    → Example: "#general", "#sales", "@username"

Q4: What message should we send?
    → Field: message
    → Type: string
    → Required: Yes
    → Example: "New lead: {{$json.email}}"
    → Note: Also accepts "text" as alias

Q5: (Optional) Bot username
    → Field: username
    → Type: string
    → Required: No

Q6: (Optional) Icon emoji
    → Field: iconEmoji
    → Type: string
    → Required: No
    → Example: ":robot_face:"
```

**User-Friendly Order:** Credential → Operation → Channel → Message → Username/Icon (optional)

---

### 27. Telegram (`telegram`)

**Question Flow:**
```
Q1: [CREDENTIAL] Which Telegram bot should we use?
    → Field: credentialId
    → Required: Yes
    → Note: Bot token stored as credential

Q2: What should we do?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: sendMessage
    → Default: sendMessage

Q3: What is the Telegram chat ID or @username?
    → Field: chatId
    → Type: string
    → Required: Yes
    → Example: "123456789", "@username"

Q4: What message should we send?
    → Field: text
    → Type: string
    → Required: Yes
    → Example: "Hello! New order received: {{$json.orderId}}"
```

**User-Friendly Order:** Credential → Operation → Chat ID → Message

---

### 28. Outlook (`outlook`)

**Question Flow:**
```
Q1: [CREDENTIAL] Which Outlook account should we use?
    → Field: credentialId
    → Required: Yes

Q2: What should we do?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: send
    → Default: send

Q3: Who should we send to?
    → Field: to
    → Type: email
    → Required: Yes
    → Example: "recipient@example.com"

Q4: What is the subject?
    → Field: subject
    → Type: string
    → Required: Yes

Q5: What is the email body?
    → Field: body
    → Type: string
    → Required: Yes
```

**User-Friendly Order:** Credential → Operation → To → Subject → Body

---

### 29. Google Calendar (`google_calendar`)

**Question Flow:**
```
Q1: [CREDENTIAL] Which Google Calendar should we use?
    → Field: credentialId
    → Required: Yes

Q2: What should we do?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: createEvent, updateEvent, getEvent, listEvents
    → Default: createEvent

Q3: Which calendar ID?
    → Field: calendarId
    → Type: string
    → Required: Yes
    → Example: "primary", "calendar@group.calendar.google.com"

Q4: (If operation = updateEvent/getEvent) Event ID?
    → Field: eventId
    → Type: string
    → Required: Conditional

Q5: (If operation = createEvent/updateEvent) Event title?
    → Field: summary
    → Type: string
    → Required: Conditional
    → Example: "Team Meeting"

Q6: (If operation = createEvent/updateEvent) When does it start?
    → Field: start
    → Type: datetime
    → Required: Conditional
    → Example: "2026-02-16T09:00:00Z"

Q7: (If operation = createEvent/updateEvent) When does it end?
    → Field: end
    → Type: datetime
    → Required: Conditional
    → Example: "2026-02-16T10:00:00Z"

Q8: (Optional) Event description
    → Field: description
    → Type: string
    → Required: No

Q9: (If operation = listEvents) Time range start?
    → Field: timeMin
    → Type: datetime
    → Required: Conditional

Q10: (If operation = listEvents) Time range end?
    → Field: timeMax
    → Type: datetime
    → Required: Conditional
```

**User-Friendly Order:** Credential → Operation → Calendar → Event ID (conditional) → Title/Start/End (conditional) → Description (optional)

---

## SOCIAL / DEV NODES

### 30. LinkedIn (`linkedin`)

**Question Flow:**
```
Q1: [CREDENTIAL] Which LinkedIn account should we use?
    → Field: credentialId
    → Required: Yes

Q2: What should we do?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: createPost, previewPost
    → Default: createPost

Q3: What content should we post?
    → Field: text
    → Type: string
    → Required: Conditional (required if no media)
    → Example: "Excited to announce our new feature!"

Q4: (Optional) Post visibility
    → Field: visibility
    → Type: select
    → Required: No
    → Options: PUBLIC, CONNECTIONS
    → Default: PUBLIC

Q5: (Optional) Person URN (if posting as specific person)
    → Field: personUrn
    → Type: string
    → Required: No
    → Note: Usually auto-detected from credential

Q6: (Optional) Media (images/videos)
    → Field: media
    → Type: object
    → Required: No
    → Note: If provided, text becomes optional

Q7: (Optional) Dry run (test without posting)
    → Field: dryRun
    → Type: boolean
    → Required: No
    → Default: false
```

**User-Friendly Order:** Credential → Operation → Content → Visibility → Person URN (optional) → Media (optional) → Dry Run (optional)

---

### 31. GitHub (`github`)

**Question Flow:**
```
Q1: [CREDENTIAL] Which GitHub account should we use?
    → Field: credentialId
    → Required: Yes

Q2: What should we do?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: createIssue, commentIssue, createPR, triggerWorkflow
    → Default: createIssue

Q3: Which repository? (owner/repo)
    → Field: repository
    → Type: string
    → Required: Yes
    → Example: "owner/repo-name"

Q4: (If operation = commentIssue/getIssue) Issue number?
    → Field: issueNumber
    → Type: number
    → Required: Conditional

Q5: (If operation = createIssue/createPR) Title?
    → Field: title
    → Type: string
    → Required: Conditional
    → Example: "Bug: Login not working"

Q6: (If operation = createIssue/createPR/commentIssue) Body/comment?
    → Field: body
    → Type: string
    → Required: Conditional
    → Example: "Description of the issue..."

Q7: (If operation = createPR) Base branch?
    → Field: baseBranch
    → Type: string
    → Required: Conditional
    → Default: "main"

Q8: (If operation = createPR) Head branch?
    → Field: headBranch
    → Type: string
    → Required: Conditional
```

**User-Friendly Order:** Credential → Operation → Repository → Issue Number (conditional) → Title/Body (conditional) → Branch (for PR)

---

### 32. WhatsApp (`whatsapp_cloud`)

**Question Flow:**
```
Q1: [CREDENTIAL] Which WhatsApp Business account should we use?
    → Field: credentialId
    → Required: Yes

Q2: What should we do?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: sendMessage
    → Default: sendMessage

Q3: What is the recipient phone number?
    → Field: to
    → Type: string
    → Required: Yes
    → Example: "+1234567890"
    → Format: E.164 format

Q4: What message should we send?
    → Field: message
    → Type: string
    → Required: Yes
    → Example: "Hello! Your order {{$json.orderId}} is ready."

Q5: (Optional) Message type
    → Field: messageType
    → Type: select
    → Required: No
    → Options: text, template
    → Default: text
```

**User-Friendly Order:** Credential → Operation → Phone Number → Message → Type (optional)

---

### 33. Instagram (`instagram`)

**Question Flow:**
```
Q1: [CREDENTIAL] Which Instagram account should we use?
    → Field: credentialId
    → Required: Yes

Q2: What should we do?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: createPost, createStory
    → Default: createPost

Q3: Image URL or base64
    → Field: image
    → Type: string
    → Required: Yes
    → Example: "https://example.com/image.jpg"

Q4: Caption for the post
    → Field: caption
    → Type: string
    → Required: Yes
    → Example: "Check out our new product! #newproduct"

Q5: (Optional) Location
    → Field: location
    → Type: string
    → Required: No
```

**User-Friendly Order:** Credential → Operation → Image → Caption → Location (optional)

---

### 34. Facebook (`facebook`)

**Question Flow:**
```
Q1: [CREDENTIAL] Which Facebook page should we use?
    → Field: credentialId
    → Required: Yes

Q2: What should we do?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: createPost
    → Default: createPost

Q3: What content should we post?
    → Field: message
    → Type: string
    → Required: Yes
    → Example: "Exciting news! Check out our latest update."

Q4: (Optional) Image URL
    → Field: imageUrl
    → Type: string
    → Required: No

Q5: (Optional) Link
    → Field: link
    → Type: string
    → Required: No
```

**User-Friendly Order:** Credential → Operation → Message → Image/Link (optional)

---

### 35. Twitter (`twitter`)

**Question Flow:**
```
Q1: [CREDENTIAL] Which Twitter/X account should we use?
    → Field: credentialId
    → Required: Yes

Q2: What should we do?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: createTweet
    → Default: createTweet

Q3: What should we tweet? (max 280 characters)
    → Field: text
    → Type: string
    → Required: Yes
    → Example: "Excited to share our latest feature! 🚀"
    → Validation: Max 280 characters

Q4: (Optional) Reply to tweet ID
    → Field: replyTo
    → Type: string
    → Required: No

Q5: (Optional) Media URLs
    → Field: mediaUrls
    → Type: array
    → Required: No
```

**User-Friendly Order:** Credential → Operation → Tweet Text → Reply To (optional) → Media (optional)

---

### 36. YouTube (`youtube`)

**Question Flow:**
```
Q1: [CREDENTIAL] Which YouTube channel should we use?
    → Field: credentialId
    → Required: Yes

Q2: What should we do?
    → Field: operation
    → Type: select
    → Required: Yes
    → Options: uploadVideo, createPlaylist, addToPlaylist
    → Default: uploadVideo

Q3: (If operation = uploadVideo) Video file URL or path?
    → Field: videoUrl
    → Type: string
    → Required: Conditional

Q4: (If operation = uploadVideo/createPlaylist) Title?
    → Field: title
    → Type: string
    → Required: Conditional
    → Example: "How to Use Our Platform"

Q5: (If operation = uploadVideo/createPlaylist) Description?
    → Field: description
    → Type: string
    → Required: Conditional

Q6: (If operation = addToPlaylist) Playlist ID?
    → Field: playlistId
    → Type: string
    → Required: Conditional

Q7: (If operation = addToPlaylist) Video ID?
    → Field: videoId
    → Type: string
    → Required: Conditional
```

**User-Friendly Order:** Credential → Operation → Video/Playlist Details → Title/Description → IDs (conditional)

---

## Implementation Guidelines

### Question Grouping

Group related questions together:
- **Credential questions** → Always first (if needed)
- **Operation questions** → Always second
- **Core identifiers** → Third (what resource to act on)
- **Essential data** → Fourth (required for operation)
- **Optional enhancements** → Last

### Conditional Questions

Use clear conditional logic:
- Show questions only when relevant
- Use "If [condition], then..." language
- Hide irrelevant fields automatically

### User Experience Tips

1. **Progressive Disclosure**: Show only what's needed at each step
2. **Smart Defaults**: Pre-fill common values
3. **Examples**: Provide examples for every field
4. **Validation**: Validate as user types
5. **Help Text**: Explain what each field does
6. **Skip Logic**: Skip optional fields by default, allow "Add more" option

### Question Flow Visualization

```
[Start]
  |
  v
[Credential?] --> Yes --> [Select Credential]
  |                        |
  No                       v
  |                    [Operation?]
  |                        |
  v                        v
[Operation?] <------------+
  |
  v
[Core Identifier?]
  |
  v
[Essential Data?]
  |
  v
[Optional Fields?] --> [Done]
```

---

## Summary Table

| Node Type | Credential | Operation | Core ID | Essential Data | Optional |
|-----------|-----------|-----------|---------|----------------|----------|
| Webhook | No | No | path | method | verifySignature |
| Chat Trigger | No | No | channel | - | allowedSenders |
| Form | No | No | name | schema | description |
| Schedule | No | No | cron | timezone | - |
| AI Chat Model | Conditional | No | model | prompt | systemPrompt, format |
| If | No | No | condition | - | description |
| Switch | No | No | field | cases | - |
| Set | No | No | - | fields | - |
| Function | No | No | - | description | code |
| Merge | No | No | - | strategy | - |
| Wait | No | No | duration | - | until |
| Limit | No | No | - | count | - |
| Aggregate | No | No | operation | field | groupBy |
| Sort | No | No | field | direction | - |
| Code | No | No | language | snippet | - |
| Function Item | No | No | - | description | code |
| NoOp | No | No | - | - | - |
| HubSpot | Yes | Yes | resource | objectId/properties | - |
| Zoho CRM | Yes | Yes | module | recordId/data | - |
| Pipedrive | Yes | Yes | resource | id/data | - |
| Notion | Yes | Yes | targetType | pageId/databaseId | properties |
| Airtable | Yes | Yes | baseId, table | recordId/fields | - |
| ClickUp | Yes | Yes | listId | taskId/taskData | - |
| Gmail | Yes | Yes | - | to/subject/body | maxResults |
| Slack | Yes | Yes | channel | message | username, icon |
| Telegram | Yes | Yes | chatId | text | - |
| Outlook | Yes | Yes | to | subject, body | - |
| Google Calendar | Yes | Yes | calendarId | eventId/summary/start/end | description |
| LinkedIn | Yes | Yes | - | text | visibility, media |
| GitHub | Yes | Yes | repository | issueNumber/title/body | branches |
| WhatsApp | Yes | Yes | to | message | messageType |
| Instagram | Yes | Yes | image | caption | location |
| Facebook | Yes | Yes | - | message | imageUrl, link |
| Twitter | Yes | Yes | - | text | replyTo, media |
| YouTube | Yes | Yes | - | videoUrl/title/description | playlistId |

---

## Next Steps

1. **Implement Question Engine**: Build a question resolver that follows this order
2. **Create UI Components**: Build form components for each question type
3. **Add Validation**: Implement field-level and cross-field validation
4. **Build Helpers**: Create autocomplete, expression builders, and examples
5. **Test Flow**: Test each node type end-to-end

---

*Last Updated: 2026-02-16*
*Version: 1.0*
