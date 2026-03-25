# Omega Runtime Input Root Cause Mapping

This document classifies all known code paths that write to `node.data.config.*`.

## Allowed writes (metadata-only)

- `worker/src/services/ai/intelligent-config-filler.ts`
  - Writes `_mappingMetadata`, `_expectedInputKeys`.
  - Does not write runtime input values.

## Disallowed / legacy writes (real values or templates before runtime)

- `worker/src/services/ai/workflow-builder.ts`
  - Historically generated `{{$json.*}}` expressions for downstream runtime fields.
  - Legacy fallback paths wrote templates during required-input resolution.

- `worker/src/services/data-flow-contract-layer.ts`
  - Writes `nodeConfig[fieldName] = {{$json...}}` from observed upstream output.
  - Must stay disabled for generation path (empty-until-runtime invariant).

- `worker/src/core/execution/dynamic-node-executor.ts`
  - Runtime-only path, but used to pre-fill some text fields before validation.
  - Now gated by per-field fill modes; manual_static fields are never auto-filled.

- `worker/src/services/ai/universal-node-ai-context.ts`
  - Can write generated text into node config when invoked.
  - Must only run for allowed runtime/build-time modes.

## Why text_summarizer text could still show templates

1. Legacy template creation in `workflow-builder.ts` paths.
2. Full-question mode was not enabled everywhere, so the field wasn’t asked and stayed with legacy value.
3. Runtime in-memory merge could make AI-resolved values appear in UI even if not persisted.

## Refactor direction

- Ask all essential inputs for all nodes in full-configuration mode.
- Persist only user values + `_fillMode` choices.
- Keep runtime fields empty in stored workflow when mode is `runtime_ai`.
- Resolve runtime values only during execution from upstream JSON + intent.

