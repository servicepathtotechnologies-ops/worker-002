/**
 * POST /api/test-type1-node
 *
 * Tests a single Type 1 node (no external credentials) using a pre-defined
 * synthetic fixture. Calls nodeDef.execute() directly — no DB or credential
 * resolution needed.
 *
 * Body: { nodeType: string }
 * Returns: { success, output, executionTimeMs, assertions: { passed, failed } }
 */

import { Request, Response } from 'express';
import { unifiedNodeRegistry } from '../core/registry/unified-node-registry';
import { nodeTestFixtures } from '../core/registry/node-test-fixtures';
import type { NodeExecutionContext } from '../core/types/unified-node-contract';

export default async function testType1NodeHandler(req: Request, res: Response) {
  const { nodeType } = req.body as { nodeType?: string };

  if (!nodeType) {
    return res.status(400).json({ success: false, error: { message: 'nodeType is required' } });
  }

  // Check fixture exists
  const fixture = nodeTestFixtures[nodeType];
  if (!fixture) {
    return res.status(404).json({
      success: false,
      error: { message: `No Type 1 test fixture defined for node type: ${nodeType}` },
    });
  }

  // Check node is registered
  const nodeDef = unifiedNodeRegistry.get(nodeType);
  if (!nodeDef) {
    return res.status(404).json({
      success: false,
      error: { message: `Node type not registered in unified registry: ${nodeType}` },
    });
  }

  // Reject nodes that require external credentials (Type 2 / Type 3)
  const credSchema = nodeDef.credentialSchema ?? {};
  if (Object.keys(credSchema).length > 0) {
    return res.status(422).json({
      success: false,
      error: {
        message: `${nodeType} requires external credentials and is not a Type 1 node. Use /api/test-connection for credential-based nodes.`,
      },
    });
  }

  const startMs = Date.now();

  try {
    // Build a minimal execution context from the fixture
    const inputData = (fixture.input && typeof fixture.input === 'object' && !Array.isArray(fixture.input))
      ? fixture.input as Record<string, any>
      : {};
    const context: NodeExecutionContext = {
      nodeId: `test_${nodeType}_${Date.now()}`,
      nodeType,
      config: { ...fixture.config },
      inputs: inputData, // upstream input data (not config) so $json.field resolves correctly
      rawInput: fixture.input,
      upstreamOutputs: new Map(),
      workflowId: 'fixture_test_workflow',
      userId: 'fixture_test_user',
      currentUserId: 'fixture_test_user',
      db: null, // Type 1 nodes must not require DB
    };

    const result = await nodeDef.execute(context);
    const executionTimeMs = Date.now() - startMs;

    // Run assertions
    const assertionsPassed: string[] = [];
    const assertionsFailed: string[] = [];

    // Assertion 1: success flag matches expectation
    if (result.success === fixture.expectSuccess) {
      assertionsPassed.push(`success === ${fixture.expectSuccess}`);
    } else {
      assertionsFailed.push(
        `Expected success=${fixture.expectSuccess} but got success=${result.success}` +
        (result.error ? `: ${result.error.message}` : '')
      );
    }

    // Assertion 2: expected output keys present (only when expectSuccess=true)
    if (fixture.expectSuccess && fixture.expectOutputKeys && result.output) {
      for (const key of fixture.expectOutputKeys) {
        const outputObj = typeof result.output === 'object' && result.output !== null
          ? result.output as Record<string, unknown>
          : {};
        if (key in outputObj) {
          assertionsPassed.push(`output has key: ${key}`);
        } else {
          assertionsFailed.push(`output missing expected key: ${key}`);
        }
      }
    }

    const allPassed = assertionsFailed.length === 0;

    return res.json({
      success: allPassed,
      nodeType,
      executionTimeMs,
      output: result.output ?? null,
      error: result.error ?? null,
      assertions: {
        passed: assertionsPassed,
        failed: assertionsFailed,
      },
      fixture: {
        description: fixture.description,
        expectSuccess: fixture.expectSuccess,
        expectOutputKeys: fixture.expectOutputKeys,
      },
    });
  } catch (err) {
    const executionTimeMs = Date.now() - startMs;
    const message = err instanceof Error ? err.message : String(err);

    return res.status(500).json({
      success: false,
      nodeType,
      executionTimeMs,
      error: { message: `Unhandled exception during node execution: ${message}` },
      assertions: { passed: [], failed: [`Unhandled exception: ${message}`] },
    });
  }
}
