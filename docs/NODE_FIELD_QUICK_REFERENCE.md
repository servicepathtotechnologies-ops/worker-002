# Node Output Field Quick Reference

## 🚀 Quick Lookup Guide for Developers

This is a quick reference guide for the most commonly used node output fields. For complete documentation, see `NODE_FIELD_MAPPING_AUDIT.md`.

---

## ⚡ Critical Triggers (Most Important)

| Node Type | Primary Output Field | Template Expression |
|-----------|---------------------|---------------------|
| `manual_trigger` | `inputData` | `{{$json.inputData}}` |
| `workflow_trigger` | `inputData` | `{{$json.inputData}}` |
| `chat_trigger` | `message` | `{{$json.message}}` |
| `webhook` | `body` | `{{$json.body}}` |
| `form` | `formData` | `{{$json.formData}}` |
| `schedule` | `output` | `{{$json.output}}` |
| `interval` | `output` | `{{$json.output}}` |
| `error_trigger` | `error` | `{{$json.error}}` |

**⚠️ Common Mistakes:**
- ❌ `{{$json.output}}` for `manual_trigger` → ✅ Use `{{$json.inputData}}`
- ❌ `{{$json.output}}` for `chat_trigger` → ✅ Use `{{$json.message}}`
- ❌ `{{$json.data}}` for `manual_trigger` → ✅ Use `{{$json.inputData}}`

---

## 🤖 AI Nodes

| Node Type | Primary Output Field | Additional Fields |
|-----------|---------------------|-------------------|
| `ai_agent` | `response_text` | `response_json`, `response_markdown`, `confidence_score` |
| `openai_gpt` | `text` | `response`, `content`, `message` |
| `anthropic_claude` | `text` | `response`, `content`, `message` |
| `google_gemini` | `text` | `response`, `content`, `message` |
| `ollama` | `text` | `response`, `content`, `message` |
| `text_summarizer` | `text` | `summary` |
| `sentiment_analyzer` | `sentiment` | `score`, `emotions` |

**Template Examples:**
- `{{$json.response_text}}` - AI Agent response
- `{{$json.text}}` - GPT/Claude/Gemini response
- `{{$json.sentiment}}` - Sentiment analysis result

---

## 📡 HTTP & API Nodes

| Node Type | Primary Output Field | Additional Fields |
|-----------|---------------------|-------------------|
| `http_request` | `body` | `status`, `headers`, `response`, `responseTime` |
| `http_post` | `body` | `status`, `headers`, `response`, `responseTime` |
| `graphql` | `data` | `errors`, `response` |

**Template Examples:**
- `{{$json.body}}` - HTTP response body
- `{{$json.status}}` - HTTP status code
- `{{$json.headers}}` - HTTP headers

---

## 📊 Data Source Nodes

| Node Type | Primary Output Field | Additional Fields |
|-----------|---------------------|-------------------|
| `google_sheets` | `rows` | `row_data`, `sheet_data`, `data` |
| `database_read` | `rows` | `data`, `result` |
| `database_write` | `result` | `affectedRows`, `insertId`, `rowsAffected` |
| `supabase` | `data` | `error`, `rows` |

**Template Examples:**
- `{{$json.rows}}` - Array of rows from sheets/database
- `{{$json.result}}` - Database write result
- `{{$json.data}}` - Generic data field

---

## 💬 Communication/Output Nodes

| Node Type | Primary Output Field | Additional Fields |
|-----------|---------------------|-------------------|
| `slack_message` | `message` | `response`, `output` |
| `email` | `message` | `response`, `output` |
| `google_gmail` | `message` | `response`, `output` |
| `discord` | `message` | `response`, `output` |
| `telegram` | `message` | `response`, `output` |
| `microsoft_teams` | `message` | `response`, `output` |
| `log_output` | *(void)* | No output fields |

**Note:** All communication nodes return strings, not JSON objects.

---

## 🔀 Logic Nodes

| Node Type | Primary Output Field | Special Notes |
|-----------|---------------------|---------------|
| `if_else` | `true` / `false` | Has two output handles: `true` and `false` |
| `switch` | `result` | Dynamic output handles based on cases |
| `filter` | `filtered` | Returns filtered array |
| `merge` | `merged` | Returns merged data |
| `aggregate` | `groups` | Returns `groups`, `totals`, `count` |
| `sort` | `sorted` | Returns sorted array |
| `limit` | `limited` | Returns limited array |

**Special Handling:**
- `if_else` outputs to `true` or `false` handles (not `output`)
- `switch` has dynamic output handles based on case configuration

---

## 🗄️ Database Nodes

| Node Type | Primary Output Field | Additional Fields |
|-----------|---------------------|-------------------|
| `database_read` | `rows` | `data`, `result` |
| `database_write` | `result` | `affectedRows`, `insertId`, `rowsAffected` |
| `supabase` | `data` | `error`, `rows` |
| `postgresql` | `rows` | `data`, `result` |
| `mysql` | `rows` | `data`, `result` |
| `mongodb` | `documents` | `data`, `result` |
| `redis` | `value` | `data`, `result` |

---

## 📧 CRM Nodes

| Node Type | Primary Output Field | Additional Fields |
|-----------|---------------------|-------------------|
| `hubspot` | `data` | `result`, `output` |
| `zoho_crm` | `data` | `result`, `output` |
| `pipedrive` | `data` | `result`, `output` |
| `salesforce` | `data` | `result`, `output` |

**Input Field:** CRM nodes typically expect `data` as input field.

---

## 🔗 Common Connection Patterns

### Trigger → Action
```typescript
// manual_trigger → any node
{ sourceHandle: 'inputData', targetHandle: 'input' }

// chat_trigger → ai_agent
{ sourceHandle: 'message', targetHandle: 'userInput' }

// webhook → any node
{ sourceHandle: 'body', targetHandle: 'input' }
```

### AI → Output
```typescript
// ai_agent → slack_message
{ sourceHandle: 'response_text', targetHandle: 'text' }

// ai_agent → email
{ sourceHandle: 'response_text', targetHandle: 'body' }
```

### Data Source → Processing
```typescript
// google_sheets → javascript
{ sourceHandle: 'rows', targetHandle: 'code' }

// database_read → filter
{ sourceHandle: 'rows', targetHandle: 'input' }
```

---

## 🛠️ How to Use This Reference

### When Creating Connections:
1. Check the source node's **Primary Output Field** from this table
2. Check the target node's expected input field
3. Use `mapOutputToInput()` function for automatic mapping

### When Writing Template Expressions:
1. Use the **Template Expression** format from this table
2. Always use `{{$json.fieldName}}` format
3. Use the **Primary Output Field** unless you need a specific field

### When Debugging Errors:
1. If you see "field not found" error, check this reference
2. Verify you're using the correct field name
3. Check if the node type is in the registry

---

## 📚 Related Functions

- `getNodeOutputFields(nodeType)` - Get all output fields for a node
- `inferOutputFieldsFromNodeType(nodeType)` - Infer fields from node type
- `mapOutputToInput(sourceType, targetType)` - Map output to input fields
- `generateInputFieldValue()` - Generate template expressions

---

## ⚠️ Important Notes

1. **Always use `inputData` for `manual_trigger` and `workflow_trigger`** - NOT `output`
2. **Always use `message` for `chat_trigger`** - NOT `output` or `inputData`
3. **AI Agent outputs `response_text`** - Use this for connecting to output nodes
4. **Array-returning nodes** (sheets, database_read) output `rows` - Use this in loops
5. **Void nodes** (log_output, stop_and_error) have no output fields

---

*Last Updated: 2024*
*For complete documentation, see `NODE_FIELD_MAPPING_AUDIT.md`*
