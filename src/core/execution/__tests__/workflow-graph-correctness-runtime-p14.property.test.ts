import * as fc from 'fast-check';
import { describe, expect, it, jest } from '@jest/globals';
import { executeNodeDynamically } from '../dynamic-node-executor';
import { LRUNodeOutputsCache } from '../../cache/lru-node-outputs-cache';

jest.mock('../../registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
    migrateConfig: jest.fn((_: string, config: Record<string, unknown>) => config),
    validateConfig: jest.fn(() => ({ valid: true, errors: [] })),
  },
}));

jest.mock('../../ai-input-resolver', () => ({
  aiInputResolver: {
    resolveInput: jest.fn(),
  },
}));

jest.mock('../../utils/node-authority', () => ({
  assertValidNodeType: jest.fn(() => true),
}));

jest.mock('../../intent-driven-json-router', () => ({
  shouldActivateRouter: jest.fn(() => false),
  IntentDrivenJsonRouter: jest.fn().mockImplementation(() => ({
    route: jest.fn(),
  })),
}));

jest.mock('../../../services/ai/ai-field-detector', () => ({
  aiFieldDetector: {
    detectAIFields: jest.fn(() => []),
  },
}));

const META_KEYS = ['$json', 'json', 'trigger', 'input'] as const;

async function buildCacheWithMetaShadowing(
  realEntry: { key: string; value: Record<string, unknown> },
  metaCount: number
): Promise<LRUNodeOutputsCache> {
  const cache = new LRUNodeOutputsCache(100);
  cache.set(realEntry.key, realEntry.value, false);
  await new Promise((r) => setTimeout(r, 1));
  for (const key of META_KEYS.slice(0, Math.max(1, Math.min(metaCount, META_KEYS.length)))) {
    cache.set(key, { _meta: true }, false);
    await new Promise((r) => setTimeout(r, 1));
  }
  return cache;
}

// Feature: workflow-graph-correctness, Property 14: AI Resolver Receives Actual Upstream Payload
describe('P14 — AI Resolver Receives Actual Upstream Payload', () => {
  it('property: resolveInputsWithAI forwards real upstream payload even when meta entries were set later', async () => {
    const { unifiedNodeRegistry } = await import('../../registry/unified-node-registry');
    const { aiInputResolver } = await import('../../ai-input-resolver');

    (unifiedNodeRegistry.get as jest.Mock).mockReturnValue({
      type: 'target_node',
      label: 'Target Node',
      category: 'utility',
      description: 'P14 test node',
      version: '1.0.0',
      inputSchema: {
        body: { type: 'string', required: false },
      },
      outputSchema: {},
      requiredInputs: [],
      defaultConfig: () => ({}),
      validateConfig: () => ({ valid: true, errors: [] }),
      execute: jest.fn(async () => ({ success: true, output: { ok: true } })),
      incomingPorts: ['default'],
      outgoingPorts: ['default'],
      isBranching: false,
    });

    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(
          fc.string({ minLength: 2, maxLength: 10 }).filter((k) => !META_KEYS.includes(k as any)),
          fc.string({ minLength: 1, maxLength: 30 }),
          { minKeys: 1, maxKeys: 4 }
        ),
        fc.integer({ min: 1, max: 4 }),
        async (realOutput, metaCount) => {
          jest.clearAllMocks();
          (aiInputResolver as any).resolveInput.mockResolvedValue({
            mode: 'json',
            value: {},
            explanation: 'mock',
          });

          const nodeOutputs = await buildCacheWithMetaShadowing(
            { key: 'real_upstream_node', value: realOutput as Record<string, unknown> },
            metaCount
          );

          const node: any = {
            id: 'target1',
            type: 'target_node',
            data: {
              type: 'target_node',
              label: 'Target Node',
              category: 'utility',
              config: {},
            },
          };

          await executeNodeDynamically({
            node,
            input: null,
            nodeOutputs,
            supabase: {} as any,
            workflowId: 'wf_p14',
            userId: 'u_test',
            currentUserId: 'u_test',
          });

          expect((aiInputResolver as any).resolveInput).toHaveBeenCalled();
          const callArg = (aiInputResolver as any).resolveInput.mock.calls[0][0];
          expect(callArg.previousOutput).toEqual(realOutput);
          expect(callArg.previousOutput).toBeDefined();
          expect(Object.keys(callArg.previousOutput || {}).length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 30 }
    );
  });
});
