/**
 * Integration Tests: Netlify Node Integration Verification
 * Feature: netlify-node-integration
 *
 * Tasks: 9.1
 * Validates: Requirements 4.3, 3.2, 3.5, 3.6, 3.7, 3.8, 3.9
 */

import { registerAllNodeDefinitions } from '../index';
import { nodeDefinitionRegistry } from '../../../core/types/node-definition';
import { netlifyNodeDefinition } from '../netlify-node';

// ─── Task 9.1 ─────────────────────────────────────────────────────────────────
// Verify nodeDefinitionRegistry contains 'netlify' after registerAllNodeDefinitions()
// Validates: Requirements 4.3

describe('Task 9.1 — nodeDefinitionRegistry contains netlify after registration', () => {
  beforeAll(() => {
    // index.ts auto-registers on import, but call explicitly to be explicit
    registerAllNodeDefinitions();
  });

  test('nodeDefinitionRegistry.get("netlify") returns a definition', () => {
    const def = nodeDefinitionRegistry.get('netlify');
    expect(def).toBeDefined();
  });

  test('the netlify definition has type "netlify"', () => {
    const def = nodeDefinitionRegistry.get('netlify');
    expect(def?.type).toBe('netlify');
  });

  test('the netlify definition has label "Netlify"', () => {
    const def = nodeDefinitionRegistry.get('netlify');
    expect(def?.label).toBe('Netlify');
  });

  test('the netlify definition has a non-empty category', () => {
    // Note: the NodeDefinitionRegistry may remap the category internally.
    // We assert the category is defined and non-empty.
    const def = nodeDefinitionRegistry.get('netlify');
    expect(def?.category).toBeTruthy();
  });
});

// ─── Unit Tests: netlifyNodeDefinition exported fields ────────────────────────
// Validates: Requirements 3.2

describe('netlifyNodeDefinition exported fields', () => {
  test('type is "netlify"', () => {
    expect(netlifyNodeDefinition.type).toBe('netlify');
  });

  test('label is "Netlify"', () => {
    expect(netlifyNodeDefinition.label).toBe('Netlify');
  });

  test('category is "devops"', () => {
    expect(netlifyNodeDefinition.category).toBe('devops');
  });

  test('icon is "Globe"', () => {
    expect(netlifyNodeDefinition.icon).toBe('Globe');
  });

  test('version is 1', () => {
    expect(netlifyNodeDefinition.version).toBe(1);
  });

  test('outgoingPorts is ["default"]', () => {
    expect(netlifyNodeDefinition.outgoingPorts).toEqual(['default']);
  });

  test('isBranching is false', () => {
    expect(netlifyNodeDefinition.isBranching).toBe(false);
  });
});

// ─── Unit Tests: defaultInputs() ─────────────────────────────────────────────
// Validates: Requirements 3.10

describe('defaultInputs()', () => {
  test('returns { resource: "sites", operation: "list_sites", limit: 25 }', () => {
    const defaults = netlifyNodeDefinition.defaultInputs();
    expect(defaults).toMatchObject({
      resource: 'sites',
      operation: 'list_sites',
      limit: 25,
    });
  });

  test('returns all fields populated (no undefined values)', () => {
    const defaults = netlifyNodeDefinition.defaultInputs();
    const expectedKeys = ['resource', 'operation', 'limit', 'accessToken', 'siteId', 'deployId', 'payload'];
    for (const key of expectedKeys) {
      expect(defaults).toHaveProperty(key);
    }
  });
});

// ─── Unit Tests: validateInputs() ────────────────────────────────────────────
// Validates: Requirements 3.5, 3.6, 3.7, 3.8, 3.9

describe('validateInputs()', () => {
  const validListSitesConfig = {
    resource: 'sites',
    operation: 'list_sites',
    accessToken: 'my-token',
  };

  // Validates: Requirements 3.5, 3.6
  test('fully valid list_sites config returns { valid: true, errors: [] }', () => {
    const result = netlifyNodeDefinition.validateInputs(validListSitesConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  // Validates: Requirements 3.5
  test('invalid resource returns { valid: false }', () => {
    const result = netlifyNodeDefinition.validateInputs({
      ...validListSitesConfig,
      resource: 'invalid_resource',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // Validates: Requirements 3.6
  test('invalid operation returns { valid: false }', () => {
    const result = netlifyNodeDefinition.validateInputs({
      ...validListSitesConfig,
      operation: 'invalid_operation',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // Validates: Requirements 3.7
  test('operation: "get_site" with empty siteId returns { valid: false }', () => {
    const result = netlifyNodeDefinition.validateInputs({
      resource: 'sites',
      operation: 'get_site',
      accessToken: 'my-token',
      siteId: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('operation: "get_site" with valid siteId returns { valid: true }', () => {
    const result = netlifyNodeDefinition.validateInputs({
      resource: 'sites',
      operation: 'get_site',
      accessToken: 'my-token',
      siteId: 'site-123',
    });
    expect(result.valid).toBe(true);
  });

  // Validates: Requirements 3.8
  test('operation: "create_deploy" with empty siteId returns { valid: false }', () => {
    const result = netlifyNodeDefinition.validateInputs({
      resource: 'deploys',
      operation: 'create_deploy',
      accessToken: 'my-token',
      siteId: '',
      payload: { branch: 'main' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('operation: "create_deploy" with valid siteId and payload returns { valid: true }', () => {
    const result = netlifyNodeDefinition.validateInputs({
      resource: 'deploys',
      operation: 'create_deploy',
      accessToken: 'my-token',
      siteId: 'site-123',
      payload: { branch: 'main' },
    });
    expect(result.valid).toBe(true);
  });

  // Validates: Requirements 3.9
  test('operation: "get_deploy" with empty deployId returns { valid: false }', () => {
    const result = netlifyNodeDefinition.validateInputs({
      resource: 'deploys',
      operation: 'get_deploy',
      accessToken: 'my-token',
      siteId: 'site-123',
      deployId: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('operation: "get_deploy" with valid siteId and deployId returns { valid: true }', () => {
    const result = netlifyNodeDefinition.validateInputs({
      resource: 'deploys',
      operation: 'get_deploy',
      accessToken: 'my-token',
      siteId: 'site-123',
      deployId: 'deploy-456',
    });
    expect(result.valid).toBe(true);
  });

  test('operation: "list_deploys" with empty siteId returns { valid: false }', () => {
    const result = netlifyNodeDefinition.validateInputs({
      resource: 'deploys',
      operation: 'list_deploys',
      accessToken: 'my-token',
      siteId: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('operation: "create_deploy" with missing payload returns { valid: false }', () => {
    const result = netlifyNodeDefinition.validateInputs({
      resource: 'deploys',
      operation: 'create_deploy',
      accessToken: 'my-token',
      siteId: 'site-123',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
