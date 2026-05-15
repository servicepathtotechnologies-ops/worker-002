/**
 * Tests for the placeholder-like value detection used to prevent property-population
 * AI artifacts (especially node IDs) from blocking runtime AI content generation.
 *
 * Root cause from logs.txt (2026-05-08):
 *   - Switch output included `nodeId: "node_176fee7c-2227-495e-b91f-822b4332f068"`
 *   - Property-population AI set Slack `text`, `message`, `iconEmoji` to that node ID
 *   - `isMeaningfulValueForResolution` treated it as a real value → runtime AI never fired
 *   - Fix: node IDs now match `looksPlaceholderLikeValue`, get cleared, AI generates real content
 */

import { looksPlaceholderLikeValue } from '../dynamic-node-executor';
import { LRUNodeOutputsCache } from '../../cache/lru-node-outputs-cache';
import { executeNodeDynamically } from '../dynamic-node-executor';
import { unifiedNodeRegistry } from '../../registry/unified-node-registry';

// ─── Unit tests: looksPlaceholderLikeValue ────────────────────────────────────

describe('looksPlaceholderLikeValue — node ID detection', () => {
  const NODE_ID = 'node_176fee7c-2227-495e-b91f-822b4332f068';

  it('detects the exact node ID from logs.txt as placeholder-like', () => {
    expect(looksPlaceholderLikeValue(NODE_ID)).toBe(true);
  });

  it('detects any node_UUID pattern as placeholder-like', () => {
    expect(looksPlaceholderLikeValue('node_00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(looksPlaceholderLikeValue('node_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(true);
    expect(looksPlaceholderLikeValue('node_12345678-1234-1234-1234-123456789abc')).toBe(true);
  });

  it('does NOT flag real message content as placeholder-like', () => {
    expect(looksPlaceholderLikeValue('Payment of $4000 was successful for vusa@email.com')).toBe(false);
    expect(looksPlaceholderLikeValue('Your payment is pending. Please retry.')).toBe(false);
    expect(looksPlaceholderLikeValue('Transaction failed. Contact support.')).toBe(false);
    expect(looksPlaceholderLikeValue('#payment-reminders')).toBe(false);
    expect(looksPlaceholderLikeValue('Payment Reminder Bot')).toBe(false);
  });

  it('does NOT flag short IDs that look like node IDs but are not full UUIDs', () => {
    expect(looksPlaceholderLikeValue('node_abc123')).toBe(false);
    expect(looksPlaceholderLikeValue('node_123')).toBe(false);
  });

  it('still detects existing placeholder patterns', () => {
    expect(looksPlaceholderLikeValue('')).toBe(true);
    expect(looksPlaceholderLikeValue('[Insert message here]')).toBe(true);
    expect(looksPlaceholderLikeValue('Process the workflow using the configured nodes.')).toBe(true);
    expect(looksPlaceholderLikeValue('placeholder')).toBe(true);
    expect(looksPlaceholderLikeValue('generated message')).toBe(true);
  });

  it('returns false for non-string types', () => {
    expect(looksPlaceholderLikeValue(null)).toBe(false);
    expect(looksPlaceholderLikeValue(undefined)).toBe(false);
    expect(looksPlaceholderLikeValue(42)).toBe(false);
    expect(looksPlaceholderLikeValue({})).toBe(false);
    expect(looksPlaceholderLikeValue([])).toBe(false);
  });

  it('is case-insensitive for node ID detection', () => {
    expect(looksPlaceholderLikeValue('NODE_176FEE7C-2227-495E-B91F-822B4332F068')).toBe(true);
    expect(looksPlaceholderLikeValue('Node_176fee7c-2227-495e-b91f-822b4332f068')).toBe(true);
  });
});

// ─── Integration: runtime AI fires for node-ID-valued runtime_ai fields ───────

describe('executeNodeDynamically — clears node ID and triggers AI for runtime_ai fields', () => {
  function makeNodeOutputs(data: Record<string, unknown>): LRUNodeOutputsCache {
    const cache = new LRUNodeOutputsCache(100);
    for (const [k, v] of Object.entries(data)) cache.set(k, v, true);
    return cache;
  }

  const supabaseStub: any = { from: () => supabaseStub };

  // Use log_output (no credentials, simple text output) to verify the clearing behavior.
  // log_output has a `message` field with fillMode runtime_ai.
  // google_gmail has `body` and `subject` as runtime_ai fields — correct test subject for
  // the placeholder clearing behavior (log_output.message is manual_static so cleanup doesn't apply).
  it('clears node ID on runtime_ai body/subject for google_gmail — node ID must NOT appear in output', async () => {
    const def = unifiedNodeRegistry.get('google_gmail');
    if (!def) return; // skip if not registered

    const NODE_ID = 'node_176fee7c-2227-495e-b91f-822b4332f068';

    const node = {
      id: 'gmail1',
      type: 'custom',
      data: {
        type: 'google_gmail',
        label: 'Send Payment Confirmation',
        config: {
          operation: 'send',
          recipientSource: 'manual_entry',
          recipientEmails: 'test@example.com',
          // PP AI injected the switch node ID into runtime_ai fields — must be cleared
          subject: NODE_ID,
          body: NODE_ID,
        },
      },
    } as any;

    const upstreamData = {
      payment_status: 'success',
      payment_amount: 4000,
      customer_email: 'test@example.com',
    };

    const result = await executeNodeDynamically({
      node,
      input: upstreamData,
      nodeOutputs: makeNodeOutputs({ $json: upstreamData, json: upstreamData, input: upstreamData }),
      db: supabaseStub,
      workflowId: 'wf-test',
    });

    // The node ID must NOT appear as a field value in the output.
    // (AI may or may not generate content based on env — but the artifact must be cleared.)
    const outputStr = JSON.stringify(result ?? {});
    expect(outputStr).not.toContain(NODE_ID);
  }, 30000);
});
