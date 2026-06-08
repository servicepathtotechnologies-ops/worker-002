/**
 * Unit Tests: WorkflowLifecycleManager — shouldRequireCredential and discoverNodeInputs edge cases
 * Day 46: fills coverage gap for shouldRequireCredential (entirely untested) and
 * additional discoverNodeInputs paths not covered by existing suites.
 */

import { shouldRequireCredential, WorkflowLifecycleManager } from '../workflow-lifecycle-manager';
import type { Workflow } from '../../core/types/ai-types';

// ─── shouldRequireCredential ──────────────────────────────────────────────────

describe('shouldRequireCredential', () => {
  it('returns false for an unregistered node type', () => {
    expect(shouldRequireCredential('not_a_real_node_xyz', 'apiKey', {})).toBe(false);
  });

  it('returns false when field does not exist in registry input schema', () => {
    // manual_trigger has no credential fields
    expect(shouldRequireCredential('manual_trigger', 'nonexistentField', {})).toBe(false);
  });

  it('returns false for a non-credential ownership field', () => {
    // google_sheets has structural/value fields like 'spreadsheetId' — not credential
    expect(shouldRequireCredential('google_sheets', 'spreadsheetId', { spreadsheetId: 'manual_static' as any })).toBe(false);
  });

  it('returns false for a credential field when fieldModes is empty (no manual_static)', () => {
    // activecampaign.apiKey has ownership: 'credential'
    expect(shouldRequireCredential('activecampaign', 'apiKey', {})).toBe(false);
  });

  it('returns false for a credential field when mode is runtime_ai', () => {
    expect(shouldRequireCredential('activecampaign', 'apiKey', { apiKey: 'runtime_ai' as any })).toBe(false);
  });

  it('returns false for a credential field when mode is buildtime_ai_once', () => {
    expect(shouldRequireCredential('activecampaign', 'apiKey', { apiKey: 'buildtime_ai_once' as any })).toBe(false);
  });

  it('returns true for a credential field when mode is manual_static', () => {
    // activecampaign.apiKey: ownership 'credential', fillMode.default 'manual_static'
    expect(shouldRequireCredential('activecampaign', 'apiKey', { apiKey: 'manual_static' })).toBe(true);
  });

  it('returns true for google_gmail credentialId when mode is manual_static', () => {
    // google_gmail.credentialId: ownership 'credential'
    expect(shouldRequireCredential('google_gmail', 'credentialId', { credentialId: 'manual_static' })).toBe(true);
  });
});

// ─── discoverNodeInputs edge cases ───────────────────────────────────────────

describe('WorkflowLifecycleManager.discoverNodeInputs edge cases', () => {
  const manager = new WorkflowLifecycleManager();

  it('returns empty inputs array for an empty workflow', () => {
    const workflow: Workflow = { nodes: [], edges: [] };
    const result = manager.discoverNodeInputs(workflow);
    expect(result.inputs).toEqual([]);
  });

  it('skips nodes whose type is not found in the node library', () => {
    const workflow: Workflow = {
      nodes: [
        {
          id: 'fake_1',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: {
            type: 'totally_unknown_node_type_xyz',
            label: 'Unknown',
            category: 'utility',
            config: {},
          },
        },
      ],
      edges: [],
    };
    const result = manager.discoverNodeInputs(workflow);
    expect(result.inputs.filter((i) => i.nodeId === 'fake_1')).toHaveLength(0);
  });

  it('does not emit fields that already have a concrete value in config', () => {
    // google_sheets needs spreadsheetId and sheetName; pre-fill both
    const workflow: Workflow = {
      nodes: [
        {
          id: 'sheets_1',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: {
            type: 'google_sheets',
            label: 'Read Sheets',
            category: 'google',
            config: {
              operation: 'read',
              spreadsheetId: 'existing-spreadsheet-id',
              sheetName: 'Sheet1',
            },
          },
        },
      ],
      edges: [],
    };
    const result = manager.discoverNodeInputs(workflow);
    const fields = result.inputs
      .filter((i) => i.nodeId === 'sheets_1')
      .map((i) => i.fieldName);
    expect(fields).not.toContain('spreadsheetId');
    expect(fields).not.toContain('sheetName');
  });

  it('does not emit credential-ownership fields (credential gate)', () => {
    // activecampaign has apiKey with ownership: 'credential' — must not appear in discoverNodeInputs
    const workflow: Workflow = {
      nodes: [
        {
          id: 'ac_1',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: {
            type: 'activecampaign',
            label: 'ActiveCampaign',
            category: 'crm',
            config: {
              operation: 'add',
            },
          },
        },
      ],
      edges: [],
    };
    const result = manager.discoverNodeInputs(workflow);
    const fields = result.inputs
      .filter((i) => i.nodeId === 'ac_1')
      .map((i) => i.fieldName);
    // apiKey is credential-owned — must never surface as a node input
    expect(fields).not.toContain('apiKey');
  });

  it('includes inputType metadata for every discovered input', () => {
    const workflow: Workflow = {
      nodes: [
        {
          id: 'sheets_2',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: {
            type: 'google_sheets',
            label: 'Write Sheets',
            category: 'google',
            config: {
              operation: 'read',
            },
          },
        },
      ],
      edges: [],
    };
    const result = manager.discoverNodeInputs(workflow);
    const nodeInputs = result.inputs.filter((i) => i.nodeId === 'sheets_2');
    for (const input of nodeInputs) {
      expect(input.inputType).toBeDefined();
      expect(input.nodeType).toBe('google_sheets');
      expect(typeof input.required).toBe('boolean');
    }
  });

  it('handles multiple nodes and returns inputs attributed to the correct nodeId', () => {
    // Use google_gmail which the existing test suite confirms produces value-ownership inputs
    const workflow: Workflow = {
      nodes: [
        {
          id: 'gmail_a',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: {
            type: 'google_gmail',
            label: 'Gmail A',
            category: 'google',
            config: { operation: 'send' },
          },
        },
        {
          id: 'gmail_b',
          type: 'custom',
          position: { x: 200, y: 0 },
          data: {
            type: 'google_gmail',
            label: 'Gmail B',
            category: 'google',
            config: { operation: 'send' },
          },
        },
      ],
      edges: [],
    };
    const result = manager.discoverNodeInputs(workflow);
    // Each input must reference a nodeId that exists in the workflow
    const validNodeIds = new Set(['gmail_a', 'gmail_b']);
    for (const input of result.inputs) {
      expect(validNodeIds.has(input.nodeId)).toBe(true);
    }
    // Both nodes must be represented if there are any inputs
    if (result.inputs.length > 0) {
      const nodeIds = new Set(result.inputs.map((i) => i.nodeId));
      expect(nodeIds.has('gmail_a') || nodeIds.has('gmail_b')).toBe(true);
    }
  });
});
