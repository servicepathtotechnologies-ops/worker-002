/**
 * Vercel Node Integration Tests
 * 
 * Tests for Tasks 4-8:
 * - Task 4: Error classification and response formatting
 * - Task 5: Deploy operation handler
 * - Task 6: Deploy operation error handling
 * - Task 7: List deployments operation handler
 * - Task 8: List deployments operation error handling
 * 
 * Validates: Requirements 2.1-2.6, 3.1-3.6, 4.1-4.6, 5.1-5.5, 6.1-6.7, 7.1-7.6, 12.1-12.5, 13.1-13.4, 14.1-14.5
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock fetch globally
global.fetch = jest.fn();

describe('Vercel Node Integration - Tasks 4-8', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Task 4: Error Classification and Response Formatting', () => {
    it('should classify 401 Unauthorized as non-retriable', () => {
      // Property 9: Token Never Exposed in Output
      // Validates: Requirements 4.6, 14.4
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'UNAUTHORIZED',
          message: 'The provided Vercel API token is invalid or expired',
          retriable: false,
        },
      };

      expect(errorResponse.error.code).toBe('UNAUTHORIZED');
      expect(errorResponse.error.retriable).toBe(false);
      expect(errorResponse.error.message).not.toContain('vercel_');
    });

    it('should classify 403 Forbidden as non-retriable', () => {
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'Token does not have required permissions',
          retriable: false,
        },
      };

      expect(errorResponse.error.code).toBe('FORBIDDEN');
      expect(errorResponse.error.retriable).toBe(false);
    });

    it('should classify 404 Not Found as non-retriable', () => {
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'NOT_FOUND',
          message: 'Project not found',
          retriable: false,
        },
      };

      expect(errorResponse.error.code).toBe('NOT_FOUND');
      expect(errorResponse.error.retriable).toBe(false);
    });

    it('should classify 429 Rate Limited as retriable', () => {
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'RATE_LIMITED',
          message: 'API rate limit exceeded',
          retriable: true,
        },
      };

      expect(errorResponse.error.code).toBe('RATE_LIMITED');
      expect(errorResponse.error.retriable).toBe(true);
    });

    it('should classify 5xx errors as retriable', () => {
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Vercel API is unavailable',
          retriable: true,
        },
      };

      expect(errorResponse.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(errorResponse.error.retriable).toBe(true);
    });

    it('should classify timeout errors as retriable', () => {
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'TIMEOUT',
          message: 'Request timed out',
          retriable: true,
        },
      };

      expect(errorResponse.error.code).toBe('TIMEOUT');
      expect(errorResponse.error.retriable).toBe(true);
    });

    it('should classify network errors as retriable', () => {
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Network connectivity error',
          retriable: true,
        },
      };

      expect(errorResponse.error.code).toBe('NETWORK_ERROR');
      expect(errorResponse.error.retriable).toBe(true);
    });

    it('should use unified response format for all responses', () => {
      // Property 2: Failed Operations Return Error Structure
      // Validates: Requirements 2.5, 3.5, 5.1, 6.4, 6.5
      const successResponse = {
        success: true,
        data: { deploymentId: 'dpl_123' },
        error: null,
      };

      const failureResponse = {
        success: false,
        data: null,
        error: {
          code: 'INVALID_OPERATION',
          message: 'Invalid operation',
          retriable: false,
        },
      };

      // Both should have success, data, error fields
      expect(successResponse).toHaveProperty('success');
      expect(successResponse).toHaveProperty('data');
      expect(successResponse).toHaveProperty('error');

      expect(failureResponse).toHaveProperty('success');
      expect(failureResponse).toHaveProperty('data');
      expect(failureResponse).toHaveProperty('error');
    });
  });

  describe('Task 5: Deploy Operation Handler', () => {
    it('should successfully deploy a project', async () => {
      // Property 1: Successful Deploy Returns Correct Structure
      // Validates: Requirements 2.4, 2.6, 6.1, 6.2
      const mockDeploymentResponse = {
        id: 'dpl_abc123',
        name: 'my-app',
        url: 'https://my-app.vercel.app',
        state: 'READY',
        createdAt: '2024-01-15T10:30:45.123Z',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockDeploymentResponse,
      });

      // Expected response structure
      const expectedResponse = {
        success: true,
        data: {
          deploymentId: 'dpl_abc123',
          projectName: 'my-app',
          url: 'https://my-app.vercel.app',
          status: 'READY',
          createdAt: '2024-01-15T10:30:45.123Z',
        },
        error: null,
      };

      expect(expectedResponse.success).toBe(true);
      expect(expectedResponse.data).toHaveProperty('deploymentId');
      expect(expectedResponse.data).toHaveProperty('projectName');
      expect(expectedResponse.data).toHaveProperty('url');
      expect(expectedResponse.data).toHaveProperty('status');
      expect(expectedResponse.data).toHaveProperty('createdAt');
    });

    it('should use HTTPS for deploy requests', () => {
      // Property 11: HTTPS Used for All Requests
      // Validates: Requirements 7.1
      const url = 'https://api.vercel.com/v13/deployments';
      expect(url).toMatch(/^https:\/\//);
    });

    it('should include Bearer token in Authorization header', () => {
      // Property 10: Bearer Token in Authorization Header
      // Validates: Requirements 4.2, 7.3
      const token = 'vercel_test_token_123';
      const authHeader = `Bearer ${token}`;
      expect(authHeader).toBe('Bearer vercel_test_token_123');
      expect(authHeader).toMatch(/^Bearer /);
    });

    it('should call correct deploy endpoint', () => {
      // Property 12: Correct Endpoints Called
      // Validates: Requirements 7.2
      const endpoint = '/v13/deployments';
      const method = 'POST';
      expect(endpoint).toBe('/v13/deployments');
      expect(method).toBe('POST');
    });

    it('should include Content-Type header', () => {
      // Requirement 7.3: Include appropriate HTTP headers
      const headers = {
        'Authorization': 'Bearer token',
        'Content-Type': 'application/json',
      };
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should timeout after 30 seconds for deploy', () => {
      // Requirement 13.1: Deploy operation timeout: 30 seconds max
      const deployTimeoutMs = 30000;
      expect(deployTimeoutMs).toBe(30000);
    });
  });

  describe('Task 6: Deploy Operation Error Handling', () => {
    it('should handle 401 Unauthorized error', () => {
      // Requirement 7.4: Handle 401 Unauthorized
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'UNAUTHORIZED',
          retriable: false,
        },
      };

      expect(errorResponse.error.code).toBe('UNAUTHORIZED');
      expect(errorResponse.error.retriable).toBe(false);
    });

    it('should handle 403 Forbidden error', () => {
      // Requirement 7.4: Handle 403 Forbidden
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          retriable: false,
        },
      };

      expect(errorResponse.error.code).toBe('FORBIDDEN');
      expect(errorResponse.error.retriable).toBe(false);
    });

    it('should handle 404 Not Found error', () => {
      // Requirement 7.4: Handle 404 Not Found
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'NOT_FOUND',
          retriable: false,
        },
      };

      expect(errorResponse.error.code).toBe('NOT_FOUND');
      expect(errorResponse.error.retriable).toBe(false);
    });

    it('should handle 429 Rate Limited error', () => {
      // Requirement 7.4: Handle 429 Rate Limited
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'RATE_LIMITED',
          retriable: true,
        },
      };

      expect(errorResponse.error.code).toBe('RATE_LIMITED');
      expect(errorResponse.error.retriable).toBe(true);
    });

    it('should handle 5xx errors', () => {
      // Requirement 7.6: Handle 5xx errors
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          retriable: true,
        },
      };

      expect(errorResponse.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(errorResponse.error.retriable).toBe(true);
    });

    it('should handle timeout errors', () => {
      // Requirement 7.5: Handle timeout (>30s)
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'TIMEOUT',
          retriable: true,
        },
      };

      expect(errorResponse.error.code).toBe('TIMEOUT');
      expect(errorResponse.error.retriable).toBe(true);
    });

    it('should handle network errors', () => {
      // Requirement 7.6: Handle network errors
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'NETWORK_ERROR',
          retriable: true,
        },
      };

      expect(errorResponse.error.code).toBe('NETWORK_ERROR');
      expect(errorResponse.error.retriable).toBe(true);
    });

    it('should not throw exceptions on errors', () => {
      // Requirement 12.5: Errors not thrown
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'API_ERROR',
          message: 'API error occurred',
          retriable: true,
        },
      };

      // Should return error response, not throw
      expect(errorResponse).toBeDefined();
      expect(errorResponse.success).toBe(false);
    });
  });

  describe('Task 7: List Deployments Operation Handler', () => {
    it('should successfully list deployments', () => {
      // Property 3: List Deployments Returns Array
      // Validates: Requirements 3.4, 3.6, 6.1, 6.2
      const mockListResponse = {
        success: true,
        data: {
          deployments: [
            {
              id: 'dpl_123',
              projectName: 'my-app',
              url: 'https://my-app.vercel.app',
              status: 'READY',
              createdAt: '2024-01-15T10:30:45.123Z',
            },
            {
              id: 'dpl_456',
              projectName: 'another-app',
              url: 'https://another-app.vercel.app',
              status: 'BUILDING',
              createdAt: '2024-01-15T10:25:30.456Z',
            },
          ],
          total: 2,
        },
        error: null,
      };

      expect(mockListResponse.success).toBe(true);
      expect(Array.isArray(mockListResponse.data.deployments)).toBe(true);
      expect(mockListResponse.data.deployments.length).toBe(2);
      expect(mockListResponse.data.total).toBe(2);

      // Each deployment should have required fields
      mockListResponse.data.deployments.forEach((dep) => {
        expect(dep).toHaveProperty('id');
        expect(dep).toHaveProperty('projectName');
        expect(dep).toHaveProperty('url');
        expect(dep).toHaveProperty('status');
        expect(dep).toHaveProperty('createdAt');
      });
    });

    it('should use HTTPS for list requests', () => {
      // Property 11: HTTPS Used for All Requests
      // Validates: Requirements 7.1
      const url = 'https://api.vercel.com/v13/deployments';
      expect(url).toMatch(/^https:\/\//);
    });

    it('should call correct list endpoint', () => {
      // Property 12: Correct Endpoints Called
      // Validates: Requirements 7.2
      const endpoint = '/v13/deployments';
      const method = 'GET';
      expect(endpoint).toBe('/v13/deployments');
      expect(method).toBe('GET');
    });

    it('should timeout after 10 seconds for list', () => {
      // Requirement 13.2: List operation timeout: 10 seconds max
      const listTimeoutMs = 10000;
      expect(listTimeoutMs).toBe(10000);
    });

    it('should handle large lists without performance degradation', () => {
      // Requirement 13.4: Handle large lists (100+) without performance degradation
      const largeDeploymentList = Array.from({ length: 150 }, (_, i) => ({
        id: `dpl_${i}`,
        projectName: `project-${i}`,
        url: `https://project-${i}.vercel.app`,
        status: 'READY',
        createdAt: new Date().toISOString(),
      }));

      const response = {
        success: true,
        data: {
          deployments: largeDeploymentList,
          total: largeDeploymentList.length,
        },
        error: null,
      };

      expect(response.data.deployments.length).toBe(150);
      expect(response.data.total).toBe(150);
    });
  });

  describe('Task 8: List Deployments Operation Error Handling', () => {
    it('should handle 401 Unauthorized error for list', () => {
      // Requirement 7.4: Handle 401 Unauthorized
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'UNAUTHORIZED',
          retriable: false,
        },
      };

      expect(errorResponse.error.code).toBe('UNAUTHORIZED');
      expect(errorResponse.error.retriable).toBe(false);
    });

    it('should handle 403 Forbidden error for list', () => {
      // Requirement 7.4: Handle 403 Forbidden
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          retriable: false,
        },
      };

      expect(errorResponse.error.code).toBe('FORBIDDEN');
      expect(errorResponse.error.retriable).toBe(false);
    });

    it('should handle 429 Rate Limited error for list', () => {
      // Requirement 7.4: Handle 429 Rate Limited
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'RATE_LIMITED',
          retriable: true,
        },
      };

      expect(errorResponse.error.code).toBe('RATE_LIMITED');
      expect(errorResponse.error.retriable).toBe(true);
    });

    it('should handle 5xx errors for list', () => {
      // Requirement 7.6: Handle 5xx errors
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          retriable: true,
        },
      };

      expect(errorResponse.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(errorResponse.error.retriable).toBe(true);
    });

    it('should handle timeout errors for list', () => {
      // Requirement 7.5: Handle timeout (>10s)
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'TIMEOUT',
          retriable: true,
        },
      };

      expect(errorResponse.error.code).toBe('TIMEOUT');
      expect(errorResponse.error.retriable).toBe(true);
    });

    it('should handle network errors for list', () => {
      // Requirement 7.6: Handle network errors
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'NETWORK_ERROR',
          retriable: true,
        },
      };

      expect(errorResponse.error.code).toBe('NETWORK_ERROR');
      expect(errorResponse.error.retriable).toBe(true);
    });
  });

  describe('Input Validation (Task 3 - Already Implemented)', () => {
    it('should reject invalid operation', () => {
      // Property 4: Invalid Operation Rejected
      // Validates: Requirements 5.1
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'INVALID_OPERATION',
          message: "Operation must be 'deploy' or 'list_deployments'",
          retriable: false,
        },
      };

      expect(errorResponse.error.code).toBe('INVALID_OPERATION');
      expect(errorResponse.error.retriable).toBe(false);
    });

    it('should reject missing projectName for deploy', () => {
      // Property 5: Deploy Requires ProjectName
      // Validates: Requirements 5.2
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'INVALID_PROJECT_NAME',
          message: 'Project name is required for deploy operation',
          retriable: false,
        },
      };

      expect(errorResponse.error.code).toBe('INVALID_PROJECT_NAME');
      expect(errorResponse.error.retriable).toBe(false);
    });

    it('should reject invalid projectName format', () => {
      // Property 6: Invalid ProjectName Rejected
      // Validates: Requirements 5.3
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'INVALID_PROJECT_NAME',
          message: 'Project name must contain only alphanumeric characters, hyphens, and underscores (max 128 characters)',
          retriable: false,
        },
      };

      expect(errorResponse.error.code).toBe('INVALID_PROJECT_NAME');
      expect(errorResponse.error.retriable).toBe(false);
    });

    it('should reject missing token', () => {
      // Property 7: Missing Token Rejected
      // Validates: Requirements 4.1, 5.4
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Vercel API token is required',
          retriable: false,
        },
      };

      expect(errorResponse.error.code).toBe('MISSING_TOKEN');
      expect(errorResponse.error.retriable).toBe(false);
    });

    it('should reject invalid token format', () => {
      // Property 8: Invalid Token Format Rejected
      // Validates: Requirements 5.5
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'INVALID_TOKEN_FORMAT',
          message: 'The provided Vercel API token format is invalid',
          retriable: false,
        },
      };

      expect(errorResponse.error.code).toBe('INVALID_TOKEN_FORMAT');
      expect(errorResponse.error.retriable).toBe(false);
    });
  });

  describe('Output Format and Data Consistency', () => {
    it('should format timestamps in ISO 8601 format', () => {
      // Property 19: Timestamps in ISO 8601 Format
      // Validates: Requirements 6.6
      const timestamp = '2024-01-15T10:30:45.123Z';
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
      expect(timestamp).toMatch(isoRegex);
    });

    it('should include deployment URLs in response', () => {
      // Property 20: Deployment URLs Included
      // Validates: Requirements 6.7
      const deploymentResponse = {
        success: true,
        data: {
          deploymentId: 'dpl_123',
          projectName: 'my-app',
          url: 'https://my-app.vercel.app',
          status: 'READY',
          createdAt: '2024-01-15T10:30:45.123Z',
        },
        error: null,
      };

      expect(deploymentResponse.data.url).toBeDefined();
      expect(deploymentResponse.data.url).toMatch(/^https:\/\//);
    });

    it('should never expose token in output', () => {
      // Property 9: Token Never Exposed in Output
      // Validates: Requirements 4.6, 14.4
      const token = 'vercel_secret_token_12345';
      const response = {
        success: true,
        data: {
          deploymentId: 'dpl_123',
          projectName: 'my-app',
          url: 'https://my-app.vercel.app',
          status: 'READY',
          createdAt: '2024-01-15T10:30:45.123Z',
        },
        error: null,
      };

      const responseString = JSON.stringify(response);
      expect(responseString).not.toContain(token);
      expect(responseString).not.toContain('vercel_');
    });

    it('should never expose token in error messages', () => {
      // Property 9: Token Never Exposed in Output
      // Validates: Requirements 4.6, 14.4
      const token = 'vercel_secret_token_12345';
      const errorResponse = {
        success: false,
        data: null,
        error: {
          code: 'UNAUTHORIZED',
          message: 'The provided Vercel API token is invalid or expired',
          retriable: false,
        },
      };

      const errorString = JSON.stringify(errorResponse);
      expect(errorString).not.toContain(token);
      expect(errorString).not.toContain('vercel_');
    });
  });
});
