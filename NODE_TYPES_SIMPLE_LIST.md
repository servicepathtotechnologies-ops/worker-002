# Node Type IDs - Simple List with Schemas

## Storage
- **Structure**: `Map<string, NodeSchema>`
- **Location**: `worker/src/services/nodes/node-library.ts`
- **Property**: `private schemas: Map<string, NodeSchema> = new Map()`
- **Key**: The `type` field (string) from each NodeSchema
- **Access**: `nodeLibrary.getSchema(nodeType)` or `nodeLibrary.getAllSchemas()`

## All Node Type Names with Schemas (111 nodes)

### Triggers (8)
- `schedule` - Schema: required: `['cron']`, optional: `timezone`
- `webhook` - Schema: required: `['path']`, optional: `method`, `responseMode`, `authentication`
- `manual_trigger` - Schema: required: `[]`, optional: `inputData`
- `interval` - Schema: required: `['interval', 'unit']`, optional: `timezone`
- `chat_trigger` - Schema: required: `[]`, optional: `systemPrompt`, `messages`, `model`
- `form` - Schema: required: `['formTitle', 'fields']`, optional: `description`, `submitButtonText`, `redirectUrl`, `notifications`
- `error_trigger` - Schema: required: `[]`, optional: `{}`
- `workflow_trigger` - Schema: required: `[]`, optional: `{}`

### HTTP & API (5)
- `http_request` - Schema: required: `['url']`, optional: `method`, `headers`, `body`, `qs`, `timeout`, `followRedirect`, `maxRedirects`
- `respond_to_webhook` - Schema: required: `[]`, optional: `responseCode`, `responseBody`, `responseHeaders`
- `http_post` - Schema: required: `['url', 'body']`, optional: `headers`
- `webhook_response` - Schema: required: `['responseCode']`, optional: `body`
- `graphql` - Schema: required: `['url', 'query']`, optional: `variables`

### Database (7)
- `database_write` - Schema: required: `['query']`, optional: `connectionString`, `parameters`
- `database_read` - Schema: required: `['query']`, optional: `connectionString`, `parameters`
- `supabase` - Schema: required: `['table', 'operation']`, optional: `supabaseUrl`, `supabaseKey`, `data`, `filter`
- `mysql` - Schema: required: `['query']`, optional: `parameters`
- `mongodb` - Schema: required: `['operation', 'collection']`, optional: `query`
- `redis` - Schema: required: `['operation', 'key']`, optional: `value`
- `postgresql` - Schema: required: `['query']`, optional: `parameters` (alias for database_write)

### Google Services (9)
- `google_sheets` - Schema: required: `['spreadsheetId', 'operation']`, optional: `range`, `sheetName`, `values`, `valueInputOption`
- `google_doc` - Schema: required: `['documentId', 'operation']`, optional: `content`, `title`, `format`
- `google_gmail` - Schema: required: `[]`, optional: `to`, `subject`, `body`, `from`, `attachments`, `threadId`, `labelIds`, `maxResults`
- `gmail` - Schema: required: `['to', 'subject', 'message']`, optional: `credentialId`, `from`, `cc`, `bcc`, `attachments`, `html`
- `google_drive` - Schema: required: `['operation']`, optional: `fileId`, `fileName`
- `google_calendar` - Schema: required: `['resource', 'operation']`, optional: `credentialId`, `calendarId`, `eventId`, `summary`, `start`, `end`, `eventData`
- `google_contacts` - Schema: required: `['operation']`, optional: `contactId`
- `google_tasks` - Schema: required: `['operation']`, optional: `taskId`
- `google_big_query` - Schema: required: `['query']`, optional: `projectId`

### Transformation & Data (16)
- `set_variable` - Schema: required: `['name']`, optional: `value`, `assignments`, `keepOnlySet`
- `javascript` - Schema: required: `['code']`, optional: `jsCode`
- `function` - Schema: required: `['description']`, optional: `name`, `parameters`, `timeout`
- `function_item` - Schema: required: `['description']`, optional: `name`, `parameters`
- `date_time` - Schema: required: `['operation']`, optional: `value`, `format`
- `text_formatter` - Schema: required: `['template']`, optional: `options`, `values`
- `json_parser` - Schema: required: `['json']`, optional: `options`
- `merge_data` - Schema: required: `['mode']`, optional: `mergeByFields`, `overwrite`
- `edit_fields` - Schema: required: `[]`, optional: `fields`
- `set` - Schema: required: `['fields']`, optional: `{}`
- `csv` - Schema: required: `['operation']`, optional: `csv`, `data`
- `html` - Schema: required: `['html']`, optional: `options`
- `xml` - Schema: required: `['xml']`, optional: `options`
- `rename_keys` - Schema: required: `['mappings']`, optional: `{}`
- `aggregate` - Schema: required: `['operation']`, optional: `field`
- `sort` - Schema: required: `[]`, optional: `field`, `direction`, `type`
- `limit` - Schema: required: `['limit']`, optional: `array`

### Logic & Flow (8)
- `if_else` - Schema: required: `['conditions']`, optional: `combineOperation`, `trueValue`
- `switch` - Schema: required: `['routingType', 'rules']`, optional: `value`
- `merge` - Schema: required: `['mode']`, optional: `mergeByFields`, `overwrite`
- `filter` - Schema: required: `['condition']`, optional: `{}`
- `loop` - Schema: required: `['items']`, optional: `{}`
- `noop` - Schema: required: `[]`, optional: `{}`
- `split_in_batches` - Schema: required: `['batchSize']`, optional: `{}`
- `stop_and_error` - Schema: required: `['errorMessage']`, optional: `{}`

### Error Handling (2)
- `error_handler` - Schema: required: `[]`, optional: `continueOnFail`, `retryOnFail`, `maxRetries`, `retryDelay`
- `wait` - Schema: required: `['duration']`, optional: `unit`

### AI Nodes (12)
- `ai_agent` - Schema: required: `['userInput', 'chat_model']`, optional: `systemPrompt`, `tools`, `memory`
- `ai_chat_model` - Schema: required: `['prompt']`, optional: `model`, `temperature`, `maxTokens`, `systemPrompt`, `messages`
- `ai_service` - Schema: required: `['prompt', 'maxTokens']`, optional: `inputData`, `serviceType`, `provider`, `model`, `temperature`, `topP`
- `openai_gpt` - Schema: required: `['model', 'messages', 'apiKey']`, optional: `{}`
- `anthropic_claude` - Schema: required: `['model', 'messages', 'apiKey']`, optional: `{}`
- `google_gemini` - Schema: required: `['model', 'prompt', 'apiKey']`, optional: `{}`
- `ollama` - Schema: required: `['model', 'prompt']`, optional: `{}`
- `text_summarizer` - Schema: required: `['text']`, optional: `maxLength`
- `sentiment_analyzer` - Schema: required: `['text']`, optional: `{}`
- `chat_model` - Schema: required: `['model']`, optional: `provider`, `temperature`
- `memory` - Schema: required: `[]`, optional: `context`
- `tool` - Schema: required: `['toolName']`, optional: `{}`

### Output & Communication (11)
- `slack_message` - Schema: required: `['webhookUrl']`, optional: `channel`, `text`, `username`, `iconEmoji`, `iconUrl`, `attachments`
- `email` - Schema: required: `['to', 'subject', 'text']`, optional: `from`, `cc`, `bcc`, `html`
- `log_output` - Schema: required: `[]`, optional: `message`, `level`
- `telegram` - Schema: required: `['chatId', 'messageType']`, optional: `message`, `parseMode`, `disableWebPagePreview`, `replyToMessageId`, `replyMarkup`, `caption`, `photo`, `document`, `disableNotification`, `protectContent`
- `outlook` - Schema: required: `[]`, optional: `to`, `subject`, `body`, `from`, `cc`, `bcc`, `attachments`, `importance`, `sensitivity`
- `discord` - Schema: required: `['channelId', 'message']`, optional: `{}`
- `slack_webhook` - Schema: required: `['webhookUrl', 'message']`, optional: `{}`
- `discord_webhook` - Schema: required: `['webhookUrl', 'message']`, optional: `{}`
- `microsoft_teams` - Schema: required: `['webhookUrl', 'message']`, optional: `{}`
- `whatsapp_cloud` - Schema: required: `['resource', 'operation', 'phoneNumberId', 'to']`, optional: `text`, `message`, `mediaUrl`, `apiKey`, `credentialId`
- `twilio` - Schema: required: `['to', 'message']`, optional: `from`

### Social Media (5)
- `linkedin` - Schema: required: `[]`, optional: `accessToken`, `text`, `visibility`, `mediaCategory`, `description`, `title`, `originalUrl`, `thumbnailUrl`, `credentialId`
- `twitter` - Schema: required: `['resource', 'operation']`, optional: `text`, `tweetId`, `userId`, `mediaIds`
- `instagram` - Schema: required: `['resource', 'operation']`, optional: `caption`, `imageUrl`, `mediaId`
- `youtube` - Schema: required: `['operation']`, optional: `videoId`, `title`, `description`, `privacy`, `tags`, `categoryId`
- `facebook` - Schema: required: `['message']`, optional: `pageId`, `accessToken`, `credentialId`

### CRM & Business (11)
- `salesforce` - Schema: required: `['resource', 'operation']`, optional: `objectType`, `recordId`, `fields`, `query`, `filters`, `orderBy`, `limit`, `soql`, `data`, `externalIdField`, `externalId`
- `clickup` - Schema: required: `['operation']`, optional: `listId`, `taskId`, `name`, `description`, `status`, `assignees`, `dueDate`, `priority`
- `hubspot` - Schema: required: `['resource', 'operation']`, optional: `objectType`, `objectId`, `properties`, `filters`, `limit`, `after`
- `airtable` - Schema: required: `['baseId', 'tableId', 'operation']`, optional: `recordId`, `fields`, `filterByFormula`, `maxRecords`
- `notion` - Schema: required: `['resource', 'operation']`, optional: `databaseId`, `pageId`, `properties`, `filter`, `sorts`, `startCursor`, `pageSize`
- `zoho_crm` - Schema: required: `['resource', 'operation']`, optional: `module`, `recordId`, `data`, `criteria`, `fields`
- `pipedrive` - Schema: required: `['resource', 'operation']`, optional: `dealId`, `personId`, `organizationId`, `data`, `filters`
- `freshdesk` - Schema: required: `['resource', 'operation']`, optional: `{}`
- `intercom` - Schema: required: `['operation']`, optional: `conversationId`
- `mailchimp` - Schema: required: `['operation']`, optional: `listId`, `email`
- `activecampaign` - Schema: required: `['operation']`, optional: `contactId`

### File Storage (7)
- `read_binary_file` - Schema: required: `['filePath']`, optional: `{}`
- `write_binary_file` - Schema: required: `['filePath', 'data']`, optional: `{}`
- `aws_s3` - Schema: required: `['operation', 'bucket']`, optional: `key`
- `dropbox` - Schema: required: `['operation']`, optional: `path`
- `onedrive` - Schema: required: `['operation']`, optional: `path`
- `ftp` - Schema: required: `['operation', 'host']`, optional: `path`
- `sftp` - Schema: required: `['operation', 'host']`, optional: `path`

### DevOps (5)
- `github` - Schema: required: `['operation']`, optional: `owner`, `repo`, `title`, `body`, `issueNumber`, `comment`, `labels`, `ref`, `branchName`, `workflowId`, `accessToken`, `apiKey`, `credentialId`
- `gitlab` - Schema: required: `['operation']`, optional: `repo`
- `bitbucket` - Schema: required: `['operation']`, optional: `repo`
- `jira` - Schema: required: `['operation']`, optional: `issueKey`
- `jenkins` - Schema: required: `['operation']`, optional: `jobName`

### E-commerce (4)
- `shopify` - Schema: required: `['resource', 'operation']`, optional: `{}`
- `woocommerce` - Schema: required: `['resource', 'operation']`, optional: `{}`
- `stripe` - Schema: required: `['operation']`, optional: `amount`
- `paypal` - Schema: required: `['operation']`, optional: `amount`

## Schema Structure
Each node stored as `NodeSchema` with:
- `type`: string (the node ID)
- `label`: string
- `category`: string
- `description`: string
- `configSchema`: { required: string[], optional: Record<string, ConfigField> }
- `aiSelectionCriteria`: object
- `commonPatterns`: array
- `validationRules`: array
- `outputType`: string (optional)
- `outputSchema`: object (optional)

## Notes
- **Required fields**: Must be provided for the node to function
- **Optional fields**: Can be omitted, may have defaults
- **Schema format**: `required: ['field1', 'field2']`, `optional: { field1: {...}, field2: {...} }`
- **Field types**: `string`, `number`, `boolean`, `object`, `array`, `expression`
- **Templates**: Many fields support template expressions like `{{$json.field}}` or `{{$credentials.apiKey}}`
