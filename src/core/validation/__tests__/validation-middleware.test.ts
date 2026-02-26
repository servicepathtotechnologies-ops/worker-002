/**
 * Phase 3: Validation Middleware Tests
 * 
 * Tests for validation middleware integration.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ValidationMiddleware } from '../validation-middleware';

describe('ValidationMiddleware', () => {
  let middleware: ValidationMiddleware;

  beforeEach(() => {
    middleware = new ValidationMiddleware({
      validateConfig: true,
      validateInput: false,
      validateOutput: false,
      validateTemplates: true,
      strict: false,
    });
  });

  describe('validateConfig', () => {
    it('should validate JavaScript node config', () => {
      const result = middleware.validateConfig('javascript', {
        code: 'return 1;',
        timeout: 5000,
      }, 'node-1');
      
      expect(result.success).toBe(true);
    });

    it('should reject invalid config', () => {
      const result = middleware.validateConfig('javascript', {
        code: '', // Empty code
      }, 'node-1');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should skip validation when disabled', () => {
      const noValidation = new ValidationMiddleware({
        validateConfig: false,
      });
      
      const result = noValidation.validateConfig('javascript', {
        code: '', // Invalid, but should pass
      }, 'node-1');
      
      expect(result.success).toBe(true);
    });
  });

  describe('validateTemplateValue', () => {
    it('should validate template value exists in context', () => {
      const context = {
        input: { value: 'test' },
        node1: { data: 'data' },
      };
      
      const result = middleware.validateTemplateValue(
        '{{input.value}}',
        'test',
        context
      );
      
      expect(result.valid).toBe(true);
    });

    it('should detect missing template path', () => {
      const context = {
        input: { value: 'test' },
      };
      
      const result = middleware.validateTemplateValue(
        '{{input.missing}}',
        undefined,
        context
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('non-existent field');
    });

    it('should skip validation when disabled', () => {
      const noValidation = new ValidationMiddleware({
        validateTemplates: false,
      });
      
      const result = noValidation.validateTemplateValue(
        '{{invalid.path}}',
        undefined,
        {}
      );
      
      expect(result.valid).toBe(true);
    });
  });

  describe('getErrors', () => {
    it('should track validation errors', () => {
      middleware.validateConfig('javascript', { code: '' }, 'node-1');
      middleware.validateConfig('http_request', { url: 'invalid' }, 'node-2');
      
      const errors = middleware.getErrors();
      expect(errors.length).toBe(2);
    });

    it('should clear errors', () => {
      middleware.validateConfig('javascript', { code: '' }, 'node-1');
      middleware.clearErrors();
      
      const errors = middleware.getErrors();
      expect(errors.length).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return validation statistics', () => {
      middleware.validateConfig('javascript', { code: '' }, 'node-1');
      
      const stats = middleware.getStats();
      expect(stats.totalErrors).toBe(1);
      expect(stats.configErrors).toBe(1);
    });
  });

  describe('hasSchema', () => {
    it('should check if node type has schema', () => {
      expect(middleware.hasSchema('javascript')).toBe(true);
      expect(middleware.hasSchema('http_request')).toBe(true);
      expect(middleware.hasSchema('unknown_type')).toBe(false);
    });
  });
});
