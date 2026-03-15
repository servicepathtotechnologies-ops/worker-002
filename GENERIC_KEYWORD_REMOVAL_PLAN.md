# Generic Keyword Removal Plan

## Problem
Generic keywords like "send", "message", "create", "update", "read", "write", "get", "fetch", "process", "transform" are causing false matches between different nodes.

## Solution
Remove ALL generic keywords from ALL nodes. Keep ONLY service-specific keywords.

## Generic Keywords to Remove

### Communication Nodes
- ❌ Remove: "send", "message", "notification", "post", "notify", "alert" (when standalone or without service name)
- ✅ Keep: Service name + specific terms (e.g., "slack message", "discord channel", "gmail api")

### CRM Nodes
- ❌ Remove: "create", "update", "search", "get", "delete", "read", "write" (when standalone)
- ✅ Keep: Service name + entity (e.g., "hubspot contact", "salesforce account", "zoho deal")

### Data Source Nodes
- ❌ Remove: "read", "fetch", "get", "retrieve", "load" (when standalone)
- ✅ Keep: Service name + data type (e.g., "google sheets", "airtable base", "mysql database")

### Transformation Nodes
- ❌ Remove: "process", "transform", "analyze", "filter", "sort" (when standalone)
- ✅ Keep: Service name + operation (e.g., "ai chat model", "text summarizer", "sentiment analyzer")

## Implementation Status

### ✅ Completed
- Slack: Removed generic keywords
- Discord: Removed generic keywords  
- Gmail: Removed generic keywords
- Telegram: Removed generic keywords
- Teams: Removed generic keywords
- Twilio: Removed generic keywords
- HubSpot: Removed generic keywords
- Salesforce: Removed generic keywords
- Zoho CRM: Removed generic keywords

### 🔄 In Progress
- Need to scan ALL remaining nodes and remove generic keywords

## Pattern to Follow

**BEFORE (with generic keywords):**
```typescript
keywords: [
  'slack', 'slack message', 'send slack', 'slack channel',
  'slack notification', 'post slack', 'slack post', 'notify slack',
  'slack send', 'message slack', 'slack alert'
]
```

**AFTER (service-specific only):**
```typescript
keywords: [
  'slack', 'slack message', 'slack channel', 'slack workspace',
  'slack webhook', 'slack bot', 'slack api', 'slack integration'
]
```

## Next Steps
1. Scan all remaining nodes for generic keywords
2. Remove generic keywords systematically
3. Verify no overlapping generic keywords remain
4. Test keyword detection accuracy
