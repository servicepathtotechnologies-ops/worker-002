/**
 * Unit Tests for Credential Discovery Phase
 * 
 * Tests the structural credential discovery architecture:
 * - Gmail + Slack workflow returns both credentials
 * - Gmail only returns Gmail
 * - Slack only returns Slack
 * - Missing schema throws during discover_credentials phase
 */

import { credentialDiscoveryPhase } from '../credential-discovery-phase';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../../core/types/ai-types';
import { nodeLibrary } from '../../nodes/node-library';

describe('CredentialDiscoveryPhase', () => {
  describe('discoverCredentials', () => {
    it('should discover Gmail + Slack credentials for workflow with both nodes', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'manual_trigger',
            position: { x: 0, y: 0 },
            data: {
              type: 'manual_trigger',
              label: 'Start',
              category: 'triggers',
              config: {},
            },
          },
          {
            id: 'gmail1',
            type: 'custom',
            position: { x: 100, y: 0 },
            data: {
              type: 'google_gmail',
              label: 'Send Email',
              category: 'google',
              config: {},
            },
          },
          {
            id: 'slack1',
            type: 'custom',
            position: { x: 200, y: 0 },
            data: {
              type: 'slack_message',
              label: 'Send to Slack',
              category: 'output',
              config: {},
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger1', target: 'gmail1' },
          { id: 'e2', source: 'gmail1', target: 'slack1' },
        ],
      };

      const result = await credentialDiscoveryPhase.discoverCredentials(workflow);

      expect(result.allDiscovered).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.requiredCredentials).toHaveLength(2);
      
      const gmailCred = result.requiredCredentials.find(c => c.provider === 'google');
      const slackCred = result.requiredCredentials.find(c => c.provider === 'slack');
      
      expect(gmailCred).toBeDefined();
      expect(gmailCred?.type).toBe('oauth');
      expect(gmailCred?.nodeTypes).toContain('google_gmail');
      
      expect(slackCred).toBeDefined();
      expect(slackCred?.type).toBe('webhook');
      expect(slackCred?.nodeTypes).toContain('slack_message');
    });

    it('should discover only Gmail credential for Gmail-only workflow', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'manual_trigger',
            position: { x: 0, y: 0 },
            data: {
              type: 'manual_trigger',
              label: 'Start',
              category: 'triggers',
              config: {},
            },
          },
          {
            id: 'gmail1',
            type: 'custom',
            position: { x: 100, y: 0 },
            data: {
              type: 'google_gmail',
              label: 'Send Email',
              category: 'google',
              config: {},
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger1', target: 'gmail1' },
        ],
      };

      const result = await credentialDiscoveryPhase.discoverCredentials(workflow);

      expect(result.allDiscovered).toBe(true);
      expect(result.requiredCredentials).toHaveLength(1);
      expect(result.requiredCredentials[0].provider).toBe('google');
      expect(result.requiredCredentials[0].nodeTypes).toContain('google_gmail');
    });

    it('should treat "gmail" alias as google_gmail for credential discovery (OAuth contract)', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'manual_trigger',
            position: { x: 0, y: 0 },
            data: {
              type: 'manual_trigger',
              label: 'Start',
              category: 'triggers',
              config: {},
            },
          },
          {
            id: 'gmail1',
            type: 'custom',
            position: { x: 100, y: 0 },
            data: {
              type: 'gmail', // alias (virtual type)
              label: 'Send Email',
              category: 'google',
              config: {},
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger1', target: 'gmail1' },
        ],
      };

      const result = await credentialDiscoveryPhase.discoverCredentials(workflow);

      expect(result.allDiscovered).toBe(true);
      // Must resolve via connector registry (google oauth), not via schema heuristics
      expect(result.requiredCredentials.some(c => c.provider === 'google' && c.type === 'oauth')).toBe(true);
      const googleCred = result.requiredCredentials.find(c => c.provider === 'google' && c.type === 'oauth');
      expect(googleCred?.nodeIds).toContain('gmail1');
    });

    it('should discover only Slack credential for Slack-only workflow', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'manual_trigger',
            position: { x: 0, y: 0 },
            data: {
              type: 'manual_trigger',
              label: 'Start',
              category: 'triggers',
              config: {},
            },
          },
          {
            id: 'slack1',
            type: 'custom',
            position: { x: 100, y: 0 },
            data: {
              type: 'slack_message',
              label: 'Send to Slack',
              category: 'output',
              config: {},
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger1', target: 'slack1' },
        ],
      };

      const result = await credentialDiscoveryPhase.discoverCredentials(workflow);

      expect(result.allDiscovered).toBe(true);
      expect(result.requiredCredentials).toHaveLength(1);
      expect(result.requiredCredentials[0].provider).toBe('slack');
      expect(result.requiredCredentials[0].nodeTypes).toContain('slack_message');
    });

    it('should fail when node has missing schema', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'manual_trigger',
            position: { x: 0, y: 0 },
            data: {
              type: 'manual_trigger',
              label: 'Start',
              category: 'triggers',
              config: {},
            },
          },
          {
            id: 'invalid1',
            type: 'custom',
            position: { x: 100, y: 0 },
            data: {
              type: 'nonexistent_node_type_12345',
              label: 'Invalid Node',
              category: 'unknown',
              config: {},
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger1', target: 'invalid1' },
        ],
      };

      const result = await credentialDiscoveryPhase.discoverCredentials(workflow);

      expect(result.allDiscovered).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('nonexistent_node_type_12345'))).toBe(true);
      expect(result.errors.some(e => e.includes('no schema'))).toBe(true);
    });

    it('should deduplicate credentials by provider + scope', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'manual_trigger',
            position: { x: 0, y: 0 },
            data: {
              type: 'manual_trigger',
              label: 'Start',
              category: 'triggers',
              config: {},
            },
          },
          {
            id: 'gmail1',
            type: 'custom',
            position: { x: 100, y: 0 },
            data: {
              type: 'google_gmail',
              label: 'Send Email 1',
              category: 'google',
              config: {},
            },
          },
          {
            id: 'gmail2',
            type: 'custom',
            position: { x: 200, y: 0 },
            data: {
              type: 'google_gmail',
              label: 'Send Email 2',
              category: 'google',
              config: {},
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger1', target: 'gmail1' },
          { id: 'e2', source: 'gmail1', target: 'gmail2' },
        ],
      };

      const result = await credentialDiscoveryPhase.discoverCredentials(workflow);

      // Should have only ONE Google credential (deduplicated - same scopes)
      expect(result.requiredCredentials.filter(c => c.provider === 'google')).toHaveLength(1);
      
      const googleCred = result.requiredCredentials.find(c => c.provider === 'google');
      expect(googleCred?.nodeIds).toContain('gmail1');
      expect(googleCred?.nodeIds).toContain('gmail2');
      expect(googleCred?.nodeTypes).toContain('google_gmail');
    });

    // ✅ NEW TESTS: Multiple Google integrations should get separate credentials
    it('should discover separate credentials for Gmail + Sheets workflow', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'manual_trigger',
            position: { x: 0, y: 0 },
            data: {
              type: 'manual_trigger',
              label: 'Start',
              category: 'triggers',
              config: {},
            },
          },
          {
            id: 'gmail1',
            type: 'custom',
            position: { x: 100, y: 0 },
            data: {
              type: 'google_gmail',
              label: 'Send Email',
              category: 'google',
              config: {},
            },
          },
          {
            id: 'sheets1',
            type: 'custom',
            position: { x: 200, y: 0 },
            data: {
              type: 'google_sheets',
              label: 'Append to Sheet',
              category: 'google',
              config: {},
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger1', target: 'gmail1' },
          { id: 'e2', source: 'gmail1', target: 'sheets1' },
        ],
      };

      const result = await credentialDiscoveryPhase.discoverCredentials(workflow);

      expect(result.allDiscovered).toBe(true);
      expect(result.errors).toHaveLength(0);
      
      // ✅ CRITICAL: Should have TWO separate Google credentials (different scopes)
      const googleCreds = result.requiredCredentials.filter(c => c.provider === 'google');
      expect(googleCreds).toHaveLength(2);
      
      const gmailCred = googleCreds.find(c => 
        c.scopes?.some(s => s.includes('gmail'))
      );
      const sheetsCred = googleCreds.find(c => 
        c.scopes?.some(s => s.includes('spreadsheets'))
      );
      
      expect(gmailCred).toBeDefined();
      expect(gmailCred?.nodeTypes).toContain('google_gmail');
      expect(gmailCred?.displayName).toContain('Gmail');
      
      expect(sheetsCred).toBeDefined();
      expect(sheetsCred?.nodeTypes).toContain('google_sheets');
      expect(sheetsCred?.displayName).toContain('Sheets');
    });

    it('should discover separate credentials for Gmail + Docs workflow', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'manual_trigger',
            position: { x: 0, y: 0 },
            data: {
              type: 'manual_trigger',
              label: 'Start',
              category: 'triggers',
              config: {},
            },
          },
          {
            id: 'gmail1',
            type: 'custom',
            position: { x: 100, y: 0 },
            data: {
              type: 'google_gmail',
              label: 'Send Email',
              category: 'google',
              config: {},
            },
          },
          {
            id: 'docs1',
            type: 'custom',
            position: { x: 200, y: 0 },
            data: {
              type: 'google_doc',
              label: 'Create Document',
              category: 'google',
              config: {},
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger1', target: 'gmail1' },
          { id: 'e2', source: 'gmail1', target: 'docs1' },
        ],
      };

      const result = await credentialDiscoveryPhase.discoverCredentials(workflow);

      expect(result.allDiscovered).toBe(true);
      expect(result.errors).toHaveLength(0);
      
      // ✅ CRITICAL: Should have TWO separate Google credentials
      const googleCreds = result.requiredCredentials.filter(c => c.provider === 'google');
      expect(googleCreds).toHaveLength(2);
      
      const gmailCred = googleCreds.find(c => 
        c.scopes?.some(s => s.includes('gmail'))
      );
      const docsCred = googleCreds.find(c => 
        c.scopes?.some(s => s.includes('documents'))
      );
      
      expect(gmailCred).toBeDefined();
      expect(gmailCred?.nodeTypes).toContain('google_gmail');
      
      expect(docsCred).toBeDefined();
      expect(docsCred?.nodeTypes).toContain('google_doc');
      expect(docsCred?.displayName).toContain('Docs');
    });

    it('should discover separate credentials for Sheets + Docs workflow', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'manual_trigger',
            position: { x: 0, y: 0 },
            data: {
              type: 'manual_trigger',
              label: 'Start',
              category: 'triggers',
              config: {},
            },
          },
          {
            id: 'sheets1',
            type: 'custom',
            position: { x: 100, y: 0 },
            data: {
              type: 'google_sheets',
              label: 'Read Sheet',
              category: 'google',
              config: {},
            },
          },
          {
            id: 'docs1',
            type: 'custom',
            position: { x: 200, y: 0 },
            data: {
              type: 'google_doc',
              label: 'Create Document',
              category: 'google',
              config: {},
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger1', target: 'sheets1' },
          { id: 'e2', source: 'sheets1', target: 'docs1' },
        ],
      };

      const result = await credentialDiscoveryPhase.discoverCredentials(workflow);

      expect(result.allDiscovered).toBe(true);
      expect(result.errors).toHaveLength(0);
      
      // ✅ CRITICAL: Should have TWO separate Google credentials
      const googleCreds = result.requiredCredentials.filter(c => c.provider === 'google');
      expect(googleCreds).toHaveLength(2);
      
      const sheetsCred = googleCreds.find(c => 
        c.scopes?.some(s => s.includes('spreadsheets'))
      );
      const docsCred = googleCreds.find(c => 
        c.scopes?.some(s => s.includes('documents'))
      );
      
      expect(sheetsCred).toBeDefined();
      expect(sheetsCred?.nodeTypes).toContain('google_sheets');
      
      expect(docsCred).toBeDefined();
      expect(docsCred?.nodeTypes).toContain('google_doc');
    });

    it('should discover separate credentials for Gmail + Sheets + Docs workflow', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'trigger1',
            type: 'manual_trigger',
            position: { x: 0, y: 0 },
            data: {
              type: 'manual_trigger',
              label: 'Start',
              category: 'triggers',
              config: {},
            },
          },
          {
            id: 'gmail1',
            type: 'custom',
            position: { x: 100, y: 0 },
            data: {
              type: 'google_gmail',
              label: 'Send Email',
              category: 'google',
              config: {},
            },
          },
          {
            id: 'sheets1',
            type: 'custom',
            position: { x: 200, y: 0 },
            data: {
              type: 'google_sheets',
              label: 'Append to Sheet',
              category: 'google',
              config: {},
            },
          },
          {
            id: 'docs1',
            type: 'custom',
            position: { x: 300, y: 0 },
            data: {
              type: 'google_doc',
              label: 'Create Document',
              category: 'google',
              config: {},
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger1', target: 'gmail1' },
          { id: 'e2', source: 'gmail1', target: 'sheets1' },
          { id: 'e3', source: 'sheets1', target: 'docs1' },
        ],
      };

      const result = await credentialDiscoveryPhase.discoverCredentials(workflow);

      expect(result.allDiscovered).toBe(true);
      expect(result.errors).toHaveLength(0);
      
      // ✅ CRITICAL: Should have THREE separate Google credentials (one per integration)
      const googleCreds = result.requiredCredentials.filter(c => c.provider === 'google');
      expect(googleCreds).toHaveLength(3);
      
      const gmailCred = googleCreds.find(c => 
        c.scopes?.some(s => s.includes('gmail'))
      );
      const sheetsCred = googleCreds.find(c => 
        c.scopes?.some(s => s.includes('spreadsheets'))
      );
      const docsCred = googleCreds.find(c => 
        c.scopes?.some(s => s.includes('documents'))
      );
      
      expect(gmailCred).toBeDefined();
      expect(gmailCred?.nodeTypes).toContain('google_gmail');
      
      expect(sheetsCred).toBeDefined();
      expect(sheetsCred?.nodeTypes).toContain('google_sheets');
      
      expect(docsCred).toBeDefined();
      expect(docsCred?.nodeTypes).toContain('google_doc');
    });
  });

  describe('validateCredentialsAvailable', () => {
    it('should validate when all credentials are available', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'gmail1',
            type: 'custom',
            position: { x: 0, y: 0 },
            data: {
              type: 'google_gmail',
              label: 'Send Email',
              category: 'google',
              config: {},
            },
          },
        ],
        edges: [],
      };

      const availableCredentials = new Map<string, boolean>();
      availableCredentials.set('google', true);

      const result = await credentialDiscoveryPhase.validateCredentialsAvailable(
        workflow,
        availableCredentials
      );

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should fail when required credentials are missing', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'gmail1',
            type: 'custom',
            position: { x: 0, y: 0 },
            data: {
              type: 'google_gmail',
              label: 'Send Email',
              category: 'google',
              config: {},
            },
          },
        ],
        edges: [],
      };

      const availableCredentials = new Map<string, boolean>();
      // Google credential NOT available

      const result = await credentialDiscoveryPhase.validateCredentialsAvailable(
        workflow,
        availableCredentials
      );

      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
      expect(result.missing.some(c => c.provider === 'google')).toBe(true);
    });
  });
});
