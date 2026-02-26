# Node Registry Debugging Improvements

## Overview

Enhanced the NodeLibrary with comprehensive debugging features to help diagnose node registration and lookup issues.

## Features Added

### 1. Log All Registered Node Types at Startup ✅

**Location**: `NodeLibrary.constructor()` → `logAllRegisteredNodes()`

**Output**:
```
[NodeLibrary] 📋 Registered nodes (111): schedule, webhook, manual_trigger, interval, chat_trigger, form, error_trigger, workflow_trigger, http_request, respond_to_webhook, ...
[NodeLibrary] 📊 Nodes by category:
[NodeLibrary]   triggers: 8 nodes (schedule, webhook, manual_trigger, ...)
[NodeLibrary]   ai: 12 nodes (ai_agent, ai_chat_model, ai_service, ...)
[NodeLibrary]   google: 9 nodes (google_sheets, google_doc, google_gmail, ...)
```

**Benefits**:
- See all registered nodes at startup
- Organized by category for easier navigation
- Helps identify missing or duplicate nodes

### 2. Log Node Lookup Attempts ✅

**Location**: `NodeLibrary.getSchema()`

**Behavior**:
- **Successful lookups**: Only logged if `DEBUG_NODE_LOOKUPS=true` (to reduce noise)
- **Failed lookups**: Always logged with helpful suggestions

**Output Examples**:

**Successful (debug mode)**:
```
[NodeLibrary] ✅ Found node type: "google_gmail"
```

**Failed (always logged)**:
```
[NodeLibrary] ❌ Node type not found: "gmail_send"
[NodeLibrary] 💡 Available node types: schedule, webhook, manual_trigger, interval, chat_trigger, form, error_trigger, workflow_trigger, http_request, respond_to_webhook...
```

**Benefits**:
- Track which nodes are being looked up
- Identify typos or incorrect node type names
- See suggestions for available nodes

### 3. Log Failed Lookups ✅

**Location**: `NodeLibrary.getSchema()`

**Features**:
- Always logs failed lookups (not just in debug mode)
- Shows first 10 available node types as suggestions
- Validates input (warns on invalid types)

**Output**:
```
[NodeLibrary] ❌ Node type not found: "unknown_node"
[NodeLibrary] 💡 Available node types: schedule, webhook, manual_trigger, interval, chat_trigger, form, error_trigger, workflow_trigger, http_request, respond_to_webhook...
```

**Benefits**:
- Immediate feedback on missing nodes
- Helps identify typos or incorrect names
- Provides suggestions for similar nodes

### 4. Expose `getRegisteredNodeTypes()` Function ✅

**Location**: `NodeLibrary.getRegisteredNodeTypes()`

**Signature**:
```typescript
getRegisteredNodeTypes(): string[]
```

**Usage**:
```typescript
import { nodeLibrary } from './services/nodes/node-library';

const allNodeTypes = nodeLibrary.getRegisteredNodeTypes();
console.log(`Total nodes: ${allNodeTypes.length}`);
// Output: ["schedule", "webhook", "manual_trigger", ...]
```

**Benefits**:
- Programmatic access to all registered node types
- Useful for validation, testing, and debugging
- Returns sorted array for consistent output

### 5. Additional Debugging Features

#### Duplicate Registration Detection ✅

**Location**: `NodeLibrary.addSchema()`

**Output**:
```
[NodeLibrary] ⚠️  Duplicate node type registration: "gmail" (overwriting existing schema)
```

**Benefits**:
- Detects accidental duplicate registrations
- Warns when overwriting existing schemas

#### Registration Logging (Debug Mode) ✅

**Location**: `NodeLibrary.addSchema()`

**Environment Variable**: `DEBUG_NODE_REGISTRATION=true`

**Output**:
```
[NodeLibrary] 📝 Registered node: "google_gmail" (google)
[NodeLibrary] 📝 Registered node: "ai_service" (ai)
```

**Benefits**:
- Track node registration in real-time
- Useful for debugging initialization issues

## Environment Variables

Control debug logging with environment variables:

```bash
# Enable detailed lookup logging
DEBUG_NODE_LOOKUPS=true

# Enable registration logging
DEBUG_NODE_REGISTRATION=true
```

## Example Log Output

### Startup Logs
```
[NodeLibrary] 🚀 Initializing NodeLibrary...
[NodeLibrary] 🔄 Initializing node schemas...
[NodeLibrary] ✅ Registered 29 node schemas so far...
[NodeLibrary] ✅ All critical nodes registered (ai_service, google_gmail)
[NodeLibrary] ✅ NodeLibrary initialized with 111 node schemas
[NodeLibrary] 📋 Registered nodes (111): aggregate, ai_agent, ai_chat_model, ai_service, airtable, anthropic_claude, aws_s3, bitbucket, chat_model, chat_trigger, clickup, csv, database_read, database_write, date_time, discord, discord_webhook, dropbox, edit_fields, email, error_handler, error_trigger, facebook, filter, form, freshdesk, ftp, function, function_item, github, gitlab, google_big_query, google_calendar, google_contacts, google_doc, google_drive, google_gmail, google_sheets, google_tasks, google_gemini, graphql, gmail, gmail_send, html, hubspot, http_post, http_request, if_else, instagram, intercom, interval, jira, jenkins, javascript, json_parser, limit, linkedin, log_output, loop, mailchimp, manual_trigger, math, memory, merge, merge_data, microsoft_teams, mongodb, mysql, noop, notion, ollama, one_drive, openai_gpt, outlook, paypal, pipedrive, read_binary_file, redis, rename_keys, respond_to_webhook, schedule, salesforce, sentiment_analyzer, set, set_variable, sftp, shopify, slack_message, slack_webhook, sort, split_in_batches, stop_and_error, stripe, supabase, switch, telegram, text_formatter, text_summarizer, tool, twilio, twitter, wait, webhook, webhook_response, whatsapp_cloud, woocommerce, workflow_trigger, write_binary_file, xml, youtube, zoho_crm
[NodeLibrary] 📊 Nodes by category:
[NodeLibrary]   triggers: 8 nodes (schedule, webhook, manual_trigger, interval, chat_trigger, form, error_trigger, workflow_trigger)
[NodeLibrary]   ai: 12 nodes (ai_agent, ai_chat_model, ai_service, openai_gpt, anthropic_claude, google_gemini, ollama, text_summarizer, sentiment_analyzer, chat_model, memory, tool)
[NodeLibrary]   google: 9 nodes (google_sheets, google_doc, google_gmail, google_drive, google_calendar, google_contacts, google_tasks, google_big_query)
[NodeLibrary]   ...
```

### Lookup Logs
```
[NodeLibrary] ❌ Node type not found: "gmail_send"
[NodeLibrary] 💡 Available node types: schedule, webhook, manual_trigger, interval, chat_trigger, form, error_trigger, workflow_trigger, http_request, respond_to_webhook...
```

## API Reference

### `getRegisteredNodeTypes(): string[]`

Returns a sorted array of all registered node type names.

**Example**:
```typescript
const nodeTypes = nodeLibrary.getRegisteredNodeTypes();
console.log(`Total: ${nodeTypes.length} nodes`);
// Total: 111 nodes
```

### `getSchema(nodeType: string): NodeSchema | undefined`

Enhanced with logging:
- Logs failed lookups automatically
- Logs successful lookups if `DEBUG_NODE_LOOKUPS=true`
- Validates input and warns on invalid types

## Benefits

1. **Easier Debugging**: See all registered nodes at startup
2. **Faster Issue Resolution**: Failed lookups show suggestions
3. **Better Visibility**: Track node registration and lookups
4. **Programmatic Access**: `getRegisteredNodeTypes()` for external use
5. **Duplicate Detection**: Warns on duplicate registrations

## Files Modified

- `worker/src/services/nodes/node-library.ts`:
  - Added `logAllRegisteredNodes()` method
  - Enhanced `getSchema()` with logging
  - Added `getRegisteredNodeTypes()` method
  - Enhanced `addSchema()` with duplicate detection and debug logging
