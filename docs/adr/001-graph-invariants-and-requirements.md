# ADR 001: Graph invariants and traceability (R1–R6)

## Status

Accepted — implementation references below.

## Context

Workflow graphs must stay structurally valid through orchestration, reconciliation, planning, and execution. This ADR records **traceable requirements** (R1–R6) and links them to automated verification.

## Requirements

| ID | Requirement | Primary implementation | Tests / verification |
|----|-------------|------------------------|----------------------|
| R1 | Valid DAG from a single trigger; no orphan required nodes | `unified-graph-orchestrator.ts`, `edge-reconciliation-engine.ts` | `validateWorkflow`; `edge-reconciliation-branching.test.ts`; `unified-graph-orchestrator-branching.test.ts` |
| R2 | Branching ports consistent with registry (`true`/`false`, `case_n`, semantic labels) | Registry `isBranching` / `getOutgoingPortsForWorkflowNode`; reconciliation | `unified-graph-orchestrator-branching.test.ts`; `workflow-graph-correctness-preservation.test.ts` |
| R3 | Switch runtime: one winning branch per evaluation | `switch-branch-router.ts`; `unified-execution-engine.ts`; `execute-workflow.ts`; `distributed-orchestrator.ts` | `switch-branch-router.test.ts` |
| R4 | Plan switch: N planned cases need enough downstream actions (non–`log_output` after `switch`) | `switch-case-node-mapping.ts`; `plan-chain-guards.ts` (`switch_downstream_actions_insufficient`) | `plan-chain-guards-switch.test.ts` |
| R5 | No ad-hoc `workflow.edges` mutation in feature code | Orchestrator-only mutations (see `.cursor/rules/unified-graph-orchestrator-edge-ownership.mdc`) | Code review; `EDGE_MUTATION_POLICY.md` |
| R6 | Node contracts and execution via `UnifiedNodeRegistry` | `unified-node-registry.ts`; `dynamic-node-executor.ts`; `legacy-node-output-normalize.ts` (incremental unwrap helper from legacy executor) | `tier1-runtime-credentials-matrix.test.ts`; `legacy-executor-registry-characterization.test.ts`; `legacy-node-output-normalize.test.ts` |

## Optional product track (Phase E)

- **Structured LLM single plan**: when `ENABLE_STRUCTURAL_LLM_SINGLE_PLAN=true`, `summarize-layer.ts` may propose `proposedNodeChain` via Gemini; output is **canonicalized** and must pass `plan-chain-guards` before use. On failure the pipeline **falls back** to the deterministic chain builder. This does not relax R1–R6.

## Edge / switch contracts (design baseline)

- **Edge handle precedence**: `sourceHandle` is preferred over `type` when resolving branch labels (see `switch-branch-router` `handle()`).
- **Switch evaluation**: `matchedCase` and optional `expressionValue` bind to edges via `branchName`, `sourceIndex`, `case_N` index, `isDefault`, then stable last-edge fallback.
- **Reconciliation**: After `reconcileWorkflow`, structural validation is merged into the orchestrator result so callers observe reconciliation **and** graph invariant errors together.

## Links

- [ARCHITECTURE.md](../../../ARCHITECTURE.md) — stages 5–8
- [EDGE_MUTATION_POLICY.md](../EDGE_MUTATION_POLICY.md)
