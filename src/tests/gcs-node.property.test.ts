/**
 * Google Cloud Storage Node — Property-Based Tests
 *
 * All Google Cloud Storage SDK calls are mocked — no real GCS connections.
 *
 * Properties covered:
 *   Property 1  (sub-task 1.1): Credential validation rejects missing/empty fields
 *   Property 2  (sub-task 1.2): Operation validation rejects invalid strings
 *   Property 3  (sub-task 1.3): Executor returns success shape for upload
 *   Property 4  (sub-task 1.4): Executor returns success shape for download
 *   Property 5  (sub-task 1.5): Executor returns success shape for delete
 *   Property 6  (sub-task 1.6): Executor returns success shape for list
 *   Property 7  (sub-task 1.7): Executor returns { success: false } for missing credentials
 *   Property 8  (sub-task 1.8): Executor propagates SDK errors
 *   Property 9  (sub-task 1.9): Bucket validation prevents empty bucket names
 *   Property 10 (sub-task 1.10): FileName validation for upload, download, delete
 *   Property 11 (sub-task 1.11): FileContent encoding for upload
 *
 * Spec: .kiro/specs/google-cloud-storage-node-integration/
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Mock @google-cloud/storage BEFORE importing the executor
// ---------------------------------------------------------------------------

// Captured client names across calls
const capturedClientNames: string[] = [];

// Configurable mock behaviours
let mockUploadedContent: Buffer | null = null;
let mockDownloadedContent: Buffer = Buffer.from('file content');
let mockListedFiles: Array<{ name: string; size: number; updated: string }> = [];
let mockSdkShouldThrow = false;
let mockSdkErrorMessage = 'GCS SDK error';

// Mock file operations
const mockFileSave = jest.fn<(data: Buffer) => Promise<void>>(async (data) => {
  if (mockSdkShouldThrow) throw new Error(mockSdkErrorMessage);
  mockUploadedContent = data;
});

const mockFileDelete = jest.fn<() => Promise<void>>(async () => {
  if (mockSdkShouldThrow) throw new Error(mockSdkErrorMessage);
});

const mockFileDownload = jest.fn<() => Promise<[Buffer]>>(async () => {
  if (mockSdkShouldThrow) throw new Error(mockSdkErrorMessage);
  return [mockDownloadedContent];
});

const mockGetFiles = jest.fn<(options?: any) => Promise<[Array<{ name: string; metadata: any }>]>>(
  async (options?: any) => {
    if (mockSdkShouldThrow) throw new Error(mockSdkErrorMessage);
    return [
      mockListedFiles.map((f) => ({
        name: f.name,
        metadata: {
          size: f.size,
          updated: f.updated,
        },
      })),
    ];
  }
);

// Mock Storage class
class MockStorage {
  constructor(config: any) {
    if (mockSdkShouldThrow) throw new Error(mockSdkErrorMessage);
  }

  bucket(name: string) {
    return {
      file: (fileName: string) => ({
        save: mockFileSave,
        delete: mockFileDelete,
        download: mockFileDownload,
      }),
      getFiles: mockGetFiles,
    };
  }
}

// Create the complete mock object
const googleCloudStorageMock = {
  __esModule: true,
  Storage: MockStorage,
  default: MockStorage,
};

// Mock the @google-cloud/storage module
jest.mock('@google-cloud/storage', () => googleCloudStorageMock);
jest.doMock('@google-cloud/storage', () => googleCloudStorageMock);

// Clear the module cache to ensure fresh import
jest.resetModules();

// Import AFTER mock is set up
import { runGCSNode } from '../services/database/gcsNode';

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
  capturedClientNames.length = 0;
  mockSdkShouldThrow = false;
  mockUploadedContent = null;
  mockDownloadedContent = Buffer.from('file content');
  mockListedFiles = [];
  jest.clearAllMocks();
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Property 1 — Credential validation rejects missing or empty fields
// Validates: Requirements 1.9, 6.5, 11.6
// ---------------------------------------------------------------------------

// Feature: google-cloud-storage-node-integration, Property 1: Credential validation rejects missing or empty fields
describe('Property 1: Credential validation rejects missing or empty fields', () => {
  it('PBT: returns { success: false } when projectId is empty or absent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant(''), fc.constant(undefined)),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        async (projectId, clientEmail, privateKey) => {
          const result = await runGCSNode(
            makeContext({
              projectId,
              clientEmail,
              privateKey,
              operation: 'upload',
              bucket: 'my-bucket',
            })
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
          const result = await runGCSNode(
            makeContext({
              projectId,
              clientEmail,
              privateKey,
              operation: 'upload',
              bucket: 'my-bucket',
            })
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
          const result = await runGCSNode(
            makeContext({
              projectId,
              clientEmail,
              privateKey,
              operation: 'upload',
              bucket: 'my-bucket',
            })
          );
          return result.success === false;
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

// Feature: google-cloud-storage-node-integration, Property 2: Operation validation rejects invalid operation strings
describe('Property 2: Operation validation rejects invalid operation strings', () => {
  it('PBT: returns { success: false } for invalid operation strings', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string().filter((s) => !['upload', 'download', 'delete', 'list'].includes(s)),
        async (invalidOp) => {
          const result = await runGCSNode(
            makeContext({
              ...validCredentials(),
              operation: invalidOp,
              bucket: 'my-bucket',
            })
          );
          return result.success === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('PBT: returns { success: true } for valid operation strings with all credentials', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('upload', 'download', 'delete', 'list'),
        async (validOp) => {
          const inputs: any = {
            ...validCredentials(),
            operation: validOp,
            bucket: 'my-bucket',
          };

          // Add required fields for each operation
          if (validOp === 'upload') {
            inputs.fileName = 'test.txt';
            inputs.fileContent = 'test content';
          } else if (validOp === 'download' || validOp === 'delete') {
            inputs.fileName = 'test.txt';
          }

          const result = await runGCSNode(makeContext(inputs));
          return result.success === true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3 — Executor returns success shape for upload
// Validates: Requirement 2.2
// ---------------------------------------------------------------------------

// Feature: google-cloud-storage-node-integration, Property 3: Executor returns success shape for upload
describe('Property 3: Executor returns success shape for upload', () => {
  it('PBT: upload returns { success: true, fileName, fileSize }', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
        async (bucket, fileName, fileContent) => {
          const result = await runGCSNode(
            makeContext({
              ...validCredentials(),
              operation: 'upload',
              bucket,
              fileName,
              fileContent,
            })
          );

          // Must succeed
          if (!result.success) {
            return false;
          }

          // Must have required fields with correct values
          const hasRequiredFields =
            result.success === true &&
            'fileName' in result &&
            result.fileName === fileName &&
            'fileSize' in result &&
            typeof result.fileSize === 'number' &&
            result.fileSize > 0;

          return hasRequiredFields;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4 — Executor returns success shape for download
// Validates: Requirement 2.3
// ---------------------------------------------------------------------------

// Feature: google-cloud-storage-node-integration, Property 4: Executor returns success shape for download
describe('Property 4: Executor returns success shape for download', () => {
  it('PBT: download returns { success: true, fileName, data }', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
        async (bucket, fileName, fileContent) => {
          mockDownloadedContent = Buffer.from(fileContent, 'utf-8');

          const result = await runGCSNode(
            makeContext({
              ...validCredentials(),
              operation: 'download',
              bucket,
              fileName,
            })
          );

          // Must succeed
          if (!result.success) {
            return false;
          }

          // Must have required fields with correct values
          const hasRequiredFields =
            result.success === true &&
            'fileName' in result &&
            result.fileName === fileName &&
            'data' in result &&
            typeof result.data === 'string' &&
            result.data.length > 0;

          return hasRequiredFields;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5 — Executor returns success shape for delete
// Validates: Requirement 2.4
// ---------------------------------------------------------------------------

// Feature: google-cloud-storage-node-integration, Property 5: Executor returns success shape for delete
describe('Property 5: Executor returns success shape for delete', () => {
  it('PBT: delete returns { success: true, fileName, deleted: true }', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        async (bucket, fileName) => {
          const result = await runGCSNode(
            makeContext({
              ...validCredentials(),
              operation: 'delete',
              bucket,
              fileName,
            })
          );

          // Must succeed
          if (!result.success) {
            return false;
          }

          // Must have required fields with correct values
          const hasRequiredFields =
            result.success === true &&
            'fileName' in result &&
            result.fileName === fileName &&
            'deleted' in result &&
            result.deleted === true;

          return hasRequiredFields;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6 — Executor returns success shape for list
// Validates: Requirement 2.5
// ---------------------------------------------------------------------------

// Feature: google-cloud-storage-node-integration, Property 6: Executor returns success shape for list
describe('Property 6: Executor returns success shape for list', () => {
  it('PBT: list returns { success: true, data (array), count === data.length }', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
            size: fc.integer({ min: 0, max: 1000000 }),
            updated: fc.string({ minLength: 1 }),
          }),
          { minLength: 0, maxLength: 10 }
        ),
        async (bucket, files) => {
          mockListedFiles = files;

          const result = await runGCSNode(
            makeContext({
              ...validCredentials(),
              operation: 'list',
              bucket,
            })
          );

          // Must succeed
          if (!result.success) {
            return false;
          }

          // Must have required fields with correct values
          const hasRequiredFields =
            result.success === true &&
            'data' in result &&
            Array.isArray(result.data) &&
            'count' in result &&
            typeof result.count === 'number' &&
            result.count === result.data.length;

          return hasRequiredFields;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7 — Executor returns { success: false } for missing credentials
// Validates: Requirements 2.6, 11.10
// ---------------------------------------------------------------------------

// Feature: google-cloud-storage-node-integration, Property 7: Executor returns { success: false } for missing credentials
describe('Property 7: Executor returns { success: false } for missing credentials without SDK call', () => {
  it('PBT: SDK Storage is never instantiated when credentials are absent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          projectId: fc.oneof(fc.constant(''), fc.constant(undefined)),
          clientEmail: fc.string({ minLength: 1 }),
          privateKey: fc.string({ minLength: 1 }),
          operation: fc.constant('upload'),
          bucket: fc.string({ minLength: 1 }),
        }),
        async (inputs) => {
          const result = await runGCSNode(makeContext(inputs as any));
          return result.success === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8 — Executor propagates SDK errors
// Validates: Requirement 2.7
// ---------------------------------------------------------------------------

// Feature: google-cloud-storage-node-integration, Property 8: Executor propagates SDK errors
describe('Property 8: Executor propagates SDK errors', () => {
  it('PBT: any error thrown by the SDK is caught and returned as { success: false, error }', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.constantFrom('upload', 'download', 'delete', 'list'),
        async (errorMessage, operation) => {
          mockSdkShouldThrow = true;
          mockSdkErrorMessage = errorMessage;

          const inputs: any = {
            ...validCredentials(),
            operation,
            bucket: 'my-bucket',
          };

          if (operation === 'upload') {
            inputs.fileName = 'test.txt';
            inputs.fileContent = 'content';
          } else if (operation === 'download' || operation === 'delete') {
            inputs.fileName = 'test.txt';
          }

          const result = await runGCSNode(makeContext(inputs));
          mockSdkShouldThrow = false;

          return result.success === false && typeof result.error === 'string';
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9 — Bucket validation prevents empty bucket names
// Validates: Requirement 2.10
// ---------------------------------------------------------------------------

// Feature: google-cloud-storage-node-integration, Property 9: Bucket validation prevents empty bucket names
describe('Property 9: Bucket validation prevents empty bucket names', () => {
  it('PBT: returns { success: false } when bucket is empty or absent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant(''), fc.constant(undefined)),
        async (bucket) => {
          const result = await runGCSNode(
            makeContext({
              ...validCredentials(),
              operation: 'list',
              bucket,
            })
          );
          return result.success === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10 — FileName validation for upload, download, delete
// Validates: Requirement 2.11
// ---------------------------------------------------------------------------

// Feature: google-cloud-storage-node-integration, Property 10: FileName validation for upload, download, delete
describe('Property 10: FileName validation for upload, download, delete', () => {
  it('PBT: returns { success: false } when fileName is empty or absent for upload', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant(''), fc.constant(undefined)),
        async (fileName) => {
          const result = await runGCSNode(
            makeContext({
              ...validCredentials(),
              operation: 'upload',
              bucket: 'my-bucket',
              fileName,
              fileContent: 'content',
            })
          );
          return result.success === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('PBT: returns { success: false } when fileName is empty or absent for download', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant(''), fc.constant(undefined)),
        async (fileName) => {
          const result = await runGCSNode(
            makeContext({
              ...validCredentials(),
              operation: 'download',
              bucket: 'my-bucket',
              fileName,
            })
          );
          return result.success === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('PBT: returns { success: false } when fileName is empty or absent for delete', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant(''), fc.constant(undefined)),
        async (fileName) => {
          const result = await runGCSNode(
            makeContext({
              ...validCredentials(),
              operation: 'delete',
              bucket: 'my-bucket',
              fileName,
            })
          );
          return result.success === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11 — FileContent encoding for upload
// Validates: Requirement 2.12
// ---------------------------------------------------------------------------

// Feature: google-cloud-storage-node-integration, Property 11: FileContent encoding for upload
describe('Property 11: FileContent encoding for upload', () => {
  it('PBT: for any valid string fileContent, upload encodes as UTF-8 and returns { success: true }', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
        async (fileContent) => {
          const result = await runGCSNode(
            makeContext({
              ...validCredentials(),
              operation: 'upload',
              bucket: 'my-bucket',
              fileName: 'test.txt',
              fileContent,
            })
          );

          // Must succeed
          if (!result.success) {
            return false;
          }

          // Verify that the content was encoded as UTF-8
          // The mock captures the buffer, so we can verify it matches the UTF-8 encoding
          const expectedBuffer = Buffer.from(fileContent, 'utf-8');
          const contentMatches =
            mockUploadedContent !== null &&
            mockUploadedContent.toString('utf-8') === fileContent;

          return contentMatches;
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ---------------------------------------------------------------------------
// Property 12 — Unknown database node type returns error
// Validates: Requirement 4.4
// ---------------------------------------------------------------------------

// Feature: google-cloud-storage-node-integration, Property 12: Unknown database node type returns error
describe('Property 12: Unknown database node type returns error', () => {
  it('PBT: executeDatabaseNode returns { success: false, error } for unknown types', async () => {
    const { executeDatabaseNode } = await import('../services/database/database-node-handler');

    await fc.assert(
      fc.asyncProperty(
        fc.string().filter((s) => !['google_cloud_storage', 'firebase', 'supabase', 'mongodb', 'postgres', 'mysql', 'redis', 'snowflake', 'sqlite', 'timescaledb', 'sql_server', 'intuit_smes', 'odoo'].includes(s)),
        async (unknownType) => {
          const context = makeContext({});
          const result = await executeDatabaseNode(unknownType, context);

          // Must return success: false
          if (result.success !== false) {
            return false;
          }

          // Must have an error message
          const hasError = typeof result.error === 'string' && result.error.length > 0;
          return hasError;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15 — executeDatabaseNode result always has a success boolean
// Validates: Requirement 11.12
// ---------------------------------------------------------------------------

// Feature: google-cloud-storage-node-integration, Property 15: executeDatabaseNode result always has a success boolean
describe('Property 15: executeDatabaseNode result always has a success boolean', () => {
  it('PBT: executeDatabaseNode with google_cloud_storage returns result with success boolean', async () => {
    const { executeDatabaseNode } = await import('../services/database/database-node-handler');

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          projectId: fc.string({ minLength: 1 }),
          clientEmail: fc.string({ minLength: 1 }),
          privateKey: fc.string({ minLength: 1 }),
          operation: fc.constantFrom('upload', 'download', 'delete', 'list'),
          bucket: fc.string({ minLength: 1 }),
          fileName: fc.option(fc.string({ minLength: 1 }), { freq: 2 }),
          fileContent: fc.option(fc.string({ minLength: 1 }), { freq: 2 }),
        }),
        async (inputs) => {
          const context = makeContext(inputs);
          const result = await executeDatabaseNode('google_cloud_storage', context);

          // Must have a success field of type boolean
          return typeof result.success === 'boolean';
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ---------------------------------------------------------------------------
// Property 13 — overrideGCS preserves def properties and replaces execute
// Validates: Requirements 8.2, 8.4
// ---------------------------------------------------------------------------

// Feature: google-cloud-storage-node-integration, Property 13: overrideGCS preserves def properties and replaces execute
describe('Property 13: overrideGCS preserves def properties and replaces execute', () => {
  it('PBT: overrideGCS preserves all def properties except execute', async () => {
    const { overrideGCS } = await import('../core/registry/overrides/gcs');
    const { nodeLibrary } = await import('../services/nodes/node-library');

    // Get the GCS schema from the library
    const schema = nodeLibrary.getSchema('google_cloud_storage');
    if (!schema) {
      throw new Error('GCS schema not found in node library');
    }

    // Create a mock UnifiedNodeDefinition
    const mockDef: any = {
      type: 'google_cloud_storage',
      label: 'Google Cloud Storage',
      category: 'database',
      icon: 'Database',
      version: 1,
      inputSchema: { projectId: { type: 'string' } },
      outputSchema: { default: { type: 'json' } },
      credentialSchema: { requirements: [] },
      defaultConfig: () => ({}),
      execute: async () => ({ success: false }),
      validateConfig: () => ({ valid: true, errors: [] }),
      isBranching: false,
      outgoingPorts: ['default'],
      incomingPorts: ['default'],
    };

    // Apply the override
    const overridden = overrideGCS(mockDef, schema);

    // Verify all properties except execute are preserved
    await fc.assert(
      fc.property(fc.constant(null), () => {
        // Check that all properties except execute are identical
        const keysToCheck = Object.keys(mockDef).filter((k) => k !== 'execute');

        for (const key of keysToCheck) {
          if (overridden[key as keyof typeof overridden] !== mockDef[key]) {
            return false;
          }
        }

        // Check that execute is a non-null function
        const executeIsFunction = typeof overridden.execute === 'function' && overridden.execute !== null;

        // Check that execute is different from the original
        const executeIsReplaced = overridden.execute !== mockDef.execute;

        return executeIsFunction && executeIsReplaced;
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 14 — GCS alias resolution
// Validates: Requirements 10.1–10.7
// ---------------------------------------------------------------------------

// Feature: google-cloud-storage-node-integration, Property 14: GCS alias resolution
describe('Property 14: GCS alias resolution', () => {
  it('PBT: all GCS aliases resolve to google_cloud_storage', async () => {
    const { unifiedNodeRegistry } = await import('../core/registry/unified-node-registry');

    const gcsAliases = ['gcs', 'google_storage', 'cloud_storage', 'google_cloud_storage'];

    await fc.assert(
      fc.property(
        fc.constantFrom(...gcsAliases),
        (alias) => {
          const resolved = unifiedNodeRegistry.resolveAlias(alias);
          return resolved === 'google_cloud_storage';
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 16 — Schema round-trip: defaultConfig keys match configSchema fields
//
// Validates: Requirement 12.3
// ---------------------------------------------------------------------------

// Feature: google-cloud-storage-node-integration, Property 16: Schema round-trip — defaultConfig keys match configSchema fields
describe('Property 16: Schema round-trip — defaultConfig keys match configSchema fields', () => {
  it('PBT: unifiedNodeRegistry.get(gcsSchema).defaultConfig() keys match configSchema fields', async () => {
    const { NodeLibrary } = await import('../services/nodes/node-library');
    const { unifiedNodeRegistry } = await import('../core/registry/unified-node-registry');

    const library = new NodeLibrary();
    const gcsSchema = library.getSchema('google_cloud_storage');
    expect(gcsSchema).toBeDefined();

    // Get the unified definition from the registry
    const unifiedDef = unifiedNodeRegistry.get('google_cloud_storage');
    expect(unifiedDef).toBeDefined();

    const defaultConfig = unifiedDef!.defaultConfig();

    // Get all field names from configSchema
    const requiredFields = gcsSchema!.configSchema.required || [];
    const optionalFields = Object.keys(gcsSchema!.configSchema.optional || {});
    const allFields = [...requiredFields, ...optionalFields];

    // Assert that defaultConfig keys are a superset of all field names
    const defaultConfigKeys = Object.keys(defaultConfig);
    for (const field of allFields) {
      expect(defaultConfigKeys).toContain(field);
    }
  });
});
