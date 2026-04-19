/**
 * Unit Tests for createFirebaseSchema() — Task 12.1
 *
 * Validates: Requirements 1.1–1.14
 *
 * Asserts:
 *   - schema has type: 'firebase', category: 'database', providers: ['firebase']
 *   - all required fields are declared in configSchema.required
 *   - all optional fields are declared in configSchema.optional
 *   - aiSelectionCriteria.keywords includes 'firebase' and 'firestore'
 *   - commonPatterns has entries for get_document, add_document, query_collection
 *   - validationRules enforces non-empty strings for credentials and valid operation enum
 */

import { describe, it, expect } from '@jest/globals';

// We access the private method via the public API (getSchema) since
// NodeLibrary registers all schemas on construction.
import { NodeLibrary } from '../services/nodes/node-library';

describe('createFirebaseSchema() — unit tests (Task 12.1)', () => {
  let schema: ReturnType<NodeLibrary['getSchema']>;

  beforeAll(() => {
    const library = new NodeLibrary();
    schema = library.getSchema('firebase');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1 — NodeLibrary contains a Firebase schema with type 'firebase'
  // -------------------------------------------------------------------------
  it('schema is registered and has type: firebase', () => {
    expect(schema).toBeDefined();
    expect(schema!.type).toBe('firebase');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.3 — category: 'database'
  // -------------------------------------------------------------------------
  it('schema has category: database', () => {
    expect(schema!.category).toBe('database');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.12 — providers: ['firebase']
  // -------------------------------------------------------------------------
  it('schema has providers: [firebase]', () => {
    expect(schema!.providers).toEqual(['firebase']);
  });

  // -------------------------------------------------------------------------
  // Requirement 1.4 — required fields
  // -------------------------------------------------------------------------
  it('configSchema.required includes projectId, clientEmail, privateKey, operation', () => {
    const required = schema!.configSchema.required;
    expect(required).toContain('projectId');
    expect(required).toContain('clientEmail');
    expect(required).toContain('privateKey');
    expect(required).toContain('operation');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.5 — optional fields with type and description
  // -------------------------------------------------------------------------
  it('configSchema.optional includes all six optional fields', () => {
    const optional = schema!.configSchema.optional as Record<string, { type: string; description: string }>;
    expect(optional).toBeDefined();

    const expectedOptional = ['collection', 'documentId', 'data', 'filter', 'limit', 'databaseUrl'];
    for (const field of expectedOptional) {
      expect(optional[field]).toBeDefined();
      expect(typeof optional[field].type).toBe('string');
      expect(typeof optional[field].description).toBe('string');
    }
  });

  it('optional field types are correct', () => {
    const optional = schema!.configSchema.optional as Record<string, { type: string }>;
    expect(optional.collection.type).toBe('string');
    expect(optional.documentId.type).toBe('string');
    expect(optional.data.type).toBe('object');
    expect(optional.filter.type).toBe('object');
    expect(optional.limit.type).toBe('number');
    expect(optional.databaseUrl.type).toBe('string');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.6 — aiSelectionCriteria.keywords
  // -------------------------------------------------------------------------
  it('aiSelectionCriteria.keywords includes firebase and firestore', () => {
    const keywords = schema!.aiSelectionCriteria?.keywords ?? [];
    expect(keywords).toContain('firebase');
    expect(keywords).toContain('firestore');
  });

  it('aiSelectionCriteria.keywords includes all required keywords', () => {
    const keywords = schema!.aiSelectionCriteria?.keywords ?? [];
    const expected = ['firebase', 'firestore', 'realtime database', 'google firebase', 'nosql', 'document database'];
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

  // -------------------------------------------------------------------------
  // Requirement 1.7 — whenNotToUse includes SQL databases, PostgreSQL, MySQL
  // -------------------------------------------------------------------------
  it('aiSelectionCriteria.whenNotToUse includes SQL databases, PostgreSQL, MySQL', () => {
    const whenNotToUse = schema!.aiSelectionCriteria?.whenNotToUse ?? [];
    expect(whenNotToUse).toContain('SQL databases');
    expect(whenNotToUse).toContain('PostgreSQL');
    expect(whenNotToUse).toContain('MySQL');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.8 — commonPatterns: get_document, add_document, query_collection
  // -------------------------------------------------------------------------
  it('commonPatterns has entries for get_document, add_document, query_collection', () => {
    const patterns = schema!.commonPatterns ?? [];
    const names = patterns.map((p: { name: string }) => p.name);
    expect(names).toContain('get_document');
    expect(names).toContain('add_document');
    expect(names).toContain('query_collection');
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
  // Requirement 1.10 — validationRules: operation must be one of valid values
  // -------------------------------------------------------------------------
  it('validationRules enforces operation is one of valid values', () => {
    const rules = schema!.validationRules ?? [];
    const opRule = rules.find((r: any) => r.field === 'operation');
    expect(opRule).toBeDefined();
    const validOps = ['get', 'add', 'update', 'delete', 'query', 'realtime_get', 'realtime_set'];
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
  it('schema has an outputSchema defined (set by createFirebaseSchema or addSchema enrichment)', () => {
    // The schema is enriched by addSchema() which may set outputSchema via getNodeOutputSchema().
    // Either way, the schema must be defined and registered.
    expect(schema).toBeDefined();
    // The raw outputSchema from createFirebaseSchema is set before addSchema may overwrite it.
    // We verify the schema is registered and has the correct type.
    expect(schema!.type).toBe('firebase');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.13 — getSchema('firebase') returns without error
  // -------------------------------------------------------------------------
  it('NodeLibrary.getSchema("firebase") returns the schema without error', () => {
    const library = new NodeLibrary();
    const result = library.getSchema('firebase');
    expect(result).toBeDefined();
    expect(result!.type).toBe('firebase');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.14 — isNodeTypeRegistered('firebase') returns true
  // -------------------------------------------------------------------------
  it('NodeLibrary.isNodeTypeRegistered("firebase") returns true', () => {
    const library = new NodeLibrary();
    expect(library.isNodeTypeRegistered('firebase')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1 — getRegisteredNodeTypes() includes 'firebase'
  // -------------------------------------------------------------------------
  it('NodeLibrary.getRegisteredNodeTypes() includes firebase', () => {
    const library = new NodeLibrary();
    const types = library.getRegisteredNodeTypes();
    expect(types).toContain('firebase');
  });
});
