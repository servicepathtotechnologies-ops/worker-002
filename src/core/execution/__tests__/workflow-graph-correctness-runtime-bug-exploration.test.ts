/**
 * Bug Condition Exploration Tests — Runtime Field Mapping
 * Feature: workflow-graph-correctness
 *
 * CRITICAL: These tests encode the EXPECTED (correct) behavior.
 * They are expected to FAIL on unfixed code — failure confirms the bugs exist.
 * They will PASS after the fixes are applied.
 *
 * Properties tested:
 *   P13 — getPreviousNodeOutput Returns Last Non-Meta Entry
 *   P14 — AI Resolver Receives Actual Upstream Payload (not empty/meta)
 */

import * as fc from 'fast-check';
import { describe, expect, it } from '@jest/globals';
import { LRUNodeOutputsCache } from '../../cache/lru-node-outputs-cache';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const META_KEYS = ['$json', 'json', 'trigger', 'input'];

/**
 * Simulate getPreviousNodeOutput as currently implemented in dynamic-node-executor.ts.
 * Returns the most recently SET entry excluding meta keys.
 */
function getPreviousNodeOutputCurrent(cache: LRUNodeOutputsCache): unknown {
  return cache.getMostRecentOutput(META_KEYS);
}

/**
 * Build a cache with real entries set first, then meta entries set after.
 * This simulates the bug: meta keys set after real output shadow the real output
 * when getMostRecentOutput uses setTimestamp ordering.
 */
async function buildCacheWithMetaShadowing(
  realEntries: Array<{ key: string; value: Record<string, unknown> }>,
  metaEntries: Array<{ key: string; value: unknown }>
): Promise<LRUNodeOutputsCache> {
  const cache = new LRUNodeOutputsCache(100);
  // Set real entries first
  for (const { key, value } of realEntries) {
    cache.set(key, value, false);
    await new Promise(r => setTimeout(r, 1)); // ensure distinct timestamps
  }
  // Set meta entries after (higher setTimestamp)
  for (const { key, value } of metaEntries) {
    cache.set(key, value, false);
    await new Promise(r => setTimeout(r, 1));
  }
  return cache;
}

// ─── P13: getPreviousNodeOutput Returns Last Non-Meta Entry ──────────────────

// Feature: workflow-graph-correctness, Property 13: getPreviousNodeOutput Returns Last Non-Meta Entry
describe('P13 — getPreviousNodeOutput Returns Last Non-Meta Entry', () => {
  it('returns real node output even when meta keys were set after it', async () => {
    // Feature: workflow-graph-correctness, Property 13: getPreviousNodeOutput Returns Last Non-Meta Entry
    const realOutput = { status: 'shipped', orderId: '12345', trackingUrl: 'https://track.example.com' };
    const cache = await buildCacheWithMetaShadowing(
      [{ key: 'node_gmail_1', value: realOutput }],
      [
        { key: '$json', value: { _trigger: true } },
        { key: 'json', value: {} },
        { key: 'trigger', value: { _meta: true } },
      ]
    );

    const result = getPreviousNodeOutputCurrent(cache);
    console.log('[P13] getPreviousNodeOutput result:', result);
    console.log('[P13] expected:', realOutput);

    // The result should be the real node output, not undefined or a meta value
    expect(result).toBeDefined();
    expect(result).toEqual(realOutput);
  });

  it('returns the most recently set real entry when multiple real entries exist', async () => {
    // Feature: workflow-graph-correctness, Property 13: getPreviousNodeOutput Returns Last Non-Meta Entry
    const firstOutput = { message: 'first output' };
    const secondOutput = { message: 'second output', data: [1, 2, 3] };
    const cache = await buildCacheWithMetaShadowing(
      [
        { key: 'node_1', value: firstOutput },
        { key: 'node_2', value: secondOutput },
      ],
      [{ key: '$json', value: {} }]
    );

    const result = getPreviousNodeOutputCurrent(cache);
    console.log('[P13] result:', result);
    // Should return the most recently set real entry (node_2)
    expect(result).toEqual(secondOutput);
  });

  it('does not return undefined when a real entry exists but meta was set later', async () => {
    // Feature: workflow-graph-correctness, Property 13: getPreviousNodeOutput Returns Last Non-Meta Entry
    const realOutput = { subject: 'Order shipped', body: 'Your order has been shipped.' };
    const cache = await buildCacheWithMetaShadowing(
      [{ key: 'node_http_1', value: realOutput }],
      [
        { key: '$json', value: null },
        { key: 'input', value: undefined },
      ]
    );

    const result = getPreviousNodeOutputCurrent(cache);
    console.log('[P13] result (should not be undefined):', result);
    expect(result).not.toBeUndefined();
    expect(result).toEqual(realOutput);
  });

  it('property: for any cache with K real entries + M meta entries (meta set after), returns a real entry', async () => {
    // Feature: workflow-graph-correctness, Property 13: getPreviousNodeOutput Returns Last Non-Meta Entry
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 3 }),
        async (k, m) => {
          const realEntries = Array.from({ length: k }, (_, i) => ({
            key: `real_node_${i}`,
            value: { data: `value_${i}`, index: i },
          }));
          const metaEntries = META_KEYS.slice(0, m).map(key => ({
            key,
            value: { _meta: true },
          }));

          const cache = await buildCacheWithMetaShadowing(realEntries, metaEntries);
          const result = getPreviousNodeOutputCurrent(cache);

          // Result must be one of the real entries, not undefined
          const realValues = realEntries.map(e => e.value);
          const isRealEntry = realValues.some(v => JSON.stringify(v) === JSON.stringify(result));
          expect(isRealEntry).toBe(true);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ─── P14: AI Resolver Receives Actual Upstream Payload ───────────────────────

// Feature: workflow-graph-correctness, Property 14: AI Resolver Receives Actual Upstream Payload
describe('P14 — AI Resolver Receives Actual Upstream Payload (not empty/meta)', () => {
  it('isEffectivelyEmptyUpstreamPayload returns false for real node output', async () => {
    // Feature: workflow-graph-correctness, Property 14: AI Resolver Receives Actual Upstream Payload
    const { isEffectivelyEmptyUpstreamPayload } = await import('../../utils/upstream-payload-signal');

    const realOutputs = [
      { status: 'shipped', orderId: '123' },
      { message: 'Hello from Slack', channel: '#general' },
      { subject: 'Order update', body: 'Your order is ready.' },
      { url: 'https://api.example.com', method: 'GET', response: { ok: true } },
    ];

    for (const output of realOutputs) {
      const isEmpty = isEffectivelyEmptyUpstreamPayload(output);
      console.log(`[P14] isEffectivelyEmptyUpstreamPayload(${JSON.stringify(output)}):`, isEmpty);
      expect(isEmpty).toBe(false);
    }
  });

  it('isEffectivelyEmptyUpstreamPayload returns true for meta/trigger-only payloads', async () => {
    // Feature: workflow-graph-correctness, Property 14: AI Resolver Receives Actual Upstream Payload
    const { isEffectivelyEmptyUpstreamPayload } = await import('../../utils/upstream-payload-signal');

    const metaPayloads = [
      { _trigger: true },
      { _meta: true, _nodeType: 'form' },
      {},
      null,
      undefined,
    ];

    for (const payload of metaPayloads) {
      const isEmpty = isEffectivelyEmptyUpstreamPayload(payload);
      console.log(`[P14] isEffectivelyEmptyUpstreamPayload(${JSON.stringify(payload)}):`, isEmpty);
      expect(isEmpty).toBe(true);
    }
  });

  it('when cache has real output + meta entries (meta set after), thin-payload guard does NOT fire', async () => {
    // Feature: workflow-graph-correctness, Property 14: AI Resolver Receives Actual Upstream Payload
    const { isEffectivelyEmptyUpstreamPayload } = await import('../../utils/upstream-payload-signal');

    const realOutput = { status: 'processing', orderId: '456', eta: '2 days' };
    const cache = await buildCacheWithMetaShadowing(
      [{ key: 'node_form_1', value: realOutput }],
      [
        { key: '$json', value: { _trigger: true } },
        { key: 'trigger', value: { _meta: true } },
      ]
    );

    const previousOutput = getPreviousNodeOutputCurrent(cache);
    console.log('[P14] previousOutput from cache:', previousOutput);

    // The thin-payload guard should NOT fire — previousOutput is the real node output
    const wouldFireThinGuard =
      previousOutput == null ||
      (typeof previousOutput === 'object' && Object.keys(previousOutput as object).length === 0) ||
      isEffectivelyEmptyUpstreamPayload(previousOutput);

    console.log('[P14] wouldFireThinGuard:', wouldFireThinGuard, '(should be false)');
    expect(wouldFireThinGuard).toBe(false);
  });

  it('property: for any non-empty real output, thin-payload guard does not fire when cache is correctly read', async () => {
    // Feature: workflow-graph-correctness, Property 14: AI Resolver Receives Actual Upstream Payload
    const { isEffectivelyEmptyUpstreamPayload } = await import('../../utils/upstream-payload-signal');

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          key1: fc.string({ minLength: 2, maxLength: 10 }).filter((s) => s.trim().length > 0),
          val1: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        }),
        async ({ key1, val1 }) => {
          const realOutput = { [key1]: val1, _realData: true };
          const cache = await buildCacheWithMetaShadowing(
            [{ key: 'real_node', value: realOutput }],
            [{ key: '$json', value: { _trigger: true } }]
          );

          const previousOutput = getPreviousNodeOutputCurrent(cache);
          const wouldFireThinGuard =
            previousOutput == null ||
            (typeof previousOutput === 'object' && Object.keys(previousOutput as object).length === 0) ||
            isEffectivelyEmptyUpstreamPayload(previousOutput);

          // Should NOT fire thin guard when real output exists
          expect(wouldFireThinGuard).toBe(false);
        }
      ),
      { numRuns: 30 }
    );
  });
});
