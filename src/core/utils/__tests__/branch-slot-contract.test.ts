jest.mock('../../registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    getOutgoingPortsForWorkflowNode: jest.fn(),
  },
}));

jest.mock('../../../services/ai/node-capability-registry-dsl', () => ({
  nodeCapabilityRegistryDSL: {
    isOutput: jest.fn(),
  },
}));

import type { BranchIntentSignals } from '../branch-intent-model';
import {
  buildBranchSlotContract,
  buildRequiredBranchSlots,
  inferBranchType,
} from '../branch-slot-contract';
import { unifiedNodeRegistry } from '../../registry/unified-node-registry';

const getOutgoingPortsMock =
  unifiedNodeRegistry.getOutgoingPortsForWorkflowNode as jest.MockedFunction<
    typeof unifiedNodeRegistry.getOutgoingPortsForWorkflowNode
  >;

function makeSignals(overrides: Partial<BranchIntentSignals> = {}): BranchIntentSignals {
  return {
    hasBranchingIntent: false,
    explicitOutcomeCount: 0,
    mentionedOutputNodeTypes: [],
    branchType: null,
    estimatedBranchCount: 0,
    outcomeDescriptors: [],
    confidence: 0,
    ...overrides,
  };
}

describe('branch-slot-contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOutgoingPortsMock.mockImplementation((node: any) => {
      const nodeType = node?.data?.type ?? node?.type;
      if (nodeType === 'switch') return ['case_a', 'case_b', 'case_c'];
      if (nodeType === 'if_else') return ['true', 'false'];
      if (nodeType === 'custom_router') return ['left', 'middle', 'right'];
      return ['output'];
    });
  });

  it('infers switch before if_else when both node types are present', () => {
    expect(inferBranchType(['if_else', 'switch'])).toBe('switch');
  });

  it('infers if_else and unknown branch types from node type lists', () => {
    expect(inferBranchType(['gmail', 'if_else', 'slack'])).toBe('if_else');
    expect(inferBranchType(['gmail', 'slack'])).toBe('unknown');
  });

  it('builds fixed true/false slots for if_else branches', () => {
    expect(buildRequiredBranchSlots('if_else', 5)).toEqual(['true', 'false']);
  });

  it('builds switch case slots with a minimum of two cases', () => {
    expect(buildRequiredBranchSlots('switch', 1)).toEqual(['case_1', 'case_2']);
    expect(buildRequiredBranchSlots('switch', 4)).toEqual([
      'case_1',
      'case_2',
      'case_3',
      'case_4',
    ]);
  });

  it('uses registry outgoing ports as the floor when there is no branching intent', () => {
    expect(
      buildBranchSlotContract(['custom_router'], makeSignals({ hasBranchingIntent: false }))
    ).toEqual({
      branchType: 'unknown',
      requiredSlotCount: 3,
      requiredSlots: [],
    });
  });

  it('returns binary required slots for if_else contracts', () => {
    expect(
      buildBranchSlotContract(['if_else'], makeSignals({ hasBranchingIntent: true }))
    ).toEqual({
      branchType: 'if_else',
      requiredSlotCount: 2,
      requiredSlots: ['true', 'false'],
    });
  });

  it('lets switch intent raise the required case slot count above registry ports', () => {
    expect(
      buildBranchSlotContract(
        ['switch'],
        makeSignals({
          hasBranchingIntent: true,
          branchType: 'switch',
          estimatedBranchCount: 4,
          outcomeDescriptors: ['new', 'processing', 'done', 'failed'],
        })
      )
    ).toEqual({
      branchType: 'switch',
      requiredSlotCount: 4,
      requiredSlots: ['case_1', 'case_2', 'case_3', 'case_4'],
    });
  });
});
