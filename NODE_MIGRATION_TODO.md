# 📋 COMPREHENSIVE NODE MIGRATION TODO

## Overview

This document provides a complete, prioritized todo list for migrating all nodes from legacy executor to UnifiedNodeRegistry.

**Current Status:**
- ✅ **17 nodes fully migrated** (21%)
- ⚠️ **~63 nodes in registry** (base definitions)
- ❌ **~30+ nodes need migration** (38%)

**Target:** 100% migration, remove legacy executor

---

## 🎯 PRIORITY 1: CRITICAL NODES (Week 1-2)

### Trigger Nodes (8 nodes)
**Why:** Workflows can't start without triggers

- [ ] `manual_trigger` - Simple trigger, returns input as-is
  - Legacy: `execute-workflow.ts:510-515`
  - Create: `overrides/manual-trigger.ts`
  - Priority: **CRITICAL**

- [ ] `chat_trigger` - Extracts message from input
  - Legacy: `execute-workflow.ts:517-530`
  - Create: `overrides/chat-trigger.ts`
  - Priority: **CRITICAL**

- [ ] `webhook` - Returns webhook payload
  - Legacy: `execute-workflow.ts:532-553`
  - Create: `overrides/webhook.ts`
  - Priority: **CRITICAL**

- [ ] `schedule` - Cron-based scheduling
  - Legacy: `execute-workflow.ts:4242-4250`
  - Create: `overrides/schedule.ts`
  - Priority: **HIGH**

- [ ] `interval` - Recurring interval trigger
  - Legacy: `execute-workflow.ts:4251-4259`
  - Create: `overrides/interval.ts`
  - Priority: **HIGH**

- [ ] `form_trigger` - Form submission trigger
  - Legacy: `execute-workflow.ts:4260-4266`
  - Create: `overrides/form-trigger.ts`
  - Priority: **HIGH**

- [ ] `workflow_trigger` - Triggered by another workflow
  - Legacy: `execute-workflow.ts:4267-4274`
  - Create: `overrides/workflow-trigger.ts`
  - Priority: **MEDIUM**

- [ ] `error_trigger` - Error-based trigger
  - Legacy: `execute-workflow.ts:4275-4291`
  - Create: `overrides/error-trigger.ts`
  - Priority: **MEDIUM**

### Logic Nodes (4 nodes)
**Why:** Core workflow control flow

- [x] `if_else` - ✅ **MIGRATED**
- [x] `timeout` - ✅ **MIGRATED**
- [x] `try_catch` - ✅ **MIGRATED**
- [x] `retry` - ✅ **MIGRATED**
- [x] `parallel` - ✅ **MIGRATED**

- [ ] `switch` - Multi-case branching
  - Legacy: `execute-workflow.ts:10297-10346`
  - Create: `overrides/switch.ts`
  - Priority: **CRITICAL**

- [ ] `wait` - Delay execution
  - Legacy: `execute-workflow.ts:1006-1047`
  - Create: `overrides/wait.ts`
  - Priority: **HIGH**

- [ ] `delay` - Delay execution (alias)
  - Legacy: `execute-workflow.ts:1048-1095`
  - Create: `overrides/delay.ts`
  - Priority: **HIGH**

- [ ] `return` - Early return
  - Legacy: `execute-workflow.ts:1113-1140`
  - Create: `overrides/return.ts`
  - Priority: **MEDIUM**

---

## 🎯 PRIORITY 2: HIGH-USAGE NODES (Week 3-4)

### Communication Nodes (7 nodes)
**Why:** High usage, critical for workflows

- [x] `google_gmail` - ✅ **MIGRATED**

- [ ] `slack_message` - Slack messaging
  - Legacy: Check `execute-workflow.ts` for Slack case
  - Create: `overrides/slack-message.ts`
  - Priority: **HIGH**

- [ ] `telegram` - Telegram messaging
  - Legacy: Check `execute-workflow.ts` for Telegram case
  - Create: `overrides/telegram.ts`
  - Priority: **MEDIUM**

- [ ] `discord` - Discord messaging
  - Legacy: Check `execute-workflow.ts` for Discord case
  - Create: `overrides/discord.ts`
  - Priority: **MEDIUM**

- [ ] `microsoft_teams` - Teams messaging
  - Legacy: Check `execute-workflow.ts` for Teams case
  - Create: `overrides/microsoft-teams.ts`
  - Priority: **MEDIUM**

- [ ] `whatsapp_cloud` - WhatsApp messaging
  - Legacy: Check `execute-workflow.ts` for WhatsApp case
  - Create: `overrides/whatsapp-cloud.ts`
  - Priority: **MEDIUM**

- [ ] `twilio` - SMS via Twilio
  - Legacy: `execute-workflow.ts:2500-2595`
  - Create: `overrides/twilio.ts`
  - Priority: **MEDIUM**

- [ ] `email` - Generic email (SMTP)
  - Legacy: Check `execute-workflow.ts` for email case
  - Create: `overrides/email.ts`
  - Priority: **MEDIUM**

### Data Transformation Nodes (8 nodes)
**Why:** Common operations, high usage

- [ ] `set_variable` - Set variable values
  - Legacy: `execute-workflow.ts:572-586`
  - Create: `overrides/set-variable.ts`
  - Priority: **HIGH**

- [ ] `math` - Mathematical operations
  - Legacy: `execute-workflow.ts:619-735`
  - Create: `overrides/math.ts`
  - Priority: **HIGH**

- [ ] `sort` - Sort arrays
  - Legacy: `execute-workflow.ts:736-810`
  - Create: `overrides/sort.ts`
  - Priority: **MEDIUM**

- [ ] `limit` - Limit array items
  - Legacy: `execute-workflow.ts:811-925`
  - Create: `overrides/limit.ts`
  - Priority: **MEDIUM**

- [ ] `aggregate` - Aggregate data
  - Legacy: `execute-workflow.ts:926-985`
  - Create: `overrides/aggregate.ts`
  - Priority: **MEDIUM**

- [ ] `filter` - Filter array items
  - Legacy: Check `execute-workflow.ts` for filter case
  - Create: `overrides/filter.ts`
  - Priority: **MEDIUM**

- [ ] `loop` - Iterate over arrays
  - Legacy: Check `execute-workflow.ts` for loop case
  - Create: `overrides/loop.ts`
  - Priority: **MEDIUM**

- [ ] `split_in_batches` - Split into batches
  - Legacy: Check `execute-workflow.ts` for split case
  - Create: `overrides/split-in-batches.ts`
  - Priority: **LOW**

---

## 🎯 PRIORITY 3: SPECIALIZED NODES (Week 5-6)

### Storage Nodes (7 nodes)
**Why:** Common integrations

- [ ] `google_sheets` - Google Sheets
  - Legacy: `execute-workflow.ts:4895-5174`
  - Create: `overrides/google-sheets.ts`
  - Priority: **HIGH**

- [ ] `google_doc` - Google Docs
  - Legacy: `execute-workflow.ts:5175-5356`
  - Create: `overrides/google-doc.ts`
  - Priority: **MEDIUM**

- [ ] `airtable` - Airtable integration
  - Legacy: `execute-workflow.ts:5357-5913`
  - Create: `overrides/airtable.ts`
  - Priority: **HIGH**

- [ ] `notion` - Notion integration
  - Legacy: `execute-workflow.ts:6757-7265`
  - Create: `overrides/notion.ts`
  - Priority: **MEDIUM**

- [ ] `aws_s3` - AWS S3 storage
  - Legacy: `execute-workflow.ts:2114-2179`
  - Create: `overrides/aws-s3.ts`
  - Priority: **MEDIUM**

- [ ] `dropbox` - Dropbox storage
  - Legacy: `execute-workflow.ts:2180-2275`
  - Create: `overrides/dropbox.ts`
  - Priority: **LOW**

- [ ] `onedrive` - OneDrive storage
  - Legacy: `execute-workflow.ts:2276-2365`
  - Create: `overrides/onedrive.ts`
  - Priority: **LOW**

### CRM Nodes (4 nodes)
**Why:** Business-critical integrations

- [ ] `hubspot` - HubSpot CRM
  - Legacy: Check `execute-workflow.ts` for HubSpot case
  - Create: `overrides/hubspot.ts`
  - Priority: **HIGH**

- [ ] `salesforce` - Salesforce CRM
  - Legacy: Check `execute-workflow.ts` for Salesforce case
  - Create: `overrides/salesforce.ts`
  - Priority: **HIGH**

- [ ] `pipedrive` - Pipedrive CRM
  - Legacy: `execute-workflow.ts:5914-6756`
  - Create: `overrides/pipedrive.ts`
  - Priority: **MEDIUM**

- [ ] `zoho` - Zoho CRM
  - Legacy: Check `execute-workflow.ts` for Zoho case
  - Create: `overrides/zoho.ts`
  - Priority: **MEDIUM**

### AI/ML Nodes (3 nodes)
**Why:** High usage, already partially migrated

- [x] `ai_agent` - ✅ **MIGRATED**
- [x] `ai_chat_model` - ✅ **MIGRATED**
- [x] `ollama` - ✅ **MIGRATED**
- [x] `openai_gpt` - ✅ **MIGRATED**
- [x] `anthropic_claude` - ✅ **MIGRATED**
- [x] `google_gemini` - ✅ **MIGRATED**

- [ ] `text_summarizer` - Text summarization
  - Legacy: `execute-workflow.ts:3410-3435`
  - Create: `overrides/text-summarizer.ts`
  - Priority: **MEDIUM**

- [ ] `sentiment_analyzer` - Sentiment analysis
  - Legacy: `execute-workflow.ts:3436-3456`
  - Create: `overrides/sentiment-analyzer.ts`
  - Priority: **MEDIUM**

- [ ] `ai_service` - Generic AI service
  - Legacy: `execute-workflow.ts:3457-3490`
  - Create: `overrides/ai-service.ts`
  - Priority: **LOW**

### Database Nodes (4 nodes)
**Why:** Already partially migrated

- [x] `database_read` - ✅ **MIGRATED**
- [x] `database_write` - ✅ **MIGRATED**

- [ ] `postgresql` - PostgreSQL specific operations
  - Legacy: Check `execute-workflow.ts` for PostgreSQL case
  - Create: `overrides/postgresql.ts`
  - Priority: **MEDIUM**

- [ ] `supabase` - Supabase operations
  - Legacy: Check `execute-workflow.ts` for Supabase case
  - Create: `overrides/supabase.ts`
  - Priority: **MEDIUM**

- [ ] `mysql` - MySQL operations
  - Legacy: Check `execute-workflow.ts` for MySQL case
  - Create: `overrides/mysql.ts`
  - Priority: **LOW**

- [ ] `mongodb` - MongoDB operations
  - Legacy: Check `execute-workflow.ts` for MongoDB case
  - Create: `overrides/mongodb.ts`
  - Priority: **LOW**

---

## 🎯 PRIORITY 4: LOW-PRIORITY NODES (Week 7-8)

### Utility Nodes (6 nodes)
**Why:** Specialized use cases

- [x] `log_output` - ✅ **MIGRATED**

- [ ] `javascript` - Custom JavaScript execution
  - Legacy: `execute-workflow.ts:4473-4659`
  - Create: `overrides/javascript.ts`
  - Priority: **MEDIUM**

- [ ] `function` - Function execution
  - Legacy: `execute-workflow.ts:4660-4818`
  - Create: `overrides/function.ts`
  - Priority: **MEDIUM**

- [ ] `function_item` - Function item execution
  - Legacy: `execute-workflow.ts:4819-4894`
  - Create: `overrides/function-item.ts`
  - Priority: **LOW**

- [ ] `http_request` - HTTP requests
  - Legacy: `execute-workflow.ts:4292-4409`
  - Create: `overrides/http-request.ts`
  - Priority: **HIGH**

- [ ] `http_response` - HTTP responses
  - Legacy: Check `execute-workflow.ts` for HTTP response case
  - Create: `overrides/http-response.ts`
  - Priority: **MEDIUM**

- [ ] `graphql` - GraphQL requests
  - Legacy: `execute-workflow.ts:4431-4472`
  - Create: `overrides/graphql.ts`
  - Priority: **LOW**

### Queue & Cache Nodes (4 nodes)
**Why:** Specialized infrastructure

- [ ] `queue_push` - Push to queue
  - Legacy: `execute-workflow.ts:1313-1392`
  - Create: `overrides/queue-push.ts`
  - Priority: **LOW**

- [ ] `queue_consume` - Consume from queue
  - Legacy: `execute-workflow.ts:1393-1514`
  - Create: `overrides/queue-consume.ts`
  - Priority: **LOW**

- [ ] `cache_get` - Get from cache
  - Legacy: `execute-workflow.ts:1515-1610`
  - Create: `overrides/cache-get.ts`
  - Priority: **LOW**

- [ ] `cache_set` - Set in cache
  - Legacy: `execute-workflow.ts:1611-1700`
  - Create: `overrides/cache-set.ts`
  - Priority: **LOW**

### Auth Nodes (2 nodes)
**Why:** Infrastructure support

- [ ] `oauth2_auth` - OAuth2 authentication
  - Legacy: `execute-workflow.ts:1701-1839`
  - Create: `overrides/oauth2-auth.ts`
  - Priority: **LOW**

- [ ] `api_key_auth` - API key authentication
  - Legacy: `execute-workflow.ts:1840-1971`
  - Create: `overrides/api-key-auth.ts`
  - Priority: **LOW**

### File Nodes (2 nodes)
**Why:** File operations

- [ ] `read_binary_file` - Read binary files
  - Legacy: `execute-workflow.ts:1972-1998`
  - Create: `overrides/read-binary-file.ts`
  - Priority: **LOW**

- [ ] `write_binary_file` - Write binary files
  - Legacy: `execute-workflow.ts:1999-2029`
  - Create: `overrides/write-binary-file.ts`
  - Priority: **LOW**

### Advanced Nodes (3 nodes)
**Why:** Advanced workflow features

- [ ] `execute_workflow` - Execute sub-workflow
  - Legacy: `execute-workflow.ts:1141-1270`
  - Create: `overrides/execute-workflow.ts`
  - Priority: **MEDIUM**

- [ ] `twitter` - Twitter integration
  - Legacy: `execute-workflow.ts:7266-8127`
  - Create: `overrides/twitter.ts`
  - Priority: **MEDIUM**

- [ ] `instagram` - Instagram integration
  - Legacy: `execute-workflow.ts:8128+`
  - Create: `overrides/instagram.ts`
  - Priority: **LOW**

---

## 📊 MIGRATION CHECKLIST (Per Node)

For each node migration, complete:

### 1. Preparation
- [ ] Locate legacy implementation in `execute-workflow.ts`
- [ ] Understand node's input/output contracts
- [ ] Review existing override examples (e.g., `google-gmail.ts`)

### 2. Implementation
- [ ] Create override file: `worker/src/core/registry/overrides/{node-name}.ts`
- [ ] Port execution logic from legacy executor
- [ ] Ensure proper error handling
- [ ] Verify output format matches schema

### 3. Integration
- [ ] Add override to `unified-node-registry-overrides.ts`
- [ ] Update `node-execution-stubs.ts` (mark as complete)
- [ ] Remove legacy case from `execute-workflow.ts` (if applicable)

### 4. Testing
- [ ] Unit tests pass
- [ ] Integration test with sample workflow
- [ ] Verify backward compatibility
- [ ] Test edge cases

### 5. Documentation
- [ ] Update migration status in this document
- [ ] Update `ROOT_LEVEL_NODE_VERIFICATION.md`
- [ ] Add any special notes

---

## 🎯 PROGRESS TRACKING

### Current Status
- **Total Nodes:** ~80+
- **Fully Migrated:** 17 (21%)
- **In Registry (Base):** ~63+ (79%)
- **Needs Migration:** ~30+ (38%)

### Target Milestones
- **Week 1-2:** All trigger nodes migrated (8 nodes)
- **Week 3-4:** All communication + data transformation nodes (15 nodes)
- **Week 5-6:** All storage + CRM + AI nodes (14 nodes)
- **Week 7-8:** All utility + infrastructure nodes (15 nodes)

### Success Criteria
- ✅ All nodes in UnifiedNodeRegistry
- ✅ All nodes have complete context
- ✅ All nodes have accurate schemas
- ✅ Legacy executor removed
- ✅ Zero hardcoded node logic

---

## 🚀 QUICK START

1. **Choose a node** from Priority 1 (Critical)
2. **Read the legacy implementation** in `execute-workflow.ts`
3. **Copy an existing override** (e.g., `google-gmail.ts`) as template
4. **Port the logic** to the override file
5. **Register the override** in `unified-node-registry-overrides.ts`
6. **Test thoroughly** before moving to next node

---

**Last Updated:** 2024
**Status:** Ready for Migration
