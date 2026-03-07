# FixAgent MVP

FixAgent is a post-generation auto-fix service that runs **after**
`workflowLifecycleManager.generateWorkflowGraph()` in `/api/generate-workflow`.
It analyzes the generated workflow, applies a small set of deterministic fixes,
and returns an updated workflow plus an audit trail.

## What FixAgent does

FixAgent performs three main tasks:

1. **Diagnostic analysis**
   - Ingests structural validation from `workflowValidator.validateAndFix(...)`.
   - Ingests credential discovery from `credentialDiscoveryPhase.discoverCredentials(...)` (or from the lifecycle manager result).
   - Optionally performs a **best-effort dry-run** of upstream nodes using the
     dynamic node executor and `LRUNodeOutputsCache` to collect sample JSON.

2. **Auto-fix rules (MVP)**
   - **Credential auto-inject**
     - Uses `satisfiedCredentials` from credential discovery to auto-inject a
       non-secret `credentialId` reference into node configs (e.g. Gmail) when
       the OAuth credential is already satisfied in the vault.
   - **`if_else` normalization & expression correction**
     - Normalizes legacy `config.condition` into `config.conditions` array.
     - Ensures `conditions` is always an array.
     - Wraps bare expressions like `$json.field` into `{{...}}` template form.
   - **Template key rewrite**
     - Scans config strings containing `{{...}}` templates.
     - Uses keys observed from dry-run JSON to rewrite obviously wrong paths
       (simple exact / suffix / substring heuristics).

3. **Confidence engine**
   - Computes an overall confidence score based on:
     - Post-fix validation result (no critical/high errors → high score).
     - Ratio of applied fixes vs total fix attempts (proxy for dry-run quality).
     - Optional memory bonus from previous fix records.

The score is returned as `fixConfidence` alongside a per-fix `fixAudit` array
from `/api/generate-workflow`.

## API integration

FixAgent is wired into `worker/src/api/generate-workflow.ts`:

- **Streaming mode (`x-stream-progress: true`)**
  - After `workflowLifecycleManager.generateWorkflowGraph(...)` completes,
    the API sends a progress event with:

    ```json
    {
      "step": 6,
      "step_name": "FixAgent Processing",
      "details": {
        "status": "processing",
        "etaSeconds": 10
      }
    }
    ```

  - When FixAgent finishes, the final event includes:
    - `workflow` (possibly modified)
    - `validation` (post-fix)
    - `fixAudit`
    - `fixConfidence`

- **Non‑streaming mode**
  - `generate-workflow` calls `fixAgent.runAutoFix(...)` synchronously
    (bounded by `maxRuntimeMs`).
  - The JSON response adds:
    - `fixAudit`: list of applied/suggested fixes.
    - `fixConfidence`: overall confidence score (0–1).

> Existing response fields and behavior remain unchanged, except for the optional
> presence of `fixAudit` and `fixConfidence`. This satisfies the constraint of
> not breaking external APIs while exposing a soft `"processing"` state in
> streaming mode.

## Configuration

FixAgent can be configured via `FixAgentConfig`:

- `maxRuntimeMs` (default: `30000`)
  - Upper bound on how long FixAgent is allowed to run per request.
- `autoApplyThreshold` (default: `0.75`) *(reserved for future use)*
- `suggestLowerThreshold` (default: `0.5`) *(reserved for future use)*

In `/api/generate-workflow` we currently use:

```ts
fixAgent.runAutoFix({
  workflow: lifecycleWorkflow,
  lifecycleValidation,
  lifecycleCredentials: lifecycleResult.requiredCredentials,
  userId,
  config: { maxRuntimeMs: 30_000 },
});
```

To **opt‑out** of FixAgent for certain calls, you can pass a very low
`maxRuntimeMs` (e.g. `1`) or add a flag in the request body and branch before
calling `fixAgent.runAutoFix(...)`.

## Persistence / Agent memory

The MVP implementation focuses on in‑memory confidence and audit only. It is
designed so a future `AgentMemoryStore` (e.g. Postgres table
`fixes(id, workflowId, diff, confidence, createdAt)`) can be wired into
`FixAgent.runAutoFix` without changing its external signature:

- You can persist each `FixAuditEntry` plus an optional diff of changes.
- You can feed previous fix confidences back via the `previousFixes` parameter
  to influence the memory bonus in the confidence engine.

## Notes and constraints

- FixAgent respects the `maxRuntimeMs` budget; if the budget is exceeded during
  diagnostics or auto‑fix, it returns the best‑effort workflow and validation
  without further processing.
- It never logs raw OAuth tokens; credential auto‑inject only works with
  non‑secret references (e.g. `vaultKey` / `credentialId`) already exposed by
  the credential discovery phase.
- All node‑specific behavior (execution, config schema, template resolution)
  still flows through the Unified Node Registry and existing execution engine;
  FixAgent operates only on workflow graphs and node configs, not on the
  execution core itself.

