const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn(async () => ({
  query: mockQuery,
  release: mockRelease,
}));

describe('supabase-compat mutation chains', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({
      rows: [{ id: 'wf-1', status: 'active', phase: 'ready_for_execution' }],
    });
    jest.doMock('pg', () => ({
      Pool: jest.fn(() => ({
        connect: mockConnect,
        on: jest.fn(),
      })),
    }));
  });

  it('preserves update operation when select().single() is chained', async () => {
    const { getDbClient } = require('../supabase-compat');

    const { data, error } = await getDbClient()
      .from('workflows')
      .update({
        status: 'active',
        phase: 'ready_for_execution',
        metadata: { source: 'attach-inputs' },
      })
      .eq('id', 'wf-1')
      .select('id, status, phase')
      .single();

    expect(error).toBeNull();
    expect(data).toEqual({ id: 'wf-1', status: 'active', phase: 'ready_for_execution' });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('UPDATE "workflows"');
    expect(sql).toContain('"status" = $1');
    expect(sql).toContain('"phase" = $2');
    expect(sql).toContain('WHERE "id" = $4');
    expect(sql).toContain('RETURNING "id", "status", "phase"');
    expect(params).toEqual([
      'active',
      'ready_for_execution',
      JSON.stringify({ source: 'attach-inputs' }),
      'wf-1',
    ]);
  });

  it('preserves insert operation when select().single() is chained', async () => {
    const { getDbClient } = require('../supabase-compat');

    await getDbClient()
      .from('workflows')
      .insert({ id: 'wf-1', status: 'draft' })
      .select('id, status')
      .single();

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO "workflows"');
    expect(sql).toContain('RETURNING "id", "status"');
  });

  it('serializes durable execution JSON columns before writing to postgres', async () => {
    const { getDbClient } = require('../supabase-compat');
    const output = { items: [{ row: 1 }], headers: ['row'] };

    await getDbClient()
      .from('execution_steps')
      .upsert({
        execution_id: 'exec-1',
        node_id: 'node-1',
        input_json: { _trigger: 'manual' },
        output_json: output,
        state_snapshot: { nodeId: 'node-1' },
        checkpoint_data: { sequence: 1 },
      }, { onConflict: 'execution_id,node_id' })
      .select()
      .single();

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO "execution_steps"');
    expect(params).toContain(JSON.stringify({ _trigger: 'manual' }));
    expect(params).toContain(JSON.stringify(output));
    expect(params).toContain(JSON.stringify({ nodeId: 'node-1' }));
    expect(params).toContain(JSON.stringify({ sequence: 1 }));
  });
});
