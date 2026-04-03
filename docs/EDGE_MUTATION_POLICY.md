# Edge mutation policy (Appendix C)

Structural edges must be created or repaired through `unifiedGraphOrchestrator` and `edgeReconciliationEngine` only.

## Known exceptions (technical debt)

| Location | Pattern | Mitigation |
|----------|---------|------------|
| `workflow-graph-sanitizer.ts` | `workflow.edges.push` | Run `reconcileWorkflow` after sanitize when changing connectivity |
| `workflow-policy-enforcer-v2.ts` | `push` / filter | Prefer orchestrator `removeEdges` + `reconcileWorkflow` in future refactors |
| `workflow-builder.ts` | `workflow.edges =` (dedup) | Dedup is structural cleanup; follow with orchestrator validation |

Do **not** add new `workflow.edges.push` in feature code without an orchestrator path.

## Agent transcript persistence

If persisting `WorkflowAgentTranscript`, gate with `ENABLE_AGENT_TRANSCRIPT_PERSISTENCE` (env) and avoid storing raw secrets or full user prompts unless explicitly required.
