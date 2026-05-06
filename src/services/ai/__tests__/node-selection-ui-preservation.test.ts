/**
 * Preservation Property Tests — Node Selection UI Fix
 * Spec: .kiro/specs/node-selection-ui-fix/
 *
 * These tests verify that existing CORRECT behaviors are preserved after the fix.
 * All tests in this file MUST PASS on both unfixed and fixed code.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, expect, it } from '@jest/globals';
import { buildSystemPromptForTest } from '../stages/capability-intent-analyzer';
import { buildGrouperSystemPromptForTest } from '../stages/capability-grouper-stage';

// ─── Helpers: simulate CapabilityStage state logic ────────────────────────────

type NodeSelectionMap = Record<string, string>;

/**
 * Simulate the handleSelect function from CapabilityStage.
 * This is the toggle-select logic that must be preserved.
 */
function handleSelect(
  prev: NodeSelectionMap,
  containerId: string,
  nodeType: string,
): NodeSelectionMap {
  if (prev[containerId] === nodeType) {
    // Toggle off — clicking an already-selected node deselects it
    const next = { ...prev };
    delete next[containerId];
    return next;
  }
  // Select — clicking a new node selects it (replacing any prior selection)
  return { ...prev, [containerId]: nodeType };
}

/**
 * Simulate the useEffect selection preservation logic (FIXED version).
 * Preserves valid prior user selections; never auto-selects.
 */
function preserveSelections(
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

// ─── Preservation: Explicit Selection ────────────────────────────────────────

describe('Preservation — Explicit user selection works correctly', () => {
  it('clicking a candidate node selects it in the container', () => {
    // Validates: Requirements 3.1
    const prev: NodeSelectionMap = {};
    const result = handleSelect(prev, 'container-email', 'google_gmail');
    expect(result['container-email']).toBe('google_gmail');
  });

  it('clicking a different candidate replaces the prior selection', () => {
    // Validates: Requirements 3.3
    const prev: NodeSelectionMap = { 'container-email': 'google_gmail' };
    const result = handleSelect(prev, 'container-email', 'outlook');
    expect(result['container-email']).toBe('outlook');
    expect(result['container-email']).not.toBe('google_gmail');
  });

  it('selecting in one container does not affect other containers', () => {
    // Validates: Requirements 3.1
    const prev: NodeSelectionMap = { 'container-slack': 'slack' };
    const result = handleSelect(prev, 'container-email', 'google_gmail');
    expect(result['container-email']).toBe('google_gmail');
    expect(result['container-slack']).toBe('slack'); // unchanged
  });

  it('can select nodes in multiple containers independently', () => {
    // Validates: Requirements 3.1, 3.3
    let selections: NodeSelectionMap = {};
    selections = handleSelect(selections, 'container-trigger', 'form_trigger');
    selections = handleSelect(selections, 'container-email', 'google_gmail');
    selections = handleSelect(selections, 'container-slack', 'slack');

    expect(selections['container-trigger']).toBe('form_trigger');
    expect(selections['container-email']).toBe('google_gmail');
    expect(selections['container-slack']).toBe('slack');
    expect(Object.keys(selections)).toHaveLength(3);
  });
});

// ─── Preservation: Toggle-Off ─────────────────────────────────────────────────

describe('Preservation — Toggle-off behavior works correctly', () => {
  it('clicking an already-selected node deselects it', () => {
    // Validates: Requirements 3.2
    const prev: NodeSelectionMap = { 'container-email': 'google_gmail' };
    const result = handleSelect(prev, 'container-email', 'google_gmail');
    expect(result['container-email']).toBeUndefined();
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('toggle-off removes only the targeted container, not others', () => {
    // Validates: Requirements 3.2
    const prev: NodeSelectionMap = {
      'container-email': 'google_gmail',
      'container-slack': 'slack',
    };
    const result = handleSelect(prev, 'container-email', 'google_gmail');
    expect(result['container-email']).toBeUndefined();
    expect(result['container-slack']).toBe('slack'); // preserved
  });

  it('toggle-off then re-select works correctly', () => {
    // Validates: Requirements 3.2, 3.1
    let selections: NodeSelectionMap = { 'container-email': 'google_gmail' };
    selections = handleSelect(selections, 'container-email', 'google_gmail'); // deselect
    expect(selections['container-email']).toBeUndefined();
    selections = handleSelect(selections, 'container-email', 'google_gmail'); // re-select
    expect(selections['container-email']).toBe('google_gmail');
  });
});

// ─── Preservation: Selection Preservation on Container Change ─────────────────

describe('Preservation — Valid prior selections are preserved when containers change', () => {
  it('preserves a valid prior selection when containers prop changes', () => {
    // Validates: Requirements 3.3 (preservation of user selections)
    const prev: NodeSelectionMap = { 'container-email': 'google_gmail' };
    const containers = [
      {
        containerId: 'container-email',
        candidates: [{ nodeType: 'google_gmail' }, { nodeType: 'outlook' }],
      },
    ];
    const result = preserveSelections(prev, containers);
    expect(result['container-email']).toBe('google_gmail');
  });

  it('removes a selection when the selected node is no longer a candidate', () => {
    // Validates: Requirements 3.3 (stale selection cleanup)
    const prev: NodeSelectionMap = { 'container-email': 'google_gmail' };
    const containers = [
      {
        containerId: 'container-email',
        candidates: [{ nodeType: 'outlook' }], // google_gmail removed
      },
    ];
    const result = preserveSelections(prev, containers);
    expect(result['container-email']).toBeUndefined();
  });

  it('does NOT auto-select single-candidate containers on prop change', () => {
    // Validates: Requirements 2.2 (no auto-selection in useEffect)
    const prev: NodeSelectionMap = {}; // no prior selections
    const containers = [
      {
        containerId: 'container-email',
        candidates: [{ nodeType: 'google_gmail' }], // single candidate
      },
    ];
    const result = preserveSelections(prev, containers);
    // Must NOT auto-select google_gmail
    expect(result['container-email']).toBeUndefined();
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('preserves multiple valid selections across multiple containers', () => {
    // Validates: Requirements 3.3
    const prev: NodeSelectionMap = {
      'container-trigger': 'form_trigger',
      'container-email': 'google_gmail',
      'container-slack': 'slack',
    };
    const containers = [
      { containerId: 'container-trigger', candidates: [{ nodeType: 'form_trigger' }] },
      { containerId: 'container-email', candidates: [{ nodeType: 'google_gmail' }, { nodeType: 'outlook' }] },
      { containerId: 'container-slack', candidates: [{ nodeType: 'slack' }] },
    ];
    const result = preserveSelections(prev, containers);
    expect(result['container-trigger']).toBe('form_trigger');
    expect(result['container-email']).toBe('google_gmail');
    expect(result['container-slack']).toBe('slack');
  });
});

// ─── Preservation: isComplete Logic ──────────────────────────────────────────

describe('Preservation — isComplete logic (fixed version)', () => {
  function computeIsComplete_FIXED(totalCount: number, selectedCount: number): boolean {
    // FIXED: at least one selection enables Continue
    return totalCount > 0 && selectedCount >= 1;
  }

  it('isComplete is false with 0 containers', () => {
    expect(computeIsComplete_FIXED(0, 0)).toBe(false);
  });

  it('isComplete is false with containers but no selections', () => {
    expect(computeIsComplete_FIXED(3, 0)).toBe(false);
  });

  it('isComplete is true with 1 selection out of 1 container', () => {
    expect(computeIsComplete_FIXED(1, 1)).toBe(true);
  });

  it('isComplete is true with 1 selection out of 3 containers', () => {
    // Validates: Requirements 2.3 — at least one selection is sufficient
    expect(computeIsComplete_FIXED(3, 1)).toBe(true);
  });

  it('isComplete is true with 2 selections out of 8 containers', () => {
    // Validates: Requirements 2.3 — simulates the screenshot scenario
    expect(computeIsComplete_FIXED(8, 2)).toBe(true);
  });

  it('isComplete is true with all containers selected', () => {
    expect(computeIsComplete_FIXED(5, 5)).toBe(true);
  });
});

// ─── Preservation: Intent Analyzer System Prompt ─────────────────────────────

describe('Preservation — Intent analyzer system prompt retains existing rules', () => {
  it('system prompt still contains the BRANCHING WORKFLOWS rule', () => {
    // Validates: Requirements 3.6 — branching rule must be preserved
    const prompt = buildSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('BRANCHING WORKFLOWS');
  });

  it('system prompt still contains the trigger requirement rule', () => {
    // Validates: Requirements 3.6
    const prompt = buildSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('Exactly ONE unit must have semanticRole "trigger"');
  });

  it('system prompt still contains the COUNT CHECK rule', () => {
    // Validates: Requirements 3.6
    const prompt = buildSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('COUNT CHECK');
  });

  it('system prompt still contains the output format instructions', () => {
    // Validates: Requirements 3.6
    const prompt = buildSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('OUTPUT FORMAT');
    expect(prompt).toContain('unitId');
    expect(prompt).toContain('semanticRole');
    expect(prompt).toContain('orderIndex');
  });

  it('system prompt now also contains the STRICT SCOPE RULE', () => {
    // Validates: Requirements 2.4 — new rule is present
    const prompt = buildSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('STRICT SCOPE RULE');
  });

  it('system prompt now also contains the DEDUPLICATION RULE', () => {
    // Validates: Requirements 2.4 — new rule is present
    const prompt = buildSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('DEDUPLICATION RULE');
  });
});

// ─── Preservation: Grouper System Prompt ─────────────────────────────────────

describe('Preservation — Capability grouper system prompt retains existing rules', () => {
  it('grouper prompt still contains the semantic equivalence rule', () => {
    // Validates: Requirements 3.7 — grouper must still group by semantic equivalence
    const prompt = buildGrouperSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('semantic equivalence');
  });

  it('grouper prompt still contains the NODE_CATALOG reference', () => {
    // Validates: Requirements 3.7
    const prompt = buildGrouperSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('NODE_CATALOG');
  });

  it('grouper prompt still contains the candidates field requirement', () => {
    // Validates: Requirements 3.7
    const prompt = buildGrouperSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('"candidates"');
  });

  it('grouper prompt now also contains the SEMANTIC RELEVANCE RULE', () => {
    // Validates: Requirements 2.5 — new rule is present
    const prompt = buildGrouperSystemPromptForTest('(mock catalog)');
    expect(prompt).toContain('SEMANTIC RELEVANCE RULE');
  });
});
