/**
 * Async execution tests — verifies that POST /api/execute-workflow
 * returns 202 when the queue is enabled, and falls back to direct
 * execution when the queue is disabled.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ─── Mock the execution queue ─────────────────────────────────────────────────

const mockEnqueue = (jest.fn() as any).mockResolvedValue('job-abc-123');
const mockGetExecutionQueue = (jest.fn() as any).mockResolvedValue({ enqueue: mockEnqueue });

jest.mock('../../services/execution-queue', () => ({
  getExecutionQueue: mockGetExecutionQueue,
}));

// ─── Mock the DB client ───────────────────────────────────────────────────────

const mockDbChain = {
  update: (jest.fn() as any).mockReturnThis(),
  insert: (jest.fn() as any).mockResolvedValue({ data: null, error: null }),
  eq: (jest.fn() as any).mockResolvedValue({ data: null, error: null }),
  select: (jest.fn() as any).mockReturnThis(),
  single: (jest.fn() as any).mockResolvedValue({ data: null, error: null }),
};
const mockDbFrom = jest.fn(() => mockDbChain);
const mockAuth = {
  getUser: (jest.fn() as any).mockResolvedValue({ data: { user: { id: 'user-111' } }, error: null }),
};

jest.mock('../../core/database/aws-db-client', () => ({
  getDbClient: jest.fn(() => ({ from: mockDbFrom, auth: mockAuth })),
  createDbClient: jest.fn(() => ({ from: mockDbFrom, auth: mockAuth })),
}));

// Suppress heavy dynamic-import side-effects
jest.mock('../../services/ai/credential-discovery-phase', () => ({
  credentialDiscoveryPhase: {
    discoverCredentials: (jest.fn() as any).mockResolvedValue({ requiredCredentials: [], missingCredentials: [] }),
  },
}));

jest.mock('../../services/workflow-lifecycle-manager', () => ({
  workflowLifecycleManager: {
    validateExecutionReady: (jest.fn() as any).mockResolvedValue({ ready: true, errors: [] }),
    discoverNodeInputs: (jest.fn() as any).mockResolvedValue({ inputs: [] }),
  },
}));

jest.mock('../../core/utils/workflow-cloner', () => ({
  cloneWorkflowDefinition: jest.fn((w: any) => w),
}));

jest.mock('../../core/validation/workflow-save-validator', () => ({
  normalizeWorkflowForSave: jest.fn((w: any) => w),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import executeWorkflowHandler from '../execute-workflow';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(overrides: Record<string, any> = {}) {
  return {
    body: { workflowId: 'wf-xyz', input: {}, ...overrides },
    headers: { authorization: 'Bearer test-jwt' },
    method: 'POST',
    path: '/api/execute-workflow',
  } as any;
}

function makeRes() {
  const res: any = {
    _status: 200,
    _body: null,
    status(code: number) { res._status = code; return res; },
    json(data: any) { res._body = data; return res; },
    send(data: any) { res._body = data; return res; },
  };
  return res;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/execute-workflow — async queue path', () => {
  const originalQueueEnv = process.env.ENABLE_EXECUTION_QUEUE;

  beforeEach(() => {
    jest.clearAllMocks();
    (mockEnqueue as any).mockResolvedValue('job-abc-123');
    (mockGetExecutionQueue as any).mockResolvedValue({ enqueue: mockEnqueue });
  });

  afterEach(() => {
    if (originalQueueEnv !== undefined) {
      process.env.ENABLE_EXECUTION_QUEUE = originalQueueEnv;
    } else {
      delete process.env.ENABLE_EXECUTION_QUEUE;
    }
  });

  it('returns 202 with executionId and jobId when useQueue=true', async () => {
    const req = makeReq({ useQueue: true });
    const res = makeRes();

    await executeWorkflowHandler(req, res);

    expect(res._status).toBe(202);
    expect(res._body).toMatchObject({
      status: 'queued',
      jobId: 'job-abc-123',
      executionId: expect.any(String),
    });
  });

  it('returns 202 when ENABLE_EXECUTION_QUEUE=true (env-driven default)', async () => {
    process.env.ENABLE_EXECUTION_QUEUE = 'true';
    const req = makeReq();
    const res = makeRes();

    await executeWorkflowHandler(req, res);

    expect(res._status).toBe(202);
    expect(res._body.status).toBe('queued');
  });

  it('calls queue.enqueue with correct workflowId', async () => {
    process.env.ENABLE_EXECUTION_QUEUE = 'true';
    const req = makeReq({ workflowId: 'my-special-workflow' });
    const res = makeRes();

    await executeWorkflowHandler(req, res);

    expect(mockEnqueue).toHaveBeenCalledWith(
      'my-special-workflow',
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('uses provided executionId when given in request body', async () => {
    process.env.ENABLE_EXECUTION_QUEUE = 'true';
    const req = makeReq({ executionId: 'my-exec-id-999' });
    const res = makeRes();

    await executeWorkflowHandler(req, res);

    expect(res._body.executionId).toBe('my-exec-id-999');
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.any(String),
      'my-exec-id-999',
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('returns 400 when workflowId is missing', async () => {
    process.env.ENABLE_EXECUTION_QUEUE = 'true';
    const req = makeReq({ workflowId: undefined });
    const res = makeRes();

    await executeWorkflowHandler(req, res);

    expect(res._status).toBe(400);
  });

  it('does NOT call getExecutionQueue when useQueue=false', async () => {
    process.env.ENABLE_EXECUTION_QUEUE = 'true';
    const req = makeReq({ useQueue: false });
    const res = makeRes();

    await executeWorkflowHandler(req, res);

    // useQueue: false explicitly disables the queue path
    expect(mockGetExecutionQueue).not.toHaveBeenCalled();
  });

  it('pre-creates execution record with status=queued before enqueuing', async () => {
    process.env.ENABLE_EXECUTION_QUEUE = 'true';
    const req = makeReq({ workflowId: 'wf-precreate-test' });
    const res = makeRes();

    await executeWorkflowHandler(req, res);

    expect(res._status).toBe(202);
    // DB insert must have been called (pre-create execution row)
    expect(mockDbFrom).toHaveBeenCalledWith('executions');
    expect(mockDbChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow_id: 'wf-precreate-test',
        status: 'queued',
      }),
    );
  });
});

// ─── runExecutionJob wiring ───────────────────────────────────────────────────

describe('execution-job-runner', () => {
  it('is importable without errors', async () => {
    const { runExecutionJob } = await import('../../services/execution-job-runner');
    expect(typeof runExecutionJob).toBe('function');
  });
});
