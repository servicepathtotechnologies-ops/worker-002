/**
 * Node Validation Tests
 * 
 * Tests for each node's validateInputs() and defaultInputs() methods.
 */

import { nodeDefinitionRegistry } from '../../../core/types/node-definition';

describe('Node Validation Tests', () => {
  describe('If/Else Node', () => {
    it('should validate valid conditions array', () => {
      const definition = nodeDefinitionRegistry.get('if_else');
      expect(definition).toBeDefined();

      const validation = definition!.validateInputs({
        conditions: [
          { expression: '{{input.age}} >= 18' }
        ]
      });

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject missing conditions', () => {
      const definition = nodeDefinitionRegistry.get('if_else');
      const validation = definition!.validateInputs({});

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should return valid default inputs', () => {
      const definition = nodeDefinitionRegistry.get('if_else');
      const defaults = definition!.defaultInputs();

      expect(defaults).toHaveProperty('conditions');
      expect(Array.isArray(defaults.conditions)).toBe(true);
    });
  });

  describe('Manual Trigger Node', () => {
    it('should validate empty inputs (no required fields)', () => {
      const definition = nodeDefinitionRegistry.get('manual_trigger');
      expect(definition).toBeDefined();

      const validation = definition!.validateInputs({});

      expect(validation.valid).toBe(true);
    });

    it('should return valid default inputs', () => {
      const definition = nodeDefinitionRegistry.get('manual_trigger');
      const defaults = definition!.defaultInputs();

      expect(defaults).toEqual({});
    });
  });

  describe('Webhook Trigger Node', () => {
    it('should validate with optional method', () => {
      const definition = nodeDefinitionRegistry.get('webhook');
      expect(definition).toBeDefined();

      const validation = definition!.validateInputs({
        method: 'POST'
      });

      expect(validation.valid).toBe(true);
    });

    it('should validate without method (optional)', () => {
      const definition = nodeDefinitionRegistry.get('webhook');
      const validation = definition!.validateInputs({});

      expect(validation.valid).toBe(true);
    });
  });

  describe('Schedule Trigger Node', () => {
    it('should validate with required time and timezone', () => {
      const definition = nodeDefinitionRegistry.get('schedule');
      expect(definition).toBeDefined();

      const validation = definition!.validateInputs({
        time: '0 9 * * *',
        timezone: 'UTC'
      });

      expect(validation.valid).toBe(true);
    });

    it('should reject missing required fields', () => {
      const definition = nodeDefinitionRegistry.get('schedule');
      const validation = definition!.validateInputs({});

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Interval Trigger Node', () => {
    it('should validate with required interval', () => {
      const definition = nodeDefinitionRegistry.get('interval');
      expect(definition).toBeDefined();

      const validation = definition!.validateInputs({
        interval: '10m'
      });

      expect(validation.valid).toBe(true);
    });

    it('should reject missing interval', () => {
      const definition = nodeDefinitionRegistry.get('interval');
      const validation = definition!.validateInputs({});

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('JavaScript Node', () => {
    it('should validate with required code', () => {
      const definition = nodeDefinitionRegistry.get('javascript');
      expect(definition).toBeDefined();

      const validation = definition!.validateInputs({
        code: 'return input.data;'
      });

      expect(validation.valid).toBe(true);
    });

    it('should reject missing code', () => {
      const definition = nodeDefinitionRegistry.get('javascript');
      const validation = definition!.validateInputs({});

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Log Output Node', () => {
    it('should validate with required message', () => {
      const definition = nodeDefinitionRegistry.get('log_output');
      expect(definition).toBeDefined();

      const validation = definition!.validateInputs({
        message: 'Test log message'
      });

      expect(validation.valid).toBe(true);
    });

    it('should reject missing message', () => {
      const definition = nodeDefinitionRegistry.get('log_output');
      const validation = definition!.validateInputs({});

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('HTTP Request Node', () => {
    it('should validate with required url and method', () => {
      const definition = nodeDefinitionRegistry.get('http_request');
      expect(definition).toBeDefined();

      const validation = definition!.validateInputs({
        url: 'https://api.example.com',
        method: 'GET'
      });

      expect(validation.valid).toBe(true);
    });

    it('should reject missing required fields', () => {
      const definition = nodeDefinitionRegistry.get('http_request');
      const validation = definition!.validateInputs({});

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('All Nodes', () => {
    it('should have defaultInputs that pass validation', () => {
      const allDefinitions = nodeDefinitionRegistry.getAll();

      for (const definition of allDefinitions) {
        const defaults = definition.defaultInputs();
        const validation = definition.validateInputs(defaults);

        expect(validation.valid).toBe(true);
      }
    });
  });

  describe('Google Cloud Storage Node', () => {
    it('should validate with all required fields', () => {
      const definition = nodeDefinitionRegistry.get('google_cloud_storage');
      expect(definition).toBeDefined();

      const validation = definition!.validateInputs({
        projectId: 'my-project',
        clientEmail: 'sa@project.iam.gserviceaccount.com',
        privateKey: '-----BEGIN PRIVATE KEY-----',
        operation: 'upload',
        bucket: 'my-bucket',
      });

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject missing projectId', () => {
      const definition = nodeDefinitionRegistry.get('google_cloud_storage');
      const validation = definition!.validateInputs({
        clientEmail: 'sa@project.iam.gserviceaccount.com',
        privateKey: '-----BEGIN PRIVATE KEY-----',
        operation: 'upload',
        bucket: 'my-bucket',
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('projectId is required');
    });

    it('should reject missing clientEmail', () => {
      const definition = nodeDefinitionRegistry.get('google_cloud_storage');
      const validation = definition!.validateInputs({
        projectId: 'my-project',
        privateKey: '-----BEGIN PRIVATE KEY-----',
        operation: 'upload',
        bucket: 'my-bucket',
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('clientEmail is required');
    });

    it('should reject missing privateKey', () => {
      const definition = nodeDefinitionRegistry.get('google_cloud_storage');
      const validation = definition!.validateInputs({
        projectId: 'my-project',
        clientEmail: 'sa@project.iam.gserviceaccount.com',
        operation: 'upload',
        bucket: 'my-bucket',
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('privateKey is required');
    });

    it('should reject missing operation', () => {
      const definition = nodeDefinitionRegistry.get('google_cloud_storage');
      const validation = definition!.validateInputs({
        projectId: 'my-project',
        clientEmail: 'sa@project.iam.gserviceaccount.com',
        privateKey: '-----BEGIN PRIVATE KEY-----',
        bucket: 'my-bucket',
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('operation is required');
    });

    it('should reject invalid operation', () => {
      const definition = nodeDefinitionRegistry.get('google_cloud_storage');
      const validation = definition!.validateInputs({
        projectId: 'my-project',
        clientEmail: 'sa@project.iam.gserviceaccount.com',
        privateKey: '-----BEGIN PRIVATE KEY-----',
        operation: 'invalid_op',
        bucket: 'my-bucket',
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('operation must be one of');
    });

    it('should reject missing bucket', () => {
      const definition = nodeDefinitionRegistry.get('google_cloud_storage');
      const validation = definition!.validateInputs({
        projectId: 'my-project',
        clientEmail: 'sa@project.iam.gserviceaccount.com',
        privateKey: '-----BEGIN PRIVATE KEY-----',
        operation: 'upload',
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('bucket is required');
    });

    it('should accept valid operations', () => {
      const definition = nodeDefinitionRegistry.get('google_cloud_storage');
      const validOps = ['upload', 'download', 'delete', 'list'];

      for (const op of validOps) {
        const validation = definition!.validateInputs({
          projectId: 'my-project',
          clientEmail: 'sa@project.iam.gserviceaccount.com',
          privateKey: '-----BEGIN PRIVATE KEY-----',
          operation: op,
          bucket: 'my-bucket',
        });

        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }
    });

    it('should return valid default inputs', () => {
      const definition = nodeDefinitionRegistry.get('google_cloud_storage');
      const defaults = definition!.defaultInputs();

      expect(defaults).toEqual({
        projectId: '',
        clientEmail: '',
        privateKey: '',
        operation: 'upload',
        bucket: '',
        fileName: '',
        fileContent: '',
        filter: '',
      });
    });

    it('should reject default inputs (empty required fields)', () => {
      const definition = nodeDefinitionRegistry.get('google_cloud_storage');
      const defaults = definition!.defaultInputs();
      const validation = definition!.validateInputs(defaults);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should have correct type, label, category, icon', () => {
      const definition = nodeDefinitionRegistry.get('google_cloud_storage');
      expect(definition).toBeDefined();
      expect(definition!.type).toBe('google_cloud_storage');
      expect(definition!.label).toBe('Google Cloud Storage');
      expect(definition!.category).toBe('database');
      expect(definition!.icon).toBe('Database');
    });

    it('should have correct requiredInputs', () => {
      const definition = nodeDefinitionRegistry.get('google_cloud_storage');
      expect(definition!.requiredInputs).toEqual([
        'projectId',
        'clientEmail',
        'privateKey',
        'operation',
        'bucket',
      ]);
    });

    it('should have correct ports', () => {
      const definition = nodeDefinitionRegistry.get('google_cloud_storage');
      expect(definition!.outgoingPorts).toEqual(['default']);
      expect(definition!.incomingPorts).toEqual(['default']);
      expect(definition!.isBranching).toBe(false);
    });

    it('should have runGCSNode as run function', () => {
      const definition = nodeDefinitionRegistry.get('google_cloud_storage');
      expect(definition!.run).toBeDefined();
      expect(typeof definition!.run).toBe('function');
    });
  });
});
