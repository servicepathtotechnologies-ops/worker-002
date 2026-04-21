/**
 * Integration Tests: Pinecone Node Integration Verification
 * Feature: pinecone-node-integration
 *
 * Tasks: 9.1
 * Validates: Requirements 5.3, 5.4, 6.2, 8.1, 8.2
 */

import { registerAllNodeDefinitions } from '../index';
import { nodeDefinitionRegistry } from '../../../core/types/node-definition';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { pineconeNodeDefinition } from '../pinecone-node';

// ─── Task 9.1 ─────────────────────────────────────────────────────────────────
// Verify the full registration chain for the Pinecone node
// Validates: Requirements 5.3, 5.4, 6.2, 8.1, 8.2

describe('Task 9.1 — Full registration chain for Pinecone node', () => {
  beforeAll(() => {
    registerAllNodeDefinitions();
  });

  // Validates: Requirements 6.2
  test('nodeDefinitionRegistry.get("pinecone") returns a definition', () => {
    const def = nodeDefinitionRegistry.get('pinecone');
    expect(def).toBeDefined();
  });

  // Validates: Requirements 8.1
  test('unifiedNodeRegistry.has("pinecone") returns true', () => {
    expect(unifiedNodeRegistry.has('pinecone')).toBe(true);
  });

  // Validates: Requirements 5.3
  test('unifiedNodeRegistry.resolveAlias("pinecone_query") returns "pinecone"', () => {
    expect(unifiedNodeRegistry.resolveAlias('pinecone_query')).toBe('pinecone');
  });

  // Validates: Requirements 5.4
  test('unifiedNodeRegistry.resolveAlias("vector_database") returns "pinecone"', () => {
    expect(unifiedNodeRegistry.resolveAlias('vector_database')).toBe('pinecone');
  });

  // Validates: Requirements 8.2
  test('resolved definition has an execute function (override applied)', () => {
    const def = unifiedNodeRegistry.get('pinecone');
    expect(def).toBeDefined();
    expect(typeof def?.execute).toBe('function');
  });
});

// ─── Unit Tests: pineconeNodeDefinition exported fields ───────────────────────
// Validates: Requirements 1.1, 1.9

describe('pineconeNodeDefinition exported fields', () => {
  test('type is "pinecone"', () => {
    expect(pineconeNodeDefinition.type).toBe('pinecone');
  });

  test('requiredInputs contains "operation"', () => {
    expect(pineconeNodeDefinition.requiredInputs).toContain('operation');
  });

  test('requiredInputs contains "index"', () => {
    expect(pineconeNodeDefinition.requiredInputs).toContain('index');
  });
});

// ─── Unit Tests: defaultInputs() ─────────────────────────────────────────────
// Validates: Requirements 1.6

describe('defaultInputs()', () => {
  test('returns correct defaults', () => {
    const defaults = pineconeNodeDefinition.defaultInputs();
    expect(defaults).toMatchObject({
      operation: 'query',
      index: '',
      apiKey: '',
      vector: null,
      topK: 5,
      id: '',
      metadata: {},
      namespace: '',
    });
  });
});

// ─── Unit Tests: validateInputs() ────────────────────────────────────────────
// Validates: Requirements 1.10, 1.11, 1.12, 1.13

describe('validateInputs()', () => {
  // Validates: Requirements 1.10
  test('missing operation returns { valid: false }', () => {
    const result = pineconeNodeDefinition.validateInputs({ index: 'my-index' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // Validates: Requirements 1.11
  test('missing index returns { valid: false }', () => {
    const result = pineconeNodeDefinition.validateInputs({ operation: 'query' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // Validates: Requirements 1.12
  test('invalid operation returns { valid: false } with error listing valid ops', () => {
    const result = pineconeNodeDefinition.validateInputs({ operation: 'invalid_op', index: 'my-index' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Error message should mention valid operations
    const errorText = result.errors.join(' ');
    expect(errorText).toMatch(/upsert|query|delete/);
  });

  // Validates: Requirements 1.13
  test('valid inputs returns { valid: true, errors: [] }', () => {
    const result = pineconeNodeDefinition.validateInputs({ operation: 'query', index: 'my-index' });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

// ─── Unit Tests: outputSchema ─────────────────────────────────────────────────
// Validates: Requirements 1.8

describe('outputSchema', () => {
  test('has "success" field', () => {
    expect(pineconeNodeDefinition.outputSchema).toHaveProperty('success');
  });

  test('has "matches" field', () => {
    expect(pineconeNodeDefinition.outputSchema).toHaveProperty('matches');
  });

  test('has "error" field', () => {
    expect(pineconeNodeDefinition.outputSchema).toHaveProperty('error');
  });
});
