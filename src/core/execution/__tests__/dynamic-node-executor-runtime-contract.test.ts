import { LRUNodeOutputsCache } from '../..//cache/lru-node-outputs-cache';
import { executeNodeDynamically } from '../dynamic-node-executor';
import { unifiedNodeRegistry } from '../../registry/unified-node-registry';

// Minimal db client stub for tests that don't hit the network.
const supabaseStub: any = {
  from: () => supabaseStub,
};

function makeNodeOutputs(data: Record<string, unknown>): LRUNodeOutputsCache {
  const cache = new LRUNodeOutputsCache(100);
  for (const [k, v] of Object.entries(data)) {
    cache.set(k, v, true);
  }
  return cache;
}

test('dynamic executor resolves runtime_ai subject/body for google_gmail from upstream JSON', async () => {
  const def = unifiedNodeRegistry.get('google_gmail');
  expect(def).toBeDefined();

  const node = {
    id: 'gmail1',
    type: 'custom',
    data: {
      type: 'google_gmail',
      label: 'Send VIP ticket email',
      config: {
        operation: 'send',
        recipientSource: 'manual_entry',
        recipientEmails: 'user@example.com',
        // subject/body left empty so runtime_ai + upstream payload fill them.
      },
    },
  } as any;

  const upstream = {
    ticket_type: 'VIP',
    email: 'user@example.com',
    message: 'Your VIP ticket has been confirmed.',
  };

  const result = await executeNodeDynamically({
    node,
    input: upstream,
    nodeOutputs: makeNodeOutputs({ previous: upstream }),
    db: supabaseStub,
    workflowId: 'wf-test',
  });

  // When runtime_ai fails, executor returns an _error object instead of throwing.
  if (result && typeof result === 'object' && '_error' in (result as any)) {
    // In CI we still want to see the failure explicitly.
    fail(`Expected gmail execution to succeed, got error: ${(result as any)._error}`);
  }

  const out = result as any;
  expect(out.subject).toBeTruthy();
  expect(typeof out.subject).toBe('string');
  expect(out.body).toBeTruthy();
  expect(typeof out.body).toBe('string');
});

test('dynamic executor resolves templates and does not leak config placeholders into log_output', async () => {
  const def = unifiedNodeRegistry.get('log_output');
  expect(def).toBeDefined();

  const node = {
    id: 'log1',
    type: 'custom',
    data: {
      type: 'log_output',
      label: 'Log final result',
      config: {
        level: 'info',
        message: 'Result: {{$json.message}}',
      },
    },
  } as any;

  const upstream = { message: 'OK', internalConfigKey: 'SHOULD_NOT_LEAK' };

  const result = await executeNodeDynamically({
    node,
    input: upstream,
    nodeOutputs: makeNodeOutputs({ $json: upstream, json: upstream, input: upstream }),
    db: supabaseStub,
    workflowId: 'wf-test',
  });

  if (result && typeof result === 'object' && '_error' in (result as any)) {
    fail(`Expected log_output execution to succeed, got error: ${(result as any)._error}`);
  }

  const out = result as any;
  expect(out.message).toBe('Result: OK');
  expect(JSON.stringify(out)).not.toContain('SHOULD_NOT_LEAK');
});

