# Input field guidance governance

## Goals

- Every user-editable field has a visible, accurate "How to get it" path (registry metadata + `generateFieldGuide` + optional `nodeGuides` / `helpText`).
- Credential wizard questions align with fields that need user-supplied secrets or resource IDs (see `CREDENTIAL_QUESTION_HELP_CATEGORIES`).
- Changes are test-backed and repeatable via inventory.

## Checklist for a new node or new field

1. **Registry** – Field appears in `unified-node-registry` / node library with correct `inputSchema`; `inferFieldHelpMetadata` or explicit metadata sets `helpCategory`, and `docsUrl` / `exampleValue` when useful.
2. **Category** – `helpCategory` is listed in [`FIELD_HELP_CATEGORY_REFERENCE.md`](./FIELD_HELP_CATEGORY_REFERENCE.md) and handled in `guideFromRegistryHelpCategory()`.
3. **Copy** – Steps are concrete (where to click, what to copy), not only a single link.
4. **UI** – If the node uses a custom settings component (e.g. Google Sheets), each control passes `helpCategory` / `docsUrl` / `helpText` into `InputGuideLink` where the generic PropertiesPanel path is bypassed.
5. **Tests** – Add a worker test for credential questions if the field is credential-like; add or extend a frontend `generateFieldGuide` test for new categories or high-risk providers.

## Automation

| Script | Purpose |
|--------|---------|
| `worker`: `npm run inventory:field-guidance` | Console sample of unified inventory |
| `worker`: `npm run inventory:field-guidance:write` | Writes `worker/tmp/field-guidance-inventory.json` |
| `ctrl_checks`: `npx tsx scripts/enrich-field-guidance-inventory.ts <in.json> [out.json]` | Adds `guidePreview`, `guidanceStatus`, audit flags |

## UX consistency (PropertiesPanel vs custom panels)

- **PropertiesPanel** – Renders `InputGuideLink` with registry-backed `helpCategory` from schema conversion for most types.
- **GoogleSheetsSettings** – Uses `InputGuideLink` per field with explicit `helpCategory` / `helpText` where the schema-driven panel is not used.
- **FormNodeSettings** – Uses `InputGuideLink` on form builder fields.
- **ScheduleTrigger** – Built-in cron help dialog (no `InputGuideLink` required); ensure cron copy stays in sync with `generateCronGuide` where both exist.

## Release routine

1. Run `inventory:field-guidance:write` and enrichment to `worker/tmp/field-guidance-audit-enriched.json`.
2. Filter `guidanceStatus !== "ok"` and `auditFlags.needsRegistryCategory`.
3. Triage: registry tweak vs guide text vs provider doc URL update.
4. Run `npm test` in worker (including inventory test) and `npm test` in `ctrl_checks` (guide registry tests).
