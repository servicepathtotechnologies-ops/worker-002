## Smart Planner–Driven Workflow Orchestration (Backend)

This backend adds a **planner-driven** API that turns natural language prompts into **deterministic workflow graphs** using your existing **Ollama (Llama / Qwen)** setup.

- **AI decides WHAT**: a Planner Agent (via Ollama) outputs a strict `WorkflowSpec` JSON.
- **System decides HOW**: deterministic code resolves spec → nodes → workflow graph.
- **No keyword-based node creation**: all nodes come from the structured spec.

---

## Key Files

- `src/preprocessor.ts` – prompt normalization (abbreviations, filler removal, verb standardization).
- `src/planner/types.ts` – `WorkflowSpec` and planner-related types.
- `src/planner/plannerAgent.ts` – calls Ollama chat with a strict system prompt and parses JSON spec.
- `src/validator/specValidator.ts` – validates planner output.
- `src/resolver/nodeResolver.ts` – maps `WorkflowSpec` → deterministic node list.
- `src/builder/graphBuilder.ts` – builds a simple linear workflow graph (nodes + connections).
- `src/credentials/credentialManager.ts` – in-memory credential vault + missing-credential questions.
- `src/questions/questionEngine.ts` – basic field-level question plan per node type/operation.
- `src/validation/autoRepair.ts` – basic validation/auto-repair hook (placeholder for richer logic).
- `src/orchestrator.ts` – orchestrates the entire flow for a session.
- `src/api/smart-planner.ts` – HTTP handlers for the Smart Planner endpoints.

The Express entrypoint `src/index.ts` wires the new API routes:

- `POST /api/generate`
- `POST /api/answer`
- `GET  /api/workflow/:sessionId`

---

## API Overview

### 1. `POST /api/generate`

Start a new planner session from a natural language prompt.

**Request body**

```json
{
  "prompt": "Extract the Gmail in sheet and create contact in HubSpot."
}
```

**Response (shape)**

```json
{
  "sessionId": "session_...",
  "status": "pending | needs_clarification | awaiting_answers | ready",
  "spec": { /* WorkflowSpec from planner */ },
  "clarifications": [],
  "credentialQuestions": [],
  "fieldQuestions": [],
  "repairs": [],
  "graph": {
    "nodes": [],
    "connections": []
  }
}
```

Notes:
- If the planner returns non-empty `clarifications`, `status` will be `needs_clarification` and graph building is deferred.
- Otherwise the system deterministically resolves nodes, builds the graph, and computes credential/field questions.

---

### 2. `POST /api/answer`

Submit answers for credentials (and later clarifications / field mappings).

**Request body (current demo support)**

```json
{
  "sessionId": "session_...",
  "credentials": [
    {
      "provider": "google_sheets",
      "data": {
        "oauth_token": "xyz"
      }
    }
  ]
}
```

**Response**

Same shape as `POST /api/generate`, but with the latest session view.

---

### 3. `GET /api/workflow/:sessionId`

Fetch the current (or final) workflow graph and spec for a session.

**Example**

```bash
curl "http://localhost:3000/api/workflow/session_123"
```

**Response**

```json
{
  "sessionId": "session_123",
  "status": "ready",
  "graph": {
    "nodes": [ /* WorkflowNode[] */ ],
    "connections": [ /* WorkflowConnection[] */ ]
  },
  "spec": { /* WorkflowSpec */ },
  "repairs": []
}
```

---

## Example `curl` Commands

Replace `http://localhost:3000` with your worker base URL/port.

### Clear Sheets → HubSpot Intent

```bash
curl -X POST "http://localhost:3000/api/generate" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Get emails from Google Sheets and create contact in HubSpot."}'
```

You should see:
- `spec.data_sources` includes `"google_sheets"`.
- `spec.actions` includes `"hubspot.create_contact"`.
- `spec.clarifications` is an empty array.

### Ambiguous Source

```bash
curl -X POST "http://localhost:3000/api/generate" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Get emails and store in CRM"}'
```

You should see:
- `spec.clarifications` contains a question like  
  `"Should we read emails directly from Gmail, or from Google Sheets, or from another source?"`
- `status` is likely `"needs_clarification"`.

### Gmail Over-Generation Test

```bash
curl -X POST "http://localhost:3000/api/generate" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Extract the Gmail in sheet and create contact in HubSpot."}'
```

You should see:
- `spec.data_sources` includes `"google_sheets"`.
- `spec.mentioned_only` includes `"google_gmail"`.
- No node of type `"google_gmail"` is created in `graph.nodes`.

---

## Running Tests

The repo already uses Jest. To run the new Smart Planner integration test:

```bash
cd worker
npm test -- smart-planner.integration.test.ts
```

The test performs a simple `POST /api/generate` call and asserts that Sheets → HubSpot is recognized correctly.

