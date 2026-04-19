/**
 * Comprehensive Validation and Logging Tests for Amazon SES Node
 * 
 * Tests for:
 * - validateAmazonSesConfig() - Complete configuration validation
 * - validateConfigAgainstSchema() - Schema-based validation
 * - logEmailAttempt() - Email sending audit logging
 * - logDetailedError() - Error logging
 * 
 * Requirements: 1.1, 2.1, 3.1, 4.1, 5.3, 7.4
 */

import type { SupabaseClient } from '@supabase/supabase-js';

describe('Amazon SES Comprehensive Validation and Logging', () => {
  describe('validateAmazonSesConfig()', () => {
    it('should validate complete valid configuration', async () => {
      const { validateAmazonSesConfig } = await import('../execute-workflow');
      
      const config = {
        recipients: { to: ['user@example.com'], cc: [], bcc: [] },
        subject: 'Test Subject',
        body: 'Test Body',
        fromAddress: 'sender@example.com',
        awsRegion: 'us-east-1',
      };

      const result = validateAmazonSesConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing recipients', async () => {
      const { validateAmazonSesConfig } = await import('../execute-workflow');
      
      const config = {
        recipients: { to: [], cc: [], bcc: [] },
        subject: 'Test Subject',
        body: 'Test Body',
        fromAddress: 'sender@example.com',
      };

      const result = validateAmazonSesConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('recipient'))).toBe(true);
    });

    it('should detect missing subject', async () => {
      const { validateAmazonSesConfig } = await import('../execute-workflow');
      
      const config = {
        recipients: { to: ['user@example.com'], cc: [], bcc: [] },
        subject: '',
        body: 'Test Body',
        fromAddress: 'sender@example.com',
      };

      const result = validateAmazonSesConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Subject'))).toBe(true);
    });

    it('should detect missing body when not using template', async () => {
      const { validateAmazonSesConfig } = await import('../execute-workflow');
      
      const config = {
        recipients: { to: ['user@example.com'], cc: [], bcc: [] },
        subject: 'Test Subject',
        body: '',
        fromAddress: 'sender@example.com',
        useTemplate: false,
      };

      const result = validateAmazonSesConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Body'))).toBe(true);
    });

    it('should detect missing template name when useTemplate is true', async () => {
      const { validateAmazonSesConfig } = await import('../execute-workflow');
      
      const config = {
        recipients: { to: ['user@example.com'], cc: [], bcc: [] },
        subject: 'Test Subject',
        fromAddress: 'sender@example.com',
        useTemplate: true,
        templateName: '',
      };

      const result = validateAmazonSesConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Template name'))).toBe(true);
    });

    it('should detect invalid from address', async () => {
      const { validateAmazonSesConfig } = await import('../execute-workflow');
      
      const config = {
        recipients: { to: ['user@example.com'], cc: [], bcc: [] },
        subject: 'Test Subject',
        body: 'Test Body',
        fromAddress: 'invalid-email',
      };

      const result = validateAmazonSesConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('from address') || e.includes('From address'))).toBe(true);
    });

    it('should detect invalid AWS region', async () => {
      const { validateAmazonSesConfig } = await import('../execute-workflow');
      
      const config = {
        recipients: { to: ['user@example.com'], cc: [], bcc: [] },
        subject: 'Test Subject',
        body: 'Test Body',
        fromAddress: 'sender@example.com',
        awsRegion: 'invalid-region',
      };

      const result = validateAmazonSesConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('AWS region'))).toBe(true);
    });

    it('should warn about missing reply-to addresses', async () => {
      const { validateAmazonSesConfig } = await import('../execute-workflow');
      
      const config = {
        recipients: { to: ['user@example.com'], cc: [], bcc: [] },
        subject: 'Test Subject',
        body: 'Test Body',
        fromAddress: 'sender@example.com',
      };

      const result = validateAmazonSesConfig(config);

      expect(result.warnings.some(w => w.includes('reply-to'))).toBe(true);
    });

    it('should aggregate multiple errors', async () => {
      const { validateAmazonSesConfig } = await import('../execute-workflow');
      
      const config = {
        recipients: { to: [], cc: [], bcc: [] },
        subject: '',
        body: '',
        fromAddress: 'invalid-email',
        awsRegion: 'invalid-region',
      };

      const result = validateAmazonSesConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('validateConfigAgainstSchema()', () => {
    it('should validate config against schema', async () => {
      const { validateConfigAgainstSchema } = await import('../execute-workflow');
      
      const config = {
        recipients: { to: ['user@example.com'] },
        subject: 'Test',
        body: 'Test',
      };

      const schema = {
        configSchema: {
          required: ['recipients', 'subject', 'body'],
          optional: {
            fromAddress: { type: 'string' },
            awsRegion: { type: 'string' },
          },
        },
      };

      const result = validateConfigAgainstSchema(config, schema);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.missingRequired).toHaveLength(0);
    });

    it('should detect missing required fields', async () => {
      const { validateConfigAgainstSchema } = await import('../execute-workflow');
      
      const config = {
        recipients: { to: ['user@example.com'] },
        // subject is missing
        body: 'Test',
      };

      const schema = {
        configSchema: {
          required: ['recipients', 'subject', 'body'],
          optional: {},
        },
      };

      const result = validateConfigAgainstSchema(config, schema);

      expect(result.valid).toBe(false);
      expect(result.missingRequired).toContain('subject');
      expect(result.errors.some(e => e.includes('subject'))).toBe(true);
    });

    it('should detect invalid field types', async () => {
      const { validateConfigAgainstSchema } = await import('../execute-workflow');
      
      const config = {
        recipients: { to: ['user@example.com'] },
        subject: 'Test',
        body: 'Test',
        fromAddress: 123, // Should be string
      };

      const schema = {
        configSchema: {
          required: ['recipients', 'subject', 'body'],
          optional: {
            fromAddress: { type: 'string' },
          },
        },
      };

      const result = validateConfigAgainstSchema(config, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('fromAddress'))).toBe(true);
    });

    it('should handle multiple missing required fields', async () => {
      const { validateConfigAgainstSchema } = await import('../execute-workflow');
      
      const config = {
        // All fields missing
      };

      const schema = {
        configSchema: {
          required: ['recipients', 'subject', 'body'],
          optional: {},
        },
      };

      const result = validateConfigAgainstSchema(config, schema);

      expect(result.valid).toBe(false);
      expect(result.missingRequired.length).toBe(3);
    });
  });

  describe('logEmailAttempt()', () => {
    it('should log successful email attempt', async () => {
      const { logEmailAttempt } = await import('../execute-workflow');
      
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockResolvedValue({ error: null }),
        }),
      } as any;

      const logData = {
        workflowId: 'workflow-123',
        nodeId: 'node-456',
        recipients: { to: ['user@example.com'], cc: [], bcc: [] },
        subject: 'Test Email',
        status: 'sent' as const,
        messageId: 'msg-789',
        timestamp: new Date().toISOString(),
      };

      await logEmailAttempt(mockSupabase, logData);

      expect(mockSupabase.from).toHaveBeenCalledWith('workflow_email_logs');
      expect(mockSupabase.from().insert).toHaveBeenCalled();
    });

    it('should log failed email attempt with error', async () => {
      const { logEmailAttempt } = await import('../execute-workflow');
      
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockResolvedValue({ error: null }),
        }),
      } as any;

      const logData = {
        workflowId: 'workflow-123',
        nodeId: 'node-456',
        recipients: { to: ['user@example.com'], cc: [], bcc: [] },
        subject: 'Test Email',
        status: 'failed' as const,
        error: 'Unverified sender',
        errorCode: 'MessageRejected',
        timestamp: new Date().toISOString(),
      };

      await logEmailAttempt(mockSupabase, logData);

      expect(mockSupabase.from).toHaveBeenCalledWith('workflow_email_logs');
      const insertCall = mockSupabase.from().insert.mock.calls[0][0];
      expect(insertCall.error).toBe('Unverified sender');
      expect(insertCall.error_code).toBe('MessageRejected');
    });

    it('should handle logging errors gracefully', async () => {
      const { logEmailAttempt } = await import('../execute-workflow');
      
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockResolvedValue({ error: new Error('DB error') }),
        }),
      } as any;

      const logData = {
        workflowId: 'workflow-123',
        nodeId: 'node-456',
        recipients: { to: ['user@example.com'], cc: [], bcc: [] },
        subject: 'Test Email',
        status: 'sent' as const,
        timestamp: new Date().toISOString(),
      };

      // Should not throw
      await expect(logEmailAttempt(mockSupabase, logData)).resolves.toBeUndefined();
    });
  });

  describe('logDetailedError()', () => {
    it('should log AWS error', async () => {
      const { logDetailedError } = await import('../execute-workflow');
      
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockResolvedValue({ error: null }),
        }),
      } as any;

      const errorData = {
        workflowId: 'workflow-123',
        nodeId: 'node-456',
        errorType: 'aws_error' as const,
        errorCode: 'MessageRejected',
        errorMessage: 'Email was rejected by AWS SES',
        timestamp: new Date().toISOString(),
      };

      await logDetailedError(mockSupabase, errorData);

      expect(mockSupabase.from).toHaveBeenCalledWith('workflow_error_logs');
      expect(mockSupabase.from().insert).toHaveBeenCalled();
    });

    it('should log validation error with context', async () => {
      const { logDetailedError } = await import('../execute-workflow');
      
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockResolvedValue({ error: null }),
        }),
      } as any;

      const errorData = {
        workflowId: 'workflow-123',
        nodeId: 'node-456',
        errorType: 'validation_error' as const,
        errorMessage: 'Invalid email address',
        context: { field: 'fromAddress', value: 'invalid' },
        timestamp: new Date().toISOString(),
      };

      await logDetailedError(mockSupabase, errorData);

      const insertCall = mockSupabase.from().insert.mock.calls[0][0];
      expect(insertCall.error_type).toBe('validation_error');
      expect(insertCall.context).toEqual({ field: 'fromAddress', value: 'invalid' });
    });

    it('should log retry attempt with backoff delay', async () => {
      const { logDetailedError } = await import('../execute-workflow');
      
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockResolvedValue({ error: null }),
        }),
      } as any;

      const errorData = {
        workflowId: 'workflow-123',
        nodeId: 'node-456',
        errorType: 'aws_error' as const,
        errorCode: 'ThrottlingException',
        errorMessage: 'Rate limit exceeded',
        retryAttempt: 2,
        backoffDelayMs: 2000,
        timestamp: new Date().toISOString(),
      };

      await logDetailedError(mockSupabase, errorData);

      const insertCall = mockSupabase.from().insert.mock.calls[0][0];
      expect(insertCall.retry_attempt).toBe(2);
      expect(insertCall.backoff_delay_ms).toBe(2000);
    });

    it('should handle logging errors gracefully', async () => {
      const { logDetailedError } = await import('../execute-workflow');
      
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockResolvedValue({ error: new Error('DB error') }),
        }),
      } as any;

      const errorData = {
        workflowId: 'workflow-123',
        nodeId: 'node-456',
        errorType: 'aws_error' as const,
        errorMessage: 'Test error',
        timestamp: new Date().toISOString(),
      };

      // Should not throw
      await expect(logDetailedError(mockSupabase, errorData)).resolves.toBeUndefined();
    });
  });
});
