# Field help category reference

Single source of type-level categories: [`src/core/utils/field-help-metadata.ts`](../src/core/utils/field-help-metadata.ts) (`FIELD_HELP_CATEGORIES`, `CREDENTIAL_QUESTION_HELP_CATEGORIES`).

## Credential wizard (`credentials_only` questions)

When `helpCategory` is in `CREDENTIAL_QUESTION_HELP_CATEGORIES`, the field is a candidate for user prompts in credential-collection mode (subject to fill-mode and generator rules). Webhook, callback, and redirect URLs are **excluded** from that set so users configure them on the node, not as vault-style wizard prompts.

## UI guide mapping

Each category should resolve through [`ctrl_checks/src/components/workflow/guideGenerator.ts`](../../ctrl_checks/src/components/workflow/guideGenerator.ts) `guideFromRegistryHelpCategory()` to a `FieldGuide` with a clear title, multiple steps, optional `url`, `example`, and `securityWarning` for secrets.

| Category | Typical use | Guide behavior |
|----------|-------------|----------------|
| `api_key` | Provider REST/AI keys | Provider-aware API key steps + optional `docsUrl` |
| `oauth_token`, `refresh_token`, `generic_token`, `bearer_token` | OAuth / long-lived tokens | Token guide; merge registry `docsUrl` |
| `client_id`, `client_secret` | OAuth clients | Google-specific or generic credential guide |
| `credential_id` | Workspace-stored connection | Connect / pick connection steps |
| `webhook_secret` | HMAC / signing secrets | Credential-style warning |
| `base_url`, `api_endpoint` | HTTP base and paths | URL / endpoint guide |
| `webhook_url`, `callback_url`, `redirect_url` | Inbound hooks / OAuth URLs | Webhook or OAuth redirect guides |
| `spreadsheet_id`, `document_id` | Google file IDs | ID extraction from URL |
| `sheet_name` | Tab name (Sheets) or other apps | Google Sheets tab guide when `nodeType` is `google_sheets` |
| `calendar_id`, `table_id`, `base_id` | Calendars, Airtable, etc. | Generic resource ID/name steps |
| `page_id`, `account_id` | Social Graph IDs | Node-family specific guides where implemented |
| `shop_domain` | Shopify store | Shop domain guide |
| `smtp_*`, `host`, `port`, `database_name`, `db_password` | Email / DB | SMTP or DB guides |
| `private_key`, `consumer_key`, `consumer_secret`, `generic_credential` | Assorted secrets | Generic credential guide |
| `email_address`, `phone_number` | Contact fields | Email / phone guides |
| `cron_expression` | Schedules | Cron guide |
| `json_payload` | Structured body | JSON guide |
| `expression`, `condition` | Logic / templates | Expression guide |
| `prompt_text` | LLM prompts | Prompt guide |
| `resource_select`, `operation_select` | Dropdowns | How to choose resource / operation |
| `none` | No special category | Falls back to name heuristics in `generateFieldGuide` |

## Adding a category

1. Append to `FIELD_HELP_CATEGORIES` and decide if it belongs in `CREDENTIAL_QUESTION_HELP_CATEGORIES`.
2. Extend `inferFieldHelpMetadata()` if the field can be inferred from name/type.
3. Add a `case` in `guideFromRegistryHelpCategory()` (no orphan categories).
4. Add a row to this table and a short test in worker + frontend guide tests where meaningful.
