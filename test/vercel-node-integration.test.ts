/**
 * Vercel Node Integration - Property-Based Tests
 * 
 * These tests verify correctness properties of the Vercel node integration.
 * Each property is tested across many generated inputs using fast-check.
 * 
 * Properties tested:
 * - Property 15: Service Unavailable Handled (5xx errors)
 * - Additional properties for comprehensive coverage
 */

import fc from 'fast-check';
import { executeNodeLegacy } from '../src/api/execute-workflow';
import { LRUNodeOutputsCache } from '../src/core/cache/lru-node-outputs-cache';

/**
 * WorkflowNode interface (matches execute-workflow.ts)
 */
interface WorkflowNode {
  id: string;
  type: string;
  data?: {
    type?: string;
    label?: string;
    category?: string;
    config?: Record<string, any>;
  };
  position?: { x: number; y: number };
}

/**
 * Mock DB client for testing
 */
const createMockSupabase = () => ({
  from: jest.fn().mockImplementation((table: string) => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: null,
      error: null,
    }),
  })),
});

/**
 * Create a mock Vercel node for testing
 */
const createMockVercelNode = (config: any): WorkflowNode => ({
  id: 'vercel-node-1',
  type: 'vercel',
  data: {
    type: 'vercel',
    label: 'Vercel Deploy',
    category: 'devops',
    config: config,
  },
  position: { x: 0, y: 0 },
});

/**
 * Create a mock node outputs cache
 */
const createMockNodeOutputsCache = () => {
  const cache = new LRUNodeOutputsCache(100);
  return cache;
};

/**
 * Mock fetch for testing API responses
 */
const mockFetch = (statusCode: number, responseData: any = {}) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    json: jest.fn().mockResolvedValue(responseData),
  });
};

describe('Vercel Node Integration - Property-Based Tests', () => {
  
  /**
   * Property 15: Service Unavailable Handled
   * 
   * **Validates: Requirements 7.6, 12.1**
   * 
   * For any 5xx API response (service unavailable), the node SHALL:
   * - Return success=false
   * - Set retriable=true (since 5xx errors are transient)
   * - Include appropriate error code
   * - Not expose sensitive data like tokens
   * 
   * This property is tested with 100+ generated test cases covering:
   * - All 5xx status codes (500-599)
   * - Various error messages
   * - Different project names and tokens
   * - Consistent error handling across all variations
   */
  describe('Property 15: Service Unavailable Handled', () => {
    
    /**
     * Main property test: 100+ test cases with various 5xx status codes
     * 
     * This test generates 100+ combinations of:
     * - 5xx status codes (500-599)
     * - Error messages
     * - Project names
     * - Tokens
     * 
     * Each combination verifies that:
     * - success=false
     * - retriable=true
     * - error code is appropriate
     * - token is not exposed
     */
    test('5xx errors return success=false with retriable=true (100+ test cases)', async () => {
      // Generate 5xx status codes (500-599) with various error messages
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 500, max: 599 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 50 }).filter(
            (name) => /^[a-zA-Z0-9_-]{1,50}$/.test(name)
          ),
          fc.string({ minLength: 20, maxLength: 50 }),
          async (statusCode, errorMessage, projectName, token) => {
            // Mock API response with 5xx status
            mockFetch(statusCode, {
              error: { message: errorMessage },
            });

            // Create Vercel node
            const node = createMockVercelNode({
              operation: 'deploy',
              projectName: projectName,
              token: token,
            });

            // Execute Vercel node with deploy operation
            const result = await executeNodeLegacy(
              node,
              {},
              createMockNodeOutputsCache(),
              createMockSupabase() as any,
              'workflow-123'
            );

            // Assert success=false
            expect((result as any).success).toBe(false);

            // Assert retriable=true for 5xx errors
            expect((result as any).error).toBeDefined();
            expect((result as any).error.retriable).toBe(true);

            // Assert error code is SERVICE_UNAVAILABLE or similar
            expect(['SERVICE_UNAVAILABLE', 'API_ERROR']).toContain((result as any).error.code);

            // Assert error message is defined
            expect((result as any).error.message).toBeDefined();
            expect(typeof (result as any).error.message).toBe('string');

            // Assert token is not exposed in error message
            expect((result as any).error.message).not.toContain(token);
            expect(JSON.stringify((result as any).error)).not.toContain(token);

            // Assert data is null for failed operations
            expect((result as any).data).toBeNull();
          }
        ),
        { numRuns: 100 } // Generate 100+ test cases
      );
    });

    /**
     * Test all specific 5xx status codes
     * Covers: 500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511
     */
    test('all 5xx status codes return retriable=true', async () => {
      const fiveHundredCodes = [
        500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511,
      ];

      for (const statusCode of fiveHundredCodes) {
        mockFetch(statusCode, {
          error: { message: `Server error ${statusCode}` },
        });

        const node = createMockVercelNode({
          operation: 'deploy',
          projectName: 'test-project',
          token: 'vercel_test_token_12345678901234567890',
        });

        const result = await executeNodeLegacy(
          node,
          {},
          createMockNodeOutputsCache(),
          createMockSupabase() as any,
          'workflow-123'
        );

        expect((result as any).success).toBe(false);
        expect((result as any).error.retriable).toBe(true);
        expect((result as any).error.code).toBe('SERVICE_UNAVAILABLE');
      }
    });

    /**
     * Test 503 Service Unavailable specifically
     * This is the most common service unavailable code
     */
    test('503 Service Unavailable specifically returns SERVICE_UNAVAILABLE code', async () => {
      mockFetch(503, {
        error: { message: 'Service temporarily unavailable' },
      });

      const node = createMockVercelNode({
        operation: 'deploy',
        projectName: 'test-project',
        token: 'vercel_test_token_12345678901234567890',
      });

      const result = await executeNodeLegacy(
        node,
        {},
        createMockNodeOutputsCache(),
        createMockSupabase() as any,
        'workflow-123'
      );

      expect((result as any).success).toBe(false);
      expect((result as any).error.code).toBe('SERVICE_UNAVAILABLE');
      expect((result as any).error.retriable).toBe(true);
      expect((result as any).error.message).toBeDefined();
    });

    /**
     * Test 502 Bad Gateway
     * Common when upstream services are down
     */
    test('502 Bad Gateway returns SERVICE_UNAVAILABLE code', async () => {
      mockFetch(502, {
        error: { message: 'Bad gateway' },
      });

      const node = createMockVercelNode({
        operation: 'deploy',
        projectName: 'test-project',
        token: 'vercel_test_token_12345678901234567890',
      });

      const result = await executeNodeLegacy(
        node,
        {},
        createMockNodeOutputsCache(),
        createMockSupabase() as any,
        'workflow-123'
      );

      expect((result as any).success).toBe(false);
      expect((result as any).error.code).toBe('SERVICE_UNAVAILABLE');
      expect((result as any).error.retriable).toBe(true);
    });

    /**
     * Test 500 Internal Server Error
     * Generic server error
     */
    test('500 Internal Server Error returns SERVICE_UNAVAILABLE code', async () => {
      mockFetch(500, {
        error: { message: 'Internal server error' },
      });

      const node = createMockVercelNode({
        operation: 'deploy',
        projectName: 'test-project',
        token: 'vercel_test_token_12345678901234567890',
      });

      const result = await executeNodeLegacy(
        node,
        {},
        createMockNodeOutputsCache(),
        createMockSupabase() as any,
        'workflow-123'
      );

      expect((result as any).success).toBe(false);
      expect((result as any).error.code).toBe('SERVICE_UNAVAILABLE');
      expect((result as any).error.retriable).toBe(true);
    });

    /**
     * Test 504 Gateway Timeout
     * Service is timing out
     */
    test('504 Gateway Timeout returns SERVICE_UNAVAILABLE code', async () => {
      mockFetch(504, {
        error: { message: 'Gateway timeout' },
      });

      const node = createMockVercelNode({
        operation: 'deploy',
        projectName: 'test-project',
        token: 'vercel_test_token_12345678901234567890',
      });

      const result = await executeNodeLegacy(
        node,
        {},
        createMockNodeOutputsCache(),
        createMockSupabase() as any,
        'workflow-123'
      );

      expect((result as any).success).toBe(false);
      expect((result as any).error.code).toBe('SERVICE_UNAVAILABLE');
      expect((result as any).error.retriable).toBe(true);
    });

    /**
     * Test 5xx errors with list_deployments operation
     * Ensures 5xx handling works for all operations
     */
    test('5xx errors on list_deployments operation return retriable=true', async () => {
      mockFetch(503, {
        error: { message: 'Service unavailable' },
      });

      const node = createMockVercelNode({
        operation: 'list_deployments',
        token: 'vercel_test_token_12345678901234567890',
      });

      const result = await executeNodeLegacy(
        node,
        {},
        createMockNodeOutputsCache(),
        createMockSupabase() as any,
        'workflow-123'
      );

      expect((result as any).success).toBe(false);
      expect((result as any).error.retriable).toBe(true);
      expect((result as any).error.code).toBe('SERVICE_UNAVAILABLE');
    });

    /**
     * Test 5xx errors with various error response formats
     * Ensures robust error handling across different API response formats
     */
    test('5xx errors with various response formats return retriable=true', async () => {
      const responseFormats = [
        { error: { message: 'Service unavailable' } },
        { message: 'Service unavailable' },
        { errors: [{ message: 'Service unavailable' }] },
        { statusCode: 503, message: 'Service unavailable' },
        {}, // Empty response
      ];

      for (const responseFormat of responseFormats) {
        mockFetch(503, responseFormat);

        const node = createMockVercelNode({
          operation: 'deploy',
          projectName: 'test-project',
          token: 'vercel_test_token_12345678901234567890',
        });

        const result = await executeNodeLegacy(
          node,
          {},
          createMockNodeOutputsCache(),
          createMockSupabase() as any,
          'workflow-123'
        );

        expect((result as any).success).toBe(false);
        expect((result as any).error.retriable).toBe(true);
      }
    });

    /**
     * Test 5xx errors never expose token in output
     * Security property: token must never leak in error responses
     */
    test('5xx errors never expose token in output', async () => {
      const tokens = [
        'vercel_test_token_12345678901234567890',
        'vercel_abc123def456ghi789jkl012mno345',
        'vercel_xyz_test_token_with_underscores',
      ];

      for (const token of tokens) {
        mockFetch(503, {
          error: { message: 'Service unavailable' },
        });

        const node = createMockVercelNode({
          operation: 'deploy',
          projectName: 'test-project',
          token: token,
        });

        const result = await executeNodeLegacy(
          node,
          {},
          createMockNodeOutputsCache(),
          createMockSupabase() as any,
          'workflow-123'
        );

        const resultString = JSON.stringify(result);
        expect(resultString).not.toContain(token);
      }
    });

    /**
     * Test 5xx errors with edge case project names
     * Ensures error handling is consistent regardless of project name
     */
    test('5xx errors with various project names return retriable=true', async () => {
      const projectNames = [
        'simple-project',
        'project_with_underscores',
        'project123',
        'a',
        'very-long-project-name-with-many-characters-to-test-edge-cases',
      ];

      for (const projectName of projectNames) {
        mockFetch(503, {
          error: { message: 'Service unavailable' },
        });

        const node = createMockVercelNode({
          operation: 'deploy',
          projectName: projectName,
          token: 'vercel_test_token_12345678901234567890',
        });

        const result = await executeNodeLegacy(
          node,
          {},
          createMockNodeOutputsCache(),
          createMockSupabase() as any,
          'workflow-123'
        );

        expect((result as any).success).toBe(false);
        expect((result as any).error.retriable).toBe(true);
      }
    });
  });

  /**
   * Property 2: Failed Operations Return Error Structure
   * 
   * **Validates: Requirements 2.5, 3.5, 5.1, 6.4, 6.5**
   * 
   * For any failed operation, the output SHALL have:
   * - success=false
   * - error object with code, message, retriable fields
   */
  describe('Property 2: Failed Operations Return Error Structure', () => {
    
    test('all error responses have required error fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 400, max: 599 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (statusCode, errorMessage) => {
            mockFetch(statusCode, {
              error: { message: errorMessage },
            });

            const result = await executeNodeLegacy(
              'vercel',
              {
                operation: 'deploy',
                projectName: 'test-project',
                token: 'vercel_test_token_12345678901234567890',
              },
              {},
              createMockSupabase(),
              'workflow-123'
            );

            // Assert success=false
            expect(result.success).toBe(false);

            // Assert error object exists and has required fields
            expect(result.error).toBeDefined();
            expect(result.error.code).toBeDefined();
            expect(typeof result.error.code).toBe('string');
            expect(result.error.message).toBeDefined();
            expect(typeof result.error.message).toBe('string');
            expect(result.error.retriable).toBeDefined();
            expect(typeof result.error.retriable).toBe('boolean');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 16: Permanent Errors Non-Retriable
   * 
   * **Validates: Requirements 12.2**
   * 
   * For any 4xx API response, the output SHALL have:
   * - success=false
   * - retriable=false (since 4xx errors are permanent)
   */
  describe('Property 16: Permanent Errors Non-Retriable', () => {
    
    test('4xx errors return retriable=false', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 400, max: 499 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (statusCode, errorMessage) => {
            mockFetch(statusCode, {
              error: { message: errorMessage },
            });

            const result = await executeNodeLegacy(
              'vercel',
              {
                operation: 'deploy',
                projectName: 'test-project',
                token: 'vercel_test_token_12345678901234567890',
              },
              {},
              createMockSupabase(),
              'workflow-123'
            );

            // Assert success=false
            expect(result.success).toBe(false);

            // Assert retriable=false for 4xx errors
            expect(result.error).toBeDefined();
            expect(result.error.retriable).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    test('401 Unauthorized returns UNAUTHORIZED code with retriable=false', async () => {
      mockFetch(401, {
        error: { message: 'Unauthorized' },
      });

      const result = await executeNodeLegacy(
        'vercel',
        {
          operation: 'deploy',
          projectName: 'test-project',
          token: 'invalid_token',
        },
        {},
        createMockSupabase(),
        'workflow-123'
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
      expect(result.error.retriable).toBe(false);
    });

    test('403 Forbidden returns FORBIDDEN code with retriable=false', async () => {
      mockFetch(403, {
        error: { message: 'Forbidden' },
      });

      const result = await executeNodeLegacy(
        'vercel',
        {
          operation: 'deploy',
          projectName: 'test-project',
          token: 'vercel_test_token_12345678901234567890',
        },
        {},
        createMockSupabase(),
        'workflow-123'
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('FORBIDDEN');
      expect(result.error.retriable).toBe(false);
    });

    test('404 Not Found returns NOT_FOUND code with retriable=false', async () => {
      mockFetch(404, {
        error: { message: 'Not found' },
      });

      const result = await executeNodeLegacy(
        'vercel',
        {
          operation: 'deploy',
          projectName: 'nonexistent-project',
          token: 'vercel_test_token_12345678901234567890',
        },
        {},
        createMockSupabase(),
        'workflow-123'
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.retriable).toBe(false);
    });
  });

  /**
   * Property 9: Token Never Exposed in Output
   * 
   * **Validates: Requirements 4.6, 14.4**
   * 
   * For any operation (success or failure), the token value SHALL NOT appear
   * in the output, error messages, or any returned data.
   */
  describe('Property 9: Token Never Exposed in Output', () => {
    
    test('token never appears in error output', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 400, max: 599 }),
          fc.string({ minLength: 20, maxLength: 50 }),
          async (statusCode, token) => {
            mockFetch(statusCode, {
              error: { message: 'API error' },
            });

            const result = await executeNodeLegacy(
              'vercel',
              {
                operation: 'deploy',
                projectName: 'test-project',
                token: token,
              },
              {},
              createMockSupabase(),
              'workflow-123'
            );

            // Convert entire result to string and check token is not present
            const resultString = JSON.stringify(result);
            expect(resultString).not.toContain(token);
          }
        ),
        { numRuns: 30 }
      );
    });

    test('token never appears in success output', async () => {
      mockFetch(200, {
        id: 'dpl_123',
        url: 'https://test-project.vercel.app',
        state: 'READY',
        createdAt: new Date().toISOString(),
      });

      const token = 'vercel_test_token_12345678901234567890';
      const result = await executeNodeLegacy(
        'vercel',
        {
          operation: 'deploy',
          projectName: 'test-project',
          token: token,
        },
        {},
        createMockSupabase(),
        'workflow-123'
      );

      const resultString = JSON.stringify(result);
      expect(resultString).not.toContain(token);
    });
  });

  /**
   * Property 4: Invalid Operation Rejected
   * 
   * **Validates: Requirements 5.1**
   * 
   * For any operation value that is not 'deploy' or 'list_deployments',
   * the output SHALL have success=false with error code indicating invalid operation.
   */
  describe('Property 4: Invalid Operation Rejected', () => {
    
    test('invalid operations are rejected', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter(
            (op) => op !== 'deploy' && op !== 'list_deployments'
          ),
          async (invalidOperation) => {
            const result = await executeNodeLegacy(
              'vercel',
              {
                operation: invalidOperation,
                projectName: 'test-project',
                token: 'vercel_test_token_12345678901234567890',
              },
              {},
              createMockSupabase(),
              'workflow-123'
            );

            expect(result.success).toBe(false);
            expect(result.error.code).toBe('INVALID_OPERATION');
            expect(result.error.retriable).toBe(false);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 5: Deploy Requires ProjectName
   * 
   * **Validates: Requirements 5.2**
   * 
   * For any deploy operation where projectName is missing or empty,
   * the output SHALL have success=false with error code indicating missing projectName.
   */
  describe('Property 5: Deploy Requires ProjectName', () => {
    
    test('deploy without projectName is rejected', async () => {
      const result = await executeNodeLegacy(
        'vercel',
        {
          operation: 'deploy',
          projectName: '',
          token: 'vercel_test_token_12345678901234567890',
        },
        {},
        createMockSupabase(),
        'workflow-123'
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_PROJECT_NAME');
      expect(result.error.retriable).toBe(false);
    });

    test('deploy with missing projectName is rejected', async () => {
      const result = await executeNodeLegacy(
        'vercel',
        {
          operation: 'deploy',
          token: 'vercel_test_token_12345678901234567890',
        },
        {},
        createMockSupabase(),
        'workflow-123'
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_PROJECT_NAME');
      expect(result.error.retriable).toBe(false);
    });
  });

  /**
   * Property 6: Invalid ProjectName Rejected
   * 
   * **Validates: Requirements 5.3**
   * 
   * For any projectName containing invalid characters (not alphanumeric, hyphen, or underscore),
   * the output SHALL have success=false with error code indicating invalid projectName.
   */
  describe('Property 6: Invalid ProjectName Rejected', () => {
    
    test('projectName with invalid characters is rejected', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter(
            (name) => !/^[a-zA-Z0-9_-]{1,128}$/.test(name)
          ),
          async (invalidProjectName) => {
            const result = await executeNodeLegacy(
              'vercel',
              {
                operation: 'deploy',
                projectName: invalidProjectName,
                token: 'vercel_test_token_12345678901234567890',
              },
              {},
              createMockSupabase(),
              'workflow-123'
            );

            expect(result.success).toBe(false);
            expect(result.error.code).toBe('INVALID_PROJECT_NAME');
            expect(result.error.retriable).toBe(false);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 7: Missing Token Rejected
   * 
   * **Validates: Requirements 4.1, 5.4**
   * 
   * For any operation where token is missing or empty,
   * the output SHALL have success=false with error code indicating missing token.
   */
  describe('Property 7: Missing Token Rejected', () => {
    
    test('missing token is rejected', async () => {
      const result = await executeNodeLegacy(
        'vercel',
        {
          operation: 'deploy',
          projectName: 'test-project',
          token: '',
        },
        {},
        createMockSupabase(),
        'workflow-123'
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_TOKEN');
      expect(result.error.retriable).toBe(false);
    });

    test('missing token field is rejected', async () => {
      const result = await executeNodeLegacy(
        'vercel',
        {
          operation: 'deploy',
          projectName: 'test-project',
        },
        {},
        createMockSupabase(),
        'workflow-123'
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_TOKEN');
      expect(result.error.retriable).toBe(false);
    });
  });

  /**
   * Property 8: Invalid Token Format Rejected
   * 
   * **Validates: Requirements 5.5**
   * 
   * For any token that does not match Vercel token format,
   * the output SHALL have success=false with error code indicating invalid token format.
   */
  describe('Property 8: Invalid Token Format Rejected', () => {
    
    test('invalid token format is rejected', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 19 }).filter(
            (token) => !/^[a-zA-Z0-9_\-]{20,}$/.test(token) && !token.startsWith('vercel_')
          ),
          async (invalidToken) => {
            const result = await executeNodeLegacy(
              'vercel',
              {
                operation: 'deploy',
                projectName: 'test-project',
                token: invalidToken,
              },
              {},
              createMockSupabase(),
              'workflow-123'
            );

            expect(result.success).toBe(false);
            expect(result.error.code).toBe('INVALID_TOKEN_FORMAT');
            expect(result.error.retriable).toBe(false);
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
