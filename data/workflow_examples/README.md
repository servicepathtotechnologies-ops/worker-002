## Canonical Workflow Examples

This directory contains **canonical, engine-aligned workflow examples** used for:

- Training datasets
- UI templates
- Agent reference patterns

Examples here are the **single source of truth** for example workflows.

### Folder structure

- `crm/` – CRM and lead management workflows
- `email/` – Email automation, notifications
- `sheets/` – Spreadsheet logging and sync
- `docs/` – Document processing and generation
- `ai/` – Chatbots, RAG, and AI-agent flows
- `webhook/` – Webhook-based pipelines and integrations
- `database/` – Database ETL, backup, and cleanup

### Canonical example schema

Each example file is a JSON object with the following shape:

```json
{
  "id": "crm_lead_capture_hubspot_v1",
  "category": "crm",
  "useCase": "lead_capture",
  "title": "Lead Capture to HubSpot",
  "description": "Capture leads from a form and create contacts in HubSpot.",
  "nodes": [
    {
      "id": "form_1",
      "type": "form_trigger",
      "config": {
        "fields": [
          { "key": "name", "label": "Name", "type": "string", "required": true },
          { "key": "email", "label": "Email", "type": "string", "required": true }
        ]
      },
      "credentials": [],
      "requiredFields": ["fields"]
    }
  ],
  "edges": [
    { "source": "form_1", "target": "hubspot_1" }
  ]
}
```

Notes:

- `type` **must** match a valid node type in the worker node library.
- `config` must follow the node's config schema.
- `credentials` lists required credential keys for that node.
- `requiredFields` lists keys that must be present in `config` for a valid example.

### How other systems reference examples

- **Training dataset** (e.g. `workflow_training_dataset.json`):
  - Each training workflow should include an `exampleId` that matches an example `id` in this folder.
  - Training records may still include natural-language descriptions, but structural details should come from these examples.

- **Worker templates** (`workflow_templates.json`):
  - Templates should map a friendly template key to an `exampleId`, title, and description.

- **Database/UI templates**:
  - UI can adapt examples by adding visual-only concerns (positions, icons) when rendering on the canvas.

### Adding a new example

1. Pick the correct subfolder (e.g. `crm/`, `ai/`).
2. Create a new JSON file named using the pattern `<category>_<useCase>_<integration>_v1.json`.
3. Follow the canonical schema above.
4. Run the validation script:

   ```bash
   node worker/scripts/validate-workflow-examples.js
   ```

5. If needed, add `exampleId` references to:
   - Training datasets
   - `workflow_templates.json`
   - Any seeding or test-workflow scripts

