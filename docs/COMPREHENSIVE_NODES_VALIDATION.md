# Comprehensive Node Questions Validation

This document validates that the comprehensive question generation system works correctly for all node types.

## System Overview

The comprehensive question generator automatically:
1. **Detects credentials** (API Key, OAuth Access Token, Stored Credential)
2. **Detects resources** (resource, module, object, table, etc.)
3. **Detects operations** (operation, action, method)
4. **Detects required configuration fields**

The system is **generic** and works for ALL nodes by reading their schemas dynamically.

## Node Categories

### ✅ TRIGGER NODES

#### Webhook (`webhook`)
- **Required Fields**: `path`
- **Optional Fields**: `httpMethod`, `responseMode`
- **Credentials**: None
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `path` (configuration, askOrder: 3+)
  - `httpMethod` (configuration, askOrder: 3+)
  - `responseMode` (configuration, askOrder: 3+)

#### Chat Trigger (`chat_trigger`)
- **Required Fields**: None
- **Optional Fields**: `message`
- **Credentials**: None
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `message` (configuration, askOrder: 3+, if required)

#### Form Trigger (`form`)
- **Required Fields**: `formTitle`, `fields`
- **Optional Fields**: `formDescription`, `submitButtonText`, `successMessage`
- **Credentials**: None
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `formTitle` (configuration, askOrder: 3+)
  - `fields` (configuration, askOrder: 3+)

#### Schedule (`schedule`)
- **Required Fields**: `cron`
- **Optional Fields**: `timezone`
- **Credentials**: None
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `cron` (configuration, askOrder: 3+)
  - `timezone` (configuration, askOrder: 3+)

---

### ✅ HTTP/AI NODES

#### HTTP Request (`http_request`)
- **Required Fields**: `url`
- **Optional Fields**: `method`, `headers`, `body`, `qs`
- **Credentials**: None (unless custom auth headers)
- **Resource**: None
- **Operation**: None (uses `method` instead)
- **Expected Questions**: 
  - `url` (configuration, askOrder: 3+)
  - `method` (configuration, askOrder: 3+)
  - `headers` (configuration, askOrder: 3+)
  - `body` (configuration, askOrder: 3+)

#### AI Chat Model (`ai_agent`)
- **Required Fields**: `prompt` or `message`
- **Optional Fields**: `model`, `temperature`, `maxTokens`, `systemPrompt`
- **Credentials**: May require API keys for AI services
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - Credential questions if API key required
  - `prompt`/`message` (configuration, askOrder: 3+)
  - `model` (configuration, askOrder: 3+)

---

### ✅ LOGIC NODES

#### If/Else (`if_else`)
- **Required Fields**: `conditions`
- **Optional Fields**: `combineOperation`
- **Credentials**: None
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `conditions` (configuration, askOrder: 3+)

#### Switch (`switch`)
- **Required Fields**: `routingType`, `rules`
- **Optional Fields**: None
- **Credentials**: None
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `routingType` (configuration, askOrder: 3+)
  - `rules` (configuration, askOrder: 3+)

#### Set Variable (`set_variable`)
- **Required Fields**: `name`
- **Optional Fields**: `value`
- **Credentials**: None
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `name` (configuration, askOrder: 3+)
  - `value` (configuration, askOrder: 3+)

#### Function (`function`)
- **Required Fields**: `description`
- **Optional Fields**: `code`
- **Credentials**: None
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `description` (configuration, askOrder: 3+)
  - `code` (configuration, askOrder: 3+)

#### Merge (`merge`)
- **Required Fields**: `mode`
- **Optional Fields**: `joinBy`
- **Credentials**: None
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `mode` (configuration, askOrder: 3+)

#### Wait (`wait`)
- **Required Fields**: `resumeType`
- **Optional Fields**: `hours`, `minutes`, `seconds`
- **Credentials**: None
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `resumeType` (configuration, askOrder: 3+)
  - `hours`/`minutes`/`seconds` (configuration, askOrder: 3+)

#### Limit (`limit`)
- **Required Fields**: `limit`
- **Optional Fields**: `array`
- **Credentials**: None
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `limit` (configuration, askOrder: 3+)

#### Aggregate (`aggregate`)
- **Required Fields**: `operation`
- **Optional Fields**: `field`
- **Credentials**: None
- **Resource**: None
- **Operation**: `operation` (askOrder: 2)
- **Expected Questions**: 
  - `operation` (operation, askOrder: 2) ✅
  - `field` (configuration, askOrder: 3+)

#### Sort (`sort`)
- **Required Fields**: `array`
- **Optional Fields**: `field`, `order`
- **Credentials**: None
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `array` (configuration, askOrder: 3+)
  - `field` (configuration, askOrder: 3+)
  - `order` (configuration, askOrder: 3+)

#### Code/JavaScript (`javascript`)
- **Required Fields**: `code`
- **Optional Fields**: None
- **Credentials**: None
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `code` (configuration, askOrder: 3+)

#### Function Item (`function_item`)
- **Required Fields**: `description`
- **Optional Fields**: `items`
- **Credentials**: None
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `description` (configuration, askOrder: 3+)

#### NoOp (`noop`)
- **Required Fields**: None
- **Optional Fields**: None
- **Credentials**: None
- **Resource**: None
- **Operation**: None
- **Expected Questions**: None

---

### ✅ CRM/PRODUCTIVITY NODES

#### HubSpot (`hubspot`) ✅ VALIDATED
- **Required Fields**: `resource`, `operation`
- **Optional Fields**: `apiKey`, `accessToken`, `credentialId`, `properties`, `id`
- **Credentials**: `apiKey`, `accessToken`, `credentialId` (askOrder: 0-0.5)
- **Resource**: `resource` (askOrder: 1) ✅
- **Operation**: `operation` (askOrder: 2) ✅
- **Expected Questions**: 
  - `authType` (credential, askOrder: 0) ✅
  - `apiKey`/`accessToken`/`credentialId` (credential, askOrder: 0.5) ✅
  - `resource` (configuration, askOrder: 1) ✅
  - `operation` (operation, askOrder: 2) ✅
  - `properties` (configuration, askOrder: 3+)

#### Zoho CRM (`zoho_crm`)
- **Required Fields**: `resource`, `operation`
- **Optional Fields**: `accessToken`, `refreshToken`, `credentialId`, `module`
- **Credentials**: `accessToken`, `refreshToken`, `credentialId`
- **Resource**: `resource` or `module` (askOrder: 1)
- **Operation**: `operation` (askOrder: 2)
- **Expected Questions**: 
  - `authType` (credential, askOrder: 0)
  - `accessToken`/`credentialId` (credential, askOrder: 0.5)
  - `resource`/`module` (configuration, askOrder: 1)
  - `operation` (operation, askOrder: 2)

#### Pipedrive (`pipedrive`)
- **Required Fields**: `resource`, `operation`
- **Optional Fields**: `apiToken`, `credentialId`, `id`
- **Credentials**: `apiToken`, `credentialId`
- **Resource**: `resource` (askOrder: 1)
- **Operation**: `operation` (askOrder: 2)
- **Expected Questions**: 
  - `authType` (credential, askOrder: 0)
  - `apiToken`/`credentialId` (credential, askOrder: 0.5)
  - `resource` (configuration, askOrder: 1)
  - `operation` (operation, askOrder: 2)

#### Notion (`notion`)
- **Required Fields**: `operation`
- **Optional Fields**: `apiKey`, `accessToken`, `credentialId`, `pageId`
- **Credentials**: `apiKey`, `accessToken`, `credentialId`
- **Resource**: None
- **Operation**: `operation` (askOrder: 2)
- **Expected Questions**: 
  - `authType` (credential, askOrder: 0)
  - `apiKey`/`accessToken`/`credentialId` (credential, askOrder: 0.5)
  - `operation` (operation, askOrder: 2)
  - `pageId` (configuration, askOrder: 3+)

#### Airtable (`airtable`)
- **Required Fields**: `baseId`, `tableId`, `operation`
- **Optional Fields**: `apiKey`, `accessToken`, `credentialId`
- **Credentials**: `apiKey`, `accessToken`, `credentialId`
- **Resource**: `baseId`, `tableId` (askOrder: 1)
- **Operation**: `operation` (askOrder: 2)
- **Expected Questions**: 
  - `authType` (credential, askOrder: 0)
  - `apiKey`/`accessToken`/`credentialId` (credential, askOrder: 0.5)
  - `baseId` (configuration, askOrder: 1)
  - `tableId` (configuration, askOrder: 1)
  - `operation` (operation, askOrder: 2)

#### ClickUp (`clickup`)
- **Required Fields**: `operation`
- **Optional Fields**: `accessToken`, `credentialId`, `listId`, `taskId`
- **Credentials**: `accessToken`, `credentialId`
- **Resource**: None (or `listId`/`taskId`)
- **Operation**: `operation` (askOrder: 2)
- **Expected Questions**: 
  - `authType` (credential, askOrder: 0)
  - `accessToken`/`credentialId` (credential, askOrder: 0.5)
  - `operation` (operation, askOrder: 2)

---

### ✅ COMMUNICATION NODES

#### Gmail (`google_gmail`)
- **Required Fields**: None (OAuth by default)
- **Optional Fields**: `operation`, `to`, `subject`, `body`, `from`
- **Credentials**: OAuth (handled separately, not in config)
- **Resource**: None
- **Operation**: `operation` (askOrder: 2, if present)
- **Expected Questions**: 
  - `operation` (operation, askOrder: 2, if required)
  - `to` (configuration, askOrder: 3+)
  - `subject` (configuration, askOrder: 3+)
  - `body` (configuration, askOrder: 3+)

#### Slack (`slack_message`)
- **Required Fields**: `message`
- **Optional Fields**: `channel`, `webhookUrl`, `username`, `botToken`, `credentialId`
- **Credentials**: `botToken`, `credentialId` (if using bot)
- **Resource**: `channel` (askOrder: 1, if treated as resource)
- **Operation**: None
- **Expected Questions**: 
  - `authType` (credential, askOrder: 0, if botToken/credentialId available)
  - `botToken`/`credentialId` (credential, askOrder: 0.5)
  - `message` (configuration, askOrder: 3+)
  - `channel` (configuration, askOrder: 3+)

#### Telegram (`telegram`)
- **Required Fields**: `chatId`, `messageType`
- **Optional Fields**: `botToken`, `message`, `parseMode`, `credentialId`
- **Credentials**: `botToken`, `credentialId`
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `authType` (credential, askOrder: 0)
  - `botToken`/`credentialId` (credential, askOrder: 0.5)
  - `chatId` (configuration, askOrder: 3+)
  - `messageType` (configuration, askOrder: 3+)
  - `message` (configuration, askOrder: 3+)

#### Outlook (`outlook`)
- **Required Fields**: None (OAuth by default)
- **Optional Fields**: `operation`, `to`, `subject`, `body`, `from`
- **Credentials**: OAuth (handled separately)
- **Resource**: None
- **Operation**: `operation` (askOrder: 2, if present)
- **Expected Questions**: 
  - `operation` (operation, askOrder: 2, if required)
  - `to` (configuration, askOrder: 3+)
  - `subject` (configuration, askOrder: 3+)
  - `body` (configuration, askOrder: 3+)

#### Google Calendar (`google_calendar`)
- **Required Fields**: `operation`
- **Optional Fields**: `calendarId`, `eventId`, OAuth credentials
- **Credentials**: OAuth (handled separately)
- **Resource**: `calendarId` (askOrder: 1)
- **Operation**: `operation` (askOrder: 2)
- **Expected Questions**: 
  - `calendarId` (configuration, askOrder: 1)
  - `operation` (operation, askOrder: 2)

---

### ✅ SOCIAL NODES

#### LinkedIn (`linkedin`)
- **Required Fields**: None
- **Optional Fields**: `text`, `visibility`, `personUrn`, `accessToken`, `credentialId`
- **Credentials**: `accessToken`, `credentialId`
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `authType` (credential, askOrder: 0)
  - `accessToken`/`credentialId` (credential, askOrder: 0.5)
  - `text` (configuration, askOrder: 3+)
  - `visibility` (configuration, askOrder: 3+)

#### GitHub (`github`)
- **Required Fields**: `operation`
- **Optional Fields**: `repo`, `accessToken`, `apiKey`, `credentialId`
- **Credentials**: `accessToken`, `apiKey`, `credentialId`
- **Resource**: `repo` (askOrder: 1)
- **Operation**: `operation` (askOrder: 2)
- **Expected Questions**: 
  - `authType` (credential, askOrder: 0)
  - `accessToken`/`apiKey`/`credentialId` (credential, askOrder: 0.5)
  - `repo` (configuration, askOrder: 1)
  - `operation` (operation, askOrder: 2)

#### WhatsApp Cloud (`whatsapp_cloud`)
- **Required Fields**: `to`, `message`
- **Optional Fields**: `apiKey`, `credentialId`
- **Credentials**: `apiKey`, `credentialId`
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `authType` (credential, askOrder: 0)
  - `apiKey`/`credentialId` (credential, askOrder: 0.5)
  - `to` (configuration, askOrder: 3+)
  - `message` (configuration, askOrder: 3+)

#### Instagram (`instagram`)
- **Required Fields**: `image`, `caption`
- **Optional Fields**: `accessToken`, `credentialId`
- **Credentials**: `accessToken`, `credentialId`
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `authType` (credential, askOrder: 0)
  - `accessToken`/`credentialId` (credential, askOrder: 0.5)
  - `image` (configuration, askOrder: 3+)
  - `caption` (configuration, askOrder: 3+)

#### Facebook (`facebook`)
- **Required Fields**: `message`
- **Optional Fields**: `pageId`, `accessToken`, `credentialId`
- **Credentials**: `accessToken`, `credentialId`
- **Resource**: `pageId` (askOrder: 1)
- **Operation**: None
- **Expected Questions**: 
  - `authType` (credential, askOrder: 0)
  - `accessToken`/`credentialId` (credential, askOrder: 0.5)
  - `pageId` (configuration, askOrder: 1)
  - `message` (configuration, askOrder: 3+)

#### Twitter (`twitter`)
- **Required Fields**: `text`
- **Optional Fields**: `accessToken`, `credentialId`
- **Credentials**: `accessToken`, `credentialId`
- **Resource**: None
- **Operation**: None
- **Expected Questions**: 
  - `authType` (credential, askOrder: 0)
  - `accessToken`/`credentialId` (credential, askOrder: 0.5)
  - `text` (configuration, askOrder: 3+)

#### YouTube (`youtube`)
- **Required Fields**: `operation`
- **Optional Fields**: `videoUrl`, `title`, `description`, `channelId`, OAuth credentials
- **Credentials**: OAuth (handled separately)
- **Resource**: `channelId` (askOrder: 1)
- **Operation**: `operation` (askOrder: 2)
- **Expected Questions**: 
  - `channelId` (configuration, askOrder: 1)
  - `operation` (operation, askOrder: 2)
  - `videoUrl` (configuration, askOrder: 3+)
  - `title` (configuration, askOrder: 3+)
  - `description` (configuration, askOrder: 3+)

---

## Validation Checklist

For each node type, verify:

- [ ] **Credentials are detected** (if node has credential fields)
- [ ] **Resource questions are generated** (if node has resource/module/object fields)
- [ ] **Operation questions are generated** (if node has operation field)
- [ ] **Required configuration fields are asked** (if node has required fields)
- [ ] **Questions are ordered correctly** (credentials → resources → operations → config)
- [ ] **Questions are grouped by node** (all questions for one node before moving to next)
- [ ] **Field names are extracted correctly** in `attach-inputs.ts`
- [ ] **Values are saved to node config** correctly

## Testing

To test each node type:

1. Create a workflow with the node
2. Check backend logs for question generation
3. Verify questions appear in frontend wizard
4. Answer all questions
5. Verify values are saved to node properties
6. Check node config in database/workflow

## Notes

- **OAuth nodes** (Gmail, Outlook, Google Calendar, YouTube) handle credentials separately via OAuth flow, not through the question system
- **Trigger nodes** typically don't need credentials or operations
- **Logic nodes** typically don't need credentials or operations
- **CRM nodes** almost always need: credentials → resource → operation
- **Social nodes** typically need: credentials → content fields
