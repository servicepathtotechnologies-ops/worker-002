/**
 * Integration Tests: LangChain Node Integration Verification
 * Feature: langchain-node-integration
 *
 * Tasks: 9.1
 * Validates: Requirements 4.3
 */

import { registerAllNodeDefinitions } from '../index';
import { nodeDefinitionRegistry } from '../../../core/types/node-definition';

// ─── Task 9.1 ─────────────────────────────────────────────────────────────────
// Verify nodeDefinitionRegistry contains 'langchain' after registerAllNodeDefinitions()
// Validates: Requirements 4.3

describe('Task 9.1 — nodeDefinitionRegistry contains langchain after registration', () => {
  beforeAll(() => {
    registerAllNodeDefinitions();
  });

  test('nodeDefinitionRegistry.get("langchain") returns a definition', () => {
    const def = nodeDefinitionRegistry.get('langchain');
    expect(def).toBeDefined();
  });

  test('the langchain definition has type "langchain"', () => {
    const def = nodeDefinitionRegistry.get('langchain');
    expect(def?.type).toBe('langchain');
  });

  test('the langchain definition has label "LangChain"', () => {
    const def = nodeDefinitionRegistry.get('langchain');
    expect(def?.label).toBe('LangChain');
  });

  test('the langchain definition has category "ai"', () => {
    const def = nodeDefinitionRegistry.get('langchain');
    expect(def?.category).toBe('ai');
  });
});
