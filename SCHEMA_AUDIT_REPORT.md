# Schema Completeness Audit Report

**Date:** 2026-02-28T08:32:59.047Z

**Summary:**
- Total Nodes: 126
- Complete Schemas: 0
- Incomplete Schemas: 126

## ⚠️ Incomplete Schemas

### schedule

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### webhook

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### manual_trigger

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### interval

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### chat_trigger

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### form

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### http_request

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### respond_to_webhook

**Issues:**
- Schema type mismatch: defined as "void" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### postgresql

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### supabase

**Issues:**
- Schema type mismatch: defined as "array" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### database_read

**Issues:**
- Schema type mismatch: defined as "array" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### database_write

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### google_sheets

**Issues:**
- Schema type mismatch: defined as "array" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### google_doc

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### google_gmail

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"
- NodeCapability outputType (text) doesn't match output schema (string)

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"
- Align NodeCapability.outputType with output schema

### outlook

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### salesforce

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### clickup

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### set_variable

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### javascript

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### function

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### function_item

**Issues:**
- Schema type mismatch: defined as "array" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### date_time

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### text_formatter

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### if_else

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### switch

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### merge

**Issues:**
- Schema type mismatch: defined as "array" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### error_handler

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### wait

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### delay

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### timeout

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### return

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### execute_workflow

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### try_catch

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### retry

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### parallel

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### queue_push

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### queue_consume

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### cache_get

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### cache_set

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### oauth2_auth

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### api_key_auth

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### ai_agent

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### ai_chat_model

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### ai_service

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### slack_message

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"
- NodeCapability outputType (text) doesn't match output schema (string)

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"
- Align NodeCapability.outputType with output schema

### email

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### log_output

**Issues:**
- Schema type mismatch: defined as "void" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### telegram

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### linkedin

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### twitter

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### instagram

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### youtube

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### hubspot

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### airtable

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### notion

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### zoho_crm

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### pipedrive

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### discord

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### json_parser

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### merge_data

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### edit_fields

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### error_trigger

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### workflow_trigger

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### filter

**Issues:**
- Schema type mismatch: defined as "array" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### loop

**Issues:**
- Schema type mismatch: defined as "array" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### noop

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### set

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### split_in_batches

**Issues:**
- Schema type mismatch: defined as "array" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### stop_and_error

**Issues:**
- Schema type mismatch: defined as "void" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### math

**Issues:**
- Schema type mismatch: defined as "number" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### html

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### xml

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### csv

**Issues:**
- Schema type mismatch: defined as "array" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### rename_keys

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### aggregate

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### sort

**Issues:**
- Schema type mismatch: defined as "array" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### limit

**Issues:**
- Schema type mismatch: defined as "array" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### openai_gpt

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"
- NodeCapability outputType (text) doesn't match output schema (string)

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"
- Align NodeCapability.outputType with output schema

### anthropic_claude

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"
- NodeCapability outputType (text) doesn't match output schema (string)

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"
- Align NodeCapability.outputType with output schema

### google_gemini

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"
- NodeCapability outputType (text) doesn't match output schema (string)

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"
- Align NodeCapability.outputType with output schema

### ollama

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"
- NodeCapability outputType (text) doesn't match output schema (string)

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"
- Align NodeCapability.outputType with output schema

### text_summarizer

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"
- NodeCapability outputType (text) doesn't match output schema (string)

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"
- Align NodeCapability.outputType with output schema

### sentiment_analyzer

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### chat_model

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### memory

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### tool

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### http_post

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### webhook_response

**Issues:**
- Schema type mismatch: defined as "void" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### graphql

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### google_drive

**Issues:**
- Schema type mismatch: defined as "array" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### google_calendar

**Issues:**
- Schema type mismatch: defined as "object" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### google_contacts

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### google_tasks

**Issues:**
- Schema type mismatch: defined as "array" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### google_bigquery

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### slack_webhook

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### discord_webhook

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### microsoft_teams

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### whatsapp_cloud

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### twilio

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### facebook

**Issues:**
- Schema type mismatch: defined as "string" but runtime is "undefined"

**Recommendations:**
- Update output schema in node-output-types.ts to match runtime type "undefined"

### mysql

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### mongodb

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### redis

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### freshdesk

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### intercom

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### mailchimp

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### activecampaign

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### read_binary_file

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### write_binary_file

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### aws_s3

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### dropbox

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### onedrive

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### ftp

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### sftp

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### github

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### gitlab

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### bitbucket

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### jira

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### jenkins

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### shopify

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### woocommerce

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### stripe

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### paypal

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### mail

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

### ai

**Issues:**
- No output schema defined in node-output-types.ts

**Recommendations:**
- Add output schema definition to NODE_OUTPUT_SCHEMAS

