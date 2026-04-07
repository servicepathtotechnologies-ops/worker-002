/**
 * Bug Condition Exploration Tests
 *
 * These tests MUST FAIL on unfixed code — failure confirms the bugs exist.
 * DO NOT fix the tests or the code when they fail.
 * They encode the expected behavior and will PASS after the fix is applied.
 *
 * Four bug classes under test:
 *   P1 — Email alias resolves to 'ollama' instead of 'google_gmail'
 *   P2 — attach-inputs advances phase even when normalization fails
 *   P3 — credential discovery uses stale in-memory node types instead of DB row
 *   P4 — attach-credentials runs when phase is not 'inputs_applied'
 */

import { nodeTypeNormalizationService } from '../src/services/ai/node-type-normalization-service';
import { unifiedNodeRegistry } from '../src/core/registry/unified-node-registry';

// ─── P1: Email alias resolution ──────────────────────────────────────────────

describe('P1 — Email alias must resolve to google_gmail, never ollama', () => {
  const emailAliases = [
    'email',
    'mail',
    'gmail',
    'send_email',
    'google_mail',
    'send via gmail',
    'google email',
  ];

  test.each(emailAliases)(
    'normalizeNodeType("%s") should return google_gmail',
    (alias) => {
      const result = nodeTypeNormalizationService.normalizeNodeType(alias);
      // On UNFIXED code this will return 'ollama' for 'email' — confirming the bug
      expect(result.normalized).toBe('google_gmail');
      expect(result.normalized).not.toBe('ollama');
      expect(result.normalized).not.toBe('ai_chat_model');
      expect(result.normalized).not.toBe('ai_service');
    }
  );

  test('unifiedNodeRegistry.resolveAlias("email") should return google_gmail', () => {
    const resolved = unifiedNodeRegistry.resolveAlias('email');
    // On UNFIXED code resolveAlias delegates to node-type-resolver-util which
    // calls capability-resolver first — may return 'ollama'
    expect(resolved).toBe('google_gmail');
  });

  test('unifiedNodeRegistry.resolveAlias("gmail") should return google_gmail', () => {
    const resolved = unifiedNodeRegistry.resolveAlias('gmail');
    expect(resolved).toBe('google_gmail');
  });
});

// ─── P2: attach-inputs phase atomicity ───────────────────────────────────────

describe('P2 — attach-inputs must not advance phase when normalization fails', () => {
  let mockSupabase: any;
  let phaseBeforeCall: string;
  let phaseAfterCall: string;

  beforeEach(() => {
    phaseBeforeCall = 'draft';
    phaseAfterCall = 'draft'; // will be overwritten if phase mutation occurs

    // Minimal supabase mock that tracks phase updates
    mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: jest.fn().mockImplementation((table: string) => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        update: jest.fn().mockImplementation((data: any) => {
          if (data.phase) {
            phaseAfterCall = data.phase;
          }
          return { eq: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { id: 'wf-1', ...data }, error: null }) };
        }),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'wf-1',
            phase: phaseBeforeCall,
            status: 'active',
            nodes: [{ id: 'n1', type: 'manual_trigger', data: { type: 'manual_trigger', label: 'Trigger', category: 'triggers', config: {} } }],
            edges: [],
            graph: null,
          },
          error: null,
        }),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };
  });

  test('phase must remain unchanged when normalizeWorkflowGraph throws', async () => {
    // Mock normalizeWorkflowGraph to throw
    jest.mock('../src/core/utils/workflow-graph-normalizer', () => ({
      normalizeWorkflowGraph: jest.fn().mockImplementation(() => {
        throw new Error('Simulated normalization failure');
      }),
      validateNormalizedGraph: jest.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }),
    }));

    // Import handler after mock is set up
    const { default: attachInputsHandler } = await import('../src/api/attach-inputs');

    const req: any = {
      params: { workflowId: 'wf-1' },
      body: { inputs: { test_field: 'test_value' } },
      headers: { authorization: 'Bearer test-token' },
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    // Inject mock supabase
    jest.mock('../src/core/database/supabase-compat', () => ({
      getSupabaseClient: () => mockSupabase,
    }));

    await attachInputsHandler(req, res);

    // On UNFIXED code: phase was already set to 'configuring_inputs' BEFORE normalization
    // so phaseAfterCall will be 'configuring_inputs' even though normalization failed
    // On FIXED code: phase must remain 'draft' (unchanged)
    expect(res.status).toHaveBeenCalledWith(400);
    expect(phaseAfterCall).toBe(phaseBeforeCall); // phase must NOT have changed
  });
});

// ─── P3: Credential discovery must read from DB, not in-memory snapshot ──────

describe('P3 — credential discovery must use committed DB node types', () => {
  test('discoverCredentials should use DB node types, not stale in-memory object', async () => {
    const { CredentialDiscoveryPhase } = await import('../src/services/ai/credential-discovery-phase');

    // Simulate: DB has google_gmail node (the committed truth)
    const dbWorkflow = {
      nodes: [
        {
          id: 'node-gmail',
          type: 'google_gmail',
          data: { type: 'google_gmail', label: 'Gmail', category: 'communication', config: {} },
        },
      ],
      edges: [],
    };

    // Simulate: in-memory object has ollama node (stale, pre-normalization snapshot)
    const staleInMemoryWorkflow = {
      nodes: [
        {
          id: 'node-gmail',
          type: 'ollama',
          data: { type: 'ollama', label: 'Email', category: 'ai', config: {} },
        },
      ],
      edges: [],
    };

    const phase = new CredentialDiscoveryPhase();

    // Call with the stale in-memory object (current unfixed behavior)
    const result = await phase.discoverCredentials(staleInMemoryWorkflow as any);

    // On UNFIXED code: discovery walks the stale in-memory object with 'ollama'
    // and finds no Google OAuth requirement (ollama needs no credentials)
    // On FIXED code: discovery must read from DB and find google_gmail → Google OAuth required

    // The node types examined must match the DB row (google_gmail), not the stale object (ollama)
    const nodeTypesExamined = result.requiredCredentials.flatMap(c => c.nodeTypes);

    // If discovery used the stale object, nodeTypesExamined will contain 'ollama'
    // If discovery used the DB row, nodeTypesExamined will contain 'google_gmail'
    expect(nodeTypesExamined).not.toContain('ollama');

    // google_gmail requires Google OAuth — must be discovered
    const googleOAuthRequired = result.requiredCredentials.some(
      c => c.provider === 'google' && c.type === 'oauth'
    );
    expect(googleOAuthRequired).toBe(true);
  });
});

// ─── P4: attach-credentials must require inputs_applied phase ────────────────

describe('P4 — attach-credentials must return 409 when phase is not inputs_applied', () => {
  const phasesNotAllowed = [
    'draft',
    'configuring_inputs', // This is the key one — happens after failed attach-inputs
    'active',
    'ready',
  ];

  test.each(phasesNotAllowed)(
    'attach-credentials with phase="%s" should return 409',
    async (phase) => {
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
        },
        from: jest.fn().mockImplementation(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: {
              id: 'wf-1',
              user_id: 'user-1',
              phase,
              status: 'active',
              nodes: [],
              edges: [],
              graph: null,
            },
            error: null,
          }),
          insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
      };

      jest.mock('../src/core/database/supabase-compat', () => ({
        getSupabaseClient: () => mockSupabase,
      }));

      const { default: attachCredentialsHandler } = await import('../src/api/attach-credentials');

      const req: any = {
        params: { workflowId: 'wf-1' },
        body: { credentials: {} },
        headers: { authorization: 'Bearer test-token' },
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await attachCredentialsHandler(req, res);

      // On UNFIXED code: attach-credentials proceeds in 'configuring_inputs' phase
      // (only blocks 'executing', 'running', 'archived')
      // On FIXED code: must return 409 for any phase that is not 'inputs_applied'
      expect(res.status).toHaveBeenCalledWith(409);
    }
  );

  test('attach-credentials with phase="inputs_applied" should NOT return 409', async () => {
    // This is the happy path — should be allowed through
    const mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: jest.fn().mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'wf-1',
            user_id: 'user-1',
            phase: 'inputs_applied',
            status: 'active',
            nodes: [],
            edges: [],
            graph: null,
          },
          error: null,
        }),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };

    jest.mock('../src/core/database/supabase-compat', () => ({
      getSupabaseClient: () => mockSupabase,
    }));

    const { default: attachCredentialsHandler } = await import('../src/api/attach-credentials');

    const req: any = {
      params: { workflowId: 'wf-1' },
      body: { credentials: {} },
      headers: { authorization: 'Bearer test-token' },
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await attachCredentialsHandler(req, res);

    // Must NOT return 409 — inputs_applied is the correct phase
    const statusCalls = (res.status as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(statusCalls).not.toContain(409);
  });
});
