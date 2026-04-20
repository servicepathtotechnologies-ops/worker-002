/**
 * Integration Tests: Claude Node Integration Verification
 * Feature: claude-node-integration
 *
 * Tasks: 9.1
 * Validates: Requirements 4.3, 6.4
 */

import { registerAllNodeDefinitions } from '../index';
import { nodeDefinitionRegistry } from '../../../core/types/node-definition';
import { hasRegistryExecuteOverride, getNodeTypesWithExecuteOverrides } from '../../../core/registry/unified-node-registry-overrides';

// ─── Task 9.1 ─────────────────────────────────────────────────────────────────
// Verify nodeDefinitionRegistry contains 'claude' after registerAllNodeDefinitions()
// Validates: Requirements 4.3

describe('Task 9.1 — nodeDefinitionRegistry contains claude after registration', () => {
  beforeAll(() => {
    // index.ts auto-registers on import, but call explicitly to be explicit
    registerAllNodeDefinitions();
  });

  test('nodeDefinitionRegistry.get("claude") returns a definition', () => {
    const def = nodeDefinitionRegistry.get('claude');
    expect(def).toBeDefined();
  });

  test('the claude definition has type "claude"', () => {
    const def = nodeDefinitionRegistry.get('claude');
    expect(def?.type).toBe('claude');
  });

  test('the claude definition has label "Claude"', () => {
    const def = nodeDefinitionRegistry.get('claude');
    expect(def?.label).toBe('Claude');
  });

  test('the claude definition has category "ai"', () => {
    const def = nodeDefinitionRegistry.get('claude');
    expect(def?.category).toBe('ai');
  });
});

// ─── Task 9.1 — Override registry checks ─────────────────────────────────────
// Validates: Requirements 6.4

describe('Task 9.1 — claude override registry checks', () => {
  test('hasRegistryExecuteOverride("claude") returns true', () => {
    expect(hasRegistryExecuteOverride('claude')).toBe(true);
  });

  test('getNodeTypesWithExecuteOverrides() includes "claude"', () => {
    const types = getNodeTypesWithExecuteOverrides();
    expect(types).toContain('claude');
  });
});
