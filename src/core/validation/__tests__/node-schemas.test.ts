/**
 * Phase 3: Validation Schema Tests
 * 
 * Tests for Zod schema validation of node configurations.
 * Ensures validation catches common errors and provides helpful messages.
 */

import { describe, it, expect } from '@jest/globals';
import {
  JavaScriptNodeConfigSchema,
  HttpRequestNodeConfigSchema,
  AiAgentNodeConfigSchema,
  SetVariableNodeConfigSchema,
  LogNodeConfigSchema,
  MathNodeConfigSchema,
  validateNodeConfig,
  formatValidationError,
} from '../node-schemas';

describe('Node Schema Validation', () => {
  describe('JavaScriptNodeConfigSchema', () => {
    it('should validate valid JavaScript node config', () => {
      const config = {
        code: 'return input.value * 2;',
        timeout: 5000,
      };
      
      const result = JavaScriptNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.code).toBe('return input.value * 2;');
        expect(result.data.timeout).toBe(5000);
      }
    });

    it('should reject empty code', () => {
      const config = {
        code: '',
      };
      
      const result = JavaScriptNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Code is required');
      }
    });

    it('should reject missing code', () => {
      const config = {};
      
      const result = JavaScriptNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should enforce timeout limits', () => {
      const config = {
        code: 'return 1;',
        timeout: 50, // Too low
      };
      
      const result = JavaScriptNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 100ms');
      }
    });

    it('should enforce maximum timeout', () => {
      const config = {
        code: 'return 1;',
        timeout: 50000, // Too high
      };
      
      const result = JavaScriptNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('30 seconds');
      }
    });

    it('should use default timeout when not provided', () => {
      const config = {
        code: 'return 1;',
      };
      
      const result = JavaScriptNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timeout).toBe(5000);
      }
    });
  });

  describe('HttpRequestNodeConfigSchema', () => {
    it('should validate valid HTTP request config', () => {
      const config = {
        url: 'https://api.example.com/data',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: 'value' },
      };
      
      const result = HttpRequestNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid URL', () => {
      const config = {
        url: 'not-a-valid-url',
        method: 'GET',
      };
      
      const result = HttpRequestNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Valid URL');
      }
    });

    it('should reject empty URL', () => {
      const config = {
        url: '',
        method: 'GET',
      };
      
      const result = HttpRequestNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject invalid HTTP method', () => {
      const config = {
        url: 'https://api.example.com',
        method: 'INVALID',
      };
      
      const result = HttpRequestNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Method must be one of');
      }
    });

    it('should use default method when not provided', () => {
      const config = {
        url: 'https://api.example.com',
      };
      
      const result = HttpRequestNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.method).toBe('GET');
      }
    });

    it('should enforce timeout limits', () => {
      const config = {
        url: 'https://api.example.com',
        timeout: 500, // Too low
      };
      
      const result = HttpRequestNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('AiAgentNodeConfigSchema', () => {
    it('should validate valid AI agent config', () => {
      const config = {
        systemPrompt: 'You are a helpful assistant',
        mode: 'chat',
        model: 'qwen2.5:14b-instruct-q4_K_M',
        temperature: 0.7,
      };
      
      const result = AiAgentNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid mode', () => {
      const config = {
        systemPrompt: 'Test',
        mode: 'invalid',
      };
      
      const result = AiAgentNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Mode must be one of');
      }
    });

    it('should enforce temperature limits', () => {
      const config = {
        systemPrompt: 'Test',
        temperature: 3.0, // Too high
      };
      
      const result = AiAgentNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('cannot exceed 2');
      }
    });

    it('should use default system prompt when not provided', () => {
      const config = {
        mode: 'chat',
      };
      
      const result = AiAgentNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.systemPrompt).toContain('autonomous intelligent agent');
      }
    });
  });

  describe('SetVariableNodeConfigSchema', () => {
    it('should validate valid set variable config', () => {
      const config = {
        name: 'myVariable',
        value: '{{input.value}}',
      };
      
      const result = SetVariableNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid variable name', () => {
      const config = {
        name: '123invalid', // Starts with number
        value: 'test',
      };
      
      const result = SetVariableNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('valid identifier');
      }
    });

    it('should reject empty variable name', () => {
      const config = {
        name: '',
        value: 'test',
      };
      
      const result = SetVariableNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('LogNodeConfigSchema', () => {
    it('should validate valid log config', () => {
      const config = {
        message: 'Debug: {{input}}',
        level: 'info',
      };
      
      const result = LogNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid log level', () => {
      const config = {
        message: 'Test',
        level: 'invalid',
      };
      
      const result = LogNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should use default level when not provided', () => {
      const config = {
        message: 'Test',
      };
      
      const result = LogNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.level).toBe('info');
      }
    });
  });

  describe('MathNodeConfigSchema', () => {
    it('should validate valid math config', () => {
      const config = {
        operation: 'add',
        values: [1, 2, 3],
        precision: 2,
      };
      
      const result = MathNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid operation', () => {
      const config = {
        operation: 'invalid',
      };
      
      const result = MathNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should enforce precision limits', () => {
      const config = {
        operation: 'add',
        precision: 15, // Too high
      };
      
      const result = MathNodeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('validateNodeConfig', () => {
    it('should return success for valid config', () => {
      const config = {
        code: 'return 1;',
      };
      
      const result = validateNodeConfig('javascript', config, 'node-1');
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should return error for invalid config', () => {
      const config = {
        code: '', // Empty code
      };
      
      const result = validateNodeConfig('javascript', config, 'node-1');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.nodeId).toBe('node-1');
      expect(result.error?.nodeType).toBe('javascript');
    });

    it('should handle unknown node types gracefully', () => {
      const config = {
        someField: 'value',
      };
      
      const result = validateNodeConfig('unknown_type', config, 'node-1');
      expect(result.success).toBe(true); // Should allow unknown types (backward compatibility)
    });
  });

  describe('formatValidationError', () => {
    it('should format validation error with suggestions', () => {
      const error = {
        message: 'Validation failed',
        nodeId: 'node-1',
        nodeType: 'javascript',
        field: 'timeout',
        issues: [
          {
            code: 'too_small',
            minimum: 100,
            path: ['timeout'],
            message: 'Timeout must be at least 100ms',
          } as any,
        ],
        suggestions: ['Minimum value: 100'],
      };
      
      const formatted = formatValidationError(error);
      expect(formatted).toContain('Validation failed');
      expect(formatted).toContain('Suggestions:');
      expect(formatted).toContain('Minimum value: 100');
    });
  });
});
