/**
 * Property-Based Tests: Stage Progress Map
 *
 * Feature: workflow-generation-progress-bar-stages
 *
 * Property 1: Stage Progress Map Monotonicity
 * Property 2: Unknown Stage Fallback is Non-Zero
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { describe, it, expect } from '@jest/globals';
import * as fc from 'fast-check';
import {
  STAGE_PROGRESS_MAP,
  STAGE_LOG_LABELS,
  PIPELINE_STAGE_ORDER,
  getStageProgress,
} from '../stage-progress-map';

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe('STAGE_PROGRESS_MAP', () => {
  it('defines all 8 stage names', () => {
    const expected = [
      'intent',
      'structural_prompt',
      'node_selection',
      'edge_reasoning',
      'validation',
      'property_population',
      'credential_discovery',
      'field_ownership',
    ];
    for (const stage of expected) {
      expect(STAGE_PROGRESS_MAP).toHaveProperty(stage);
    }
  });

  it('has values strictly between 0 and 100 for all stages', () => {
    for (const [stage, pct] of Object.entries(STAGE_PROGRESS_MAP)) {
      expect(pct).toBeGreaterThan(0);
      expect(pct).toBeLessThan(100);
    }
  });
});

describe('STAGE_LOG_LABELS', () => {
  it('has a non-empty string label for each of the 8 stage names', () => {
    for (const stage of PIPELINE_STAGE_ORDER) {
      expect(typeof STAGE_LOG_LABELS[stage]).toBe('string');
      expect(STAGE_LOG_LABELS[stage].length).toBeGreaterThan(0);
    }
  });
});

describe('PIPELINE_STAGE_ORDER', () => {
  it('contains exactly 8 stage names', () => {
    expect(PIPELINE_STAGE_ORDER).toHaveLength(8);
  });

  it('matches the keys of STAGE_PROGRESS_MAP', () => {
    const mapKeys = Object.keys(STAGE_PROGRESS_MAP).sort();
    const orderKeys = [...PIPELINE_STAGE_ORDER].sort();
    expect(orderKeys).toEqual(mapKeys);
  });
});

describe('getStageProgress', () => {
  it('returns the mapped value for known stages', () => {
    expect(getStageProgress('intent')).toBe(10);
    expect(getStageProgress('field_ownership')).toBe(93);
  });

  it('returns 5 (non-zero fallback) for an unknown stage', () => {
    expect(getStageProgress('unknown_stage')).toBe(5);
    expect(getStageProgress('')).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Property 1: Stage Progress Map Monotonicity
// Validates: Requirements 1.2, 1.4, 1.5
// ---------------------------------------------------------------------------

describe('Property 1: Stage Progress Map Monotonicity', () => {
  it('consecutive stages have strictly ascending progress values, all in (0, 100)', () => {
    // Feature: workflow-generation-progress-bar-stages, Property 1: Stage Progress Map Monotonicity
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: PIPELINE_STAGE_ORDER.length - 2 }),
        (i) => {
          const a = getStageProgress(PIPELINE_STAGE_ORDER[i]);
          const b = getStageProgress(PIPELINE_STAGE_ORDER[i + 1]);
          return a > 0 && b > 0 && a < 100 && b < 100 && b > a;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Unknown Stage Fallback is Non-Zero
// Validates: Requirements 1.3
// ---------------------------------------------------------------------------

describe('Property 2: Unknown Stage Fallback is Non-Zero', () => {
  it('returns a value > 0 and < 100 for any string not in STAGE_PROGRESS_MAP', () => {
    // Feature: workflow-generation-progress-bar-stages, Property 2: Unknown Stage Fallback is Non-Zero
    fc.assert(
      fc.property(
        fc.string().filter((s) => !(s in STAGE_PROGRESS_MAP)),
        (unknownStage) => {
          const p = getStageProgress(unknownStage);
          return p > 0 && p < 100;
        }
      ),
      { numRuns: 100 }
    );
  });
});
