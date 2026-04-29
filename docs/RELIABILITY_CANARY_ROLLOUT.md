# Reliability Canary Rollout

This runbook enables the single-path autonomous reliability stack in controlled phases.
The runtime behavior is code-defined (single source in `config.reliability`) and is not toggled by feature ENV flags.

## Phase 0: Baseline Deployment

Deploy current code to staging and validate:
- `/health` is reachable
- tracing headers (`x-trace-id`, `traceparent`) are returned
- Redis-backed services (rate limiting, sessions, DLQ) are healthy

## Phase 1: Shadow Mode

Route 5-10% tenant traffic to the new release.

Expected:

- Self-validation evidence appears in execution events (`NODE_SELF_VALIDATION`).
- Trace context is present across API and queue boundaries.

## Phase 2: Controlled Expansion

Expand to 25-50% traffic.

Monitor:

- 429 rate
- output validation failures
- session invalidation anomalies
- circuit breaker open counts
- DLQ growth

## Phase 3: Reliability Enforcement

Move to 100% traffic after stable metrics for at least 24h.

Expected:

- Terminal failures persist to DLQ.
- Autonomous replay/remediation is visible via `AUTONOMOUS_REMEDIATION` events.
- Replay endpoint validates operational recovery.

## Rollback

Rollback is release-based (previous stable build), not feature-flag based.
Keep trace collection enabled during rollback for diagnosis.
