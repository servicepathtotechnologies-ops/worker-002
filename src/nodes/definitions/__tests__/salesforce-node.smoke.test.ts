/**
 * Salesforce Node Smoke Tests
 *
 * Validates: Requirements 3.1, 3.3, 4.4, 16.1, 19.1, 19.5
 */

import { nodeDefinitionRegistry } from '../../../core/types/node-definition';
import { ConnectorRegistry } from '../../../services/connectors/connector-registry';
import { salesforceNodeDefinition } from '../salesforce-node';

describe('Salesforce Node Smoke Tests', () => {
  describe('Registry Registration', () => {
    it('should be registered in nodeDefinitionRegistry', () => {
      const definition = nodeDefinitionRegistry.get('salesforce');
      expect(definition).toBeDefined();
    });

    it('should have all required definition fields', () => {
      const definition = nodeDefinitionRegistry.get('salesforce');
      expect(definition!.type).toBe('salesforce');
      expect(definition!.inputSchema).toBeDefined();
      expect(definition!.outputSchema).toBeDefined();
      expect(definition!.validateInputs).toBeDefined();
      expect(definition!.defaultInputs).toBeDefined();
    });

    it('should have resource and operation in inputSchema with ui.options', () => {
      const schema = salesforceNodeDefinition.inputSchema;
      expect(schema.resource).toBeDefined();
      expect(schema.operation).toBeDefined();
      expect((schema.resource as any).ui?.options).toBeDefined();
      expect(Array.isArray((schema.resource as any).ui?.options)).toBe(true);
      expect((schema.operation as any).ui?.options).toBeDefined();
      expect(Array.isArray((schema.operation as any).ui?.options)).toBe(true);
    });

    it('should have sensible defaultInputs', () => {
      const defaults = salesforceNodeDefinition.defaultInputs();
      expect(defaults.resource).toBe('account');
      expect(defaults.operation).toBe('get');
      expect(defaults.returnAll).toBe(false);
      expect(defaults.limit).toBe(50);
      expect(defaults.apiVersion).toBe('v59.0');
    });

    it('should pass validation with default inputs', () => {
      const defaults = salesforceNodeDefinition.defaultInputs();
      // get operation requires recordId — provide one for the smoke test
      const validation = salesforceNodeDefinition.validateInputs({ ...defaults, recordId: 'test-id-123' });
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('Connector Registry', () => {
    it('should be registered in ConnectorRegistry', () => {
      const registry = new ConnectorRegistry();
      const connector = registry.getConnectorByNodeType('salesforce');
      expect(connector).toBeDefined();
    });

    it('should have correct connector id and provider', () => {
      const registry = new ConnectorRegistry();
      const connector = registry.getConnectorByNodeType('salesforce');
      expect(connector!.id).toBe('salesforce');
      expect(connector!.provider).toBe('salesforce');
    });

    it('should have salesforce in nodeTypes', () => {
      const registry = new ConnectorRegistry();
      const connector = registry.getConnectorByNodeType('salesforce');
      expect(connector!.nodeTypes).toContain('salesforce');
    });

    it('should have oauth credential contract with correct vaultKey', () => {
      const registry = new ConnectorRegistry();
      const connector = registry.getConnectorByNodeType('salesforce');
      expect(connector!.credentialContract.type).toBe('oauth');
      expect(connector!.credentialContract.vaultKey).toBe('salesforce');
    });

    it('should have required CRM capabilities', () => {
      const registry = new ConnectorRegistry();
      const connector = registry.getConnectorByNodeType('salesforce');
      expect(connector!.capabilities).toContain('crm.read');
      expect(connector!.capabilities).toContain('crm.write');
    });
  });

  describe('Input Validation', () => {
    it('should require recordId for get operation', () => {
      const validation = salesforceNodeDefinition.validateInputs({ resource: 'account', operation: 'get' });
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('recordId'))).toBe(true);
    });

    it('should require lastName for contact create', () => {
      const validation = salesforceNodeDefinition.validateInputs({ resource: 'contact', operation: 'create' });
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('lastName'))).toBe(true);
    });

    it('should require lastName and company for lead create', () => {
      const validation = salesforceNodeDefinition.validateInputs({ resource: 'lead', operation: 'create' });
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('lastName'))).toBe(true);
      expect(validation.errors.some(e => e.includes('company'))).toBe(true);
    });

    it('should require soqlQuery for query operation', () => {
      const validation = salesforceNodeDefinition.validateInputs({ resource: 'account', operation: 'query' });
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('soqlQuery'))).toBe(true);
    });

    it('should require customObject when resource is custom', () => {
      const validation = salesforceNodeDefinition.validateInputs({ resource: 'custom', operation: 'get', recordId: 'abc' });
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('customObject'))).toBe(true);
    });

    it('should pass validation for valid account search', () => {
      const validation = salesforceNodeDefinition.validateInputs({ resource: 'account', operation: 'search' });
      expect(validation.valid).toBe(true);
    });
  });
});
