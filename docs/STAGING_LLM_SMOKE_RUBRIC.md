# Tier 2 — Staging LLM smoke rubric (≥95% target)

This document defines how to score **non-deterministic** workflow behavior in staging where Gemini (or another provider) is enabled. **Tier 1** Jest tests remain the CI gate (100% pass). Tier 2 measures product readiness under real LLM variance.

## Environment

- Worker with `GEMINI_API_KEY` (or configured primary LLM).
- Optional: fixed `temperature` (e.g. 0.3) for resolver paths; log model id per run.

## Pass criteria per scenario

For each scenario, record **pass** only if all bullets hold:

1. **Graph:** `unifiedGraphOrchestrator.validateWorkflow` reports `valid: true` after generation (no orphan nodes, single trigger, branching edges match registry ports when applicable).
2. **Credentials:** Every required credential lists existing `node_id`s; injection leaves nodes executable (no missing provider rows after user connects vault secrets).
3. **Runtime resolution:** Downstream communication nodes (`slack_message`, `google_gmail`, `linkedin`, etc.) do not return executor `_error` for missing `runtime_ai` essential fields when upstream JSON is non-empty **or** workflow intent is supplied (webhook/manual `inputData.workflowIntent` / `body.workflowIntent`, etc.).
4. **Output shape:** Node output is usable (plain text, JSON, or mixed) without template leakage (`{{$json.*}}` unresolved) in final execution snapshot.

## Suggested prompt suite (minimum 20 runs)

| # | Style | Prompt / trigger |
|---|--------|------------------|
| 1–3 | Vague | “automate notifications”, “sync my data”, “help with email” |
| 4–6 | Linear | Form → summarizer → Slack; Sheet → Gmail; Webhook → log |
| 7–9 | Branch | “if score high Slack else log”; switch on region/case |
| 10–12 | Credential-heavy | Gmail + Sheets; Slack webhook + AI node |
| 13–15 | Webhook | POST body with nested JSON; include `workflowIntent` in body |
| 16–18 | JSON / HTTP | Previous node returns object; HTTP POST body mapping |
| 19–20 | Adversarial | Contradictory prompt; non-English short prompt |

## Scoring

- **Run each scenario N=5 times** (or N=1 for nightly with larger set).
- **Pass rate** = passes / (scenarios × runs).
- **Gate:** ≥95% Tier 2 pass rate before promoting a release candidate, **after** Tier 1 is green.

## Forensics on failure

- Inspect `EXECUTION_OBSERVABILITY_KEYS.runtimeResolutionAudit` entries in logs.
- Check `currentWorkflowIntent` was set (`execute-workflow` stores DB + `executionInput` fallbacks including `body.*`).
- For Slack-style alias fields, confirm `message` (canonical) is populated, not only `text`.
