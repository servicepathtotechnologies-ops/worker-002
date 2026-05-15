/**
 * POST /api/test-all-type1-nodes
 *
 * Runs test fixtures for every Type 1 node sequentially and returns a summary.
 * Used by the /admin/node-tests batch test runner page.
 *
 * Returns: { totalNodes, passed, failed, results: Array<NodeTestResult> }
 */

import { Request, Response } from 'express';
import { unifiedNodeRegistry } from '../core/registry/unified-node-registry';
import { nodeTestFixtures } from '../core/registry/node-test-fixtures';
import type { NodeExecutionContext } from '../core/types/unified-node-contract';

export interface NodeTestResult {
  nodeType: string;
  passed: boolean;
  executionTimeMs: number;
  error?: string;
  assertionsFailed?: string[];
}

export default async function testAllType1NodesHandler(req: Request, res: Response) {
  const results: NodeTestResult[] = [];

  for (const [nodeType, fixture] of Object.entries(nodeTestFixtures)) {
    const nodeDef = unifiedNodeRegistry.get(nodeType);

    if (!nodeDef) {
      results.push({
        nodeType,
        passed: false,
        executionTimeMs: 0,
        error: 'Node type not registered in unified registry',
      });
      continue;
    }

    // Skip if node has credential schema (shouldn't happen with Type 1 fixtures but be safe)
    const credSchema = nodeDef.credentialSchema ?? {};
    if (Object.keys(credSchema).length > 0) {
      results.push({
        nodeType,
        passed: false,
        executionTimeMs: 0,
        error: 'Node requires credentials — not a Type 1 node',
      });
      continue;
    }

    const startMs = Date.now();
    try {
      const inputData = (fixture.input && typeof fixture.input === 'object' && !Array.isArray(fixture.input))
        ? fixture.input as Record<string, any>
        : {};
      const context: NodeExecutionContext = {
        nodeId: `batch_test_${nodeType}_${Date.now()}`,
        nodeType,
        config: { ...fixture.config },
        inputs: inputData, // upstream input data so $json.field resolves correctly
        rawInput: fixture.input,
        upstreamOutputs: new Map(),
        workflowId: 'batch_fixture_test',
        userId: 'fixture_test_user',
        currentUserId: 'fixture_test_user',
        db: null,
      };

      const result = await nodeDef.execute(context);
      const executionTimeMs = Date.now() - startMs;
      const assertionsFailed: string[] = [];

      // Check success flag
      if (result.success !== fixture.expectSuccess) {
        assertionsFailed.push(
          `Expected success=${fixture.expectSuccess} but got success=${result.success}` +
          (result.error ? `: ${result.error.message}` : '')
        );
      }

      // Check expected output keys
      if (fixture.expectSuccess && fixture.expectOutputKeys && result.output) {
        const outputObj = typeof result.output === 'object' && result.output !== null
          ? result.output as Record<string, unknown>
          : {};
        for (const key of fixture.expectOutputKeys) {
          if (!(key in outputObj)) {
            assertionsFailed.push(`output missing expected key: ${key}`);
          }
        }
      }

      results.push({
        nodeType,
        passed: assertionsFailed.length === 0,
        executionTimeMs,
        error: assertionsFailed.length > 0 ? assertionsFailed[0] : undefined,
        assertionsFailed: assertionsFailed.length > 0 ? assertionsFailed : undefined,
      });
    } catch (err) {
      const executionTimeMs = Date.now() - startMs;
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        nodeType,
        passed: false,
        executionTimeMs,
        error: `Unhandled exception: ${message}`,
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return res.json({
    totalNodes: results.length,
    passed,
    failed,
    passRate: results.length > 0 ? Math.round((passed / results.length) * 100) : 0,
    results,
    timestamp: new Date().toISOString(),
  });
}
