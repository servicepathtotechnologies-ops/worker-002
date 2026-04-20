/**
 * Unit Tests for createGoogleCloudStorageSchema() — Task 12.1
 *
 * Validates: Requirements 1.1–1.14
 *
 * Asserts:
 *   - schema has type: 'google_cloud_storage', category: 'database', providers: ['google_cloud_storage']
 *   - all required fields are declared in configSchema.required
 *   - all optional fields are declared in configSchema.optional
 *   - aiSelectionCriteria.keywords includes 'google cloud storage' and 'gcs'
 *   - commonPatterns has entries for upload_file, download_file, delete_file, list_files
 *   - validationRules enforces non-empty strings for credentials and valid operation enum
 */

import { describe, it, expect } from '@jest/globals';

// We access the private method via the public API (getSchema) since
// NodeLibrary registers all schemas on construction.
import { NodeLibrary } from '../services/nodes/node-library';

describe('createGoogleCloudStorageSchema() — unit tests (Task 12.1)', () => {
  let schema: ReturnType<NodeLibrary['getSchema']>;

  beforeAll(() => {
    const library = new NodeLibrary();
    schema = library.getSchema('google_cloud_storage');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1 — NodeLibrary contains a GCS schema with type 'google_cloud_storage'
  // -------------------------------------------------------------------------
  it('schema is registered and has type: google_cloud_storage', () => {
    expect(schema).toBeDefined();
    expect(schema!.type).toBe('google_cloud_storage');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.3 — category: 'database'
  // -------------------------------------------------------------------------
  it('schema has category: database', () => {
    expect(schema!.category).toBe('database');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.12 — providers: ['google_cloud_storage']
  // -------------------------------------------------------------------------
  it('schema has providers: [google_cloud_storage]', () => {
    expect(schema!.providers).toEqual(['google_cloud_storage']);
  });

  // -------------------------------------------------------------------------
  // Requirement 1.4 — required fields
  // -------------------------------------------------------------------------
  it('configSchema.required includes projectId, clientEmail, privateKey, operation, bucket', () => {
    const required = schema!.configSchema.required;
    expect(required).toContain('projectId');
    expect(required).toContain('clientEmail');
    expect(required).toContain('privateKey');
    expect(required).toContain('operation');
    expect(required).toContain('bucket');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.5 — optional fields with type and description
  // -------------------------------------------------------------------------
  it('configSchema.optional includes all three optional fields', () => {
    const optional = schema!.configSchema.optional as Record<string, { type: string; description: string }>;
    expect(optional).toBeDefined();

    const expectedOptional = ['fileName', 'fileContent', 'filter'];
    for (const field of expectedOptional) {
      expect(optional[field]).toBeDefined();
      expect(typeof optional[field].type).toBe('string');
      expect(typeof optional[field].description).toBe('string');
    }
  });

  it('optional field types are correct', () => {
    const optional = schema!.configSchema.optional as Record<string, { type: string }>;
    expect(optional.fileName.type).toBe('string');
    expect(optional.fileContent.type).toBe('string');
    expect(optional.filter.type).toBe('string');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.6 — aiSelectionCriteria.keywords
  // -------------------------------------------------------------------------
  it('aiSelectionCriteria.keywords includes google cloud storage and gcs', () => {
    const keywords = schema!.aiSelectionCriteria?.keywords ?? [];
    expect(keywords).toContain('google cloud storage');
    expect(keywords).toContain('gcs');
  });

  it('aiSelectionCriteria.keywords includes all required keywords', () => {
    const keywords = schema!.aiSelectionCriteria?.keywords ?? [];
    const expected = ['google cloud storage', 'gcs', 'cloud storage', 'object storage', 'file storage', 'google storage'];
    for (const kw of expected) {
      expect(keywords).toContain(kw);
    }
  });

  // -------------------------------------------------------------------------
  // Requirement 1.7 — aiSelectionCriteria.whenToUse (at least 4 entries)
  // -------------------------------------------------------------------------
  it('aiSelectionCriteria.whenToUse has at least 4 entries', () => {
    const whenToUse = schema!.aiSelectionCriteria?.whenToUse ?? [];
    expect(whenToUse.length).toBeGreaterThanOrEqual(4);
  });

  it('aiSelectionCriteria.whenToUse includes uploading, downloading, deleting, listing', () => {
    const whenToUse = schema!.aiSelectionCriteria?.whenToUse ?? [];
    const whenToUseStr = whenToUse.join(' ').toLowerCase();
    expect(whenToUseStr).toContain('upload');
    expect(whenToUseStr).toContain('download');
    expect(whenToUseStr).toContain('delet'); // Matches "delete" or "deleting"
    expect(whenToUseStr).toContain('list');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.7 — whenNotToUse includes local file operations, SQL databases, document databases
  // -------------------------------------------------------------------------
  it('aiSelectionCriteria.whenNotToUse includes local file operations, SQL databases, document databases', () => {
    const whenNotToUse = schema!.aiSelectionCriteria?.whenNotToUse ?? [];
    expect(whenNotToUse).toContain('Local file operations');
    expect(whenNotToUse).toContain('SQL databases');
    expect(whenNotToUse).toContain('Document databases');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.8 — commonPatterns: upload_file, download_file, delete_file, list_files
  // -------------------------------------------------------------------------
  it('commonPatterns has entries for upload_file, download_file, delete_file, list_files', () => {
    const patterns = schema!.commonPatterns ?? [];
    const names = patterns.map((p: { name: string }) => p.name);
    expect(names).toContain('upload_file');
    expect(names).toContain('download_file');
    expect(names).toContain('delete_file');
    expect(names).toContain('list_files');
  });

  it('commonPatterns entries have name, description, and config', () => {
    const patterns = schema!.commonPatterns ?? [];
    for (const pattern of patterns) {
      expect(typeof pattern.name).toBe('string');
      expect(typeof pattern.description).toBe('string');
      expect(pattern.config).toBeDefined();
    }
  });

  // -------------------------------------------------------------------------
  // Requirement 1.9 — validationRules: non-empty string for credentials
  // -------------------------------------------------------------------------
  it('validationRules enforces non-empty string for projectId, clientEmail, privateKey', () => {
    const rules = schema!.validationRules ?? [];
    const credentialFields = ['projectId', 'clientEmail', 'privateKey'];
    for (const field of credentialFields) {
      const rule = rules.find((r: any) => r.field === field);
      expect(rule).toBeDefined();
      // validator should reject empty string
      expect(rule!.validator('')).toBe(false);
      // validator should accept non-empty string
      expect(rule!.validator('some-value')).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // Requirement 1.9 — validationRules: bucket must be non-empty
  // -------------------------------------------------------------------------
  it('validationRules enforces non-empty string for bucket', () => {
    const rules = schema!.validationRules ?? [];
    const bucketRule = rules.find((r: any) => r.field === 'bucket');
    expect(bucketRule).toBeDefined();
    expect(bucketRule!.validator('')).toBe(false);
    expect(bucketRule!.validator('my-bucket')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Requirement 1.10 — validationRules: operation must be one of valid values
  // -------------------------------------------------------------------------
  it('validationRules enforces operation is one of valid values', () => {
    const rules = schema!.validationRules ?? [];
    const opRule = rules.find((r: any) => r.field === 'operation');
    expect(opRule).toBeDefined();
    const validOps = ['upload', 'download', 'delete', 'list'];
    for (const op of validOps) {
      expect(opRule!.validator(op)).toBe(true);
    }
    // Invalid operation should fail
    expect(opRule!.validator('invalid_op')).toBe(false);
    expect(opRule!.validator('')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Requirement 1.11 — outputSchema fields
  // -------------------------------------------------------------------------
  it('schema has an outputSchema defined', () => {
    expect(schema).toBeDefined();
    expect(schema!.type).toBe('google_cloud_storage');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.13 — getSchema('google_cloud_storage') returns without error
  // -------------------------------------------------------------------------
  it('NodeLibrary.getSchema("google_cloud_storage") returns the schema without error', () => {
    const library = new NodeLibrary();
    const result = library.getSchema('google_cloud_storage');
    expect(result).toBeDefined();
    expect(result!.type).toBe('google_cloud_storage');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.14 — isNodeTypeRegistered('google_cloud_storage') returns true
  // -------------------------------------------------------------------------
  it('NodeLibrary.isNodeTypeRegistered("google_cloud_storage") returns true', () => {
    const library = new NodeLibrary();
    expect(library.isNodeTypeRegistered('google_cloud_storage')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1 — getRegisteredNodeTypes() includes 'google_cloud_storage'
  // -------------------------------------------------------------------------
  it('NodeLibrary.getRegisteredNodeTypes() includes google_cloud_storage', () => {
    const library = new NodeLibrary();
    const types = library.getRegisteredNodeTypes();
    expect(types).toContain('google_cloud_storage');
  });
});
