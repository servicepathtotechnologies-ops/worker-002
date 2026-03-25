# Node category audits (evidence-based)

Use the compliance matrix export as the spreadsheet source of truth.

## Generate the matrix

From `worker/`:

```bash
npm run inventory:node-compliance-matrix
```

Open `tmp/node-compliance-matrix/node-compliance-matrix-fields.csv` in Excel or Google Sheets.

## Per-category docs

| Category | Doc | CSV filter hint |
|----------|-----|-----------------|
| Triggers | [triggers.md](./triggers.md) | `nodeCategory` = trigger (or node types: `manual_trigger`, `schedule`, `webhook`, …) |
| Logic / branching | [logic-branching.md](./logic-branching.md) | `if_else`, `switch`, `merge`, … |
| HTTP / API | [http-api.md](./http-api.md) | `http_request`, `http_post`, `graphql`, `webhook`, … |
| Google Workspace | [google-workspace.md](./google-workspace.md) | `nodeType` starts with `google_` |
| Communication | [communication.md](./communication.md) | slack, discord, teams, telegram, email, outlook, … |
| AI | [ai-nodes.md](./ai-nodes.md) | `nodeCategory` = ai or types `openai_gpt`, `ollama`, … |
| Data / DB | [data-db.md](./data-db.md) | `postgresql`, `supabase`, `mysql`, `airtable`, … |
| Transform / utility | [transform-utility.md](./transform-utility.md) | `javascript`, `json_parser`, `set`, `set_variable`, … |

## Checklist (each node row)

1. **Credentials:** `credentialRequirementsCount` / `credentialProviders` match expectations; triggers typically have no credentials.
2. **Runtime AI:** Note `fillModeDefault`, `supportsRuntimeAI`, `essentialForExecution` for text-like fields; align with real send/query behavior.
3. **Upstream:** Prefer `outputSchema` / effective output in [unified-node-registry.ts](../../src/core/registry/unified-node-registry.ts) over ad-hoc docs.

## Definition of done

- Checklist tables in the category doc are filled for every node type in scope.
- `npm run validate:registry-gates` passes.
- Any fix is applied only via the unified registry (and overrides), not per-workflow patches.
