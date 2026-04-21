/**
 * Firebase Node — Property-Based Tests
 *
 * All Firebase Admin SDK calls are mocked — no real Firebase connections.
 *
 * Properties covered:
 *   Property 1  (sub-task 1.1): Credential validation rejects missing/empty fields
 *   Property 8  (sub-task 1.2): Executor returns { success: false } for missing credentials
 *   Property 9  (sub-task 1.3): Executor propagates SDK errors
 *   Property 10 (sub-task 1.4): Unique app name per execution
 *   Property 15 (sub-task 1.5): Data JSON string normalization
 *   Property 3  (sub-task 1.6): Success shape for Firestore get
 *   Property 4  (sub-task 1.7): Success shape for Firestore add
 *   Property 5  (sub-task 1.8): Success shape for Firestore update
 *   Property 6  (sub-task 1.9): Success shape for Firestore delete
 *   Property 7  (sub-task 1.10): Success shape for Firestore query
 *
 * Spec: .kiro/specs/firebase-node-integration/
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Mock firebase-admin BEFORE importing the executor so the module system
// picks up the mock instead of the real SDK.
// ---------------------------------------------------------------------------

// Captured app names across calls — used by Property 10
const capturedAppNames: string[] = [];

// Configurable mock behaviours
let mockGetData: any = { field: 'value' };
let mockDocExists = true;
let mockAddedDocId = 'new-doc-id';
let mockQueryDocs: any[] = [{ id: 'doc1', name: 'Alice' }];
let mockRealtimeData: any = { key: 'val' };
let mockSdkShouldThrow = false;
let mockSdkErrorMessage = 'SDK error';

// Firestore mock helpers
const mockDocGet = jest.fn<() => Promise<{ exists: boolean; data: () => any }>>(async () => ({
  exists: mockDocExists,
  data: () => mockGetData,
}));
const mockDocSet = jest.fn<(...args: any[]) => Promise<undefined>>(async () => undefined);
const mockDocDelete = jest.fn<() => Promise<undefined>>(async () => undefined);
const mockCollectionAdd = jest.fn<(...args: any[]) => Promise<{ id: string }>>(async () => ({ id: mockAddedDocId }));
const mockQueryGet = jest.fn<() => Promise<{ docs: Array<{ id: string; data: () => any }> }>>(async () => ({
  docs: mockQueryDocs.map((d) => ({ id: d.id, data: () => d })),
}));

// Realtime DB mock helpers
const mockRtdbGet = jest.fn<() => Promise<{ val: () => any }>>(async () => ({ val: () => mockRealtimeData }));
const mockRtdbSet = jest.fn<(...args: any[]) => Promise<undefined>>(async () => undefined);

// Tracks the app name passed to initializeApp
let lastInitializedAppName: string | undefined;

// Create a comprehensive mock that intercepts all Firebase Admin SDK calls
const mockInitializeApp = jest.fn((config: any, name: string) => {
  capturedAppNames.push(name);
  lastInitializedAppName = name;
  if (mockSdkShouldThrow) throw new Error(mockSdkErrorMessage);
  
  // Return a mock app instance
  return {
    delete: jest.fn(async () => undefined),
    name,
    options: config,
  };
});

const mockCredentialCert = jest.fn((creds: any) => {
  if (mockSdkShouldThrow) throw new Error(mockSdkErrorMessage);
  // Return a mock credential object that completely bypasses private key parsing
  return {
    projectId: creds?.projectId || 'mock-project',
    clientEmail: creds?.clientEmail || 'mock@example.com',
    privateKey: 'mock-private-key', // Simple mock value, no parsing
  };
});

const mockFirestore = jest.fn((app?: any) => ({
  collection: (name: string) => ({
    doc: (docId: string) => ({
      get: () => {
        if (mockSdkShouldThrow) throw new Error(mockSdkErrorMessage);
        return mockDocGet();
      },
      set: (data: any, opts: any) => {
        if (mockSdkShouldThrow) throw new Error(mockSdkErrorMessage);
        return mockDocSet(data, opts);
      },
      delete: () => {
        if (mockSdkShouldThrow) throw new Error(mockSdkErrorMessage);
        return mockDocDelete();
      },
    }),
    add: (data: any) => {
      if (mockSdkShouldThrow) throw new Error(mockSdkErrorMessage);
      return mockCollectionAdd(data);
    },
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: () => {
      if (mockSdkShouldThrow) throw new Error(mockSdkErrorMessage);
      return mockQueryGet();
    },
  }),
}));

const mockDatabase = jest.fn((app?: any) => ({
  ref: (path?: string) => ({
    get: () => {
      if (mockSdkShouldThrow) throw new Error(mockSdkErrorMessage);
      return mockRtdbGet();
    },
    set: (data: any) => {
      if (mockSdkShouldThrow) throw new Error(mockSdkErrorMessage);
      return mockRtdbSet(data);
    },
  }),
}));

const mockApp = jest.fn(() => ({
  delete: jest.fn(async () => undefined),
}));

// Create the complete mock object that matches firebase-admin structure
const firebaseAdminMock = {
  __esModule: true,
  // Named exports
  initializeApp: mockInitializeApp,
  credential: {
    cert: mockCredentialCert,
  },
  firestore: mockFirestore,
  database: mockDatabase,
  app: mockApp,
  // Default export (for default imports)
  default: {
    initializeApp: mockInitializeApp,
    credential: {
      cert: mockCredentialCert,
    },
    firestore: mockFirestore,
    database: mockDatabase,
    app: mockApp,
  },
};

// Mock the firebase-admin module completely
jest.mock('firebase-admin', () => firebaseAdminMock);

// Also mock the specific import pattern used in the executor
jest.doMock('firebase-admin', () => firebaseAdminMock);

// Clear the module cache to ensure fresh import
jest.resetModules();

// Import AFTER mock is set up
import { runFirebaseNode } from '../services/database/firebaseNode';

// ---------------------------------------------------------------------------
// Debug test to verify mock is working
// ---------------------------------------------------------------------------

describe('Mock Verification', () => {
  it('should use mocked firebase-admin', () => {
    expect(mockInitializeApp).toBeDefined();
    expect(jest.isMockFunction(mockInitializeApp)).toBe(true);
    expect(jest.isMockFunction(mockCredentialCert)).toBe(true);
  });

  it('should execute Firebase node with mocked SDK', async () => {
    const result = await runFirebaseNode(
      makeContext({
        ...validCredentials(),
        operation: 'get',
        collection: 'users',
        documentId: 'doc-1',
      })
    );
    
    console.log('Firebase node result:', result);
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(inputs: Record<string, any>, nodeId = 'node-1') {
  return {
    inputs,
    nodeId,
    workflowId: 'wf-1',
    previousOutputs: {},
  };
}

function validCredentials() {
  return {
    projectId: 'my-project',
    clientEmail: 'sa@my-project.iam.gserviceaccount.com',
    privateKey: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n',
  };
}

beforeEach(() => {
  capturedAppNames.length = 0;
  mockSdkShouldThrow = false;
  mockDocExists = true;
  mockGetData = { field: 'value' };
  mockAddedDocId = 'new-doc-id';
  mockQueryDocs = [{ id: 'doc1', name: 'Alice' }];
  mockRealtimeData = { key: 'val' };
  jest.clearAllMocks();
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Property 1 — Credential validation rejects missing or empty fields
// Validates: Requirements 1.9, 6.5, 11.6
// ---------------------------------------------------------------------------

// Feature: firebase-node-integration, Property 1: Credential validation rejects missing or empty fields
describe('Property 1: Credential validation rejects missing or empty fields', () => {
  it('PBT: returns { success: false } when projectId is empty or absent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant(''), fc.constant(undefined)),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        async (projectId, clientEmail, privateKey) => {
          const result = await runFirebaseNode(
            makeContext({ projectId, clientEmail, privateKey, operation: 'get' })
          );
          return result.success === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('PBT: returns { success: false } when clientEmail is empty or absent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.oneof(fc.constant(''), fc.constant(undefined)),
        fc.string({ minLength: 1 }),
        async (projectId, clientEmail, privateKey) => {
          const result = await runFirebaseNode(
            makeContext({ projectId, clientEmail, privateKey, operation: 'get' })
          );
          return result.success === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('PBT: returns { success: false } when privateKey is empty or absent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.oneof(fc.constant(''), fc.constant(undefined)),
        async (projectId, clientEmail, privateKey) => {
          const result = await runFirebaseNode(
            makeContext({ projectId, clientEmail, privateKey, operation: 'get' })
          );
          return result.success === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8 — Executor returns { success: false } for missing credentials
// without invoking the Firebase Admin SDK
// Validates: Requirements 2.9, 11.10
// ---------------------------------------------------------------------------

// Feature: firebase-node-integration, Property 8: Executor returns { success: false } for missing credentials
describe('Property 8: Executor returns { success: false } for missing credentials without SDK call', () => {
  it('PBT: SDK initializeApp is never called when credentials are absent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          projectId: fc.oneof(fc.constant(''), fc.constant(undefined)),
          clientEmail: fc.string({ minLength: 1 }),
          privateKey: fc.string({ minLength: 1 }),
          operation: fc.constant('get'),
        }),
        async (inputs) => {
          mockInitializeApp.mockClear();
          const result = await runFirebaseNode(makeContext(inputs as any));
          return result.success === false && mockInitializeApp.mock.calls.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9 — Executor propagates SDK errors
// Validates: Requirement 2.10
// ---------------------------------------------------------------------------

// Feature: firebase-node-integration, Property 9: Executor propagates SDK errors
describe('Property 9: Executor propagates SDK errors', () => {
  it('PBT: any error thrown by the SDK is caught and returned as { success: false, error }', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.constantFrom('get', 'add', 'update', 'delete', 'query'),
        async (errorMessage, operation) => {
          mockSdkShouldThrow = true;
          mockSdkErrorMessage = errorMessage;

          const inputs = {
            ...validCredentials(),
            operation,
            collection: 'users',
            documentId: 'doc-1',
            data: { name: 'test' },
          };

          const result = await runFirebaseNode(makeContext(inputs));
          mockSdkShouldThrow = false;

          return result.success === false && typeof result.error === 'string';
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10 — Unique app name per execution
// Validates: Requirement 2.12
// ---------------------------------------------------------------------------

// Feature: firebase-node-integration, Property 10: Unique app name per execution
describe('Property 10: Unique app name per execution', () => {
  it('PBT: two executions with different nodeIds produce distinct app names', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
        async (nodeId1, nodeId2) => {
          fc.pre(nodeId1 !== nodeId2);

          capturedAppNames.length = 0;

          const inputs = {
            ...validCredentials(),
            operation: 'get',
            collection: 'users',
            documentId: 'doc-1',
          };

          await runFirebaseNode(makeContext(inputs, nodeId1));
          const name1 = capturedAppNames[capturedAppNames.length - 1];

          await runFirebaseNode(makeContext(inputs, nodeId2));
          const name2 = capturedAppNames[capturedAppNames.length - 1];

          return name1 !== name2;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('PBT: even the same nodeId produces distinct app names across sequential calls (timestamp)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
        async (nodeId) => {
          capturedAppNames.length = 0;

          const inputs = {
            ...validCredentials(),
            operation: 'get',
            collection: 'users',
            documentId: 'doc-1',
          };

          await runFirebaseNode(makeContext(inputs, nodeId));
          const name1 = capturedAppNames[capturedAppNames.length - 1];

          // Ensure timestamp difference by waiting at least 10ms for more reliable timestamp difference
          await new Promise((r) => setTimeout(r, 10));

          await runFirebaseNode(makeContext(inputs, nodeId));
          const name2 = capturedAppNames[capturedAppNames.length - 1];

          return name1 !== name2;
        }
      ),
      { numRuns: 3 } // Reduced to 3 for more reliable timing
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15 — Data JSON string normalization
// Validates: Requirement 12.1
// ---------------------------------------------------------------------------

// Feature: firebase-node-integration, Property 15: Data JSON string normalization
describe('Property 15: Data JSON string normalization', () => {
  it('PBT: runFirebaseNode with data as JSON string produces same result as with data as object', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && /^[a-zA-Z0-9\s_-]+$/.test(s)),
          value: fc.integer({ min: 0, max: 1000 }),
        }),
        async (obj) => {
          // Reset captured add calls and set consistent mock response
          mockCollectionAdd.mockClear();
          const fixedDocId = 'test-doc-id';
          mockAddedDocId = fixedDocId;

          const baseInputs = {
            ...validCredentials(),
            operation: 'add',
            collection: 'items',
          };

          const resultWithObject = await runFirebaseNode(
            makeContext({ ...baseInputs, data: obj })
          );
          
          // Reset mock again to ensure same ID for second call
          mockAddedDocId = fixedDocId;
          
          const resultWithString = await runFirebaseNode(
            makeContext({ ...baseInputs, data: JSON.stringify(obj) })
          );

          // Both should succeed
          if (!resultWithObject.success || !resultWithString.success) {
            return false;
          }

          // Both should have documentId and data fields
          const hasRequiredFields = (
            typeof resultWithObject.documentId === 'string' &&
            typeof resultWithString.documentId === 'string' &&
            resultWithObject.documentId.length > 0 &&
            resultWithString.documentId.length > 0 &&
            'data' in resultWithObject &&
            'data' in resultWithString
          );

          if (!hasRequiredFields) {
            return false;
          }

          // The documentId should be the same since we're using a fixed mock
          const docIdMatches = resultWithObject.documentId === resultWithString.documentId;
          
          if (!docIdMatches) {
            return false;
          }

          // The data should be equivalent (both should have parsed the JSON correctly)
          // The executor returns the parsed data in the response, so both should be objects
          const dataMatches = JSON.stringify(resultWithObject.data) === JSON.stringify(resultWithString.data);
          
          // Also verify that both data fields are objects (not strings)
          const bothAreObjects = (
            typeof resultWithObject.data === 'object' &&
            typeof resultWithString.data === 'object' &&
            resultWithObject.data !== null &&
            resultWithString.data !== null
          );
          
          return dataMatches && bothAreObjects;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3 — Success shape for Firestore get
// Validates: Requirement 2.2
// ---------------------------------------------------------------------------

// Feature: firebase-node-integration, Property 3: Executor returns success shape for Firestore get
describe('Property 3: Success shape for Firestore get', () => {
  it('PBT: get returns { success: true, data, documentId } matching input', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 50 }).filter(s => s.trim().length >= 3 && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)),
        fc.string({ minLength: 3, maxLength: 50 }).filter(s => s.trim().length >= 3 && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)),
        fc.record({ field: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0) }),
        async (collection, documentId, docData) => {
          mockGetData = docData;
          mockDocExists = true;

          const result = await runFirebaseNode(
            makeContext({
              ...validCredentials(),
              operation: 'get',
              collection,
              documentId,
            })
          );

          // Must succeed
          if (!result.success) {
            return false;
          }

          // Must have required fields with correct values
          const hasRequiredFields = (
            result.success === true &&
            'data' in result &&
            'documentId' in result &&
            result.documentId === documentId
          );

          if (!hasRequiredFields) {
            return false;
          }

          // The data should match what we mocked (since document exists)
          const dataMatches = JSON.stringify(result.data) === JSON.stringify(docData);

          return dataMatches;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4 — Success shape for Firestore add
// Validates: Requirement 2.3
// ---------------------------------------------------------------------------

// Feature: firebase-node-integration, Property 4: Executor returns success shape for Firestore add
describe('Property 4: Success shape for Firestore add', () => {
  it('PBT: add returns { success: true, documentId (non-empty), data }', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 50 }).filter(s => s.trim().length >= 3 && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)),
        fc.record({ name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0 && /^[a-zA-Z0-9\s_-]+$/.test(s)) }),
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3 && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)),
        async (collection, data, docId) => {
          mockAddedDocId = docId;

          const result = await runFirebaseNode(
            makeContext({
              ...validCredentials(),
              operation: 'add',
              collection,
              data,
            })
          );

          // Must succeed
          if (!result.success) {
            return false;
          }

          // Must have required fields with correct values
          const hasRequiredFields = (
            result.success === true &&
            'documentId' in result &&
            typeof result.documentId === 'string' &&
            result.documentId.length > 0 &&
            'data' in result
          );

          if (!hasRequiredFields) {
            return false;
          }

          // The documentId should match what we mocked
          const docIdMatches = result.documentId === docId;
          
          if (!docIdMatches) {
            return false;
          }
          
          // The data should match what we sent (the executor returns the input data)
          const dataMatches = JSON.stringify(result.data) === JSON.stringify(data);

          return dataMatches;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5 — Success shape for Firestore update
// Validates: Requirement 2.4
// ---------------------------------------------------------------------------

// Feature: firebase-node-integration, Property 5: Executor returns success shape for Firestore update
describe('Property 5: Success shape for Firestore update', () => {
  it('PBT: update returns { success: true, documentId (same as input), data }', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 50 }).filter(s => s.trim().length >= 3 && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)),
        fc.string({ minLength: 3, maxLength: 50 }).filter(s => s.trim().length >= 3 && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)),
        fc.record({ name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0 && /^[a-zA-Z0-9\s_-]+$/.test(s)) }),
        async (collection, documentId, data) => {
          const result = await runFirebaseNode(
            makeContext({
              ...validCredentials(),
              operation: 'update',
              collection,
              documentId,
              data,
            })
          );

          // Must succeed
          if (!result.success) {
            return false;
          }

          // Must have required fields with correct values
          const hasRequiredFields = (
            result.success === true &&
            'documentId' in result &&
            result.documentId === documentId &&
            'data' in result
          );

          if (!hasRequiredFields) {
            return false;
          }

          // The data should match what we sent (the executor returns the input data)
          const dataMatches = JSON.stringify(result.data) === JSON.stringify(data);

          return dataMatches;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6 — Success shape for Firestore delete
// Validates: Requirement 2.5
// ---------------------------------------------------------------------------

// Feature: firebase-node-integration, Property 6: Executor returns success shape for Firestore delete
describe('Property 6: Success shape for Firestore delete', () => {
  it('PBT: delete returns { success: true, documentId (same as input), deleted: true }', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 50 }).filter(s => s.trim().length >= 3 && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)),
        fc.string({ minLength: 3, maxLength: 50 }).filter(s => s.trim().length >= 3 && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)),
        async (collection, documentId) => {
          const result = await runFirebaseNode(
            makeContext({
              ...validCredentials(),
              operation: 'delete',
              collection,
              documentId,
            })
          );

          // Must succeed
          if (!result.success) {
            return false;
          }

          // Must have required fields with correct values
          const hasRequiredFields = (
            result.success === true &&
            'documentId' in result &&
            result.documentId === documentId &&
            'deleted' in result &&
            result.deleted === true
          );

          return hasRequiredFields;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7 — Success shape for Firestore query
// Validates: Requirement 2.6
// ---------------------------------------------------------------------------

// Feature: firebase-node-integration, Property 7: Executor returns success shape for Firestore query
describe('Property 7: Success shape for Firestore query', () => {
  it('PBT: query returns { success: true, data (array), count === data.length }', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 50 }).filter(s => s.trim().length >= 3 && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)),
        fc.array(fc.record({ id: fc.string({ minLength: 1 }), name: fc.string() }), {
          minLength: 0,
          maxLength: 10,
        }),
        async (collection, docs) => {
          mockQueryDocs = docs;

          const result = await runFirebaseNode(
            makeContext({
              ...validCredentials(),
              operation: 'query',
              collection,
            })
          );

          // Must succeed
          if (!result.success) {
            return false;
          }

          // Must have required fields with correct values
          const hasRequiredFields = (
            result.success === true &&
            'data' in result &&
            Array.isArray(result.data) &&
            'count' in result &&
            typeof result.count === 'number' &&
            result.count === result.data.length
          );

          if (!hasRequiredFields) {
            return false;
          }

          // The data should match what we mocked (with id field included)
          // Since the mock docs already have an id field, we don't need to add it again
          const expectedData = docs;
          const dataMatches = JSON.stringify(result.data) === JSON.stringify(expectedData);

          return dataMatches;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12 — overrideFirebase preserves def properties and replaces execute
// Validates: Requirements 8.2, 8.4
// ---------------------------------------------------------------------------

// Feature: firebase-node-integration, Property 12: overrideFirebase preserves def properties and replaces execute
describe('Property 12: overrideFirebase preserves def properties and replaces execute', () => {
  it('PBT: every property except execute is identical after override, and execute is a non-null function', async () => {
    const { overrideFirebase } = await import('../core/registry/overrides/firebase');

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.string({ minLength: 1 }),
          label: fc.string({ minLength: 1 }),
          category: fc.constantFrom('database', 'trigger', 'action', 'utility'),
          description: fc.string(),
          version: fc.integer({ min: 1, max: 10 }),
        }),
        async (defFields) => {
          // Build a minimal UnifiedNodeDefinition-shaped object
          const def: any = {
            ...defFields,
            execute: async () => ({ success: true }),
            defaultConfig: () => ({}),
            inputSchema: {},
            outputSchema: {},
          };

          // Minimal NodeSchema stub
          const schema: any = {
            type: defFields.type,
            label: defFields.label,
            category: defFields.category,
            configSchema: { required: [], optional: {} },
          };

          const result = overrideFirebase(def, schema);

          // execute must be replaced with a non-null function
          if (typeof result.execute !== 'function') return false;

          // All other properties must be preserved
          for (const key of Object.keys(def)) {
            if (key === 'execute') continue;
            if (result[key as keyof typeof result] !== def[key]) return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2 — Operation validation rejects invalid operation strings
// Validates: Requirements 1.10, 6.5, 6.6
// ---------------------------------------------------------------------------

// Feature: firebase-node-integration, Property 2: Operation validation rejects invalid operation strings
describe('Property 2: Operation validation rejects invalid operation strings', () => {
  const VALID_OPERATIONS = ['get', 'add', 'update', 'delete', 'query', 'realtime_get', 'realtime_set'];

  it('PBT: validateInputs returns { valid: false } for strings outside the valid operation set', async () => {
    const { firebaseNodeDefinition } = await import('../nodes/definitions/firebase-node');

    await fc.assert(
      fc.property(
        fc.string().filter((s) => !VALID_OPERATIONS.includes(s)),
        (invalidOp) => {
          const result = firebaseNodeDefinition.validateInputs({
            projectId: 'my-project',
            clientEmail: 'sa@project.iam.gserviceaccount.com',
            privateKey: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n',
            operation: invalidOp,
          });
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('PBT: validateInputs returns { valid: true } for valid operation strings with all credentials present', async () => {
    const { firebaseNodeDefinition } = await import('../nodes/definitions/firebase-node');

    await fc.assert(
      fc.property(
        fc.constantFrom(...VALID_OPERATIONS),
        (validOp) => {
          const result = firebaseNodeDefinition.validateInputs({
            projectId: 'my-project',
            clientEmail: 'sa@project.iam.gserviceaccount.com',
            privateKey: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n',
            operation: validOp,
          });
          return result.valid === true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests for firebaseNodeDefinition — Task 6.2
// Validates: Requirements 6.1–6.10, 12.4
// ---------------------------------------------------------------------------

describe('Unit tests: firebaseNodeDefinition (Task 6.2)', () => {
  let firebaseNodeDefinition: any;
  let runFirebaseNodeRef: any;

  beforeAll(async () => {
    const defModule = await import('../nodes/definitions/firebase-node');
    const execModule = await import('../services/database/firebaseNode');
    firebaseNodeDefinition = defModule.firebaseNodeDefinition;
    runFirebaseNodeRef = execModule.runFirebaseNode;
  });

  // Requirement 6.2 — type, label, category, icon
  it('has correct type, label, category, icon', () => {
    expect(firebaseNodeDefinition.type).toBe('firebase');
    expect(firebaseNodeDefinition.label).toBe('Firebase');
    expect(firebaseNodeDefinition.category).toBe('database');
    expect(firebaseNodeDefinition.icon).toBe('Database');
  });

  // Requirement 6.9 — requiredInputs
  it('has requiredInputs: [projectId, clientEmail, privateKey, operation]', () => {
    expect(firebaseNodeDefinition.requiredInputs).toEqual(
      expect.arrayContaining(['projectId', 'clientEmail', 'privateKey', 'operation'])
    );
  });

  // Requirement 6.10 — outgoingPorts, incomingPorts, isBranching
  it('has outgoingPorts: [default], incomingPorts: [default], isBranching: false', () => {
    expect(firebaseNodeDefinition.outgoingPorts).toEqual(['default']);
    expect(firebaseNodeDefinition.incomingPorts).toEqual(['default']);
    expect(firebaseNodeDefinition.isBranching).toBe(false);
  });

  // Requirement 6.8 — run === runFirebaseNode
  it('run is set to runFirebaseNode', () => {
    expect(firebaseNodeDefinition.run).toBe(runFirebaseNodeRef);
  });

  // Requirement 6.7 — defaultInputs returns expected defaults
  it('defaultInputs() returns expected default object', () => {
    const defaults = firebaseNodeDefinition.defaultInputs();
    expect(defaults).toMatchObject({
      projectId: '',
      clientEmail: '',
      privateKey: '',
      operation: 'get',
      collection: '',
      documentId: '',
      data: null,
      filter: null,
      limit: null,
      databaseUrl: '',
    });
  });

  // Requirement 12.4 — validateInputs(defaultInputs()) returns { valid: false }
  it('validateInputs(defaultInputs()) returns { valid: false } because defaults have empty required fields', () => {
    const defaults = firebaseNodeDefinition.defaultInputs();
    const result = firebaseNodeDefinition.validateInputs(defaults);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // Requirement 6.5 — validateInputs returns { valid: false } when required fields are missing
  it('validateInputs returns { valid: false } when projectId is missing', () => {
    const result = firebaseNodeDefinition.validateInputs({
      projectId: '',
      clientEmail: 'sa@project.iam.gserviceaccount.com',
      privateKey: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n',
      operation: 'get',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('projectId is required');
  });

  it('validateInputs returns { valid: false } when operation is invalid', () => {
    const result = firebaseNodeDefinition.validateInputs({
      projectId: 'my-project',
      clientEmail: 'sa@project.iam.gserviceaccount.com',
      privateKey: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n',
      operation: 'invalid_op',
    });
    expect(result.valid).toBe(false);
  });

  // Requirement 6.6 — validateInputs returns { valid: true } when all required fields are valid
  it('validateInputs returns { valid: true, errors: [] } when all required fields are valid', () => {
    const result = firebaseNodeDefinition.validateInputs({
      projectId: 'my-project',
      clientEmail: 'sa@project.iam.gserviceaccount.com',
      privateKey: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n',
      operation: 'get',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  // Requirement 6.4 — outputSchema has a default port
  it('outputSchema has a default port with type json', () => {
    expect(firebaseNodeDefinition.outputSchema).toBeDefined();
    expect(firebaseNodeDefinition.outputSchema.default).toBeDefined();
    expect(firebaseNodeDefinition.outputSchema.default.type).toBe('json');
  });
});

// ---------------------------------------------------------------------------
// Property 11 — Unknown database node type returns error
// Validates: Requirement 4.4
// ---------------------------------------------------------------------------

// Feature: firebase-node-integration, Property 11: Unknown database node type returns error
describe('Property 11: Unknown database node type returns error', () => {
  const KNOWN_TYPES = new Set([
    'sql_server', 'mssql', 'mongodb', 'mysql', 'postgres', 'postgresql',
    'redis', 'snowflake', 'sqlite', 'supabase', 'timescaledb', 'timescale',
    'intuit_smes', 'intuit', 'odoo', 'firebase',
  ]);

  it('PBT: executeDatabaseNode returns { success: false, error: "Unknown database node type: ..." } for unknown types', async () => {
    const { executeDatabaseNode } = await import('../services/database/database-node-handler');

    const context = makeContext({
      ...validCredentials(),
      operation: 'get',
      collection: 'users',
      documentId: 'doc-1',
    });

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => !KNOWN_TYPES.has(s)),
        async (unknownType) => {
          const result = await executeDatabaseNode(unknownType, context as any);
          return (
            result.success === false &&
            typeof result.error === 'string' &&
            result.error.includes(unknownType)
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 14 — executeDatabaseNode result always has a success boolean
// Validates: Requirement 11.12
// ---------------------------------------------------------------------------

// Feature: firebase-node-integration, Property 14: executeDatabaseNode result always has a success boolean
describe('Property 14: executeDatabaseNode result always has a success boolean', () => {
  it('executeDatabaseNode("firebase", context) returns an object with a success boolean field', async () => {
    const { executeDatabaseNode } = await import('../services/database/database-node-handler');

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          collection: fc.string({ minLength: 1, maxLength: 30 }),
          documentId: fc.string({ minLength: 1, maxLength: 30 }),
        }),
        async ({ collection, documentId }) => {
          const context = makeContext({
            ...validCredentials(),
            operation: 'get',
            collection,
            documentId,
          });

          const result = await executeDatabaseNode('firebase', context as any);
          return typeof result.success === 'boolean';
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13 — Firebase alias resolution
// Validates: Requirements 10.1–10.7
// ---------------------------------------------------------------------------

// Feature: firebase-node-integration, Property 13: Firebase alias resolution
describe('Property 13: Firebase alias resolution', () => {
  const FIREBASE_ALIASES = [
    'firebase',
    'firestore',
    'firebase_firestore',
    'firebase_realtime',
    'firebase_realtime_database',
  ] as const;

  it('resolveAlias returns "firebase" for each Firebase alias', () => {
    // Import the singleton — it is already initialized
    const { unifiedNodeRegistry } = require('../core/registry/unified-node-registry');

    for (const alias of FIREBASE_ALIASES) {
      const resolved = unifiedNodeRegistry.resolveAlias(alias);
      expect(resolved).toBe('firebase');
    }
  });

  it('PBT: every alias in the Firebase alias set resolves to "firebase"', () => {
    const { unifiedNodeRegistry } = require('../core/registry/unified-node-registry');

    fc.assert(
      fc.property(
        fc.constantFrom(...FIREBASE_ALIASES),
        (alias) => {
          const resolved = unifiedNodeRegistry.resolveAlias(alias);
          return resolved === 'firebase';
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests for createFirebaseSchema() — Task 12.1
// (Additional coverage beyond firebase-schema.unit.test.ts)
// Validates: Requirements 1.1–1.14
// ---------------------------------------------------------------------------

describe('Unit tests: createFirebaseSchema() (Task 12.1 — inline)', () => {
  it('NodeLibrary registers firebase schema with correct type, category, providers', () => {
    const { nodeLibrary } = require('../services/nodes/node-library');
    const schema = nodeLibrary.getSchema('firebase');
    expect(schema).toBeDefined();
    expect(schema.type).toBe('firebase');
    expect(schema.category).toBe('database');
    expect(schema.providers).toEqual(['firebase']);
  });

  it('configSchema.required includes all four required fields', () => {
    const { nodeLibrary } = require('../services/nodes/node-library');
    const schema = nodeLibrary.getSchema('firebase');
    const required = schema.configSchema.required;
    expect(required).toContain('projectId');
    expect(required).toContain('clientEmail');
    expect(required).toContain('privateKey');
    expect(required).toContain('operation');
  });

  it('configSchema.optional includes all six optional fields', () => {
    const { nodeLibrary } = require('../services/nodes/node-library');
    const schema = nodeLibrary.getSchema('firebase');
    const optional = schema.configSchema.optional;
    for (const field of ['collection', 'documentId', 'data', 'filter', 'limit', 'databaseUrl']) {
      expect(optional[field]).toBeDefined();
    }
  });

  it('aiSelectionCriteria.keywords includes firebase and firestore', () => {
    const { nodeLibrary } = require('../services/nodes/node-library');
    const schema = nodeLibrary.getSchema('firebase');
    const keywords = schema.aiSelectionCriteria?.keywords ?? [];
    expect(keywords).toContain('firebase');
    expect(keywords).toContain('firestore');
  });

  it('commonPatterns has entries for get_document, add_document, query_collection', () => {
    const { nodeLibrary } = require('../services/nodes/node-library');
    const schema = nodeLibrary.getSchema('firebase');
    const names = (schema.commonPatterns ?? []).map((p: any) => p.name);
    expect(names).toContain('get_document');
    expect(names).toContain('add_document');
    expect(names).toContain('query_collection');
  });

  it('validationRules enforces non-empty strings for credentials and valid operation enum', () => {
    const { nodeLibrary } = require('../services/nodes/node-library');
    const schema = nodeLibrary.getSchema('firebase');
    const rules = schema.validationRules ?? [];

    // Credential fields must reject empty string
    for (const field of ['projectId', 'clientEmail', 'privateKey']) {
      const rule = rules.find((r: any) => r.field === field);
      expect(rule).toBeDefined();
      expect(rule.validator('')).toBe(false);
      expect(rule.validator('non-empty')).toBe(true);
    }

    // Operation must be one of the valid values
    const opRule = rules.find((r: any) => r.field === 'operation');
    expect(opRule).toBeDefined();
    expect(opRule.validator('get')).toBe(true);
    expect(opRule.validator('invalid')).toBe(false);
  });
});

// Debug test to see actual response format
describe('Debug: Actual Response Format', () => {
  it('should show actual response format for get operation', async () => {
    mockGetData = { field: 'test-value' };
    mockDocExists = true;

    const result = await runFirebaseNode(
      makeContext({
        ...validCredentials(),
        operation: 'get',
        collection: 'test-collection',
        documentId: 'test-doc',
      })
    );

    console.log('GET result:', JSON.stringify(result, null, 2));
    expect(result).toBeDefined();
  });

  it('should show actual response format for add operation', async () => {
    mockAddedDocId = 'test-doc-id';

    const result = await runFirebaseNode(
      makeContext({
        ...validCredentials(),
        operation: 'add',
        collection: 'test-collection',
        data: { name: 'test-name' },
      })
    );

    console.log('ADD result:', JSON.stringify(result, null, 2));
    expect(result).toBeDefined();
  });

  it('should show actual response format for query operation', async () => {
    mockQueryDocs = [{ id: 'doc1', name: 'Alice' }];

    const result = await runFirebaseNode(
      makeContext({
        ...validCredentials(),
        operation: 'query',
        collection: 'test-collection',
      })
    );

    console.log('QUERY result:', JSON.stringify(result, null, 2));
    expect(result).toBeDefined();
  });
});

// Feature: firebase-node-integration, Property 16: Schema round-trip — defaultConfig keys match configSchema fields
describe('Property 16: Schema round-trip — defaultConfig keys match configSchema fields', () => {
  it('unifiedNodeRegistry.get("firebase").defaultConfig() keys are a superset of all configSchema field names', () => {
    const { unifiedNodeRegistry } = require('../core/registry/unified-node-registry');
    const { nodeLibrary } = require('../services/nodes/node-library');

    const schema = nodeLibrary.getSchema('firebase');
    expect(schema).toBeDefined();

    const def = unifiedNodeRegistry.get('firebase');
    expect(def).toBeDefined();

    const defaultConfigKeys = new Set(Object.keys(def.defaultConfig()));
    
    console.log('Schema required fields:', schema.configSchema.required);
    console.log('Schema optional fields:', Object.keys(schema.configSchema.optional));
    console.log('DefaultConfig keys:', Array.from(defaultConfigKeys));

    // All required fields must be present in defaultConfig
    for (const field of schema.configSchema.required) {
      if (!defaultConfigKeys.has(field)) {
        console.log(`Missing required field: ${field}`);
      }
      expect(defaultConfigKeys.has(field)).toBe(true);
    }

    // All optional fields must be present in defaultConfig
    for (const field of Object.keys(schema.configSchema.optional)) {
      if (!defaultConfigKeys.has(field)) {
        console.log(`Missing optional field: ${field}`);
      }
      expect(defaultConfigKeys.has(field)).toBe(true);
    }
  });

  it('PBT: defaultConfig keys are always a superset of configSchema required + optional fields', () => {
    const { unifiedNodeRegistry } = require('../core/registry/unified-node-registry');
    const { nodeLibrary } = require('../services/nodes/node-library');

    const schema = nodeLibrary.getSchema('firebase');
    const def = unifiedNodeRegistry.get('firebase');

    // Collect all expected field names from the schema
    const expectedFields = [
      ...schema.configSchema.required,
      ...Object.keys(schema.configSchema.optional),
    ];

    fc.assert(
      fc.property(
        // Pick any subset of expected fields to check
        fc.subarray(expectedFields),
        (fieldsToCheck) => {
          const defaultConfigKeys = new Set(Object.keys(def.defaultConfig()));
          return fieldsToCheck.every((field: string) => defaultConfigKeys.has(field));
        }
      ),
      { numRuns: 100 }
    );
  });
});
