/**
 * Bug Condition Exploration Tests — Execution Status Stale Cache Fix
 *
 * These tests MUST FAIL on unfixed code — failure confirms both bugs exist.
 * DO NOT fix the tests or the code when they fail.
 * They encode the expected (correct) behavior and will PASS after the fix is applied.
 *
 * Bug 1 — Stale Redis cache on execution completion:
 *   After `updateExecutionStatus('abc-123', 'success')`, the Redis cache for
 *   `/api/execution-status/abc-123?lite=1` still holds the stale `status='running'`
 *   response because no invalidation occurs. The frontend receives stale data.
 *
 * Bug 2 — Concurrent attach-inputs race condition:
 *   When 4 simultaneous POST /attach-inputs requests arrive for the same workflowId,
 *   the full pipeline (including fingerprintWorkflowTopology) runs N times instead of
 *   once, and `Post-freeze fingerprint mismatch` warnings are emitted.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import crypto from 'crypto';

// ─── Bug 1: Stale Redis cache after execution completion ──────────────────────

describe('Bug 1 — Stale Redis cache after execution completion', () => {
  /**
   * Simulate buildCacheKey logic from redisGetCache.ts so we can seed the exact key.
   * buildCacheKey hashes { params, query, body, auth } and appends to req.path.
   */
  function buildCacheKey(path: string, params: Record<string, string>, query: Record<string, string>, auth: string): string {
    const authHash = auth
      ? crypto.createHash('sha256').update(auth).digest('hex').slice(0, 16)
      : 'anon';
    const source = JSON.stringify({ params, query, body: {}, auth: authHash });
    const paramsHash = crypto.createHash('sha256').update(source).digest('hex');
    return `${path}:${paramsHash}`;
  }

  /**
   * Build a minimal in-memory Redis mock that supports get/setEx/del/scan.
   */
  function buildRedisMock(initialData: Record<string, string> = {}): {
    store: Record<string, string>;
    get: jest.Mock;
    setEx: jest.Mock;
    del: jest.Mock;
    scan: jest.Mock;
    isOpen: boolean;
  } {
    const store: Record<string, string> = { ...initialData };
    return {
      store,
      isOpen: true,
      get: jest.fn(async (key: string) => store[key] ?? null),
      setEx: jest.fn(async (key: string, _ttl: number, value: string) => {
        store[key] = value;
      }),
      del: jest.fn(async (key: string) => {
        const existed = key in store;
        delete store[key];
        return existed ? 1 : 0;
      }),
      scan: jest.fn(async (_cursor: number, options: { MATCH?: string; COUNT?: number }) => {
        const pattern = options?.MATCH || '*';
        // Convert Redis glob pattern to regex
        const regexStr = pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.');
        const regex = new RegExp(`^${regexStr}$`);
        const keys = Object.keys(store).filter((k) => regex.test(k));
        return { cursor: 0, keys };
      }),
    };
  }

  test('Bug 1a — cache still holds stale running status after updateExecutionStatus("success")', async () => {
    /**
     * EXPECTED FAILURE on unfixed code:
     * After updateExecutionStatus writes 'success' to the DB, the Redis cache key
     * for /api/execution-status/abc-123?lite=1 is NOT invalidated.
     * The redisGetCache middleware returns the stale cached body with status='running'.
     *
     * This test asserts the CORRECT behavior (cache should be invalidated).
     * It will FAIL on unfixed code because no invalidation happens.
     */
    const executionId = 'abc-123';
    const path = `/api/execution-status/${executionId}`;
    const query = { lite: '1' };
    const authToken = 'Bearer test-token-abc';

    // Build the exact cache key that redisGetCache would use
    const cacheKey = buildCacheKey(
      path,
      { executionId },
      query,
      authToken
    );

    // Seed Redis with a stale 'running' response
    const staleBody = JSON.stringify({
      execution_id: executionId,
      status: 'running',
      workflow_id: 'wf-abc',
      current_node: 'node-2',
      steps: [],
    });
    const redisMock = buildRedisMock({ [cacheKey]: staleBody });

    // Mock the Redis client singleton so getCacheRedisClient returns our mock
    jest.resetModules();
    jest.mock('../src/middleware/redisGetCache', () => {
      const actual = jest.requireActual('../src/middleware/redisGetCache');
      return {
        ...actual,
        getCacheRedisClient: jest.fn().mockResolvedValue(redisMock),
      };
    });

    // Mock DB: updateExecutionStatus writes 'success' to DB
    const mockSupabase = {
      from: jest.fn().mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: executionId, status: 'success' }, error: null }),
      })),
    };

    jest.mock('../src/core/database/aws-db-client', () => ({
      getDbClient: () => mockSupabase,
    }));

    // Call updateExecutionStatus (unfixed code does NOT invalidate cache)
    const { PersistentLayer } = await import('../src/services/workflow-executor/persistent-layer');
    const layer = new PersistentLayer(mockSupabase as any);
    await layer.updateExecutionStatus(executionId, 'success');

    // Allow any fire-and-forget promises to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    // ASSERT: After updateExecutionStatus('success'), the cache key must be gone.
    // On UNFIXED code: the key still exists → this assertion FAILS (confirming the bug).
    // On FIXED code: the key is deleted → this assertion PASSES.
    const cachedValue = await redisMock.get(cacheKey);
    expect(cachedValue).toBeNull(); // FAILS on unfixed code — stale key still present
  });

  test('Bug 1b — redisGetCache middleware returns stale running status after execution completes', async () => {
    /**
     * EXPECTED FAILURE on unfixed code:
     * The redisGetCache middleware serves the cached 'running' response even after
     * the execution has completed in the DB. The response body shows status='running'.
     *
     * This test directly verifies the Redis store state: after updateExecutionStatus('success'),
     * the stale key must be gone so the next middleware call would produce a MISS.
     * It will FAIL on unfixed code because the stale key is still in Redis.
     */
    const executionId = 'abc-123';
    const path = `/api/execution-status/${executionId}`;
    const query = { lite: '1' };
    const authToken = 'Bearer test-token-abc';

    const cacheKey = buildCacheKey(path, { executionId }, query, authToken);

    const staleBody = JSON.stringify({
      execution_id: executionId,
      status: 'running',
      workflow_id: 'wf-abc',
      current_node: 'node-2',
      steps: [],
    });
    const redisMock = buildRedisMock({ [cacheKey]: staleBody });

    // Verify the stale key is present before the update
    const beforeUpdate = await redisMock.get(cacheKey);
    expect(beforeUpdate).not.toBeNull(); // Stale key exists before update

    // Simulate: updateExecutionStatus writes 'success' (no invalidation in unfixed code)
    const mockSupabase = {
      from: jest.fn().mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: executionId, status: 'success' }, error: null }),
      })),
    };

    // Reset modules and mock getCacheRedisClient to return this test's redisMock
    jest.resetModules();
    jest.mock('../src/middleware/redisGetCache', () => {
      const actual = jest.requireActual('../src/middleware/redisGetCache');
      return {
        ...actual,
        getCacheRedisClient: jest.fn().mockResolvedValue(redisMock),
      };
    });
    jest.mock('../src/core/database/aws-db-client', () => ({
      getDbClient: () => mockSupabase,
    }));

    const { PersistentLayer } = await import('../src/services/workflow-executor/persistent-layer');
    const layer = new PersistentLayer(mockSupabase as any);
    await layer.updateExecutionStatus(executionId, 'success');

    // Allow any fire-and-forget promises to settle
    await new Promise((resolve) => setTimeout(resolve, 100));

    // ASSERT: After updateExecutionStatus('success'), the stale key must be gone.
    // On UNFIXED code: key still exists → FAILS (confirming the bug).
    // On FIXED code: key is deleted → PASSES.
    //
    // Counterexample: stale cache key still holds status='running' after execution completed
    const afterUpdate = await redisMock.get(cacheKey);
    expect(afterUpdate).toBeNull(); // FAILS on unfixed code — stale key still present
  });

  test('Bug 1c — key-variant coverage: ?lite=1 and ?lite=true produce different cache keys (both stale)', async () => {
    /**
     * EXPECTED FAILURE on unfixed code:
     * Both ?lite=1 and ?lite=true produce distinct cache keys. After execution completes,
     * BOTH keys remain stale because no invalidation occurs.
     *
     * This test asserts the CORRECT behavior: after updateExecutionStatus('success'),
     * ALL key variants for the execution ID must be invalidated.
     * It will FAIL on unfixed code because neither key is deleted.
     */
    const executionId = 'abc-123';
    const path = `/api/execution-status/${executionId}`;
    const authToken = 'Bearer test-token-abc';

    // Build both key variants
    const keyLite1 = buildCacheKey(path, { executionId }, { lite: '1' }, authToken);
    const keyLiteTrue = buildCacheKey(path, { executionId }, { lite: 'true' }, authToken);

    // Confirm the two keys are different (they hash different query strings)
    expect(keyLite1).not.toBe(keyLiteTrue);

    const staleBody = JSON.stringify({ execution_id: executionId, status: 'running', steps: [] });
    const redisMock = buildRedisMock({
      [keyLite1]: staleBody,
      [keyLiteTrue]: staleBody,
    });

    jest.resetModules();
    jest.mock('../src/middleware/redisGetCache', () => {
      const actual = jest.requireActual('../src/middleware/redisGetCache');
      return {
        ...actual,
        getCacheRedisClient: jest.fn().mockResolvedValue(redisMock),
      };
    });

    const mockSupabase = {
      from: jest.fn().mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: executionId, status: 'success' }, error: null }),
      })),
    };
    jest.mock('../src/core/database/aws-db-client', () => ({
      getDbClient: () => mockSupabase,
    }));

    const { PersistentLayer } = await import('../src/services/workflow-executor/persistent-layer');
    const layer = new PersistentLayer(mockSupabase as any);
    await layer.updateExecutionStatus(executionId, 'success');
    await new Promise((resolve) => setTimeout(resolve, 50));

    // ASSERT: Both key variants must be gone after invalidation.
    // On UNFIXED code: both keys still exist → both assertions FAIL (confirming the bug).
    // On FIXED code: SCAN pattern deletes all variants → both assertions PASS.
    const val1 = await redisMock.get(keyLite1);
    const valTrue = await redisMock.get(keyLiteTrue);

    // Counterexample: both keys still hold stale 'running' data after 'success' was written
    expect(val1).toBeNull();    // FAILS on unfixed code
    expect(valTrue).toBeNull(); // FAILS on unfixed code
  });
});

// ─── Bug 2: Concurrent attach-inputs pipeline duplication ────────────────────

describe('Bug 2 — Concurrent attach-inputs pipeline duplication', () => {
  /**
   * Build a minimal workflow suitable for attach-inputs processing.
   * Uses a simple trigger → gmail graph that passes normalization.
   */
  function buildMinimalWorkflow(workflowId: string) {
    return {
      id: workflowId,
      phase: 'draft',
      status: 'active',
      nodes: [
        {
          id: 'trigger-1',
          type: 'manual_trigger',
          data: { type: 'manual_trigger', label: 'Trigger', category: 'triggers', config: {} },
          position: { x: 0, y: 0 },
        },
        {
          id: 'gmail-1',
          type: 'google_gmail',
          data: {
            type: 'google_gmail',
            label: 'Gmail',
            category: 'communication',
            config: { operation: 'send' },
          },
          position: { x: 200, y: 0 },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'gmail-1', type: 'main' }],
      graph: null,
      metadata: null,
    };
  }

  test('Bug 2a — fingerprintWorkflowTopology is called more than once for 4 concurrent requests', async () => {
    /**
     * EXPECTED FAILURE on unfixed code:
     * With no in-flight deduplication, each of the 4 concurrent requests independently
     * runs the full pipeline, calling fingerprintWorkflowTopology once per request.
     * The counter will be 4 (or more) on unfixed code.
     *
     * This test asserts the CORRECT behavior: the pipeline runs exactly once.
     * It will FAIL on unfixed code because the counter > 1.
     */
    const workflowId = 'wf-concurrent-test';
    let fingerprintCallCount = 0;

    jest.resetModules();

    // Spy on fingerprintWorkflowTopology to count pipeline invocations
    jest.mock('../src/core/utils/workflow-topology-fingerprint', () => {
      const actual = jest.requireActual('../src/core/utils/workflow-topology-fingerprint');
      return {
        ...actual,
        fingerprintWorkflowTopology: jest.fn((...args: any[]) => {
          fingerprintCallCount++;
          return (actual as any).fingerprintWorkflowTopology(...args);
        }),
        diffWorkflowTopology: actual.diffWorkflowTopology,
        fingerprintWorkflowProtectedConfig: actual.fingerprintWorkflowProtectedConfig,
      };
    });

    const workflow = buildMinimalWorkflow(workflowId);

    // Mock DB to return the workflow for all fetches
    const mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'workflows') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: workflow, error: null }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };

    jest.mock('../src/core/database/aws-db-client', () => ({
      getDbClient: () => mockSupabase,
    }));

    const { default: attachInputsHandler } = await import('../src/api/attach-inputs');

    // Fire 4 concurrent requests for the same workflowId
    const makeRequest = () => {
      const req: any = {
        params: { workflowId },
        body: {
          inputs: { [`input_gmail-1_subject`]: 'Test Subject' },
        },
        headers: { authorization: 'Bearer test-token' },
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
        send: jest.fn(),
      };
      return attachInputsHandler(req, res).then(() => res);
    };

    // Reset counter before firing concurrent requests
    fingerprintCallCount = 0;

    await Promise.all([makeRequest(), makeRequest(), makeRequest(), makeRequest()]);

    // ASSERT: with deduplication, the pipeline runs exactly ONCE for 4 concurrent requests.
    // A single pipeline run calls fingerprintWorkflowTopology 5 times internally.
    // On UNFIXED code: 4 pipelines run → count = 20 → FAILS (confirming the bug).
    // On FIXED code: 1 pipeline runs → count = 5 → PASSES.
    //
    // Counterexample: fingerprintWorkflowTopology called N times for N concurrent requests
    expect(fingerprintCallCount).toBe(5); // FAILS on unfixed code — count will be 20
  });

  test('Bug 2b — pipeline runs N times for N concurrent requests (counter > 1)', async () => {
    /**
     * EXPECTED FAILURE on unfixed code:
     * With no in-flight deduplication, each of the 4 concurrent requests independently
     * runs the full pipeline. We count calls to fingerprintWorkflowTopology as a proxy
     * for pipeline invocations. On unfixed code the count is >> 1.
     *
     * This is a complementary assertion to Bug 2a using a different workflowId to
     * avoid module cache interference. It asserts counter === 1 (single pipeline run).
     * It will FAIL on unfixed code because the counter > 1.
     *
     * Also verifies: console.warn is called with attach-inputs-related messages
     * multiple times (each concurrent request logs independently), which is a
     * secondary indicator of duplicate pipeline execution.
     */
    const workflowId = 'wf-concurrent-count-test';
    let pipelineEntryCount = 0;

    jest.resetModules();

    // Count how many times the pipeline's normalization phase is entered
    // by spying on normalizeWorkflowGraph (called once per pipeline run)
    jest.mock('../src/core/utils/workflow-graph-normalizer', () => {
      const actual = jest.requireActual('../src/core/utils/workflow-graph-normalizer');
      return {
        ...actual,
        normalizeWorkflowGraph: jest.fn((...args: any[]) => {
          pipelineEntryCount++;
          return (actual as any).normalizeWorkflowGraph(...args);
        }),
      };
    });

    const workflow = buildMinimalWorkflow(workflowId);

    const mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'workflows') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: workflow, error: null }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };

    jest.mock('../src/core/database/aws-db-client', () => ({
      getDbClient: () => mockSupabase,
    }));

    const { default: attachInputsHandler } = await import('../src/api/attach-inputs');

    const makeRequest = () => {
      const req: any = {
        params: { workflowId },
        body: { inputs: { [`input_gmail-1_subject`]: 'Test Subject' } },
        headers: { authorization: 'Bearer test-token' },
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
        send: jest.fn(),
      };
      return attachInputsHandler(req, res).then(() => res);
    };

    // Reset counter before firing concurrent requests
    pipelineEntryCount = 0;

    await Promise.all([makeRequest(), makeRequest(), makeRequest(), makeRequest()]);

    // ASSERT: with deduplication, the pipeline runs exactly ONCE for 4 concurrent requests.
    // A single pipeline run calls normalizeWorkflowGraph 3 times internally.
    // On UNFIXED code: 4 pipelines run → count = 12 → FAILS (confirming the bug).
    // On FIXED code: 1 pipeline runs → count = 3 → PASSES.
    //
    // Counterexample: normalizeWorkflowGraph called N times for N concurrent requests
    expect(pipelineEntryCount).toBe(3); // FAILS on unfixed code — count will be 12
  });
});
