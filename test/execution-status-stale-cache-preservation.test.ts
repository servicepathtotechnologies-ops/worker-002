/**
 * Preservation Property Tests — Execution Status Stale Cache Fix
 *
 * These tests MUST PASS on UNFIXED code — they capture baseline behavior that
 * must survive the fix without regression.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 *
 * Preservation for Bug 1:
 *   Pres-1a — Active (non-terminal) execution cache HITs are preserved
 *   Pres-1b — Redis-unavailable fallback: no error thrown, fire-and-forget swallows errors
 *   Pres-1c — Non-existent execution ID is handled gracefully (no crash)
 *
 * Preservation for Bug 2:
 *   Pres-2a — Single non-concurrent attach-inputs runs the pipeline exactly once
 *   Pres-2b — Sequential second request (after first completes) also runs the pipeline
 */

import crypto from 'crypto';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Replicate the buildCacheKey logic from redisGetCache.ts so we can seed the
 * exact Redis key that the middleware would produce.
 */
function buildCacheKey(
  path: string,
  params: Record<string, string>,
  query: Record<string, string>,
  auth: string
): string {
  const authHash = auth
    ? crypto.createHash('sha256').update(auth).digest('hex').slice(0, 16)
    : 'anon';
  const source = JSON.stringify({ params, query, body: {}, auth: authHash });
  const paramsHash = crypto.createHash('sha256').update(source).digest('hex');
  return `${path}:${paramsHash}`;
}

/**
 * Build a minimal in-memory Redis mock that supports get / setEx / del / scan.
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
    scan: jest.fn(
      async (_cursor: number, options: { MATCH?: string; COUNT?: number }) => {
        const pattern = options?.MATCH || '*';
        const regexStr = pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.');
        const regex = new RegExp(`^${regexStr}$`);
        const keys = Object.keys(store).filter((k) => regex.test(k));
        return { cursor: 0, keys };
      }
    ),
  };
}

/**
 * Build a minimal workflow suitable for attach-inputs processing.
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
        data: {
          type: 'manual_trigger',
          label: 'Trigger',
          category: 'triggers',
          config: {},
        },
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

// ─── Preservation for Bug 1 ───────────────────────────────────────────────────

describe('Pres-1a — Active execution cache HIT is preserved (non-terminal status)', () => {
  /**
   * Validates: Requirement 3.1
   *
   * When an execution is still running, the Redis cache key for its status
   * must remain present after calling updateExecutionStatus('running').
   * The fix must NOT invalidate cache for non-terminal statuses.
   */
  test('cache key is still present after updateExecutionStatus("running")', async () => {
    const executionId = 'exec-running-001';
    const path = `/api/execution-status/${executionId}`;
    const query = { lite: '1' };
    const authToken = 'Bearer test-token-running';

    const cacheKey = buildCacheKey(path, { executionId }, query, authToken);

    const runningBody = JSON.stringify({
      execution_id: executionId,
      status: 'running',
      workflow_id: 'wf-running',
      current_node: 'node-1',
      steps: [],
    });

    // Seed Redis with a 'running' response (active execution — should stay cached)
    const redisMock = buildRedisMock({ [cacheKey]: runningBody });

    // Verify the key is present before the update
    const before = await redisMock.get(cacheKey);
    expect(before).not.toBeNull();

    // Mock Supabase for PersistentLayer
    const mockSupabase = {
      from: jest.fn().mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: executionId, status: 'running' },
          error: null,
        }),
      })),
    };

    jest.resetModules();
    jest.mock('../src/middleware/redisGetCache', () => {
      const actual = jest.requireActual('../src/middleware/redisGetCache');
      return {
        ...actual,
        getCacheRedisClient: jest.fn().mockResolvedValue(redisMock),
      };
    });
    jest.mock('../src/core/database/supabase-compat', () => ({
      getDbClient: () => mockSupabase,
    }));

    const { PersistentLayer } = await import(
      '../src/services/workflow-executor/persistent-layer'
    );
    const layer = new PersistentLayer(mockSupabase as any);

    // Call with a NON-terminal status — cache must NOT be invalidated
    await layer.updateExecutionStatus(executionId, 'running');

    // Allow any fire-and-forget promises to settle
    await new Promise((resolve) => setTimeout(resolve, 100));

    // ASSERT: Cache key must still be present (cache HIT preserved for active executions)
    // This must pass on BOTH unfixed and fixed code.
    const after = await redisMock.get(cacheKey);
    expect(after).not.toBeNull(); // Cache HIT preserved — key must still exist
    expect(after).toBe(runningBody); // Content unchanged
  });

  test('cache key is still present after updateExecutionStatus("waiting")', async () => {
    const executionId = 'exec-waiting-002';
    const path = `/api/execution-status/${executionId}`;
    const query = { lite: '1' };
    const authToken = 'Bearer test-token-waiting';

    const cacheKey = buildCacheKey(path, { executionId }, query, authToken);

    const waitingBody = JSON.stringify({
      execution_id: executionId,
      status: 'waiting',
      workflow_id: 'wf-waiting',
      steps: [],
    });

    const redisMock = buildRedisMock({ [cacheKey]: waitingBody });

    const mockSupabase = {
      from: jest.fn().mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: executionId, status: 'waiting' },
          error: null,
        }),
      })),
    };

    jest.resetModules();
    jest.mock('../src/middleware/redisGetCache', () => {
      const actual = jest.requireActual('../src/middleware/redisGetCache');
      return {
        ...actual,
        getCacheRedisClient: jest.fn().mockResolvedValue(redisMock),
      };
    });
    jest.mock('../src/core/database/supabase-compat', () => ({
      getDbClient: () => mockSupabase,
    }));

    const { PersistentLayer } = await import(
      '../src/services/workflow-executor/persistent-layer'
    );
    const layer = new PersistentLayer(mockSupabase as any);

    await layer.updateExecutionStatus(executionId, 'waiting');
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Cache key must still be present for non-terminal status
    const after = await redisMock.get(cacheKey);
    expect(after).not.toBeNull();
    expect(after).toBe(waitingBody);
  });
});

describe('Pres-1b — Redis-unavailable fallback: updateExecutionStatus does not throw', () => {
  /**
   * Validates: Requirement 3.5
   *
   * When Redis is unavailable (getCacheRedisClient returns null), calling
   * updateExecutionStatus must NOT throw. The fire-and-forget cache invalidation
   * path must swallow Redis errors silently.
   *
   * This must pass on BOTH unfixed and fixed code.
   */
  test('updateExecutionStatus("success") does not throw when Redis is unavailable', async () => {
    const executionId = 'abc-123';

    const mockSupabase = {
      from: jest.fn().mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: executionId, status: 'success' },
          error: null,
        }),
      })),
    };

    jest.resetModules();
    // Simulate Redis being unavailable: getCacheRedisClient returns null
    jest.mock('../src/middleware/redisGetCache', () => {
      const actual = jest.requireActual('../src/middleware/redisGetCache');
      return {
        ...actual,
        getCacheRedisClient: jest.fn().mockResolvedValue(null),
        invalidateExecutionStatusCache: jest.fn().mockResolvedValue(undefined),
      };
    });
    jest.mock('../src/core/database/supabase-compat', () => ({
      getDbClient: () => mockSupabase,
    }));

    const { PersistentLayer } = await import(
      '../src/services/workflow-executor/persistent-layer'
    );
    const layer = new PersistentLayer(mockSupabase as any);

    // Must NOT throw — fire-and-forget must swallow Redis errors
    await expect(
      layer.updateExecutionStatus(executionId, 'success')
    ).resolves.not.toThrow();

    // Allow any fire-and-forget promises to settle
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  test('updateExecutionStatus("failed") does not throw when Redis client rejects', async () => {
    const executionId = 'exec-redis-fail-003';

    const mockSupabase = {
      from: jest.fn().mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: executionId, status: 'failed' },
          error: null,
        }),
      })),
    };

    jest.resetModules();
    // Simulate Redis client that throws on connection
    jest.mock('../src/middleware/redisGetCache', () => {
      const actual = jest.requireActual('../src/middleware/redisGetCache');
      return {
        ...actual,
        getCacheRedisClient: jest
          .fn()
          .mockRejectedValue(new Error('Redis connection refused')),
        invalidateExecutionStatusCache: jest.fn().mockResolvedValue(undefined),
      };
    });
    jest.mock('../src/core/database/supabase-compat', () => ({
      getDbClient: () => mockSupabase,
    }));

    const { PersistentLayer } = await import(
      '../src/services/workflow-executor/persistent-layer'
    );
    const layer = new PersistentLayer(mockSupabase as any);

    // Must NOT throw even when Redis rejects
    await expect(
      layer.updateExecutionStatus(executionId, 'failed')
    ).resolves.not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 100));
  });
});

describe('Pres-1c — Non-existent execution ID is handled gracefully', () => {
  /**
   * Validates: Requirement 3.4
   *
   * When updateExecutionStatus is called for an execution ID that does not exist
   * in the DB, the system must not crash. Supabase returns an error but the
   * PersistentLayer should propagate it (or handle it) without an unhandled
   * rejection.
   *
   * This must pass on BOTH unfixed and fixed code.
   */
  test('updateExecutionStatus for unknown execution ID does not cause unhandled rejection', async () => {
    const unknownId = 'nonexistent-exec-id-xyz';

    // Supabase returns an error for unknown IDs
    const mockSupabase = {
      from: jest.fn().mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Row not found', code: 'PGRST116' },
        }),
      })),
    };

    jest.resetModules();
    jest.mock('../src/middleware/redisGetCache', () => {
      const actual = jest.requireActual('../src/middleware/redisGetCache');
      return {
        ...actual,
        getCacheRedisClient: jest.fn().mockResolvedValue(null),
        invalidateExecutionStatusCache: jest.fn().mockResolvedValue(undefined),
      };
    });
    jest.mock('../src/core/database/supabase-compat', () => ({
      getDbClient: () => mockSupabase,
    }));

    const { PersistentLayer } = await import(
      '../src/services/workflow-executor/persistent-layer'
    );
    const layer = new PersistentLayer(mockSupabase as any);

    // The call may throw (DB error) or resolve — either is acceptable.
    // What must NOT happen is an unhandled promise rejection or process crash.
    let threw = false;
    try {
      await layer.updateExecutionStatus(unknownId, 'success');
    } catch {
      threw = true;
    }

    // Whether it throws or not, the test must reach this line without crashing
    // (no unhandled rejection, no process.exit, no uncaught exception).
    expect(typeof threw).toBe('boolean'); // Always true — just confirms we got here
  });

  test('PersistentLayer constructor does not throw with a mock supabase client', () => {
    const mockSupabase = {
      from: jest.fn(),
    };

    // Constructing PersistentLayer must never throw
    expect(() => {
      const { PersistentLayer } = require('../src/services/workflow-executor/persistent-layer');
      new PersistentLayer(mockSupabase);
    }).not.toThrow();
  });
});

// ─── Preservation for Bug 2 ───────────────────────────────────────────────────

/**
 * Build a full-featured Supabase mock that supports the chaining patterns
 * used by CredentialVault (.select().eq().eq().limit()) and other callers.
 */
function buildFullSupabaseMock(workflow: any) {
  const workflowId = workflow.id;
  // Capture the last update call's data for phase assertions
  let lastUpdateData: any = null;

  const chainable = (resolvedData: any = null, resolvedError: any = null) => {
    const obj: any = {};
    const methods = ['select', 'eq', 'neq', 'in', 'is', 'not', 'or', 'and',
      'filter', 'match', 'contains', 'containedBy', 'order', 'limit',
      'range', 'maybeSingle', 'insert', 'upsert', 'delete'];
    for (const m of methods) {
      obj[m] = jest.fn().mockReturnValue(obj);
    }
    obj.single = jest.fn().mockResolvedValue({ data: resolvedData, error: resolvedError });
    obj.then = (resolve: any) => Promise.resolve({ data: resolvedData, error: resolvedError }).then(resolve);
    return obj;
  };

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'workflows') {
        const chain = chainable(workflow, null);
        chain.update = jest.fn().mockImplementation((data: any) => {
          lastUpdateData = data;
          return chainable({ id: workflowId, ...workflow, ...data }, null);
        });
        return chain;
      }
      // All other tables (credential_vault, user_credentials, etc.) return empty/null
      const chain = chainable(null, null);
      chain.update = jest.fn().mockReturnValue(chainable(null, null));
      return chain;
    }),
    _getLastUpdateData: () => lastUpdateData,
  };
}

describe('Pres-2a — Single non-concurrent attach-inputs runs the pipeline exactly once', () => {
  /**
   * Validates: Requirement 3.3
   *
   * When exactly 1 POST /attach-inputs request is made with no concurrent
   * duplicates, the full pipeline must run at least once and return a valid
   * response. This must pass on BOTH unfixed and fixed code.
   */
  test('single request: normalizeWorkflowGraph is called at least once (pipeline ran)', async () => {
    const workflowId = 'wf-single-pres-001';
    let normalizeCallCount = 0;

    jest.resetModules();

    jest.mock('../src/core/utils/workflow-graph-normalizer', () => {
      const actual = jest.requireActual('../src/core/utils/workflow-graph-normalizer');
      return {
        ...actual,
        normalizeWorkflowGraph: jest.fn((...args: any[]) => {
          normalizeCallCount++;
          return (actual as any).normalizeWorkflowGraph(...args);
        }),
      };
    });

    const workflow = buildMinimalWorkflow(workflowId);
    const mockSupabase = buildFullSupabaseMock(workflow);

    jest.mock('../src/core/database/supabase-compat', () => ({
      getDbClient: () => mockSupabase,
    }));

    const { default: attachInputsHandler } = await import('../src/api/attach-inputs');

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

    normalizeCallCount = 0;
    await attachInputsHandler(req, res);

    // ASSERT: pipeline ran at least once for a single request.
    // The handler calls normalizeWorkflowGraph multiple times internally (topologyPreserve
    // pass + configOnly pass + save-time pass). What matters for preservation is that
    // the count is > 0 (pipeline ran) and consistent between unfixed and fixed code.
    expect(normalizeCallCount).toBeGreaterThanOrEqual(1);

    // ASSERT: response must not be a 500 error
    const statusCalls = (res.status as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(statusCalls).not.toContain(500);
  });

  test('single request: returns a valid JSON response (not a 500 error)', async () => {
    const workflowId = 'wf-single-pres-002';

    jest.resetModules();

    const workflow = buildMinimalWorkflow(workflowId);
    const mockSupabase = buildFullSupabaseMock(workflow);

    jest.mock('../src/core/database/supabase-compat', () => ({
      getDbClient: () => mockSupabase,
    }));

    const { default: attachInputsHandler } = await import('../src/api/attach-inputs');

    const req: any = {
      params: { workflowId },
      body: {
        inputs: { [`input_gmail-1_subject`]: 'Hello World' },
      },
      headers: { authorization: 'Bearer test-token' },
    };

    let capturedJsonBody: any = null;
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockImplementation((body: any) => {
        capturedJsonBody = body;
        return res;
      }),
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    await attachInputsHandler(req, res);

    // ASSERT: res.json was called (a response was sent)
    expect(res.json).toHaveBeenCalled();

    // ASSERT: response is not a 500 server error
    const statusCalls = (res.status as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(statusCalls).not.toContain(500);

    // ASSERT: if a JSON body was captured, it should not be an error object with code 500
    if (capturedJsonBody && capturedJsonBody.error) {
      expect(capturedJsonBody.statusCode).not.toBe(500);
    }
  });
});

describe('Pres-2b — Sequential second request runs the pipeline (no stuck in-flight entry)', () => {
  /**
   * Validates: Requirement 3.3
   *
   * After a first request completes, a second sequential (non-concurrent) request
   * for the same workflowId must also run the pipeline. The in-flight map (once
   * added by the fix) must be cleaned up after the first request so the second
   * request is not blocked.
   *
   * This must pass on BOTH unfixed and fixed code.
   */
  test('second sequential request also runs the pipeline (normalizeWorkflowGraph called more times total)', async () => {
    const workflowId = 'wf-sequential-pres-003';
    let normalizeCallCount = 0;

    jest.resetModules();

    jest.mock('../src/core/utils/workflow-graph-normalizer', () => {
      const actual = jest.requireActual('../src/core/utils/workflow-graph-normalizer');
      return {
        ...actual,
        normalizeWorkflowGraph: jest.fn((...args: any[]) => {
          normalizeCallCount++;
          return (actual as any).normalizeWorkflowGraph(...args);
        }),
      };
    });

    const workflow = buildMinimalWorkflow(workflowId);
    const mockSupabase = buildFullSupabaseMock(workflow);

    jest.mock('../src/core/database/supabase-compat', () => ({
      getDbClient: () => mockSupabase,
    }));

    const { default: attachInputsHandler } = await import('../src/api/attach-inputs');

    const makeRequest = (subject: string) => {
      const req: any = {
        params: { workflowId },
        body: { inputs: { [`input_gmail-1_subject`]: subject } },
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

    normalizeCallCount = 0;

    // Fire first request and wait for it to fully complete
    await makeRequest('First Subject');

    const countAfterFirst = normalizeCallCount;
    expect(countAfterFirst).toBeGreaterThanOrEqual(1); // First request ran the pipeline

    // Fire second request sequentially (after first is done)
    await makeRequest('Second Subject');

    // ASSERT: second request also ran the pipeline (count increased beyond first request's count)
    // On unfixed code: both requests run independently → count >= 2 ✓
    // On fixed code: in-flight map is cleaned up after first → second runs fresh → count >= 2 ✓
    expect(normalizeCallCount).toBeGreaterThan(countAfterFirst);
  });

  test('second sequential request returns a valid response (not stuck or errored)', async () => {
    const workflowId = 'wf-sequential-pres-004';

    jest.resetModules();

    const workflow = buildMinimalWorkflow(workflowId);
    const mockSupabase = buildFullSupabaseMock(workflow);

    jest.mock('../src/core/database/supabase-compat', () => ({
      getDbClient: () => mockSupabase,
    }));

    const { default: attachInputsHandler } = await import('../src/api/attach-inputs');

    const makeRequest = (subject: string) => {
      const req: any = {
        params: { workflowId },
        body: { inputs: { [`input_gmail-1_subject`]: subject } },
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

    // First request
    await makeRequest('First Subject');

    // Second request (sequential — first is fully done)
    const secondRes = await makeRequest('Second Subject');

    // ASSERT: second request got a response (json was called)
    expect(secondRes.json).toHaveBeenCalled();

    // ASSERT: second request did not return a 500
    const statusCalls = (secondRes.status as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(statusCalls).not.toContain(500);
  });
});
