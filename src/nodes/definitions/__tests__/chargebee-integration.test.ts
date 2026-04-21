/**
 * Integration Tests: Chargebee Node Integration Verification
 * Feature: chargebee-node-integration
 *
 * Tasks: 10.1
 * Validates: Requirements 4.3, 3.2, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.13
 */

import { registerAllNodeDefinitions } from '../index';
import { nodeDefinitionRegistry } from '../../../core/types/node-definition';
import { chargebeeNodeDefinition } from '../chargebee-node';

// ─── Task 10.1 ────────────────────────────────────────────────────────────────
// Verify nodeDefinitionRegistry contains 'chargebee' after registerAllNodeDefinitions()
// Validates: Requirements 4.3

describe('Task 10.1 — nodeDefinitionRegistry contains chargebee after registration', () => {
  beforeAll(() => {
    // index.ts auto-registers on import, but call explicitly to be explicit
    registerAllNodeDefinitions();
  });

  test('nodeDefinitionRegistry.get("chargebee") returns a definition', () => {
    const def = nodeDefinitionRegistry.get('chargebee');
    expect(def).toBeDefined();
  });

  test('the chargebee definition has type "chargebee"', () => {
    const def = nodeDefinitionRegistry.get('chargebee');
    expect(def?.type).toBe('chargebee');
  });

  test('the chargebee definition has label "Chargebee"', () => {
    const def = nodeDefinitionRegistry.get('chargebee');
    expect(def?.label).toBe('Chargebee');
  });

  test('the chargebee definition has a non-empty category', () => {
    const def = nodeDefinitionRegistry.get('chargebee');
    expect(def?.category).toBeTruthy();
  });
});

// ─── Unit Tests: chargebeeNodeDefinition exported fields ──────────────────────
// Validates: Requirements 3.2

describe('chargebeeNodeDefinition exported fields', () => {
  test('type is "chargebee"', () => {
    expect(chargebeeNodeDefinition.type).toBe('chargebee');
  });

  test('label is "Chargebee"', () => {
    expect(chargebeeNodeDefinition.label).toBe('Chargebee');
  });

  test('category is "payment"', () => {
    expect(chargebeeNodeDefinition.category).toBe('payment');
  });

  test('icon is "CreditCard"', () => {
    expect(chargebeeNodeDefinition.icon).toBe('CreditCard');
  });

  test('version is 1', () => {
    expect(chargebeeNodeDefinition.version).toBe(1);
  });

  test('outgoingPorts is ["default"]', () => {
    expect(chargebeeNodeDefinition.outgoingPorts).toEqual(['default']);
  });

  test('isBranching is false', () => {
    expect(chargebeeNodeDefinition.isBranching).toBe(false);
  });

  test('requiredInputs includes "operation", "apiKey", "site"', () => {
    expect(chargebeeNodeDefinition.requiredInputs).toContain('operation');
    expect(chargebeeNodeDefinition.requiredInputs).toContain('apiKey');
    expect(chargebeeNodeDefinition.requiredInputs).toContain('site');
  });
});

// ─── Unit Tests: defaultInputs() ─────────────────────────────────────────────
// Validates: Requirements 3.11

describe('defaultInputs()', () => {
  test('operation defaults to "create_customer"', () => {
    const defaults = chargebeeNodeDefinition.defaultInputs();
    expect(defaults.operation).toBe('create_customer');
  });

  test('returns all fields populated with defaults', () => {
    const defaults = chargebeeNodeDefinition.defaultInputs();
    const expectedKeys = ['operation', 'apiKey', 'site', 'customerId', 'email', 'planId', 'subscriptionId'];
    for (const key of expectedKeys) {
      expect(defaults).toHaveProperty(key);
    }
  });

  test('returns { operation: "create_customer", apiKey: "", site: "" }', () => {
    const defaults = chargebeeNodeDefinition.defaultInputs();
    expect(defaults).toMatchObject({
      operation: 'create_customer',
      apiKey: '',
      site: '',
    });
  });
});

// ─── Unit Tests: validateInputs() ────────────────────────────────────────────
// Validates: Requirements 3.5, 3.6, 3.7, 3.8, 3.9, 3.10

describe('validateInputs()', () => {
  const baseValid = { apiKey: 'test-key', site: 'my-company' };

  // Validates: Requirements 3.5
  test('invalid operation returns { valid: false }', () => {
    const result = chargebeeNodeDefinition.validateInputs({
      ...baseValid,
      operation: 'invalid_operation',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('missing operation returns { valid: false }', () => {
    const result = chargebeeNodeDefinition.validateInputs({ ...baseValid });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // Validates: Requirements 3.6
  test('create_customer with valid email returns { valid: true }', () => {
    const result = chargebeeNodeDefinition.validateInputs({
      ...baseValid,
      operation: 'create_customer',
      email: 'user@example.com',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('create_customer with empty email returns { valid: false }', () => {
    const result = chargebeeNodeDefinition.validateInputs({
      ...baseValid,
      operation: 'create_customer',
      email: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('create_customer with missing email returns { valid: false }', () => {
    const result = chargebeeNodeDefinition.validateInputs({
      ...baseValid,
      operation: 'create_customer',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // Validates: Requirements 3.7
  test('create_subscription with valid customerId and planId returns { valid: true }', () => {
    const result = chargebeeNodeDefinition.validateInputs({
      ...baseValid,
      operation: 'create_subscription',
      customerId: 'cust-123',
      planId: 'plan-monthly',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('create_subscription with empty customerId returns { valid: false }', () => {
    const result = chargebeeNodeDefinition.validateInputs({
      ...baseValid,
      operation: 'create_subscription',
      customerId: '',
      planId: 'plan-monthly',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // Validates: Requirements 3.8
  test('create_subscription with empty planId returns { valid: false }', () => {
    const result = chargebeeNodeDefinition.validateInputs({
      ...baseValid,
      operation: 'create_subscription',
      customerId: 'cust-123',
      planId: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // Validates: Requirements 3.9
  test('get_customer with valid customerId returns { valid: true }', () => {
    const result = chargebeeNodeDefinition.validateInputs({
      ...baseValid,
      operation: 'get_customer',
      customerId: 'cust-123',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('get_customer with empty customerId returns { valid: false }', () => {
    const result = chargebeeNodeDefinition.validateInputs({
      ...baseValid,
      operation: 'get_customer',
      customerId: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // Validates: Requirements 3.10
  test('cancel_subscription with valid subscriptionId returns { valid: true }', () => {
    const result = chargebeeNodeDefinition.validateInputs({
      ...baseValid,
      operation: 'cancel_subscription',
      subscriptionId: 'sub-456',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('cancel_subscription with empty subscriptionId returns { valid: false }', () => {
    const result = chargebeeNodeDefinition.validateInputs({
      ...baseValid,
      operation: 'cancel_subscription',
      subscriptionId: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ─── Unit Tests: outputSchema ─────────────────────────────────────────────────
// Validates: Requirements 3.12

describe('outputSchema', () => {
  test('has "success" field', () => {
    expect(chargebeeNodeDefinition.outputSchema).toHaveProperty('success');
  });

  test('has "operation" field', () => {
    expect(chargebeeNodeDefinition.outputSchema).toHaveProperty('operation');
  });

  test('has "customer" field', () => {
    expect(chargebeeNodeDefinition.outputSchema).toHaveProperty('customer');
  });

  test('has "subscription" field', () => {
    expect(chargebeeNodeDefinition.outputSchema).toHaveProperty('subscription');
  });

  test('has "customerId" field', () => {
    expect(chargebeeNodeDefinition.outputSchema).toHaveProperty('customerId');
  });

  test('has "subscriptionId" field', () => {
    expect(chargebeeNodeDefinition.outputSchema).toHaveProperty('subscriptionId');
  });

  test('has "error" field', () => {
    expect(chargebeeNodeDefinition.outputSchema).toHaveProperty('error');
  });
});
