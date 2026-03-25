# Provider field guidance map

Canonical doc links and notes for major integrations. Registry `docsUrl` may override per field; these are the default references used in code and guides.

## Google (Workspace / Cloud)

| Area | Official entry | Notes |
|------|----------------|-------|
| Cloud console / APIs | https://console.cloud.google.com/ | Enable APIs (Sheets, Gmail, Drive, etc.) per project |
| OAuth credentials | https://console.cloud.google.com/apis/credentials | OAuth client ID/secret, redirect URIs |
| Sheets (user) | https://docs.google.com/spreadsheets | Spreadsheet ID from `/d/{id}/` |
| Sheets API concepts | https://developers.google.com/sheets/api/guides/concepts | A1 notation, ranges |
| Docs | https://docs.google.com/document | Document ID from `/document/d/{id}/` |
| AI Studio API keys | https://aistudio.google.com/apikey | Gemini API keys |

## OpenAI / Anthropic

| Provider | Keys / console |
|----------|----------------|
| OpenAI | https://platform.openai.com/api-keys |
| Anthropic | https://console.anthropic.com/settings/keys |

## Slack

| Topic | URL |
|-------|-----|
| Apps & tokens | https://api.slack.com/apps |
| Incoming webhooks | App → Incoming Webhooks |

## Meta (Facebook / Instagram)

| Topic | URL |
|-------|-----|
| Developer apps | https://developers.facebook.com/ |
| Instagram API | https://developers.facebook.com/docs/instagram-api |

## X (Twitter)

| Topic | URL |
|-------|-----|
| Developer portal | https://developer.twitter.com/en/docs |

## Shopify

| Topic | URL |
|-------|-----|
| Admin (shop) | https://admin.shopify.com |
| Dev docs | https://shopify.dev/docs |

## SMTP / email

Users obtain host, username, and password from their provider (Google Workspace, Microsoft 365, SendGrid, etc.). Guides in the app describe generic IMAP/SMTP patterns; link provider-specific help in `docsUrl` when a node is tied to one provider.

## Databases

Host, port, database name, and password come from the DBA or cloud console (RDS, Cloud SQL, etc.). Keep examples non-production and warn against pasting production secrets into shared workflows.

## Mapping to node types

Run the inventory and enrichment pipeline:

```bash
cd worker
npm run inventory:field-guidance:write

cd ../ctrl_checks
npm install
npx tsx scripts/enrich-field-guidance-inventory.ts ../worker/tmp/field-guidance-inventory.json ../worker/tmp/field-guidance-audit-enriched.json
```

Review `enrichedFields` for `guidanceStatus` and `guidePreview` per `(nodeType, fieldName)` and update `guideGenerator.ts`, `nodeGuides.ts`, or registry `docsUrl` / `helpCategory` when provider UIs change.
