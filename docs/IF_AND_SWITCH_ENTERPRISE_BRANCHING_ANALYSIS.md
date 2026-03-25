# IF / Switch Branching — Enterprise Analysis & Implementation Paths

**Purpose:** Design discussion document (no code changes). It ties your observed issues (“missing IF node,” “order damaged by classification”) to plausible **root causes** in a graph-based automation system, compares **how market leaders conceptualize** IF and Switch, and outlines **five materially different implementation strategies** for CtrlChecks, including JSON/UI contracts and trade-offs.

**Scope:** Grounded in this repo’s direction: `UnifiedNodeRegistry`, `unified-graph-orchestrator` / `edge-reconciliation-engine`, registry overrides for `if_else` and `switch`, and AI pipeline layers (`workflow-builder`, `intent-constraint-engine`, `production-workflow-builder`).

---

## 1. How products like Zapier, Make, and n8n think about “IF” and “Switch”

These are not identical concepts across vendors; mixing them causes the bugs you see (missing nodes, wrong order).

| Concept | Typical product behavior | Graph shape |
|--------|---------------------------|-------------|
| **Filter (Zapier)** | Stops the run if condition fails; **no alternate path** in the same Zap—often “stop” or “continue only if.” | Linear: condition is a gate, not always a second wire. |
| **Paths / branching (Zapier)** | Explicit branches with different downstream steps. | Tree: multiple edges from a decision point. |
| **Router (Make)** | Routes to **one** of several routes based on rules; visually one module, many outputs. | Star from router to N targets; often reconverge. |
| **IF / Switch (n8n)** | **IF** = two outputs (true/false). **Switch** = N outputs (`case_1`… or rule-based). Graph is edited visually; execution follows **only the chosen output**. | DAG with labeled edges / handles. |
| **BPMN XOR** | Formal “exclusive gateway”: exactly one outgoing flow fires. | Same as DAG + strict token semantics. |

**Takeaway for your product:** You must decide whether “IF” is (a) a **filter** (abort path), (b) a **router** (pick one child), or (c) a **pure graph construct** (edges define truth). Your runtime and AI generation must agree on one primary model; mixing models without explicit translation is a common source of “missing node” and “broken order.”

---

## 2. Current codebase anchors (relevant to branching)

These are not exhaustive; they explain *why* classification and structure can fight each other.

### 2.1 Registry contracts

- **`if_else`** override fixes **branching** semantics: `isBranching: true`, `outgoingPorts: ['true', 'false']`, execution delegates to the legacy executor with merged upstream data for condition evaluation (`worker/src/core/registry/overrides/if-else.ts`).
- **`switch`** override: `isBranching: true`, **dynamic** `outgoingPorts` derived from `config.cases` / `config.rules`; runtime path updates `def.outgoingPorts` when cases exist (`worker/src/core/registry/overrides/switch.ts`).

### 2.2 Edge reconciliation and “guessed” branch wiring

When explicit edges are missing, the engine can **fan out** branching nodes by pairing **branch port names** with **the next nodes in execution order** (`edge-reconciliation-engine.ts`, branching block). That is powerful for repair but **dangerous** if execution order does not match the user’s intended true/false or case order: ports can attach to the wrong downstream node.

### 2.3 AI / intent layers

- **Auto-selection** of `switch` vs `if_else` uses heuristics (e.g. condition count from prompt patterns) (`intent-constraint-engine.ts`, `mapConditionToNodeType`).
- **Structure builders** insert `if_else` and splice connections by **matching node types** on paths (`workflow-structure-builder.ts`); fragile if types repeat or ordering is ambiguous.
- **Prompt tension:** generation prompts sometimes insist on **strict linear** chains while elsewhere **mandating** `if_else` for conditional language (`workflow-builder.ts` structure prompts)—that inconsistency alone can yield “lost” branch nodes or reordered steps after classification.

### 2.4 Execution ordering

- Logic nodes are given an early **priority** in ordering (`execution-order-manager.ts`: `logic`: 1 alongside data). Branching **does not** fit a single total order: a DAG needs either **topological layers** or **branch-aware scheduling**. If the system still **linearizes** for display or reconciliation, order can look “damaged” even when the graph is valid.

---

## 3. At least five root-cause buckets (symptoms you reported)

| # | Symptom | Plausible root cause (system-level) |
|---|---------|--------------------------------------|
| R1 | **IF node missing (“not giving itself”)** | Generation/injection path drops the node when intent says “conditional” but the **structure step** fails to materialize a node instance, or validation removes “orphan” logic nodes after failed edge attach. |
| R2 | **IF present but wrong downstream** | **Reconciliation-by-order**: branch ports bound to **next nodes in sorted order**, not user-labeled handles, when edges are incomplete or regenerated. |
| R3 | **Order “damaged” after classification** | **Competing order sources:** DSL order, AI “steps” array, registry category priority, and topological sort can disagree; **re-sorting** after inserting `if_else`/`switch` moves nodes that belong on parallel branches. |
| R4 | **Switch ports don’t match cases** | **Dynamic ports**: `outgoingPorts` depend on `cases` in config; if UI/JSON has **empty or stale cases** at save time, the graph shows fewer handles than the user expects, or edges reference obsolete port names. |
| R5 | **Runtime vs editor mismatch** | **Template/condition fields** stored as strings (`{{$json...}}`) while the evaluator expects resolved objects—branch **selection** works but downstream **data** looks wrong, interpreted as “broken flow.” |

Additional cross-cutting cause: **stub vs migrated execution** — registry stubs noted for legacy paths (`node-execution-stubs.ts`) mean any incomplete migration surfaces as “branching doesn’t work” even when the graph is correct.

---

## 4. JSON / UI contract — what must be specified (per node)

Below is a **checklist** for “content first, runtime JSON honest to node type.” Align Properties panel and persisted workflow JSON with these; avoid silent defaults that change port topology.

### 4.1 `if_else`

| Layer | User / system must specify | Notes |
|-------|----------------------------|--------|
| **Graph** | Exactly **one** incoming edge (main path); **up to two** outgoing edges labeled **`true`** and **`false`** (or handles equivalent in your model). | If only one branch is used, policy should define whether the other is **no-op**, **merge**, or **forbidden**. |
| **Config** | `conditions`: array of predicates (`field` / `operator` / `value`, or legacy `leftValue` / `operation` / `rightValue`). | Support both documented in `node-library` `createIfElseSchema()`. |
| **Config** | `combineOperation`: `AND` \| `OR` when multiple conditions exist. | Defaults must be explicit in UI. |
| **Runtime** | Upstream JSON must contain paths referenced in conditions (e.g. `$json.status`). | Document required upstream shape or use a **picker** in UI. |

### 4.2 `switch`

| Layer | User / system must specify | Notes |
|-------|----------------------------|--------|
| **Graph** | One input; **N outputs**, one per case (port id **stable**: either `case_1`…`case_n` or **value-based** ids—pick one convention and keep it). | Dynamic ports must be **derived from the same source** in editor and registry. |
| **Config** | `routingType` / discriminant: what is evaluated (`expression`, field path, etc.). | Align with `createSwitchSchema()` and override (`expression`, `cases`/`rules`). |
| **Config** | `cases` (or `rules`): ordered list of `{ value, label? }` (and optional fallthrough / default). | Order must match **visual case list** and **edge labels**. |
| **Optional** | **Default / else** branch when no case matches. | Many enterprise workflows require explicit “otherwise” behavior. |

### 4.3 Cross-node: **merge** (when branches reconverge)

| Layer | User / system must specify |
|-------|----------------------------|
| **Graph** | **Merge** (or equivalent) **after** parallel branches if both paths feed the same next step. |
| **Semantics** | Which branch’s payload wins, or how objects combine (document in registry). |

### 4.4 Branch regions and edge reconciliation (invariants)

These rules align `edge-reconciliation-engine` with graph-native branching:

| Invariant | Meaning |
|-----------|---------|
| **Exclusive regions** | Under a branching node `B` (`if_else`, `switch`), each **exclusive** outgoing port (`true`, `false`, `case_k`, …) defines a **region**: all nodes reachable forward from that port’s direct target without first sharing a path with another port’s region. |
| **Forbidden cross-edge** | There must be **no** “main” / sequential edge from a node that lies **only** in region R1 to a node that lies **only** in region R2 when R1 and R2 are **different exclusive ports of the same** `B`, unless a **merge** (or reconvergence) legitimately combines those paths. |
| **Linear execution order** | A **flat** topological list is still used for scheduling, but it **must not** be interpreted as “always connect `order[i]` → `order[i+1]`” across sibling branch heads—that mistake creates false edges (e.g. Gmail → Slack). |
| **Detection** | Reconciliation may treat two nodes as **exclusive fork descendants** when, for some branching `B`, they fall in different forward reachability sets from **different** branch edges out of `B`, with **no** mutual reachability between those sets (so merged subgraphs are not misclassified). |

---

## 5. Five distinct implementation strategies (each differs in core idea)

Each row is a **different** architectural bet. You can blend later, but the *primary* model should stay one to avoid the bugs in section 3.

### Strategy 1 — **Graph-native DAG (n8n-style)**

**Idea:** The canvas JSON **is** the workflow. IF/Switch are normal nodes with **typed edges** (`true`/`false`/`case_k`). Execution follows edges; no guessing.

| Pros | Cons / “runover” |
|------|------------------|
| Clear mental model; matches your orchestrator direction | Requires **excellent** editor UX for branches |
| Easiest to **validate** (orphans, cycles, port coverage) | AI generation must output **edges**, not only ordered steps |
| Aligns with `validateWorkflow` as contract | Large graphs need **layout** and **merge** discipline |

**Best when:** You want enterprise correctness and debuggability first.

---

### Strategy 2 — **Linear plan + explicit branch table (compiler)**

**Idea:** Users/API produce a **linear “main spine”** plus a **branch map** `{ nodeId: { true: id, false: id } }`. A compiler pass expands to full DAG before run.

| Pros | Cons |
|------|------|
| Easier for LLMs to emit than full edge lists | Extra compile step; errors if map inconsistent |
| UI can show “compact” view | Hides parallelism until expand |

**Best when:** AI generation dominates and humans rarely hand-edit edges.

---

### Strategy 3 — **Router with dynamic ports + schema sync (Make-like)**

**Idea:** Switch/IF are **routers**; **cases** live in config; **ports** are generated from config **at save time** and **validated** against edges.

| Pros | Cons |
|------|------|
| Matches dynamic `outgoingPorts` already started in `switch` override | Renaming a case **breaks** edges unless migrated |
| One node type scales to N cases | Must forbid runtime mutation of `def` without persisting |

**Best when:** Multi-case routing is common and users think in “rules + routes.”

---

### Strategy 4 — **Filter-first (Zapier-style) + optional Path**

**Idea:** Default “IF” is a **Filter**: pass or **stop branch**; optional upgrade to **Path** (real branch) when user adds a second output.

| Pros | Cons |
|------|------|
| Simplest UX for “only if” | **Not** equivalent to full IF—documentation burden |
| Fewer merge points | Users confuse Filter with If/Else |

**Best when:** Most automations are single-path with gating.

---

### Strategy 5 — **Execution tokens / Petri-light (BPMN XOR)**

**Idea:** Branch nodes emit a **token** `{ activeEdgeId }`; scheduler only enqueues nodes reachable from that token. Graph stored as today, but **runtime never relies on linear order**.

| Pros | Cons |
|------|------|
| Correct parallel semantics | Higher implementation complexity |
| Fixes “linearization damaged order” perception | Debugging UX must show **active path** |

**Best when:** You need **strict** enterprise semantics and future parallel gateways.

---

### Strategy 6 (bonus) — **Code node as escape hatch**

**Idea:** Advanced users output `{ nextPort, payload }` from a sandbox step. **Not** graph-first.

| Pros | Cons |
|------|------|
| Infinite flexibility | **Hard** to validate, audit, or AI-generate safely |

**Best when:** Pro users only; should not be the core model.

---

## 6. If we implement branching “smoothly,” what does world-class look like?

- **Single semantics:** Editor, JSON, AI DSL, orchestrator, and executor all agree on **port names**, **merge points**, and **what runs** on each run.
- **No silent repair:** Edge reconciliation **never** swaps true/false targets without an explicit repair policy and user-visible warning.
- **Registry-first:** `isBranching`, `outgoingPorts`, and merge behavior come from **`UnifiedNodeRegistry`** only; AI picks **node types**, system **hydrates** defaults and validates.
- **Classification serves structure, not the reverse:** Intent chooses `if_else` vs `switch` **after** the user’s stated cases are known; **structure** (nodes + edges) is generated in one pass to avoid reorder damage.
- **Observability:** Every run logs **chosen branch**, **evaluated expression snapshot**, and **downstream node id**—essential at enterprise scale.

---

## 7. Risks and “lags” specific to this codebase’s trajectory

| Risk | Why it matters |
|------|----------------|
| **Dynamic port mutation at runtime** (`switch` updating `def.outgoingPorts` during execute) | Editor and run can diverge if not persisted immutably. |
| **Reconciliation fan-out by sibling order** | Can mis-wire branches when order list ≠ user intent. |
| **Prompt-level linear vs conditional contradiction** | Causes missing branch nodes or reordered “classification” fixes. |
| **Heuristic switch vs if_else** | Wrong node type → wrong port count → reconciliation surprises. |

---

## 8. Recommended next steps (discussion only)

1. **Freeze** branch edge naming (`true`/`false` / `case_*` vs value-based) and document it for AI + UI.
2. **Define** whether empty branch is allowed and how **merge** works in the registry.
3. **Trace** one end-to-end path: user prompt → structured intent → node list → **initializeWorkflow** → saved JSON → execute, for a **2-branch** and **3-case** example.
4. **Add** product-level distinction: **Filter** vs **Branch** if you need Zapier-like simplicity without confusing IF.

---

## 9. Document control

| Item | Value |
|------|--------|
| Format | Markdown (export to PDF via any MD→PDF tool if needed) |
| Code changes | None (analysis only) |
| Primary references | `if-else.ts`, `switch.ts`, `edge-reconciliation-engine.ts`, `execution-order-manager.ts`, `intent-constraint-engine.ts`, `workflow-structure-builder.ts`, `node-library.ts` (IF/Switch schemas) |

---

*This document is intended to align product, UI, and engineering on a single branching model before scaling to “infinite workflows” without ad hoc node logic.*
