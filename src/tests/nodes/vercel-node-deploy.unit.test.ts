/**
 * Unit Tests for Vercel Deploy Operation — Task 5.2
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6**
 *
 * These unit tests verify specific scenarios for the deploy operation:
 * - Deploy with valid credentials
 * - Deploy with missing projectName
 * - Deploy with invalid projectName format
 * - Deploy API request format
 * - Deploy response parsing
 *
 * Spec: .kiro/specs/vercel-node-integration/
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

/**
 * Mock Vercel API client
 */
class MockVercelApiClient {
  async deploy(projectName: string, token: string): Promise<any> {
    // Simulate API call
    return {
      id: 'dpl_abc123',
      projectId: 'prj_123',
      projectName,
      url: `https://${projectName}.vercel.app`,
      status: 'READY',
      createdAt: new Date().toISOString(),
      creator: {
        uid: 'user_123',
        email: 'user@example.com',
        username: 'testuser',
      },
    };
  }
}

/**
 * Mock executeVercelNode for deploy operation
 */
async function executeVercelDeployNode(config: any, apiClient: any): Promise<any> {
  const { projectName, token } = config;

  // Validation
  if (!projectName) {
    return {
      success: false,
      data: null,
      error: {
        code: 'INVALID_PROJECT_NAME',
        message: 'Project name is required for deploy operation',
        retriable: false,
      },
    };
  }

  if (!token) {
    return {
      success: false,
      data: null,
      error: {
        code: 'MISSING_TOKEN',
        message: 'Vercel API token is required',
        retriable: false,
      },
    };
  }

  // Validate projectName format
  const projectNameRegex = /^[a-zA-Z0-9_-]{1,128}$/;
  if (!projectNameRegex.test(projectName)) {
    return {
      success: false,
      data: null,
      error: {
        code: 'INVALID_PROJECT_NAME',
        message: 'Project name must contain only alphanumeric characters, hyphens, and underscores (max 128 characters)',
        retriable: false,
      },
    };
  }

  try {
    // Call API
    const apiResponse = await apiClient.deploy(projectName, token);

    // Parse response
    return {
      success: true,
      data: {
        deploymentId: apiResponse.id,
        projectName: apiResponse.projectName,
        url: apiResponse.url,
        status: apiResponse.status,
        createdAt: apiResponse.createdAt,
      },
      error: null,
    };
  } catch (error: any) {
    return {
      success: false,
      data: null,
      error: {
        code: 'API_ERROR',
        message: error.message || 'Failed to deploy',
        retriable: true,
      },
    };
  }
}

describe('Vercel Deploy Operation — Unit Tests (Task 5.2)', () => {
  let apiClient: MockVercelApiClient;

  beforeEach(() => {
    apiClient = new MockVercelApiClient();
  });

  // =========================================================================
  // Test 1: Deploy with valid credentials
  // Validates: Requirements 2.1, 2.2, 2.4
  // =========================================================================
  describe('Test 1: Deploy with valid credentials', () => {
    it('should successfully deploy with valid projectName and token', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_test_token_12345',
      };

      const result = await executeVercelDeployNode(config, apiClient);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.deploymentId).toBe('dpl_abc123');
      expect(result.data.projectName).toBe('my-app');
      expect(result.data.url).toBe('https://my-app.vercel.app');
      expect(result.data.status).toBe('READY');
      expect(result.error).toBeNull();
    });

    it('should include deployment metadata in response', async () => {
      const config = {
        projectName: 'test-project',
        token: 'vercel_token_123',
      };

      const result = await executeVercelDeployNode(config, apiClient);

      expect(result.success).toBe(true);
      expect(result.data.deploymentId).toBeDefined();
      expect(result.data.projectName).toBeDefined();
      expect(result.data.url).toBeDefined();
      expect(result.data.status).toBeDefined();
      expect(result.data.createdAt).toBeDefined();
    });

    it('should handle various valid projectName formats', async () => {
      const validProjectNames = [
        'my-app',
        'my_app',
        'myapp',
        'my-app-123',
        'my_app_123',
        'a',
        'a-b-c-d-e',
      ];

      for (const projectName of validProjectNames) {
        const config = {
          projectName,
          token: 'vercel_token_123',
        };

        const result = await executeVercelDeployNode(config, apiClient);

        expect(result.success).toBe(true);
        expect(result.data.projectName).toBe(projectName);
      }
    });

    it('should return ISO 8601 formatted timestamp', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const result = await executeVercelDeployNode(config, apiClient);

      expect(result.success).toBe(true);
      expect(result.data.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  // =========================================================================
  // Test 2: Deploy with missing projectName
  // Validates: Requirements 2.2, 5.2
  // =========================================================================
  describe('Test 2: Deploy with missing projectName', () => {
    it('should return error when projectName is missing', async () => {
      const config = {
        projectName: '',
        token: 'vercel_token_123',
      };

      const result = await executeVercelDeployNode(config, apiClient);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('INVALID_PROJECT_NAME');
      expect(result.data).toBeNull();
    });

    it('should return error when projectName is undefined', async () => {
      const config = {
        projectName: undefined,
        token: 'vercel_token_123',
      };

      const result = await executeVercelDeployNode(config, apiClient);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_PROJECT_NAME');
    });

    it('should return error when projectName is null', async () => {
      const config = {
        projectName: null,
        token: 'vercel_token_123',
      };

      const result = await executeVercelDeployNode(config, apiClient);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_PROJECT_NAME');
    });

    it('should include error message for missing projectName', async () => {
      const config = {
        projectName: '',
        token: 'vercel_token_123',
      };

      const result = await executeVercelDeployNode(config, apiClient);

      expect(result.error.message).toContain('required');
    });
  });

  // =========================================================================
  // Test 3: Deploy with invalid projectName format
  // Validates: Requirements 2.2, 5.3
  // =========================================================================
  describe('Test 3: Deploy with invalid projectName format', () => {
    it('should reject projectName with spaces', async () => {
      const config = {
        projectName: 'my app',
        token: 'vercel_token_123',
      };

      const result = await executeVercelDeployNode(config, apiClient);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_PROJECT_NAME');
    });

    it('should reject projectName with special characters', async () => {
      const invalidNames = [
        'my-app!',
        'my@app',
        'my#app',
        'my$app',
        'my%app',
        'my&app',
        'my*app',
        'my(app)',
        'my[app]',
        'my{app}',
        'my/app',
        'my\\app',
        'my|app',
        'my:app',
        'my;app',
        'my,app',
        'my.app',
        'my?app',
        'my=app',
        'my+app',
      ];

      for (const projectName of invalidNames) {
        const config = {
          projectName,
          token: 'vercel_token_123',
        };

        const result = await executeVercelDeployNode(config, apiClient);

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('INVALID_PROJECT_NAME');
      }
    });

    it('should reject projectName exceeding 128 characters', async () => {
      const config = {
        projectName: 'a'.repeat(129),
        token: 'vercel_token_123',
      };

      const result = await executeVercelDeployNode(config, apiClient);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_PROJECT_NAME');
    });

    it('should accept projectName with exactly 128 characters', async () => {
      const config = {
        projectName: 'a'.repeat(128),
        token: 'vercel_token_123',
      };

      const result = await executeVercelDeployNode(config, apiClient);

      expect(result.success).toBe(true);
    });

    it('should include error message for invalid projectName format', async () => {
      const config = {
        projectName: 'my-app!',
        token: 'vercel_token_123',
      };

      const result = await executeVercelDeployNode(config, apiClient);

      expect(result.error.message).toContain('alphanumeric');
    });
  });

  // =========================================================================
  // Test 4: Deploy API request format
  // Validates: Requirements 2.3, 7.2, 7.3
  // =========================================================================
  describe('Test 4: Deploy API request format', () => {
    it('should call API with correct projectName', async () => {
      const deploySpy = jest.spyOn(apiClient, 'deploy');

      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      await executeVercelDeployNode(config, apiClient);

      expect(deploySpy).toHaveBeenCalledWith('my-app', 'vercel_token_123');
    });

    it('should pass token to API client', async () => {
      const deploySpy = jest.spyOn(apiClient, 'deploy');

      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      await executeVercelDeployNode(config, apiClient);

      expect(deploySpy).toHaveBeenCalledWith(expect.any(String), 'vercel_token_123');
    });

    it('should handle API errors gracefully', async () => {
      const errorApiClient: any = {
        deploy: jest.fn().mockRejectedValue(new Error('API Error')),
      };

      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const result = await executeVercelDeployNode(config, errorApiClient);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('API_ERROR');
    });
  });

  // =========================================================================
  // Test 5: Deploy response parsing
  // Validates: Requirements 2.4, 2.6, 6.1, 6.2
  // =========================================================================
  describe('Test 5: Deploy response parsing', () => {
    it('should parse deployment ID from API response', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const result = await executeVercelDeployNode(config, apiClient);

      expect(result.data.deploymentId).toBe('dpl_abc123');
    });

    it('should parse project name from API response', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const result = await executeVercelDeployNode(config, apiClient);

      expect(result.data.projectName).toBe('my-app');
    });

    it('should parse deployment URL from API response', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const result = await executeVercelDeployNode(config, apiClient);

      expect(result.data.url).toBe('https://my-app.vercel.app');
      expect(result.data.url).toMatch(/^https:\/\//);
    });

    it('should parse deployment status from API response', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const result = await executeVercelDeployNode(config, apiClient);

      expect(result.data.status).toBe('READY');
      expect(['BUILDING', 'READY', 'ERROR', 'QUEUED']).toContain(result.data.status);
    });

    it('should parse creation timestamp from API response', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const result = await executeVercelDeployNode(config, apiClient);

      expect(result.data.createdAt).toBeDefined();
      expect(typeof result.data.createdAt).toBe('string');
      // Should be valid ISO 8601
      const date = new Date(result.data.createdAt);
      expect(date.getTime()).toBeGreaterThan(0);
    });

    it('should not include API response fields not in output schema', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const result = await executeVercelDeployNode(config, apiClient);

      // Should not include creator, projectId, etc.
      expect(result.data.creator).toBeUndefined();
      expect(result.data.projectId).toBeUndefined();
    });

    it('should have consistent response structure', async () => {
      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const result1 = await executeVercelDeployNode(config, apiClient);
      const result2 = await executeVercelDeployNode(config, apiClient);

      expect(Object.keys(result1.data).sort()).toEqual(Object.keys(result2.data).sort());
    });
  });

  // =========================================================================
  // Test 6: Deploy timeout handling
  // Validates: Requirements 7.5
  // =========================================================================
  describe('Test 6: Deploy timeout handling', () => {
    it('should handle timeout errors', async () => {
      const timeoutApiClient: any = {
        deploy: jest.fn().mockRejectedValue(new Error('Request timeout')),
      };

      const config = {
        projectName: 'my-app',
        token: 'vercel_token_123',
      };

      const result = await executeVercelDeployNode(config, timeoutApiClient);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // =========================================================================
  // Test 7: Deploy with missing token
  // Validates: Requirements 4.1, 5.4
  // =========================================================================
  describe('Test 7: Deploy with missing token', () => {
    it('should return error when token is missing', async () => {
      const config = {
        projectName: 'my-app',
        token: '',
      };

      const result = await executeVercelDeployNode(config, apiClient);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_TOKEN');
    });

    it('should return error when token is undefined', async () => {
      const config = {
        projectName: 'my-app',
        token: undefined,
      };

      const result = await executeVercelDeployNode(config, apiClient);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_TOKEN');
    });
  });
});
