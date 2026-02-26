/**
 * Unit Tests for Credential Resolver
 * 
 * Tests the credential resolution logic, especially for multiple Google integrations:
 * - Gmail only workflow
 * - Sheets only workflow
 * - Docs only workflow
 * - Gmail + Sheets workflow (should get 2 separate credentials)
 * - Gmail + Docs workflow (should get 2 separate credentials)
 * - Sheets + Docs workflow (should get 2 separate credentials)
 * - Gmail + Sheets + Docs workflow (should get 3 separate credentials)
 */

import { CredentialResolver } from '../credential-resolver';
import { Workflow, WorkflowNode } from '../../../core/types/ai-types';
import { nodeLibrary } from '../../nodes/node-library';

describe('CredentialResolver', () => {
  let resolver: CredentialResolver;

  beforeEach(() => {
    resolver = new CredentialResolver(nodeLibrary);
  });

  describe('resolve', () => {
    it('should resolve Gmail credential for Gmail-only workflow', async () => {
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

      const result = await resolver.resolve(workflow);

      expect(result.required).toHaveLength(1);
      expect(result.required[0].provider).toBe('google');
      expect(result.required[0].type).toBe('oauth');
      expect(result.required[0].nodeTypes).toContain('google_gmail');
      expect(result.required[0].scopes?.some(s => s.includes('gmail'))).toBe(true);
    });

    it('should resolve Sheets credential for Sheets-only workflow', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'sheets1',
            type: 'custom',
            position: { x: 0, y: 0 },
            data: {
              type: 'google_sheets',
              label: 'Append to Sheet',
              category: 'google',
              config: {},
            },
          },
        ],
        edges: [],
      };

      const result = await resolver.resolve(workflow);

      expect(result.required).toHaveLength(1);
      expect(result.required[0].provider).toBe('google');
      expect(result.required[0].type).toBe('oauth');
      expect(result.required[0].nodeTypes).toContain('google_sheets');
      expect(result.required[0].scopes?.some(s => s.includes('spreadsheets'))).toBe(true);
    });

    it('should resolve Docs credential for Docs-only workflow', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'docs1',
            type: 'custom',
            position: { x: 0, y: 0 },
            data: {
              type: 'google_doc',
              label: 'Create Document',
              category: 'google',
              config: {},
            },
          },
        ],
        edges: [],
      };

      const result = await resolver.resolve(workflow);

      expect(result.required).toHaveLength(1);
      expect(result.required[0].provider).toBe('google');
      expect(result.required[0].type).toBe('oauth');
      expect(result.required[0].nodeTypes).toContain('google_doc');
      expect(result.required[0].scopes?.some(s => s.includes('documents'))).toBe(true);
    });

    it('should resolve TWO separate credentials for Gmail + Sheets workflow', async () => {
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
          {
            id: 'sheets1',
            type: 'custom',
            position: { x: 100, y: 0 },
            data: {
              type: 'google_sheets',
              label: 'Append to Sheet',
              category: 'google',
              config: {},
            },
          },
        ],
        edges: [],
      };

      const result = await resolver.resolve(workflow);

      // ✅ CRITICAL: Should have TWO separate Google credentials
      const googleCreds = result.required.filter(c => c.provider === 'google');
      expect(googleCreds).toHaveLength(2);

      const gmailCred = googleCreds.find(c => 
        c.scopes?.some(s => s.includes('gmail'))
      );
      const sheetsCred = googleCreds.find(c => 
        c.scopes?.some(s => s.includes('spreadsheets'))
      );

      expect(gmailCred).toBeDefined();
      expect(gmailCred?.nodeTypes).toContain('google_gmail');
      expect(gmailCred?.credentialId).toContain('gmail');

      expect(sheetsCred).toBeDefined();
      expect(sheetsCred?.nodeTypes).toContain('google_sheets');
      expect(sheetsCred?.credentialId).toContain('spreadsheets');
    });

    it('should resolve TWO separate credentials for Gmail + Docs workflow', async () => {
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
          {
            id: 'docs1',
            type: 'custom',
            position: { x: 100, y: 0 },
            data: {
              type: 'google_doc',
              label: 'Create Document',
              category: 'google',
              config: {},
            },
          },
        ],
        edges: [],
      };

      const result = await resolver.resolve(workflow);

      // ✅ CRITICAL: Should have TWO separate Google credentials
      const googleCreds = result.required.filter(c => c.provider === 'google');
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
    });

    it('should resolve TWO separate credentials for Sheets + Docs workflow', async () => {
      const workflow: Workflow = {
        nodes: [
          {
            id: 'sheets1',
            type: 'custom',
            position: { x: 0, y: 0 },
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
            position: { x: 100, y: 0 },
            data: {
              type: 'google_doc',
              label: 'Create Document',
              category: 'google',
              config: {},
            },
          },
        ],
        edges: [],
      };

      const result = await resolver.resolve(workflow);

      // ✅ CRITICAL: Should have TWO separate Google credentials
      const googleCreds = result.required.filter(c => c.provider === 'google');
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

    it('should resolve THREE separate credentials for Gmail + Sheets + Docs workflow', async () => {
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
          {
            id: 'sheets1',
            type: 'custom',
            position: { x: 100, y: 0 },
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
            position: { x: 200, y: 0 },
            data: {
              type: 'google_doc',
              label: 'Create Document',
              category: 'google',
              config: {},
            },
          },
        ],
        edges: [],
      };

      const result = await resolver.resolve(workflow);

      // ✅ CRITICAL: Should have THREE separate Google credentials (one per integration)
      const googleCreds = result.required.filter(c => c.provider === 'google');
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
      expect(gmailCred?.credentialId).not.toBe(sheetsCred?.credentialId);
      expect(gmailCred?.credentialId).not.toBe(docsCred?.credentialId);

      expect(sheetsCred).toBeDefined();
      expect(sheetsCred?.nodeTypes).toContain('google_sheets');
      expect(sheetsCred?.credentialId).not.toBe(docsCred?.credentialId);

      expect(docsCred).toBeDefined();
      expect(docsCred?.nodeTypes).toContain('google_doc');
    });

    it('should generate unique credential IDs for different Google integrations', async () => {
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
          {
            id: 'sheets1',
            type: 'custom',
            position: { x: 100, y: 0 },
            data: {
              type: 'google_sheets',
              label: 'Append to Sheet',
              category: 'google',
              config: {},
            },
          },
        ],
        edges: [],
      };

      const result = await resolver.resolve(workflow);

      const googleCreds = result.required.filter(c => c.provider === 'google');
      expect(googleCreds).toHaveLength(2);

      // ✅ CRITICAL: Credential IDs should be different
      const credentialIds = googleCreds.map(c => c.credentialId);
      expect(new Set(credentialIds).size).toBe(2); // All IDs should be unique

      // Credential IDs should include scope signatures
      const gmailCred = googleCreds.find(c => c.scopes?.some(s => s.includes('gmail')));
      const sheetsCred = googleCreds.find(c => c.scopes?.some(s => s.includes('spreadsheets')));

      expect(gmailCred?.credentialId).toContain('gmail');
      expect(sheetsCred?.credentialId).toContain('spreadsheets');
    });
  });
});
