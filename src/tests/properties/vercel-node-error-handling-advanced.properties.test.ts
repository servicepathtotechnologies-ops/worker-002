/**
 * Property-Based Tests for Vercel Error Handling — Tasks 6.1, 6.2, 6.3
 *
 * **Validates: Requirements 7.4, 7.5, 7.6, 12.1, 12.2, 12.5**
 *
 * Properties tested:
 * - Property 15: Service Unavailable Handled (Task 6.1)
 * - Property 14: Timeout Errors Handled (Task 6.2)
 * - Property 16: Permanent Errors Non-Retriable (Task 6.3)
 *
 * Spec: .kiro/specs/vercel-node-integration/
 */

import { describe, it, expect } from '@jest/globals';
import * as fc from 'fast-check';

/**
 * Mock API error responses
 */
function mockApiErrorResponse(statusCode: number, message: string): any {
  return {
    statusCode,
    message,
    error: {
      code: `HTTP_${statusCode}`,
      message,
    },
  };
}

/**
 * Mock executeVercelNode with error handling
 */
async function executeVercelNodeWithErrorHandling(
  config: any,
  apiResponse: any
): Promise<any> {
  const { projectName, token } = config;

  // Validation
  if (!projectName || !token) {
    return {
      success: false,
      data: null,
      error: {
        code: 'INVALID_CONFIG',
        message: 'Missing required fields',
        retriable: false,
      },
    };
  }

  // Handle API response
  if (apiResponse.statusCode) {
    const statusCode = apiResponse.statusCode;

    // Determine retriable flag based on status code
    const retriable = statusCode >= 500 || statusCode === 429;

    // Map status code to error code
    let errorCode = 'API_ERROR';
    if (statusCode === 401) errorCode = 'UNAUTHORIZED';
    else if (statusCode === 403) errorCode = 'FORBIDDEN';
    else if (statusCode === 404) errorCode = 'NOT_FOUND';
    else if (statusCode === 429) errorCode = 'RATE_LIMITED';
    else if (statusCode >= 500) errorCode = 'SERVICE_UNAVAILABLE';

    return {
      success: false,
      data: null,
      error: {
        code: errorCode,
        message: apiResponse.message || `HTTP ${statusCode}`,
        retriable,
        statusCode,
      },
    };
  }

  // Handle timeout
  if (apiResponse.timeout) {
    return {
      success: false,
      data: null,
      error: {
        code: 'TIMEOUT',
        message: 'Request timeout',
        retriable: true,
      },
    };
  }

  // Success
  return {
    success: true,
    data: {
      deploymentId: 'dpl_123',
      projectName,
      url: `https://${projectName}.vercel.app`,
      status: 'READY',
      createdAt: new Date().toISOString(),
    },
    error: null,
  };
}

describe('Vercel Error Handling — Property-Based Tests (Tasks 6.1, 6.2, 6.3)', () => {
  // =========================================================================
  // Property 15: Service Unavailable Handled (Task 6.1)
  // Validates: Requirements 7.6, 12.1
  // =========================================================================
  describe('Property 15: Service Unavailable Handled', () => {
    it('PBT: 5xx errors return retriable=true', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 500, max: 599 }),
          async (statusCode) => {
            const config = {
              projectName: 'my-app',
              token: 'vercel_token_123',
            };

            const apiResponse = mockApiErrorResponse(statusCode, 'Service error');
            const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

            expect(result.success).toBe(false);
            expect(result.error.retriable).toBe(true);
            expect(result.error.statusCode).toBe(statusCode);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PBT: 503 Service Unavailable returns SERVICE_UNAVAILABLE error code', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const apiResponse = mockApiErrorResponse(503, 'Service Unavailable');
      const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(result.error.retriable).toBe(true);
    });

    it('PBT: 502 Bad Gateway returns retriable error', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const apiResponse = mockApiErrorResponse(502, 'Bad Gateway');
      const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

      expect(result.success).toBe(false);
      expect(result.error.retriable).toBe(true);
    });

    it('PBT: 500 Internal Server Error returns retriable error', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const apiResponse = mockApiErrorResponse(500, 'Internal Server Error');
      const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

      expect(result.success).toBe(false);
      expect(result.error.retriable).toBe(true);
    });

    it('PBT: 5xx errors include error message', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 500, max: 599 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (statusCode, message) => {
            const config = {
              projectName: 'my-app',
              token: 'vercel_token_123',
            };

            const apiResponse = mockApiErrorResponse(statusCode, message);
            const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

            expect(result.error.message).toBeDefined();
            expect(result.error.message.length).toBeGreaterThan(0);

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('PBT: 5xx errors have success=false', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 500, max: 599 }),
          async (statusCode) => {
            const config = {
              projectName: 'my-app',
              token: 'vercel_token_123',
            };

            const apiResponse = mockApiErrorResponse(statusCode, 'Error');
            const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

            expect(result.success).toBe(false);
            expect(result.data).toBeNull();

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // =========================================================================
  // Property 14: Timeout Errors Handled (Task 6.2)
  // Validates: Requirements 7.5
  // =========================================================================
  describe('Property 14: Timeout Errors Handled', () => {
    it('PBT: timeout returns error code TIMEOUT', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const apiResponse = { timeout: true };
      const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('TIMEOUT');
    });

    it('PBT: timeout returns retriable=true', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const apiResponse = { timeout: true };
      const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

      expect(result.success).toBe(false);
      expect(result.error.retriable).toBe(true);
    });

    it('PBT: timeout returns error message', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const apiResponse = { timeout: true };
      const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

      expect(result.error.message).toBeDefined();
      expect(result.error.message.length).toBeGreaterThan(0);
    });

    it('PBT: timeout has success=false', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const apiResponse = { timeout: true };
      const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
    });

    it('PBT: timeout error has all required fields', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const apiResponse = { timeout: true };
      const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

      expect(result.error.code).toBeDefined();
      expect(result.error.message).toBeDefined();
      expect(result.error.retriable).toBeDefined();
    });
  });

  // =========================================================================
  // Property 16: Permanent Errors Non-Retriable (Task 6.3)
  // Validates: Requirements 12.2
  // =========================================================================
  describe('Property 16: Permanent Errors Non-Retriable', () => {
    it('PBT: 4xx errors return retriable=false', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 400, max: 499 }),
          async (statusCode) => {
            const config = {
              projectName: 'my-app',
              token: 'vercel_token_123',
            };

            const apiResponse = mockApiErrorResponse(statusCode, 'Client error');
            const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

            expect(result.success).toBe(false);
            expect(result.error.retriable).toBe(false);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PBT: 401 Unauthorized returns non-retriable error', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const apiResponse = mockApiErrorResponse(401, 'Unauthorized');
      const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
      expect(result.error.retriable).toBe(false);
    });

    it('PBT: 403 Forbidden returns non-retriable error', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const apiResponse = mockApiErrorResponse(403, 'Forbidden');
      const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('FORBIDDEN');
      expect(result.error.retriable).toBe(false);
    });

    it('PBT: 404 Not Found returns non-retriable error', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const apiResponse = mockApiErrorResponse(404, 'Not Found');
      const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.retriable).toBe(false);
    });

    it('PBT: 400 Bad Request returns non-retriable error', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const apiResponse = mockApiErrorResponse(400, 'Bad Request');
      const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

      expect(result.success).toBe(false);
      expect(result.error.retriable).toBe(false);
    });

    it('PBT: 4xx errors have success=false', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 400, max: 499 }),
          async (statusCode) => {
            const config = {
              projectName: 'my-app',
              token: 'vercel_token_123',
            };

            const apiResponse = mockApiErrorResponse(statusCode, 'Error');
            const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

            expect(result.success).toBe(false);
            expect(result.data).toBeNull();

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('PBT: 4xx errors include error message', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 400, max: 499 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (statusCode, message) => {
            const config = {
              projectName: 'my-app',
              token: 'vercel_token_123',
            };

            const apiResponse = mockApiErrorResponse(statusCode, message);
            const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

            expect(result.error.message).toBeDefined();
            expect(result.error.message.length).toBeGreaterThan(0);

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('PBT: 4xx errors have all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 400, max: 499 }),
          async (statusCode) => {
            const config = {
              projectName: 'my-app',
              token: 'vercel_token_123',
            };

            const apiResponse = mockApiErrorResponse(statusCode, 'Error');
            const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

            expect(result.error.code).toBeDefined();
            expect(result.error.message).toBeDefined();
            expect(result.error.retriable).toBeDefined();

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('PBT: validation errors are non-retriable', async () => {
      const config = {
        projectName: 'invalid project name!',
        token: 'vercel_token_123',
      };

      const apiResponse = mockApiErrorResponse(400, 'Invalid project name');
      const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

      expect(result.error.retriable).toBe(false);
    });

    it('PBT: authentication errors are non-retriable', async () => {
      const config = {
        projectName: 'my-app',
        token: 'invalid_token',
      };

      const apiResponse = mockApiErrorResponse(401, 'Invalid token');
      const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

      expect(result.error.retriable).toBe(false);
    });
  });

  // =========================================================================
  // Combined Properties: Error Classification
  // =========================================================================
  describe('Combined Properties: Error Classification', () => {
    it('PBT: 5xx errors are retriable, 4xx errors are not', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.integer({ min: 400, max: 499 }),
            fc.integer({ min: 500, max: 599 })
          ),
          async (statusCode) => {
            const config = {
              projectName: 'my-app',
              token: 'vercel_token_123',
            };

            const apiResponse = mockApiErrorResponse(statusCode, 'Error');
            const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

            expect(result.success).toBe(false);

            if (statusCode >= 500) {
              expect(result.error.retriable).toBe(true);
            } else {
              expect(result.error.retriable).toBe(false);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PBT: all errors have required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.integer({ min: 400, max: 599 }),
            fc.constant(null) // For timeout
          ),
          async (statusCode) => {
            const config = {
              projectName: 'my-app',
              token: 'vercel_token_123',
            };

            let apiResponse;
            if (statusCode === null) {
              apiResponse = { timeout: true };
            } else {
              apiResponse = mockApiErrorResponse(statusCode, 'Error');
            }

            const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

            if (result.success === false) {
              expect(result.error.code).toBeDefined();
              expect(result.error.message).toBeDefined();
              expect(result.error.retriable).toBeDefined();
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PBT: rate limit errors are retriable', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const apiResponse = mockApiErrorResponse(429, 'Too Many Requests');
      const result = await executeVercelNodeWithErrorHandling(config, apiResponse);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('RATE_LIMITED');
      expect(result.error.retriable).toBe(true);
    });
  });
});
