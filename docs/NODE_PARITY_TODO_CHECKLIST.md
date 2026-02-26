# Node parity TODO checklist (HubSpot/LinkedIn-level behavior)

This checklist verifies that **each node**:

- **Asks** all required questions (credentials → resource → operation → config)
- Uses **field names that exist in the backend schema** (`node.data.config`)
- **Persists answers** into node properties via `attach-inputs`

## Core rule (must be true for every node)

- The wizard question `field` **must exist** in the node schema (`worker/src/services/nodes/node-library.ts`)
- The question `id` must be a **comprehensive id** (`cred_…`, `resource_…`, `op_…`, `config_…`) so `attach-inputs` can map it.

## Nodes (status)

### Trigger nodes
- **WEBHOOK**: schema + question-order aligned (`path`, `httpMethod`, `responseMode`, optional `verifySignature`, `secretToken`)
- **Chat trigger**: schema includes `channel`, `allowedSenders`, `message`
- **Form trigger**: schema + question-order aligned (`formTitle`, `formDescription`, `fields`)
- **Schedule**: schema + question-order aligned (`cron`, `timezone`)

### HTTP / AI nodes
- **Http request**: question-order added (`url`, `method`, `headers`, `qs`, `body`, `timeout`)
- **Ai chat model**: schema added + executor added (`provider`, `model`, `temperature`, `prompt`, `systemPrompt`, `responseFormat`)
- **Chat model (for ai_agent)**: question-order aligned to actual config (`provider`, `model`, `temperature`)

### Logic nodes
- **If**: question-order aligned to schema (`conditions`, `combineOperation`)
- **Switch**: question-order aligned to schema (`routingType`, `rules`)
- **Set**: schema added (type `set`, field `fields`)
- **Set variable**: question-order aligned (`name`, `value`, `keepSource`)
- **Function**: question-order aligned to executor (`timeout` not `timeoutMs`)
- **Merge**: question-order aligned (`mode`)
- **Wait**: schema + question-order aligned to executor (`duration`, `unit`)
- **Limit**: question-order aligned (`limit`)
- **Aggregate**: question-order aligned (`operation`, `field`)
- **Sort**: schema + question-order aligned to executor (`field`, `direction`, `type`)
- **Code / JavaScript**: question-order aligned (`code`)
- **Function item**: already aligned (`description`, `code`)
- **NoOp**: ok

### CRM / Productivity nodes
- **HubSpot**: added schema alias `objectId`, question-order aligned (`id`, `searchQuery`)
- **Zoho**: executor supports `zoho_crm` alias; schema includes `criteria`; question-order uses `resource`
- **Pipe drive**: question-order resource values aligned to schema
- **Notion**: schema now requires `resource` + `operation`, question-order aligned (`content`, `filter`)
- **Airtable**: question-order aligned (`tableId`, `operation: read/create/update/delete`)
- **Click up**: already aligned (operation + ids)

### Communication nodes
- **Gmail**: schema includes `credentialId` so wizard persists selection
- **Slack**: question-order aligned to actual executor (asks `webhookUrl`, supports `blocks`)
- **Telegram**: question-order aligned to schema (`messageType`, `message`, `mediaUrl`, `caption`), schema includes `credentialId`
- **Outlook**: already aligned
- **Google Calendar**: schema expanded + question-order aligned (asks `resource`, `operation`, event fields)
- **WhatsApp**: executor supports `whatsapp_cloud` alias; schema + question-order aligned (`resource`, `operation`, `phoneNumberId`, `to`, `text/mediaUrl`)

### Social / DevOps nodes
- **LinkedIn**: schema includes `operation` + `mediaUrl` (fixed)
- **Git hub**: schema expanded (owner/repo/title/etc); question-order operation values aligned to dispatcher (`create_issue`, `add_issue_comment`, etc.)
- **Instagram**: schema updated to resource/operation model (`media_url`, `caption`)
- **Facebook**: question-order operation values aligned (`create_post`, `get_profile`)
- **Twitter**: schema updated to resource/operation model; question-order aligned to supported ops (`create`, `delete`, `searchRecent`)
- **YouTube**: schema exists; (executor not present in `execute-workflow.ts` yet)

## Primary files that must stay in sync

- `worker/src/services/nodes/node-library.ts` (**schema field truth**)
- `worker/src/services/ai/node-question-order.ts` (**question field truth**)
- `worker/src/services/ai/comprehensive-node-questions-generator.ts` (**question generation**)
- `worker/src/api/attach-inputs.ts` (**persistence into node properties**)
- `worker/src/api/execute-workflow.ts` (**runtime expectations**)

