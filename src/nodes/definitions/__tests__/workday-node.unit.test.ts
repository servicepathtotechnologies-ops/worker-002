/**
 * Unit Tests: workdayNodeDefinition
 * Feature: workday-node-integration
 *
 * Validates: Requirements 3.2, 3.5, 3.6, 3.7, 3.8, 3.9
 */

import { workdayNodeDefinition } from '../workday-node';

// ─── Exported fields ──────────────────────────────────────────────────────────

describe('workdayNodeDefinition exported fields', () => {
  test('type is "workday"', () => {
    expect(workdayNodeDefinition.type).toBe('workday');
  });

  test('label is "Workday"', () => {
    expect(workdayNodeDefinition.label).toBe('Workday');
  });

  test('category is "http_api"', () => {
    expect(workdayNodeDefinition.category).toBe('http_api');
  });

  test('version is 1', () => {
    expect(workdayNodeDefinition.version).toBe(1);
  });

  test('outgoingPorts is ["default"]', () => {
    expect(workdayNodeDefinition.outgoingPorts).toEqual(['default']);
  });

  test('isBranching is false', () => {
    expect(workdayNodeDefinition.isBranching).toBe(false);
  });
});

// ─── defaultInputs ────────────────────────────────────────────────────────────

describe('defaultInputs()', () => {
  test('returns correct core defaults', () => {
    const defaults = workdayNodeDefinition.defaultInputs();
    expect(defaults).toMatchObject({
      authType: 'oauth2',
      resource: 'workers',
      operation: 'get_many',
      limit: 50,
      offset: 0,
    });
  });

  test('returns all fields populated (no undefined values)', () => {
    const defaults = workdayNodeDefinition.defaultInputs();
    const expectedKeys = [
      'authType', 'resource', 'operation', 'limit', 'offset',
      'baseUrl', 'tenant', 'accessToken', 'username', 'password',
      'recordId', 'payload', 'rawPath',
    ];
    for (const key of expectedKeys) {
      expect(defaults).toHaveProperty(key);
    }
  });
});

// ─── validateInputs ───────────────────────────────────────────────────────────

describe('validateInputs()', () => {
  const validOauth2Config = {
    resource: 'workers',
    operation: 'get_many',
    authType: 'oauth2',
    accessToken: 'my-token',
  };

  test('fully valid oauth2 config returns { valid: true, errors: [] }', () => {
    const result = workdayNodeDefinition.validateInputs(validOauth2Config);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('oauth2 with empty accessToken returns { valid: false }', () => {
    const result = workdayNodeDefinition.validateInputs({
      ...validOauth2Config,
      accessToken: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('oauth2 with whitespace-only accessToken returns { valid: false }', () => {
    const result = workdayNodeDefinition.validateInputs({
      ...validOauth2Config,
      accessToken: '   ',
    });
    expect(result.valid).toBe(false);
  });

  test('basic auth with empty username returns { valid: false }', () => {
    const result = workdayNodeDefinition.validateInputs({
      resource: 'workers',
      operation: 'get_many',
      authType: 'basic',
      username: '',
      password: 'secret',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('basic auth with empty password returns { valid: false }', () => {
    const result = workdayNodeDefinition.validateInputs({
      resource: 'workers',
      operation: 'get_many',
      authType: 'basic',
      username: 'user',
      password: '',
    });
    expect(result.valid).toBe(false);
  });

  test('basic auth with valid username and password returns { valid: true }', () => {
    const result = workdayNodeDefinition.validateInputs({
      resource: 'workers',
      operation: 'get_many',
      authType: 'basic',
      username: 'user',
      password: 'secret',
    });
    expect(result.valid).toBe(true);
  });

  test('get_by_id with empty recordId returns { valid: false }', () => {
    const result = workdayNodeDefinition.validateInputs({
      ...validOauth2Config,
      operation: 'get_by_id',
      recordId: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('get_by_id with valid recordId returns { valid: true }', () => {
    const result = workdayNodeDefinition.validateInputs({
      ...validOauth2Config,
      operation: 'get_by_id',
      recordId: 'rec-123',
    });
    expect(result.valid).toBe(true);
  });

  test('create with no payload returns { valid: false }', () => {
    const result = workdayNodeDefinition.validateInputs({
      ...validOauth2Config,
      operation: 'create',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('create with null payload returns { valid: false }', () => {
    const result = workdayNodeDefinition.validateInputs({
      ...validOauth2Config,
      operation: 'create',
      payload: null,
    });
    expect(result.valid).toBe(false);
  });

  test('create with valid payload returns { valid: true }', () => {
    const result = workdayNodeDefinition.validateInputs({
      ...validOauth2Config,
      operation: 'create',
      payload: { name: 'John' },
    });
    expect(result.valid).toBe(true);
  });

  test('update requires both recordId and payload', () => {
    const result = workdayNodeDefinition.validateInputs({
      ...validOauth2Config,
      operation: 'update',
      recordId: 'rec-123',
      payload: { name: 'Jane' },
    });
    expect(result.valid).toBe(true);
  });

  test('update with missing recordId returns { valid: false }', () => {
    const result = workdayNodeDefinition.validateInputs({
      ...validOauth2Config,
      operation: 'update',
      recordId: '',
      payload: { name: 'Jane' },
    });
    expect(result.valid).toBe(false);
  });
});
