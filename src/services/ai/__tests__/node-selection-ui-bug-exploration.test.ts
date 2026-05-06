/**
 * Bug Condition Exploration Tests — Node Selection UI Fix
 * Spec: .kiro/specs/node-selection-ui-fix/
 *
 * CRITICAL: Tests A and B are EXPECTED TO FAIL on unfixed code.
 * Failure confirms each bug exists. DO NOT fix the source code when these fail.
 *
 * Test A — Auto-Selection Bug:
 *   EXPECTED TO FAIL on unfixed code — single-candidate container is pre-selected
 *
 * Test B — isComplete Gate Bug:
 *   EXPECTED TO FAIL on unfixed code — Continue disabled despite 1-of-3 selection
 *
 * Test C — Over-Generation Bug (system prompt validation):
 *   Validates that the intent analyzer system prompt contains the STRICT SCOPE RULE.
 *   EXPECTED TO FAIL on unfixed code — rule is absent from the prompt.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */

import { describe, expect, it } from '@jest/globals';
import { buildSystemPromptForTest } from '../stages/capability-intent-analyzer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Simulate the CapabilityStage useState initializer logic (the buggy version).
 * Returns the initial selections map as the component would compute it.
 */
function computeInitialSelections_BUGGY(
  containers: Array<{ containerId: string; candidates: Array<{ nodeType: string }> }>,
): Record<string, string> {
  const initial: Record<string, string> = {};
  for (const container of containers) {
    if (container.candidates.length === 1) {
      // BUG: auto-selects single-candidate containers
      initial[container.containerId] = container.candidates[0].nodeType;
    }
  }
  return initial;
}

/**
 * Simulate the CapabilityStage isComplete logic (the buggy version).
 */
function computeIsComplete_BUGGY(
  totalCount: number,
  selectedCount: number,
): boolean {
  // BUG: requires ALL containers to be selected
  return totalCount > 0 && selectedCount === totalCount;
}

// ─── Test A: Auto-Selection Bug ───────────────────────────────────────────────

describe('Test A (Bug A) — CapabilityStage auto-selects single-candidate containers', () => {
  it('initial selections should be {} for a single-candidate container — FAILS on unfixed code', () => {
    // Validates: Requirements 1.1, 1.2
    // Bug Condition: hasAutoSelectedSingleCandidateContainer = true

    const containers = [
      {
        containerId: 'container-gmail',
        candidates: [{ nodeType: 'google_gmail' }], // exactly one candidate
      },
    ];

    // Simulate the BUGGY useState initializer
    const buggyInitialSelections = computeInitialSelections_BUGGY(containers);

    console.log('[BUG EXPLORATION A] Buggy initial selections:', buggyInitialSelections);
    console.log('[BUG EXPLORATION A] google_gmail was auto-selected:', buggyInitialSelections['container-gmail'] === 'google_gmail');

    // EXPECTED (correct) behavior: initial selections should be empty {}
    // On UNFIXED code: google_gmail is pre-selected — this FAILS
    expect(buggyInitialSelections).toEqual({});
  });

  it('initial selections should be {} even when multiple containers have single candidates — FAILS on unfixed code', () => {
    // Validates: Requirements 1.1, 1.2
    // Bug Condition: hasAutoSelectedSingleCandidateContainer = true (multiple containers)

    const containers = [
      { containerId: 'container-trigger', candidates: [{ nodeType: 'form_trigger' }] },
      { containerId: 'container-logic', candidates: [{ nodeType: 'if_else' }] },
      { containerId: 'container-email', candidates: [{ nodeType: 'google_gmail' }] },
      { containerId: 'container-slack', candidates: [{ nodeType: 'slack' }] },
    ];

    const buggyInitialSelections = computeInitialSelections_BUGGY(containers);

    console.log('[BUG EXPLORATION A] Buggy initial selections (multi):', buggyInitialSelections);
    console.log('[BUG EXPLORATION A] Number of auto-selected containers:', Object.keys(buggyInitialSelections).length);

    // EXPECTED (correct) behavior: initial selections should be empty {}
    // On UNFIXED code: all 4 containers are pre-selected — this FAILS
    expect(buggyInitialSelections).toEqual({});
  });
});

// ─── Test B: isComplete Gate Bug ─────────────────────────────────────────────

describe('Test B (Bug B) — CapabilityStage isComplete requires ALL containers selected', () => {
  it('isComplete should be true with 1 selection out of 3 containers — FAILS on unfixed code', () => {
    // Validates: Requirements 1.3
    // Bug Condition: isCompleteRequiresAllContainers = true

    const totalCount = 3;
    const selectedCount = 1; // user selected 1 out of 3

    const buggyIsComplete = computeIsComplete_BUGGY(totalCount, selectedCount);

    console.log('[BUG EXPLORATION B] totalCount:', totalCount);
    console.log('[BUG EXPLORATION B] selectedCount:', selectedCount);
    console.log('[BUG EXPLORATION B] Buggy isComplete:', buggyIsComplete);
    console.log('[BUG EXPLORATION B] Continue button would be disabled:', !buggyIsComplete);

    // EXPECTED (correct) behavior: isComplete should be true (at least one selection)
    // On UNFIXED code: isComplete is false (requires all 3) — this FAILS
    expect(buggyIsComplete).toBe(true);
  });

  it('isComplete should be true with 2 selections out of 8 containers — FAILS on unfixed code', () => {
    // Validates: Requirements 1.3
    // Simulates the screenshot scenario: 8 containers, user selects only Gmail + Slack

    const totalCount = 8;
    const selectedCount = 2; // user selected Gmail and Slack

    const buggyIsComplete = computeIsComplete_BUGGY(totalCount, selectedCount);

    console.log('[BUG EXPLORATION B] totalCount:', totalCount);
    console.log('[BUG EXPLORATION B] selectedCount:', selectedCount);
    console.log('[BUG EXPLORATION B] Buggy isComplete:', buggyIsComplete);

    // EXPECTED (correct) behavior: isComplete should be true
    // On UNFIXED code: isComplete is false — this FAILS
    expect(buggyIsComplete).toBe(true);
  });

  it('isComplete should be false with 0 selections — should PASS on both unfixed and fixed code', () => {
    // Validates: Requirements 1.3 (edge case — no selections should still disable Continue)

    const totalCount = 3;
    const selectedCount = 0;

    const buggyIsComplete = computeIsComplete_BUGGY(totalCount, selectedCount);

    console.log('[BUG EXPLORATION B] isComplete with 0 selections:', buggyIsComplete);

    // Both buggy and fixed code should return false for 0 selections
    expect(buggyIsComplete).toBe(false);
  });
});

// ─── Test C: Over-Generation Bug (System Prompt Validation) ──────────────────

describe('Test C (Bug C) — Intent analyzer system prompt lacks STRICT SCOPE RULE', () => {
  it('buildSystemPrompt should contain STRICT SCOPE RULE — FAILS on unfixed code', () => {
    // Validates: Requirements 1.4
    // Bug Condition: unitsContainInferredDataFlowDestinations = true
    // Root cause: system prompt does not constrain LLM to explicit user intent only

    const systemPrompt = buildSystemPromptForTest('(mock catalog)');

    console.log('[BUG EXPLORATION C] System prompt length:', systemPrompt.length);
    console.log('[BUG EXPLORATION C] Contains STRICT SCOPE RULE:', systemPrompt.includes('STRICT SCOPE RULE'));
    console.log('[BUG EXPLORATION C] Contains DEDUPLICATION RULE:', systemPrompt.includes('DEDUPLICATION RULE'));

    // EXPECTED (correct) behavior: system prompt contains STRICT SCOPE RULE
    // On UNFIXED code: rule is absent — this FAILS
    expect(systemPrompt).toContain('STRICT SCOPE RULE');
  });

  it('buildSystemPrompt should contain DEDUPLICATION RULE — FAILS on unfixed code', () => {
    // Validates: Requirements 1.4

    const systemPrompt = buildSystemPromptForTest('(mock catalog)');

    // EXPECTED (correct) behavior: system prompt contains DEDUPLICATION RULE
    // On UNFIXED code: rule is absent — this FAILS
    expect(systemPrompt).toContain('DEDUPLICATION RULE');
  });

  it('buildSystemPrompt should instruct LLM not to infer from data flow descriptions — FAILS on unfixed code', () => {
    // Validates: Requirements 1.4

    const systemPrompt = buildSystemPromptForTest('(mock catalog)');

    console.log('[BUG EXPLORATION C] Contains "EXPLICITLY":', systemPrompt.includes('EXPLICITLY'));
    console.log('[BUG EXPLORATION C] Contains "data flow":', systemPrompt.toLowerCase().includes('data flow'));

    // EXPECTED (correct) behavior: prompt explicitly forbids inferring from data flows
    // On UNFIXED code: no such constraint — this FAILS
    expect(systemPrompt.toUpperCase()).toContain('EXPLICITLY');
  });
});

// ─── Test D: Grouper System Prompt Validation ─────────────────────────────────

describe('Test D (Bug D) — Capability grouper system prompt lacks SEMANTIC RELEVANCE RULE', () => {
  it('grouper buildSystemPrompt should contain SEMANTIC RELEVANCE RULE — FAILS on unfixed code', async () => {
    // Validates: Requirements 1.4 (grouper side)
    // Root cause: grouper prompt does not prevent tangentially related candidates

    const { buildGrouperSystemPromptForTest } = await import('../stages/capability-grouper-stage');

    const systemPrompt = buildGrouperSystemPromptForTest('(mock catalog)');

    console.log('[BUG EXPLORATION D] Grouper prompt length:', systemPrompt.length);
    console.log('[BUG EXPLORATION D] Contains SEMANTIC RELEVANCE RULE:', systemPrompt.includes('SEMANTIC RELEVANCE RULE'));

    // EXPECTED (correct) behavior: grouper prompt contains SEMANTIC RELEVANCE RULE
    // On UNFIXED code: rule is absent — this FAILS
    expect(systemPrompt).toContain('SEMANTIC RELEVANCE RULE');
  });
});
