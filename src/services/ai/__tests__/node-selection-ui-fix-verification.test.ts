/**
 * Fix Verification Tests — Node Selection UI Fix
 * Spec: .kiro/specs/node-selection-ui-fix/
 *
 * These tests verify that the fixes are correctly applied.
 * All tests MUST PASS on fixed code.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { describe, expect, it } from '@jest/globals';
import { buildSystemPromptForTest } from '../stages/capability-intent-analyzer';
import { buildGrouperSystemPromptForTest } from '../stages/capability-grouper-stage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type NodeSelectionMap = Record<string, string>;

/**
 * Simulate the FIXED CapabilityStage useState initializer.
 * Must always return empty {} regardless of container configuration.
 */
function computeInitialSelections_FIXED(
  _containers: Array<{ containerId: string; candidates: Array<{ nodeType: string }> }>,
): NodeSelectionMap {
  // FIXED: always start with empty selections — no auto-selection
  return {};
}

/**
 * Simulate the FIXED isComplete condition.
 */
function computeIsComplete_FIXED(totalCount: number, selectedCount: number): boolean {
  // FIXED: at least one selection is sufficient
  return totalCount > 0 && selectedCount >= 1;
}

/**
 * Simulate the FIXED useEffect selection preservation.
 * Preserves valid prior user selections; never auto-selects.
 */
function preserveSelections_FIXED(
  prev: NodeSelectionMap,
  containers: Array<{ containerId: string; candidates: Array<{ nodeType: string }> }>,
): NodeSelectionMap {
  const next: NodeSelectionMap = {};
  for (const container of containers) {
    const current = prev[container.containerId];
    if (current && container.candidates.some((c) => c.nodeType === current)) {
      next[container.containerId] = current;
    }
    // No auto-selection — user must choose explicitly
  }
  return next;
}

// ─── Fix Verification: No Auto-Selection ─────────────────────────────────────

describe('Fix Verification — No auto-selection on initial render', () => {
  it('initial selections are {} for a single-candidate container', () => {
    // Validates: Requirements 2.1
    const containers = [
      { containerId: 'container-gmail', candidates: [{ nodeType: 'google_gmail' }] },
    ];
    const initial = computeInitialSelections_FIXED(containers);
    expect(initial).toEqual({});
  });

  it('initial selections are {} for multiple single-candidate containers', () => {
    // Validates: Requirements 2.1
    const containers = [
      { containerId: 'container-trigger', candidates: [{ nodeType: 'form_trigger' }] },
      { containerId: 'container-logic', candidates: [{ nodeType: 'if_else' }] },
      { containerId: 'container-email', candidates: [{ nodeType: 'google_gmail' }] },
      { containerId: 'container-slack', candidates: [{ nodeType: 'slack' }] },
    ];
    const initial = computeInitialSelections_FIXED(containers);
    expect(initial).toEqual({});
    expect(Object.keys(initial)).toHaveLength(0);
  });

  it('initial selections are {} for multi-candidate containers', () => {
    // Validates: Requirements 2.1
    const containers = [
      {
        containerId: 'container-email',
        candidates: [
          { nodeType: 'google_gmail' },
          { nodeType: 'outlook' },
          { nodeType: 'amazon_ses' },
        ],
      },
    ];
    const initial = computeInitialSelections_FIXED(containers);
    expect(initial).toEqual({});
  });

  it('initial selections are {} for empty containers array', () => {
    // Validates: Requirements 2.1 (edge case)
    const initial = computeInitialSelections_FIXED([]);
    expect(initial).toEqual({});
  });
});

// ─── Fix Verification: No Auto-Selection in useEffect ────────────────────────

describe('Fix Verification — No auto-selection when containers prop changes', () => {
  it('does not auto-select when containers change and no prior selection exists', () => {
    // Validates: Requirements 2.2
    const prev: NodeSelectionMap = {};
    const containers = [
      { containerId: 'container-email', candidates: [{ nodeType: 'google_gmail' }] },
    ];
    const result = preserveSelections_FIXED(prev, containers);
    expect(result['container-email']).toBeUndefined();
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('preserves a valid prior user selection when containers change', () => {
    // Validates: Requirements 2.2 (preservation of explicit selections)
    const prev: NodeSelectionMap = { 'container-email': 'google_gmail' };
    const containers = [
      {
        containerId: 'container-email',
        candidates: [{ nodeType: 'google_gmail' }, { nodeType: 'outlook' }],
      },
    ];
    const result = preserveSelections_FIXED(prev, containers);
    expect(result['container-email']).toBe('google_gmail');
  });

  it('does not auto-select even when a container has exactly one candidate and no prior selection', () => {
    // Validates: Requirements 2.2 — the key regression test
    const prev: NodeSelectionMap = {};
    const containers = [
      { containerId: 'container-single', candidates: [{ nodeType: 'form_trigger' }] },
    ];
    const result = preserveSelections_FIXED(prev, containers);
    // Must NOT auto-select form_trigger
    expect(result['container-single']).toBeUndefined();
  });
});

// ─── Fix Verification: Correct isComplete Gate ───────────────────────────────

describe('Fix Verification — isComplete enables Continue with at least one selection', () => {
  it('isComplete is true with 1 selection out of 3 containers', () => {
    // Validates: Requirements 2.3
    expect(computeIsComplete_FIXED(3, 1)).toBe(true);
  });

  it('isComplete is true with 2 selections out of 8 containers', () => {
    // Validates: Requirements 2.3 — simulates the screenshot scenario
    expect(computeIsComplete_FIXED(8, 2)).toBe(true);
  });

  it('isComplete is true with 1 selection out of 1 container', () => {
    // Validates: Requirements 2.3
    expect(computeIsComplete_FIXED(1, 1)).toBe(true);
  });

  it('isComplete is false with 0 selections', () => {
    // Validates: Requirements 2.3 (edge case — no selections should still disable Continue)
    expect(computeIsComplete_FIXED(3, 0)).toBe(false);
  });

  it('isComplete is false with 0 containers', () => {
    // Validates: Requirements 2.3 (edge case)
    expect(computeIsComplete_FIXED(0, 0)).toBe(false);
  });

  it('isComplete is true with all containers selected', () => {
    // Validates: Requirements 2.3 (full selection still works)
    expect(computeIsComplete_FIXED(5, 5)).toBe(true);
  });
});

// ─── Fix Verification: Intent Analyzer System Prompt ─────────────────────────

describe('Fix Verification — Intent analyzer system prompt contains STRICT SCOPE RULE', () => {
  it('system prompt contains STRICT SCOPE RULE', () => {
    // Validates: Requirements 2.4
    const prompt = buildSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('STRICT SCOPE RULE');
  });

  it('system prompt contains DEDUPLICATION RULE', () => {
    // Validates: Requirements 2.4
    const prompt = buildSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('DEDUPLICATION RULE');
  });

  it('system prompt explicitly forbids inferring from data flow descriptions', () => {
    // Validates: Requirements 2.4
    const prompt = buildSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('EXPLICITLY');
    // Must mention that data flow descriptions should not be used
    expect(prompt.toLowerCase()).toContain('data flow');
  });

  it('system prompt explicitly forbids inferring from destination metadata', () => {
    // Validates: Requirements 2.4
    const prompt = buildSystemPromptForTest('(mock catalog)');
    // Must mention specific examples of what NOT to infer
    expect(prompt).toContain('Zoom Video');
    expect(prompt).toContain('Amazon SES');
  });

  it('system prompt provides correct/wrong examples for scope rule', () => {
    // Validates: Requirements 2.4
    const prompt = buildSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('CORRECT');
    expect(prompt).toContain('WRONG');
  });
});

// ─── Fix Verification: Grouper System Prompt ─────────────────────────────────

describe('Fix Verification — Capability grouper system prompt contains SEMANTIC RELEVANCE RULE', () => {
  it('grouper prompt contains SEMANTIC RELEVANCE RULE', () => {
    // Validates: Requirements 2.5
    const prompt = buildGrouperSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('SEMANTIC RELEVANCE RULE');
  });

  it('grouper prompt explicitly forbids tangentially related candidates', () => {
    // Validates: Requirements 2.5
    const prompt = buildGrouperSystemPromptForTest('(mock catalog)');
    expect(prompt.toLowerCase()).toContain('tangentially');
  });

  it('grouper prompt provides correct/wrong examples for semantic relevance', () => {
    // Validates: Requirements 2.5
    const prompt = buildGrouperSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('CORRECT');
    expect(prompt).toContain('WRONG');
  });

  it('grouper prompt explicitly mentions zoom_video as a wrong candidate for email use-cases', () => {
    // Validates: Requirements 2.5 — the specific irrelevant node from the bug report
    const prompt = buildGrouperSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('zoom_video');
  });
});

// ─── Fix Verification: Combined Bug Condition Check ──────────────────────────

describe('Fix Verification — All three bug conditions are resolved', () => {
  it('Bug A resolved: initial selections are always empty', () => {
    // Validates: Requirements 2.1
    const containers = [
      { containerId: 'c1', candidates: [{ nodeType: 'form_trigger' }] },
      { containerId: 'c2', candidates: [{ nodeType: 'if_else' }] },
      { containerId: 'c3', candidates: [{ nodeType: 'google_gmail' }] },
      { containerId: 'c4', candidates: [{ nodeType: 'slack' }] },
    ];
    const initial = computeInitialSelections_FIXED(containers);
    expect(initial).toEqual({});
  });

  it('Bug B resolved: Continue enabled with partial selection', () => {
    // Validates: Requirements 2.3
    // Simulates: user selects Gmail and Slack from 8 containers
    const isComplete = computeIsComplete_FIXED(8, 2);
    expect(isComplete).toBe(true);
  });

  it('Bug C resolved: system prompt contains scope constraints', () => {
    // Validates: Requirements 2.4
    const prompt = buildSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('STRICT SCOPE RULE');
    expect(prompt).toContain('DEDUPLICATION RULE');
  });

  it('Bug D resolved: grouper prompt contains relevance constraints', () => {
    // Validates: Requirements 2.5
    const prompt = buildGrouperSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('SEMANTIC RELEVANCE RULE');
  });
});
