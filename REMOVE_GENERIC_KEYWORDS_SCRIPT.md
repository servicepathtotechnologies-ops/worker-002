# Generic Keyword Removal Script

## Strategy

Since there are ~191 keyword definitions, I'll systematically remove generic keywords from all nodes by category:

### Communication Nodes (DONE ✅)
- Slack ✅
- Discord ✅
- Gmail ✅
- Telegram ✅
- Teams ✅
- Twilio ✅

### CRM Nodes (DONE ✅)
- HubSpot ✅
- Salesforce ✅
- Zoho CRM ✅

### Database Nodes (IN PROGRESS)
- PostgreSQL ✅
- Supabase ✅
- MySQL (TODO)
- MongoDB (TODO)
- Redis (TODO)

### Data Source Nodes (TODO)
- Google Sheets (already service-specific ✅)
- Airtable (TODO)
- Notion (TODO)

### Transformation Nodes (TODO)
- AI Chat Model (TODO)
- Text Summarizer (TODO)
- Sentiment Analyzer (TODO)

### Social Media Nodes (TODO)
- LinkedIn (TODO)
- Twitter (TODO)
- Instagram (TODO)
- Facebook (TODO)

## Generic Keywords to Remove

**Communication:**
- "send", "message", "notification", "post", "notify", "alert" (when standalone)

**CRM:**
- "create", "update", "search", "get", "delete", "read", "write" (when standalone)

**Database:**
- "query", "insert", "update", "delete", "select" (when standalone)

**Data:**
- "read", "write", "fetch", "get", "retrieve", "load" (when standalone)

**Transformation:**
- "process", "transform", "analyze", "filter", "sort" (when standalone)

## Pattern

Keep ONLY service-specific keywords:
- Service name (e.g., "slack", "discord", "gmail")
- Service + specific term (e.g., "slack channel", "discord bot", "gmail api")
- Service + integration (e.g., "slack integration", "discord api")

Remove generic action words unless they're part of service-specific phrases.
