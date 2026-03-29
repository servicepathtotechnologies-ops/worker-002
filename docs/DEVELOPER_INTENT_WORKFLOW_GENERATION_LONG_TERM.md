# Developer intent: intention, questions, and workflow generation (long-term)

This document is written for engineers who will own **intent → graph → execution** for years. It is **normative** (what the system should converge toward), not a changelog of “where we are today.” It complements `.cursor/rules` on the unified registry and graph orchestrator.

---

## Top explanation: what we are building

**User-facing promise:** Natural language becomes a **valid, runnable workflow** whose structure matches what the user actually meant—not a pretty diagram that ignores credentials, branching rules, or field semantics.

**Engineering promise:** Every behavior that depends on *what a node is* lives in **one place** (`unified-node-registry.ts` and related contracts). Every behavior that depends on *how nodes connect* lives in the **unified graph orchestrator** layer. Intent and summarization **steer** generation; they do not **replace** registry truth or edge reconciliation.

**Three planes of truth (do not collapse them):**

1. **User content plane** — Raw prompt, answers to clarifying questions, selected variation text, attachments. Unstructured or semi-structured; may contain noise, PII, and domain jargon.

2. **Intent plane** — Structured or expanded representations (`StructuredIntent`, `ExpandedIntent`, `WorkflowIntentPlan`, `PipelineContext`) that say *what should happen* in product terms: triggers, integrations, branches, terminals, missing fields.

3. **Workflow plane** — The **only** executable artifact: nodes + edges validated against registry and orchestrator invariants. If it is not in the graph with valid edges, it does not exist at runtime.

AI that “describes” a workflow without producing graph JSON through the pipeline is **content**, not **contract**. The product must treat pipeline success and `validateWorkflow` as the gate for “real intention implemented at workflow level.”

---

## System map (where code should live)

| Concern | Primary home | Notes |
|--------|----------------|------|
| Extracting structured intent from prompt | `intent-structurer`, `workflow-pipeline-orchestrator` | Feeds `PipelineContext.structured_intent` |
| Low-confidence expansion / confirmation | `intent-auto-expander`, `intent-confidence-scorer`, `workflow-confirmation-manager` | Drives `expanded_intent`, `requires_confirmation` |
| Clarification questions | Pipeline context + API phases (`generate-workflow.ts`, phased refine) | Questions refine **intent**; answers merge back into prompt / plan |
| Single-plan / variations / structured summary | `summarize-layer.ts` (`AIIntentClarifier`) | Produces `WorkflowIntentPlan`, `clarifiedIntent`, keyword paths |
| Compiling DSL or AI output into a graph | `workflow-dsl-compiler`, lifecycle `generateWorkflowWithNewPipeline` | Must call `initializeWorkflow` / orchestrator—no manual `edges.push` |
| Per-node field semantics (fill mode, ownership) | `unified-node-registry` + `registry-structural-fill-contract.ts` | **Planner-facing** “configuration contract” text is generated from registry |
| Separating user fields from boilerplate in intent text | `intent-extraction.ts` (`sanitizeIntentTextForFormFieldExtraction`, etc.) | Prevents doc fragments from becoming fake form keys |
| Edge creation and repair | `unified-graph-orchestrator`, `edge-reconciliation-engine`, `execution-order-manager` | Single source of truth for edges |
| Execution | `dynamic-node-executor` + registry `execute()` | No `switch (node.type)` in API routes |

---

## Branch: Intent — developer contract (~300 lines)

This section is the **branch header** for all intent-related work: naming, data shapes, boundaries, and long-term invariants. Treat it as the README for any PR that touches summarization, pipeline context, or “AI said X.”

### I1. Definition: “intention” in this codebase

**Intention** is not the user’s original string. It is the **best faithful reduction** of that string into:

- A **structured intent object** (goals, entities, triggers, operations, constraints).
- Optionally an **expanded intent** when confidence is low or ambiguity is high.
- A **pipeline context** that records confidence, missing fields, clarification questions, and whether human confirmation is required.

Intention is **input** to structure builders and policies. It is **invalid** as a substitute for:

- Registry `inputSchema` / `outputSchema`
- Orchestrator-derived edges
- Runtime credential resolution

If a feature “implements intention” only in natural language returned to the UI, it has **not** implemented intention at the workflow level.

### I2. Intention vs content analyzer (contract vs narrative)

The system must continually separate:

- **Contractual content** — Things that must become node config, graph shape, or credentials. Examples: “branch on status,” “send email on failure,” “read Sheet X.”
- **Narrative / educational content** — Explanations, marketing copy, repeated boilerplate from templates (“Planner rules,” “Configuration contract,” execution-line labels).

**Content analyzers** (explicit sanitizers, validators, and structured parsers) exist so that **downstream consumers do not mistake template text for user data**. Example: `sanitizeIntentTextForFormFieldExtraction` strips sections that start with registry fill-contract headers so form field discovery does not invent keys from “Semantics (universal)” lines.

Long-term rule: **Any new prompt fragment injected into the model** (structural fill contract, branching rules, terminal policy) must be:

1. Generated from registry or shared builders—not hand-copied per node.
2. Stripped or ignored by any module that extracts **user** fields from **combined** text (intent extraction, form identity).

Failure mode to prevent: **Contract leakage** — user-visible “intention” strings that are actually half registry documentation. That breaks trust and breaks parsers.

### I3. Questions and phased refinement

**Questions** are a **control mechanism** for the intent plane, not a separate product.

- They exist because **structured intent** or **confidence** indicates missing or conflicting information.
- Answers map to: merged prompt text, mandatory node lists, registry tags, blocked node types, or explicit selections from variations.

Long-term behavior:

- **Questions should narrow the search space** for node types and operations, not contradict registry capabilities.
- **Answers should be idempotent**: Re-applying the same answers to the same base prompt should yield the same structured intent class (modulo harmless wording).
- **Credential questions** are special: they must flow through `attach-credentials` / vault semantics, not be invented as plain text in configs.

Anti-pattern: Unlimited clarification loops without updating `PipelineContext.missing_fields` or registry-backed requirements. That is chat, not workflow engineering.

### I4. JSON creation vs text: what the AI returns

The platform consumes **multiple modalities** from models:

| Output type | Role | Consumption |
|-------------|------|-------------|
| Strict JSON (plan, variations, structured summary) | Machine-parseable **intent artifacts** | Parsed, validated, merged into pipeline context |
| JSON + prose (mixed responses) | Risky | Parsers must extract JSON; prose is UX-only |
| Pure prose (documentation, explanations) | Human layer | Must not silently become node config |

Long-term mandate:

- **Structure builders** should consume **validated JSON** or **registry-normalized types**, not ambiguous prose.
- **Prose** is for `documentation`, `workflowExplanation`, UI cards—not for silently filling `node.data.config`.

“Engineering AI” in product terms means: **models assist** in proposing structure and defaults; **the pipeline + registry** decide what is allowed. The AI does not bypass validation.

### I5. Pre-built workflows and user-specific intent

“Pre-built” templates (samples, demos, internal examples) are **shortcuts through the same invariants**, not exceptions.

- A pre-built graph must still pass `validateWorkflow` after any user-parameter injection.
- User intent overlays (e.g., “use my sheet”) must map to **config deltas** and **credential slots**, not ad-hoc new edges in feature code.

Long-term: Template libraries should be **versioned** with the same schema migrations as live workflows (`applyMigrations` in registry).

### I6. WorkflowIntentPlan and structured summary

`summarize-layer` produces plans that tie together:

- `structuredSummary` — Human-readable but **should align** with the node chain the system will try to realize.
- Proposed node chains, variations, and keyword alignment.

Developer intent:

- **Structured summary is not the workflow.** It is a **commitment surface** for the user (“this is what we think you want”).
- **Graph compilation** may not assume every phrase in `structuredSummary` is already a valid node id; normalization and registry lookup are mandatory.
- Branching narratives must respect **orchestrator rules**: one trigger, valid branch ports, terminals (e.g., per-branch `log_output` where policy requires).

### I7. Pipeline stages (mental model)

1. **Prompt in** (possibly with selected structured prompt, mandatory nodes, tags).
2. **Intent structuring** → `StructuredIntent`.
3. **Completeness / confidence** → expand, score, optionally ask questions.
4. **Structure build** → intermediate nodes/connections (still not the final truth until orchestrator runs).
5. **Credential detection / injection** — from registry-driven requirements, not string guessing.
6. **Policy + validation** — minimal path, safety nodes, AI validator as last guard.
7. **Graph finalization** — `initializeWorkflow` / `injectNode` / `reconcileWorkflow` as appropriate.

Any step that skips ahead to “pretty JSON” without step 6–7 is **technical debt**, not a shortcut.

### I8. Expanded intent and confirmation

`ExpandedIntent` exists to capture **refined** intent when the first pass is incomplete. Long-term:

- Expansion **must** update the same fields the structurer would have populated had the user been clearer—no parallel unofficial schema.
- `requires_confirmation` should gate **execution or save**, not be a decorative flag.

### I9. Registry: where “developer intent” becomes code

When you implement a **universal** behavior, you implement it in the **registry**:

- `inputSchema` fields with `ownership`, `fillMode`, `role` — drive `buildRegistryStructuralFillContractSection`.
- `defaultConfig()` — what AI may assume when hydrating `{ type: "nodeName" }`.
- `execute()` — resolves templates via universal template resolver, then legacy executor.
- `migrations` — old workflows upgrade without one-off scripts in the API layer.

**Forbidden long-term:** New `if (node.type === 'foo')` in `execute-workflow`, `workflow-builder`, or validators for behavior that belongs in the registry.

### I10. Intent extraction and forms

`intent-extraction.ts` is the **boundary** between:

- User-submitted field labels and values.
- Registry noise, execution slugs, and doc keys.

Rules encoded there (placeholder ids, boilerplate key detection, execution line slugs) are **security and correctness** rules: they prevent accidental PII routing and garbage keys.

Long-term: Adding a new trigger or form-like node **updates registry definitions first**; extraction logic stays **generic** (ownership, roles), not a new hardcoded list for each integration.

### I11. Branching and intent

Branching intent (“if revenue &gt; X,” “switch on region”) must compile to:

- Registry-correct `if_else` / `switch` configs (structural ownership).
- Orchestrator-valid edges (`true` / `false` / `case_n`).
- Merge when reconvergence is required by policy.

Intent text that says “optional branch” without a merge plan is **incomplete intent**—the pipeline should either expand, question, or fail validation; it should not emit an invalid DAG.

### I12. Observability and debugging

Long-term, every generation should be debuggable from:

- `PipelineContext` (confidence, missing fields, questions).
- `PipelineAnalysis` (origin sample vs scratch, missing nodes).
- Orchestrator validation messages.

“Black box AI” debugging is unacceptable at scale—**structured artifacts** are the audit trail.

### I13. Internationalization and intent

User prompts may be non-English. Structured intent and node types remain **canonical English keys** internally.

Long-term: Keyword collectors and Gemini-first selection must **normalize** to registry types; do not fork graph logic per locale.

### I14. Security-minded intent

Intent must never:

- Exfiltrate secrets into prompts logged at info level.
- Encode credentials in `expandedIntent` prose.

Registry `credentialSchema` + attach-credentials flows are the **only** durable pattern.

### I15. Testing philosophy

Tests should prove:

- **Intent → graph** for representative prompts passes `validateWorkflow`.
- **Sanitizers** strip known boilerplate; fixtures for leaked contract text.
- **Registry fill contract** includes required structural fields for branching nodes when those nodes appear in the plan.

Avoid snapshot-testing giant prose; snapshot **JSON shapes** and **graph invariants**.

### I16. Failure modes catalog (intent layer)

| Failure | Symptom | Long-term fix direction |
|---------|---------|-------------------------|
| Contract leakage | Form keys from “Planner rules” | Stronger sanitization; never concatenate unbounded contract into `generatedFrom` without delimiters |
| Confidence inflation | High score, broken graph | Tie confidence to structural validation signals |
| Orphan nodes | AI adds node, no edge | Orchestrator-only edge creation; repair passes |
| Wrong terminal | Multiple logs against policy | Policy + registry terminal tags |
| Drift | Two code paths parse same prompt | Single structurer + single normalization service |

### I17. API layer responsibilities

`generate-workflow.ts` and related handlers:

- **Route** phases (analyze, clarify, build, refine).
- **Attach** HTTP-level fields (`mandatoryNodeTypes`, `registryTags`, `selectedStructuredPrompt`).
- **Must not** embed business rules about specific integrations—delegate to pipeline and registry.

### I18. Future: intent versioning

As the product grows, introduce explicit **intent schema versions** in `PipelineContext` so old clients can be migrated. Co-evolve with registry migrations.

### I19. Future: collaborative editing

Multi-user edits to the same workflow require **graph-level** conflict resolution, not text-merge on `structuredSummary`. The workflow JSON is the document.

### I20. Alignment with “deterministic DAG compiler” rule

AI layers may propose; **compiler rules** (linear by default, controlled branching, merge rules) **reject** invalid graphs. Developer intent: never soften DAG rules in the model prompt to “make it work”—fix the proposal or the compiler, not the invariants.

### I21. Single summary sentence for PR reviews

**If it changes how we understand what the user wants, it belongs in intent + pipeline context; if it changes what nodes can do, it belongs in the registry; if it changes how nodes connect, it belongs in the orchestrator.**

### I22. `clarifiedIntent` vs `selectedStructuredPrompt`

Both carry “cleaner” text than the raw prompt, but **roles differ**:

- **`clarifiedIntent`** — Output of the summarizer when it rewrites the user message with matched keywords and required nodes. Good for **continuing** analysis when no formal plan JSON exists yet.
- **`selectedStructuredPrompt`** — The user (or UI) picked a **specific variation** or plan body. It should be treated as **authoritative narrative** for generation when present.

Long-term: Handlers should prefer `selectedStructuredPrompt` over ad-hoc string concatenation so intent does not fork between API routes.

### I23. `PipelineAnalysis` vs `pipelineContext`

- **`PipelineAnalysis`** — Snapshot for UX/debug: structured prompt, nodes/connections from structure phase, missing nodes. Helps answer “what did we think before compile?”
- **`PipelineContext`** — Live state: confidence, expansion, questions, missing fields.

Do not use them interchangeably in new code; extend the right one when adding fields.

### I24. Confidence scores must connect to structure

A number in isolation is meaningless. Long-term direction:

- Correlate confidence drops with **specific** `missing_fields` or validation failures.
- When the graph fails `validateWorkflow`, surface that as a **first-class** reason to re-run intent or block save—not only a low score.

### I25. Gemini-first vs keyword paths

`AIIntentClarifier` may select nodes via Gemini or alias keywords. **Both** must normalize to **registry type strings** via shared normalizers. Divergence in spelling (`google_gmail` vs `gmail`) is a **normalization bug**, not two valid worlds.

### I26. Mandatory nodes and registry tags

HTTP-level `mandatoryNodeTypes` and `registryTags` exist to **constrain** search and generation after user choices (variations, analyze mode). They are **intent overrides** from product UX, not replacements for registry validation.

Rules:

- Overrides must still produce a **valid** graph under orchestrator rules.
- If an override is impossible (unsupported combination), fail with a **registry-backed** message, not silent node drop.

### I27. Phased refine: end-to-end mental model

```
User prompt → (optional) summarize / plan card → user confirms or edits
    → answers merged → enhanced prompt → lifecycle generates graph
    → validate → return workflow + explanations
```

Answers that are **not** credentials should feed **prompt assembly**; credentials feed **vault attach**. Mixing these causes “filled in text but not in execution” bugs.

### I28. Analyze mode vs build mode

**Analyze** prioritizes understanding and plan surfaces; **build** prioritizes materializing `Workflow`. Shared code paths should still run the **same** validation at the end. Analyze-only responses may omit execution but must not emit **invalid** partial graphs as if they were final.

### I29. `expandedIntent` and fallback detection

Lifecycle and API attach `expandedIntent` to errors when pipeline success is ambiguous. Long-term: any consumer of fallback must treat **expanded** text as **unconfirmed** until user confirmation state transitions—do not auto-execute.

### I30. Documentation strings vs executable docs

`documentation` fields returned to clients explain **what** the workflow does. They must **not** be parsed for structure. If you need structure, put it in JSON fields consumed by the pipeline.

### I31. WorkflowCompiler vs lifecycle pipeline

`WorkflowCompiler` (intent → plan → compile) is a **distinct layering** path from lifecycle’s pipeline orchestrator. When adding features, decide whether the feature is:

- A **compiler step** (education, demos), or
- A **production pipeline** step (credentials, policy, orchestrator).

Avoid duplicating intent extraction logic; **share** `intentEngine` / structurer primitives.

### I32. Content classification (future-hardening)

Ideal pipeline: classify incoming blobs as `user_goal`, `integration_name`, `schedule_hint`, `credential_reference`, `noise`. Today we approximate via structurer + keywords + sanitizers. Long-term modules should **reuse** the same classification outputs for form extraction and summarization.

### I33. Rate limits and partial failure

When LLM calls fail mid-pipeline, preserve:

- Last known `StructuredIntent` or cached variation list if safe.
- Explicit error to UI—**do not** silently fall back to a different intent path without logging.

### I34. Privacy and retention

Structured prompts and answers may contain PII. Logging policy: log **hashes or lengths** of prompts at info level; full text only behind debug flags or dedicated secure sinks.

### I35. Extensibility: new integration checklist (intent side)

1. Registry node definition complete (schemas, credentials, execute).
2. Keywords / Gemini prompts updated only through **shared** discovery mechanisms—no orphan string in one file.
3. Summarize layer prompts reference **capabilities**, not hardcoded marketing names, where possible.
4. Add one **golden path** test: prompt → graph → `validateWorkflow`.

### I36. Glossary (intent domain)

| Term | Meaning |
|------|---------|
| **User content** | Raw text the human typed or pasted; may include noise. |
| **Contract text** | Registry-generated fragments (fill contract, semantics); must not be mistaken for user data keys. |
| **Structured intent** | Parsed object describing goals and entities for compilation. |
| **Expanded intent** | Enriched/clarified intent object when confidence is insufficient. |
| **Workflow plane** | Executable DAG after orchestrator validation. |
| **Clarification** | Questions + answers that refine the intent plane before compile. |
| **Pre-built** | Template/sample workflow parameterized for users—same invariants as custom. |

### I37. Reference flow A — happy path (linear)

```
manual_trigger → google_sheets → ai_chat_model → google_gmail → log_output
```

Intent must resolve: trigger choice, sheet identifiers (value vs template), model config (buildtime vs runtime), mail fields (credential ownership). Edges: single chain via orchestrator; no burst from trigger.

### I38. Reference flow B — branch with terminals

```
trigger → if_else → (true) → slack → log_output
                  → (false) → gmail → log_output
```

Intent must name **condition shape** (structural ownership on `if_else`). Orchestrator assigns `true`/`false` edges; policy may require **separate** terminals per branch—plan text and graph must agree.

### I39. Anti-patterns (intent + generation)

1. Parsing **free-form** AI explanation to set `node.data.config` without schema validation.
2. Duplicating **branching rules** in `summarize-layer` strings that contradict `graph-branching-validator`.
3. Storing **execution order** in prose instead of trusting `execution-order-manager` after graph ops.
4. Using **user-facing** summary as the **only** test artifact—always assert graph invariants.

### I40. Ownership of “product copy” in prompts

System prompts that include **registry structural fill contract** are **engineering copy**, not user copy. Editors should treat `registry-structural-fill-contract.ts` and summarize templates as **code**, with review for drift when registry fields change.

---

## Cross-cutting structures (short)

### Graph orchestrator (reminder)

- `initializeWorkflow(nodes)` for first graph.
- `injectNode` / `removeNode` for lifecycle changes.
- `reconcileWorkflow` when in doubt.
- `validateWorkflow` after material changes.

No feature code mutates `workflow.edges` directly.

### Universal template resolution

Config templates resolve before execution in registry `execute()`. Intent and summarization should not duplicate template syntax rules in ad-hoc string replace.

### Minimal workflow policy

Policies **remove nodes** or **constrain** via orchestrator operations; they do not hand-wire edges.

---

## What to implement “in the record” (registry) — checklist

Use this when scoping features:

- [ ] Does the node need new **inputs**? Add to `inputSchema` with `fillMode`, `ownership`, `role` as appropriate.
- [ ] Does the planner need to list fields? **Structural fill contract** will pick it up automatically from schema.
- [ ] Does execution need new behavior? Implement in registry `execute()` with template resolution.
- [ ] Do old workflows break? Add `migrations`.
- [ ] Do credentials change? Update `credentialSchema` and preflight flows.
- [ ] Does the graph need new branch semantics? Update registry branching metadata consumed by orchestrator—**not** scattered `if` in edge builders.

---

## File index (intent-related)

| File | Responsibility |
|------|------------------|
| `worker/src/services/ai/workflow-pipeline-orchestrator.ts` | Pipeline stages, `PipelineContext`, result shaping |
| `worker/src/services/ai/intent-structurer.ts` | Prompt → `StructuredIntent` |
| `worker/src/services/ai/intent-auto-expander.ts` | Low-confidence expansion |
| `worker/src/services/ai/summarize-layer.ts` | Clarification, variations, `WorkflowIntentPlan` |
| `worker/src/services/ai/intent-extraction.ts` | Form/intent text sanitization and field extraction |
| `worker/src/services/ai/registry-structural-fill-contract.ts` | Registry-driven planner contract text |
| `worker/src/services/workflow-lifecycle-manager.ts` | Generation entry, phased integration |
| `worker/src/api/generate-workflow.ts` | HTTP mapping, phased refine, analyze mode |
| `worker/src/core/registry/unified-node-registry.ts` | **Single source of node truth** |
| `worker/src/core/orchestration/unified-graph-orchestrator.ts` | **Single source of edge truth** |
| `worker/src/services/ai/workflow-compiler.ts` | Alternative compile path: intent → plan layers |
| `worker/src/services/ai/intent-completeness-validator.ts` | Gaps between structured intent and realizable structure |
| `worker/src/api/attach-credentials.ts` | Vault/credential attachment; pairs with registry `credentialSchema` |
| `worker/src/core/validation/graph-branching-validator.ts` | Branching invariants vs registry |
| `worker/src/core/execution/dynamic-node-executor.ts` | Runtime execution via registry |

---

## Implementation tiers (long-term roadmap framing)

**Tier 0 — Invariants (never regress)**  
Orchestrator-only edges; registry-only node behavior; `validateWorkflow` on material changes.

**Tier 1 — Intent fidelity**  
Structurer + confidence + expansion produce consistent `PipelineContext`; questions reduce `missing_fields`.

**Tier 2 — UX surfaces**  
Summarize layer, plan cards, phased refine—all reading/writing the same intent artifacts, not parallel strings.

**Tier 3 — Intelligence**  
Stronger classification of user content, better sample matching, richer `WorkflowExplanation`—**without** bypassing Tier 0.

Use tiers to argue about priority: Tier 3 is wasted if Tier 0 is violated.

---

## JSON vs text: API contract expectations

Clients should expect:

- **Workflow JSON** — Canonical graph; source of truth for run and edit.
- **`clarifiedIntent` / `structuredSummary`** — Human-readable; may lag graph by one iteration; not authoritative for edges.
- **`requirements` / `requiredCredentials`** — Derived from registry detection; may prompt attach-credentials flows.
- **Errors with `pipelineResult`** — May include `expandedIntent` for recovery UI—still not executable until confirmed.

Version API payloads if you add fields to `PipelineContext` that clients must interpret.

---

## Questions design principles (product + backend)

1. **Minimal** — Ask the fewest questions that unblock `missing_fields` or disambiguate integrations.
2. **Typed** — Prefer multiple-choice or constrained answers that map to registry enums over open-ended essays when possible.
3. **Idempotent** — Same answers + same base prompt yields the same structured intent class.
4. **Credential isolation** — Never mix secret answers into summarizer prompts logged at default verbosity.

---

## Registry “contractor content” (field semantics)

The phrase **contractor** in discussions often means **contract-defined** content: fields whose **ownership** and **fill mode** are defined in the registry, not invented by the user narrative.

- **Structural ownership** — User or AI must supply shape (form fields, switch cases) for the graph to exist.
- **Credential ownership** — User attaches secrets; AI does not hallucinate OAuth tokens into config.
- **Value ownership** — Business constants the user is expected to set.

When documentation refers to “contract from user content,” the implementation is: **parse user content for values**, **read registry for where those values may attach**, **reject** keys that match boilerplate patterns (`intent-extraction`).

---

## Closing mindset

Shipping fast is compatible with this architecture **only** if every change answers: **Which plane of truth am I updating, and did I avoid duplicating it?** The long-term maintainable system is boring at the boundaries—strict JSON in the middle, strict registry at execution, strict orchestrator at graph shape—and flexible only where users actually see it: prompts, questions, and explanations.

---

## Appendix A — Quick decision tree (developer)

```
Change request received
  │
  ├─ Does it change node IO, defaults, or execution?
  │     → unified-node-registry (+ migrations if needed)
  │
  ├─ Does it change how nodes connect or ordering?
  │     → unified-graph-orchestrator / edge-reconciliation / execution-order-manager
  │
  ├─ Does it change how we parse or score user prompts?
  │     → intent-structurer, pipeline context, confidence modules
  │
  ├─ Does it change UX copy or variation generation only?
  │     → summarize-layer / prompts (no registry duplication)
  │
  └─ Does it extract fields from mixed text?
        → intent-extraction sanitizers + tests for leakage
```

---

## Appendix B — Alignment with workspace rules

| Rule file | How this doc relates |
|-----------|------------------------|
| `unified-graph-orchestrator-edge-ownership.mdc` | Workflow plane invariants; no manual `edges` mutation |
| `permanent-core-architecture.mdc` | Registry as single node truth; template resolver |
| `deterministic-workflow-dag-compiler.mdc` | Intent proposes; DAG compiler accepts/rejects structure |

When rules and this doc disagree after a refactor, **update this doc** in the same PR that changes behavior.

---

*Document purpose: long-term developer alignment on intention, questions, JSON vs text, content-vs-contract analysis, and registry obligations inside workflow generation. Revise when intent schema or pipeline contracts change materially.*

