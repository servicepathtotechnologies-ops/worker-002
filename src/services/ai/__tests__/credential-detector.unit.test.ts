/**
 * Unit Tests: CredentialDetector — detectCredentials, private helpers, field descriptions
 * Day 47: covers the rule-based credential scan (entirely untested).
 * Private methods tested via `as any` casting; public API verified with real registry nodes.
 */

import { CredentialDetector } from '../credential-detector';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import type { WorkflowStructure } from '../workflow-structure-builder';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeDetector(): any {
  return new CredentialDetector() as any;
}

function makeStructure(overrides: Partial<WorkflowStructure> = {}): WorkflowStructure {
  return {
    trigger: 'manual',
    nodes: [],
    connections: [],
    ...overrides,
  };
}

// ─── detectTriggerCredentials ─────────────────────────────────────────────────

describe('detectTriggerCredentials', () => {
  let d: any;
  beforeEach(() => { d = makeDetector(); });

  it('returns null for a non-webhook trigger', () => {
    expect(d.detectTriggerCredentials('manual')).toBeNull();
    expect(d.detectTriggerCredentials('schedule')).toBeNull();
    expect(d.detectTriggerCredentials('email')).toBeNull();
  });

  it('returns null for webhook trigger without requires_auth', () => {
    expect(d.detectTriggerCredentials('webhook', {})).toBeNull();
    expect(d.detectTriggerCredentials('webhook', { requires_auth: false })).toBeNull();
  });

  it('returns null for webhook trigger with no triggerConfig', () => {
    expect(d.detectTriggerCredentials('webhook')).toBeNull();
  });

  it('returns webhook credential when trigger=webhook and requires_auth=true', () => {
    const cred = d.detectTriggerCredentials('webhook', { requires_auth: true });
    expect(cred).not.toBeNull();
    expect(cred.provider).toBe('webhook');
    expect(cred.vaultKey).toBe('webhook');
    expect(cred.fields).toContain('api_key');
  });
});

// ─── validateCredentialFields ─────────────────────────────────────────────────

describe('validateCredentialFields', () => {
  let d: any;
  beforeEach(() => { d = makeDetector(); });

  const cred = { provider: 'test', fields: ['key1', 'key2'] };

  it('returns true when all fields are present and non-empty', () => {
    expect(d.validateCredentialFields(cred, { key1: 'val1', key2: 'val2' })).toBe(true);
  });

  it('returns false when a field is missing', () => {
    expect(d.validateCredentialFields(cred, { key1: 'val1' })).toBe(false);
  });

  it('returns false when a field is null', () => {
    expect(d.validateCredentialFields(cred, { key1: 'val1', key2: null })).toBe(false);
  });

  it('returns false when a field is undefined', () => {
    expect(d.validateCredentialFields(cred, { key1: 'val1', key2: undefined })).toBe(false);
  });

  it('returns false when a field is an empty string', () => {
    expect(d.validateCredentialFields(cred, { key1: 'val1', key2: '' })).toBe(false);
  });

  it('returns true for zero-length fields array', () => {
    const emptyCred = { provider: 'test', fields: [] };
    expect(d.validateCredentialFields(emptyCred, {})).toBe(true);
  });
});

// ─── detectNodeCredentials ────────────────────────────────────────────────────

describe('detectNodeCredentials', () => {
  let d: any;
  beforeEach(() => { d = makeDetector(); });

  it('returns null for an unknown node type', () => {
    const node = { id: 'n1', type: 'not_a_real_node_xyz' };
    expect(d.detectNodeCredentials(node)).toBeNull();
  });

  it('returns null for a node with no credentialSchema (manual_trigger)', () => {
    const node = { id: 'n1', type: 'manual_trigger' };
    expect(d.detectNodeCredentials(node)).toBeNull();
  });

  it('returns a RequiredCredential for a node with a full credentialSchema', () => {
    // Find any registered node that has both requirements and credentialFields
    const allTypes = unifiedNodeRegistry.getAllTypes();
    const nodeTypeWithCreds = allTypes.find(t => {
      const def = unifiedNodeRegistry.get(t);
      const cs = def?.credentialSchema;
      return cs &&
        cs.requirements &&
        cs.requirements.length > 0 &&
        cs.credentialFields &&
        cs.credentialFields.length > 0;
    });

    if (!nodeTypeWithCreds) {
      // No nodes have full credential schemas — skip gracefully
      return;
    }

    const node = { id: 'n1', type: nodeTypeWithCreds };
    const result = d.detectNodeCredentials(node);

    expect(result).not.toBeNull();
    expect(typeof result.provider).toBe('string');
    expect(result.provider.length).toBeGreaterThan(0);
    expect(Array.isArray(result.fields)).toBe(true);
    expect(result.fields.length).toBeGreaterThan(0);
    expect(result.node_id).toBe('n1');
    expect(result.node_type).toBe(nodeTypeWithCreds);
  });

  it('returns null when credentialFields is empty even if requirements exist', () => {
    // Manually inject a definition with requirements but no credentialFields
    const stub: any = {
      credentialSchema: {
        requirements: [{ provider: 'test', required: true }],
        credentialFields: [],
      },
    };
    const originalGet = unifiedNodeRegistry.get.bind(unifiedNodeRegistry);
    const spy = jest.spyOn(unifiedNodeRegistry, 'get').mockReturnValueOnce(stub);

    const node = { id: 'n1', type: 'stubbed_node' };
    const result = d.detectNodeCredentials(node);

    spy.mockRestore();
    expect(result).toBeNull();
  });

  it('returns null when requirements array is empty', () => {
    const stub: any = {
      credentialSchema: {
        requirements: [],
        credentialFields: ['apiKey'],
      },
    };
    const spy = jest.spyOn(unifiedNodeRegistry, 'get').mockReturnValueOnce(stub);
    const node = { id: 'n1', type: 'stubbed_node' };
    const result = d.detectNodeCredentials(node);
    spy.mockRestore();
    expect(result).toBeNull();
  });

  it('uses vaultKey from requirement when present', () => {
    const stub: any = {
      credentialSchema: {
        requirements: [{ provider: 'myprovider', vaultKey: 'MY_VAULT_KEY', required: true }],
        credentialFields: ['token'],
      },
    };
    const spy = jest.spyOn(unifiedNodeRegistry, 'get').mockReturnValueOnce(stub);
    const node = { id: 'n1', type: 'stubbed_node' };
    const result = d.detectNodeCredentials(node);
    spy.mockRestore();
    expect(result?.vaultKey).toBe('MY_VAULT_KEY');
  });

  it('falls back to provider as vaultKey when vaultKey is absent', () => {
    const stub: any = {
      credentialSchema: {
        requirements: [{ provider: 'myprovider', required: true }],
        credentialFields: ['token'],
      },
    };
    const spy = jest.spyOn(unifiedNodeRegistry, 'get').mockReturnValueOnce(stub);
    const node = { id: 'n1', type: 'stubbed_node' };
    const result = d.detectNodeCredentials(node);
    spy.mockRestore();
    expect(result?.vaultKey).toBe('myprovider');
  });
});

// ─── detectCredentials (public API) ──────────────────────────────────────────

describe('detectCredentials', () => {
  let d: CredentialDetector;
  beforeEach(() => { d = new CredentialDetector(); });

  it('returns empty arrays for a structure with no nodes and no trigger auth', () => {
    const structure = makeStructure({ trigger: 'manual', nodes: [] });
    const result = d.detectCredentials(structure);
    expect(result.required_credentials).toHaveLength(0);
    expect(result.missing_credentials).toHaveLength(0);
    expect(result.satisfied_credentials).toHaveLength(0);
  });

  it('adds webhook credential to missing when trigger requires auth and no existingCredentials', () => {
    const structure = makeStructure({
      trigger: 'webhook',
      trigger_config: { requires_auth: true },
      nodes: [],
    });
    const result = d.detectCredentials(structure);
    expect(result.required_credentials).toHaveLength(1);
    expect(result.required_credentials[0].provider).toBe('webhook');
    expect(result.missing_credentials).toHaveLength(1);
    expect(result.satisfied_credentials).toHaveLength(0);
  });

  it('moves webhook credential to satisfied when existingCredentials has it', () => {
    const structure = makeStructure({
      trigger: 'webhook',
      trigger_config: { requires_auth: true },
      nodes: [],
    });
    const existing = { webhook: { api_key: 'secret' } };
    const result = d.detectCredentials(structure, existing);
    expect(result.satisfied_credentials).toHaveLength(1);
    expect(result.missing_credentials).toHaveLength(0);
  });

  it('required = missing + satisfied', () => {
    const structure = makeStructure({
      trigger: 'webhook',
      trigger_config: { requires_auth: true },
      nodes: [],
    });
    const result = d.detectCredentials(structure);
    expect(result.required_credentials.length).toBe(
      result.missing_credentials.length + result.satisfied_credentials.length
    );
  });

  it('detects credential from a stubbed node with full schema', () => {
    const stub: any = {
      credentialSchema: {
        requirements: [{ provider: 'stubprovider', vaultKey: 'STUB_KEY', required: true }],
        credentialFields: ['token'],
      },
    };
    const spy = jest.spyOn(unifiedNodeRegistry, 'get').mockReturnValue(stub);

    const structure = makeStructure({
      trigger: 'manual',
      nodes: [{ id: 'n1', type: 'stub_type' }],
    });
    const result = d.detectCredentials(structure);

    spy.mockRestore();
    expect(result.required_credentials).toHaveLength(1);
    expect(result.required_credentials[0].provider).toBe('stubprovider');
    expect(result.required_credentials[0].node_id).toBe('n1');
  });

  it('satisfies node credential when existingCredentials has all fields', () => {
    const stub: any = {
      credentialSchema: {
        requirements: [{ provider: 'stubprovider', vaultKey: 'STUB_KEY', required: true }],
        credentialFields: ['token'],
      },
    };
    const spy = jest.spyOn(unifiedNodeRegistry, 'get').mockReturnValue(stub);

    const structure = makeStructure({
      trigger: 'manual',
      nodes: [{ id: 'n1', type: 'stub_type' }],
    });
    const existing = { stubprovider: { token: 'abc123' } };
    const result = d.detectCredentials(structure, existing);

    spy.mockRestore();
    expect(result.satisfied_credentials).toHaveLength(1);
    expect(result.missing_credentials).toHaveLength(0);
  });

  it('marks node credential missing when existingCredentials has provider but field is empty', () => {
    const stub: any = {
      credentialSchema: {
        requirements: [{ provider: 'stubprovider', required: true }],
        credentialFields: ['token'],
      },
    };
    const spy = jest.spyOn(unifiedNodeRegistry, 'get').mockReturnValue(stub);

    const structure = makeStructure({
      trigger: 'manual',
      nodes: [{ id: 'n1', type: 'stub_type' }],
    });
    const existing = { stubprovider: { token: '' } };
    const result = d.detectCredentials(structure, existing);

    spy.mockRestore();
    expect(result.missing_credentials).toHaveLength(1);
    expect(result.satisfied_credentials).toHaveLength(0);
  });

  it('handles multiple nodes and accumulates credentials', () => {
    const stub: any = {
      credentialSchema: {
        requirements: [{ provider: 'p', required: true }],
        credentialFields: ['k'],
      },
    };
    const spy = jest.spyOn(unifiedNodeRegistry, 'get').mockReturnValue(stub);

    const structure = makeStructure({
      trigger: 'manual',
      nodes: [
        { id: 'n1', type: 'stub_a' },
        { id: 'n2', type: 'stub_b' },
      ],
    });
    const result = d.detectCredentials(structure);

    spy.mockRestore();
    expect(result.required_credentials).toHaveLength(2);
  });
});

// ─── getCredentialFieldDescriptions ──────────────────────────────────────────

describe('getCredentialFieldDescriptions', () => {
  let d: CredentialDetector;
  beforeEach(() => { d = new CredentialDetector(); });

  it('returns non-empty object for hubspot', () => {
    const desc = d.getCredentialFieldDescriptions('hubspot');
    expect(Object.keys(desc).length).toBeGreaterThan(0);
    expect(typeof desc['access_token']).toBe('string');
  });

  it('returns non-empty object for zoho_crm', () => {
    const desc = d.getCredentialFieldDescriptions('zoho_crm');
    expect(Object.keys(desc).length).toBeGreaterThan(0);
  });

  it('returns non-empty object for google_sheets', () => {
    const desc = d.getCredentialFieldDescriptions('google_sheets');
    expect(Object.keys(desc).length).toBeGreaterThan(0);
  });

  it('returns non-empty object for slack', () => {
    const desc = d.getCredentialFieldDescriptions('slack');
    expect(typeof desc['webhook_url']).toBe('string');
  });

  it('returns non-empty object for discord', () => {
    const desc = d.getCredentialFieldDescriptions('discord');
    expect(typeof desc['webhook_url']).toBe('string');
  });

  it('returns empty object for unknown provider', () => {
    const desc = d.getCredentialFieldDescriptions('totally_unknown_provider');
    expect(desc).toEqual({});
  });

  it('always returns an object (never null/undefined)', () => {
    const desc = d.getCredentialFieldDescriptions('something_random');
    expect(typeof desc).toBe('object');
    expect(desc).not.toBeNull();
  });
});
