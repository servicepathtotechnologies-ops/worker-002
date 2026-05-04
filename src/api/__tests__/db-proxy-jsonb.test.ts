import { dbProxyDelete, dbProxyGet, dbProxyPost, dbProxyPut } from '../db-proxy';
import { queryAsService } from '../../core/database/db-pool';

jest.mock('../../core/database/db-pool', () => ({
  queryAsService: jest.fn(async () => [{ id: 'wf-1' }]),
}));

jest.mock('../../services/subscription-service', () => ({
  subscriptionService: {
    ensureFreeSubscription: jest.fn(async () => undefined),
    canCreateWorkflow: jest.fn(async () => true),
    getSubscriptionUsage: jest.fn(async () => ({
      workflowLimit: 10,
      workflowsUsed: 0,
      remainingWorkflows: 10,
    })),
    incrementWorkflowCount: jest.fn(async () => undefined),
  },
}));

function mockResponse() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('db proxy jsonb serialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serializes workflow nodes and edges as JSON strings before inserting', async () => {
    const req: any = {
      params: { table: 'workflows' },
      user: { id: '00000000-0000-0000-0000-000000000001' },
      body: {
        name: 'Generated workflow',
        nodes: [{ id: 'n1', data: { type: 'manual_trigger' } }],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      },
    };
    const res = mockResponse();

    await dbProxyPost(req, res);

    const [, params] = (queryAsService as jest.Mock).mock.calls[0];
    expect(params).toContain(JSON.stringify(req.body.nodes));
    expect(params).toContain(JSON.stringify(req.body.edges));
    expect(params).toContain(req.user.id);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 'wf-1' }, error: null });
  });

  it('updates by non-id filters while preserving user scope', async () => {
    (queryAsService as jest.Mock).mockResolvedValueOnce([{ id: 'profile-1', email: 'user@example.com' }]);
    const req: any = {
      params: { table: 'profiles' },
      query: { filter_user_id: 'user-1' },
      user: { id: 'user-1' },
      body: { email: 'user@example.com' },
    };
    const res = mockResponse();

    await dbProxyPut(req, res);

    const [sql, params] = (queryAsService as jest.Mock).mock.calls[0];
    expect(sql).toContain('UPDATE "profiles"');
    expect(sql).toContain('"user_id" = $2');
    expect(sql).toContain('"user_id" = $3');
    expect(params).toEqual(['user@example.com', 'user-1', 'user-1']);
    expect(res.json).toHaveBeenCalledWith({
      data: { id: 'profile-1', email: 'user@example.com' },
      error: null,
    });
  });

  it('deletes by non-id filters while preserving user scope', async () => {
    (queryAsService as jest.Mock).mockResolvedValueOnce([{ id: 'token-1' }]);
    const req: any = {
      params: { table: 'social_tokens' },
      query: { filter_provider: 'github' },
      user: { id: 'user-1' },
      body: {},
    };
    const res = mockResponse();

    await dbProxyDelete(req, res);

    const [sql, params] = (queryAsService as jest.Mock).mock.calls[0];
    expect(sql).toContain('DELETE FROM "social_tokens"');
    expect(sql).toContain('"user_id" = $1');
    expect(sql).toContain('"provider" = $2');
    expect(params).toEqual(['user-1', 'github']);
    expect(res.json).toHaveBeenCalledWith({ data: null, error: null });
  });

  it('selects by IN filters while preserving user scope', async () => {
    (queryAsService as jest.Mock).mockResolvedValueOnce([{ workflow_id: 'wf-1' }]);
    const req: any = {
      params: { table: 'executions' },
      query: { in_workflow_id: JSON.stringify(['wf-1', 'wf-2']) },
      user: { id: 'user-1' },
    };
    const res = mockResponse();

    await dbProxyGet(req, res);

    const [sql, params] = (queryAsService as jest.Mock).mock.calls[0];
    expect(sql).toContain('SELECT * FROM "executions"');
    expect(sql).toContain('"user_id" = $1');
    expect(sql).toContain('"workflow_id" IN ($2, $3)');
    expect(params).toEqual(['user-1', 'wf-1', 'wf-2']);
    expect(res.json).toHaveBeenCalledWith({ data: [{ workflow_id: 'wf-1' }], error: null });
  });

  it('selects by IS NOT NULL filters while preserving user scope', async () => {
    (queryAsService as jest.Mock).mockResolvedValueOnce([{ id: 'wf-1' }]);
    const req: any = {
      params: { table: 'workflows' },
      query: { notnull_cron_expression: 'true' },
      user: { id: 'user-1' },
    };
    const res = mockResponse();

    await dbProxyGet(req, res);

    const [sql, params] = (queryAsService as jest.Mock).mock.calls[0];
    expect(sql).toContain('SELECT * FROM "workflows"');
    expect(sql).toContain('"user_id" = $1');
    expect(sql).toContain('"cron_expression" IS NOT NULL');
    expect(params).toEqual(['user-1']);
  });

  it('returns exact counts without selecting all rows for count-only requests', async () => {
    (queryAsService as jest.Mock).mockResolvedValueOnce([{ count: 42 }]);
    const req: any = {
      params: { table: 'executions' },
      query: { count: 'exact', limit: '0', gte_started_at: '2026-05-04T00:00:00.000Z' },
      user: { id: 'user-1' },
    };
    const res = mockResponse();

    await dbProxyGet(req, res);

    expect(queryAsService).toHaveBeenCalledTimes(1);
    const [sql, params] = (queryAsService as jest.Mock).mock.calls[0];
    expect(sql).toContain('SELECT COUNT(*)::int AS count FROM "executions"');
    expect(sql).toContain('"user_id" = $1');
    expect(sql).toContain('"started_at" >= $2');
    expect(sql).not.toContain('ORDER BY');
    expect(sql).not.toContain('LIMIT');
    expect(params).toEqual(['user-1', '2026-05-04T00:00:00.000Z']);
    expect(res.json).toHaveBeenCalledWith({ data: [], count: 42, error: null });
  });
});
