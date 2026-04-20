import { describe, expect, it } from '@jest/globals';
import {
  hasRegistryExecuteOverride,
  getNodeTypesWithExecuteOverrides,
} from '../unified-node-registry-overrides';

// Validates: Requirements 6.4
describe('unified node registry overrides – workday', () => {
  it('hasRegistryExecuteOverride returns true for workday', () => {
    expect(hasRegistryExecuteOverride('workday')).toBe(true);
  });

  it('getNodeTypesWithExecuteOverrides includes workday', () => {
    expect(getNodeTypesWithExecuteOverrides()).toContain('workday');
  });
});
