# Execution observability contract

This document names the stable keys used during dynamic node execution so support and tooling can grep logs and node output caches consistently.

## Resolved inputs

- **Cache key:** `EXECUTION_OBSERVABILITY_KEYS.resolvedInputs(nodeId)` → `__resolved_inputs__:{nodeId}`  
- **Set in:** [`dynamic-node-executor.ts`](../src/core/execution/dynamic-node-executor.ts) (also read when attaching logs in [`execute-workflow.ts`](../src/api/execute-workflow.ts))  
- **Payload shape:** `{ fields: Record<string, unknown>, sources: Record<string, 'runtime_ai' | 'static_config'>, runtimeMarker, capturedAt }`  
- **Purpose:** Sanitized snapshot of resolved inputs for UI previews and execution detail views (secrets redacted by `sanitizeResolvedInputsForPersistence`).

## Runtime resolution audit

- **Cache key:** `EXECUTION_OBSERVABILITY_KEYS.runtimeResolutionAudit(nodeId)` → `__runtime_resolution_audit__:{nodeId}`  
- **Payload shape:** `{ runtimeMarker, nodeId, nodeType, runtimeFields, resolvedRuntimeFields, unresolvedRuntimeFields, capturedAt }`  
- **Purpose:** Fill-mode summary: which fields were `runtime_ai`, which resolved, which remained empty.

## Console prefixes

- `[DynamicExecutor]` — fill-mode resolution summary per node (`effectiveFillModes`, `runtimeFields`, `resolvedRuntimeFields`, `missingRuntimeFields`).
- Hard runtime failure when strict runtime fields are empty after resolution: message includes `Runtime input resolution failed for required field(s)`.

## Execution API

- [`execute-workflow.ts`](../src/api/execute-workflow.ts) may read `__resolved_inputs__:{nodeId}` from execution logs when building execution detail responses. Keep key format in sync with the dynamic executor.

## Severity

- **Blocking:** Missing required `runtime_ai` fields after resolution (returns `_error` / validation errors from the executor path).
- **Non-blocking:** OAuth scope warnings from credential preflight; missing optional runtime fields where not marked essential.
