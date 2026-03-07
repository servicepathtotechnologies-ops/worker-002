# Comprehensive Category Mapping System

## Overview

This document describes the comprehensive profession/category to node type mapping system that enables the AI workflow builder to understand abstract profession names (like "CRM", "Sales", "Education") and map them to actual node types.

## Key Principles

### 1. **Hybrid Nodes** ✅
**Nodes can belong to MULTIPLE categories simultaneously.**

Examples:
- `airtable` belongs to: **CRM**, **Sales**, **Data Management**, **Education**, **Real Estate**
- `email` belongs to: **Communication**, **Sales**, **Support**, **Productivity**
- `database_write` belongs to: **Database**, **Data Management**, **Education**, **Healthcare**, **Real Estate**

This is intentional and powerful - it allows the same node to be used in different contexts.

### 2. **Category Resolution**
When a user says "I need a CRM tool", the system:
1. Looks up the "crm" category
2. Returns ALL available CRM nodes: `['airtable', 'hubspot', 'salesforce', 'zoho_crm', 'pipedrive', ...]`
3. The workflow builder selects the appropriate one(s) based on context

### 3. **Multiple Node Support**
If a workflow needs multiple nodes from the same category:
- "Sync between CRM systems" → Uses multiple CRM nodes (e.g., `airtable` + `hubspot`)
- "Capture from website and webhook" → Uses multiple website nodes (e.g., `http_request` + `webhook`)

## Category Mappings

### Core Business Categories

#### **CRM** - Customer Relationship Management
- `airtable`, `hubspot`, `salesforce`, `zoho_crm`, `pipedrive`, `activecampaign`, `mailchimp`, `freshdesk`, `intercom`

#### **Sales** - Sales processes, lead management
- `salesforce`, `hubspot`, `pipedrive`, `zoho_crm`, `airtable`, `google_sheets`, `slack_message`, `email`, `google_gmail`, `google_contacts`, `if_else`, `switch`, `filter`

#### **Marketing** - Campaigns, content distribution
- `mailchimp`, `activecampaign`, `linkedin`, `instagram`, `facebook`, `twitter`, `youtube`, `openai_gpt`, `anthropic_claude`, `google_gemini`, `text_formatter`, `schedule`, `google_drive`

#### **Support** - Customer support, ticketing
- `freshdesk`, `intercom`, `ai_chat_model`, `ai_agent`, `sentiment_analyzer`, `slack_message`, `slack_webhook`, `microsoft_teams`, `email`, `switch`, `if_else`, `webhook`

#### **E-commerce** - Online stores, orders
- `shopify`, `woocommerce`, `stripe`, `paypal`, `mysql`, `postgresql`, `aggregate`, `split_in_batches`, `loop`, `whatsapp_cloud`, `twilio`, `aws_s3`

#### **Finance** - Financial operations
- `stripe`, `paypal`, `aggregate`, `filter`, `if_else`, `database_write`, `database_read`, `google_sheets`, `email`, `slack_message`

#### **Accounting** - Financial reconciliation
- `stripe`, `paypal`, `aggregate`, `filter`, `if_else`, `stop_and_error`, `error_handler`, `interval`, `database_write`, `google_sheets`

### Technical/IT Categories

#### **DevOps** - CI/CD, monitoring
- `github`, `gitlab`, `bitbucket`, `jenkins`, `jira`, `if_else`, `discord`, `telegram`, `log_output`, `webhook`, `error_handler`

#### **IT** - IT operations, integration
- `github`, `gitlab`, `bitbucket`, `jenkins`, `jira`, `webhook`, `http_request`, `graphql`, `database_read`, `database_write`, `error_handler`

#### **Integration** - System integration
- `webhook`, `webhook_response`, `http_request`, `http_post`, `graphql`, `respond_to_webhook`, `switch`, `if_else`, `merge`

#### **Monitoring** - System monitoring
- `log_output`, `slack_message`, `telegram`, `discord`, `discord_webhook`, `email`, `error_handler`, `error_trigger`

### Data & Analytics Categories

#### **Database** - Database operations
- `database_write`, `database_read`, `postgresql`, `mysql`, `supabase`, `mongodb`, `redis`

#### **Data Management** - Data processing, migration
- `database_read`, `database_write`, `postgresql`, `mysql`, `mongodb`, `supabase`, `redis`, `split_in_batches`, `loop`, `json_parser`, `edit_fields`, `rename_keys`, `aggregate`, `airtable`, `notion`

#### **Analytics** - Data analysis
- `aggregate`, `sort`, `limit`, `filter`, `google_sheets`, `google_doc`, `google_big_query`, `airtable`, `notion`, `csv`, `database_read`

#### **Reporting** - Report generation
- `google_sheets`, `google_doc`, `google_big_query`, `airtable`, `notion`, `csv`, `text_formatter`, `interval`, `database_read`

### Content & Document Categories

#### **Content Generation** - AI content creation
- `openai_gpt`, `anthropic_claude`, `google_gemini`, `ollama`, `ai_chat_model`, `text_formatter`, `text_summarizer`, `linkedin`, `instagram`, `facebook`, `twitter`, `youtube`

#### **Document Management** - Document processing
- `read_binary_file`, `write_binary_file`, `dropbox`, `onedrive`, `ftp`, `sftp`, `aws_s3`, `google_drive`, `text_summarizer`, `rename_keys`, `xml`, `html`

#### **Legal** - Legal document processing
- `read_binary_file`, `write_binary_file`, `ollama`, `text_summarizer`, `rename_keys`, `dropbox`, `onedrive`, `xml`, `html`, `database_write`

### Communication Categories

#### **Communication** - General communication
- `slack_message`, `slack_webhook`, `google_gmail`, `email`, `outlook`, `telegram`, `discord`, `discord_webhook`, `microsoft_teams`, `whatsapp_cloud`, `twilio`

#### **Email** - Email operations
- `google_gmail`, `gmail`, `email`, `outlook`

#### **Social Media** - Social platforms
- `linkedin`, `instagram`, `facebook`, `twitter`, `youtube`, `openai_gpt`, `anthropic_claude`, `google_gemini`, `text_formatter`, `schedule`

### Productivity Categories

#### **Productivity** - Productivity tools
- `google_calendar`, `google_tasks`, `google_gmail`, `outlook`, `notion`, `clickup`, `airtable`, `date_time`, `text_formatter`, `schedule`

#### **Calendar** - Calendar management
- `google_calendar`, `google_tasks`, `date_time`, `schedule`, `google_gmail`, `outlook`

### AI & Automation Categories

#### **AI** - Artificial intelligence
- `ai_agent`, `ai_chat_model`, `ai_service`, `openai_gpt`, `anthropic_claude`, `google_gemini`, `ollama`, `text_summarizer`, `sentiment_analyzer`, `memory`, `tool`

#### **Automation** - Workflow automation
- `schedule`, `interval`, `webhook`, `if_else`, `switch`, `loop`, `merge`, `function`, `function_item`, `noop`

#### **Chatbot** - AI chatbot
- `chat_trigger`, `ai_agent`, `memory`, `tool`, `http_request`, `graphql`, `function`, `function_item`, `merge`, `noop`

### Domain-Specific Categories

#### **Education** - Educational workflows
- `form`, `database_write`, `supabase`, `ai_service`, `sentiment_analyzer`, `slack_webhook`, `merge`, `google_sheets`, `airtable`, `notion`, `email`, `schedule`, `interval`

#### **Healthcare** - Healthcare workflows
- `form`, `database_write`, `postgresql`, `mysql`, `supabase`, `schedule`, `interval`, `if_else`, `email`, `slack_message`, `twilio`, `whatsapp_cloud`, `date_time`

#### **Medical** - Medical workflows, prescriptions
- `schedule`, `interval`, `date_time`, `if_else`, `email`, `slack_message`, `twilio`, `whatsapp_cloud`, `database_write`, `postgresql`, `mysql`, `supabase`

#### **Real Estate** - Real estate workflows
- `airtable`, `google_sheets`, `notion`, `database_write`, `postgresql`, `mysql`, `email`, `google_gmail`, `slack_message`, `form`, `webhook`

#### **SaaS** - Software as a Service
- `form`, `database_write`, `supabase`, `ai_service`, `sentiment_analyzer`, `slack_webhook`, `merge`, `interval`, `schedule`, `webhook`

### Infrastructure Categories

#### **Website** - Web operations
- `http_request`, `webhook`, `webhook_response`, `http_post`, `respond_to_webhook`, `graphql`

#### **Storage** - File storage
- `aws_s3`, `google_drive`, `dropbox`, `onedrive`, `ftp`, `sftp`, `read_binary_file`, `write_binary_file`

#### **Spreadsheet** - Spreadsheet operations
- `google_sheets`, `airtable`, `csv`

### Workflow Control Categories

#### **Error Handling** - Error management
- `error_trigger`, `error_handler`, `wait`, `if_else`, `log_output`, `slack_message`, `telegram`, `discord_webhook`

#### **Logic** - Conditional logic
- `if_else`, `switch`, `filter`, `merge`, `loop`, `split_in_batches`, `limit`, `sort`, `aggregate`

#### **Transformation** - Data transformation
- `set_variable`, `javascript`, `json_parser`, `text_formatter`, `edit_fields`, `rename_keys`, `merge_data`, `date_time`, `csv`, `xml`, `html`

## Usage Examples

### Example 1: Education Workflow
**User Prompt**: "Create a workflow for students to submit assignments and get AI feedback"

**Categories Detected**: `education`, `ai`, `form`
**Nodes Resolved**:
- `education` → `['form', 'database_write', 'supabase', 'ai_service', ...]`
- `ai` → `['ai_agent', 'ai_chat_model', 'text_summarizer', ...]`

**Result**: Uses `form` + `database_write` + `ai_chat_model` + `email`

### Example 2: Medical Prescription Workflow
**User Prompt**: "Send medication reminders at prescribed intervals"

**Categories Detected**: `medical`, `healthcare`, `schedule`
**Nodes Resolved**:
- `medical` → `['schedule', 'interval', 'date_time', 'email', 'twilio', ...]`
- `healthcare` → `['form', 'database_write', 'schedule', 'interval', ...]`

**Result**: Uses `schedule` + `interval` + `date_time` + `email` + `twilio`

### Example 3: Multi-CRM Sales Workflow
**User Prompt**: "Sync leads between Airtable and HubSpot, notify sales team"

**Categories Detected**: `crm`, `sales`, `communication`
**Nodes Resolved**:
- `crm` → `['airtable', 'hubspot', 'salesforce', ...]` (uses both `airtable` and `hubspot`)
- `sales` → `['salesforce', 'hubspot', 'slack_message', ...]`
- `communication` → `['slack_message', 'email', ...]`

**Result**: Uses `airtable` + `hubspot` + `slack_message` + `email`

## API Methods

### `resolveCategoryToNodeTypes(category: string): string[]`
Returns ALL available nodes for a category.

```typescript
nodeTypeNormalizationService.resolveCategoryToNodeTypes('crm')
// Returns: ['airtable', 'hubspot', 'salesforce', 'zoho_crm', 'pipedrive', ...]
```

### `getCategoriesForNode(nodeType: string): string[]`
Returns all categories a node belongs to (hybrid node support).

```typescript
nodeTypeNormalizationService.getCategoriesForNode('airtable')
// Returns: ['crm', 'sales', 'data_management', 'education', 'real_estate', 'spreadsheet']
```

### `isNodeInCategory(nodeType: string, category: string): boolean`
Checks if a node belongs to a specific category.

```typescript
nodeTypeNormalizationService.isNodeInCategory('airtable', 'crm')
// Returns: true

nodeTypeNormalizationService.isNodeInCategory('airtable', 'education')
// Returns: true (hybrid node!)
```

### `getAllCategories(): string[]`
Returns all available category names.

```typescript
nodeTypeNormalizationService.getAllCategories()
// Returns: ['crm', 'sales', 'marketing', 'support', 'ecommerce', ...]
```

## Implementation Details

### Location
- **File**: `worker/src/services/ai/node-type-normalization-service.ts`
- **Constant**: `PROFESSION_CATEGORY_MAPPINGS`

### Integration Points
1. **DSL Compiler**: Expands categories to multiple nodes when needed
2. **Production Workflow Builder**: Validates and normalizes node types
3. **Intent Constraint Engine**: Maps user intents to node types

### Hybrid Node Support
The system fully supports hybrid nodes:
- A node can appear in multiple category arrays
- When resolving a category, all matching nodes are returned
- The workflow builder intelligently selects the appropriate node(s) based on context

## Future Enhancements

1. **Dynamic Category Discovery**: Automatically discover categories from node metadata
2. **Category Weighting**: Prioritize nodes within categories based on usage patterns
3. **Context-Aware Selection**: Use AI to select the best node(s) from a category based on user prompt
4. **Category Aliases**: Support multiple names for the same category (e.g., "crm" = "customer_relationship_management")

## Summary

This comprehensive category mapping system enables the AI workflow builder to:
- ✅ Understand abstract profession names
- ✅ Support hybrid nodes (nodes in multiple categories)
- ✅ Handle complex workflows requiring multiple nodes
- ✅ Cover 30+ categories across all business domains
- ✅ Scale to infinite use cases

The system is designed to be extensible - new categories and nodes can be added easily as new use cases emerge.
