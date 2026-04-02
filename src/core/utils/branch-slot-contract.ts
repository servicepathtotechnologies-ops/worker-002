import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import type { BranchIntentSignals } from './branch-intent-model';
import { expectedBranchTargetCount } from './branch-intent-model';

export type BranchSlotType = 'if_else' | 'switch' | 'unknown';

export interface BranchSlotContract {
  branchType: BranchSlotType;
  requiredSlotCount: number;
  requiredSlots: string[];
}

export function inferBranchType(nodeTypes: string[]): BranchSlotType {
  if (nodeTypes.includes('switch')) return 'switch';
  if (nodeTypes.includes('if_else')) return 'if_else';
  return 'unknown';
}

function expectedTargetsFromRegistry(nodeTypes: string[]): number {
  let required = 1;
  for (const nodeType of nodeTypes) {
    const ports = unifiedNodeRegistry.getOutgoingPortsForWorkflowNode({
      type: nodeType,
      data: { type: nodeType, config: {} as Record<string, unknown> },
    });
    if (Array.isArray(ports) && ports.length > 1) {
      required = Math.max(required, ports.length);
    }
  }
  return required;
}

export function buildRequiredBranchSlots(
  branchType: BranchSlotType,
  requiredSlotCount: number
): string[] {
  if (branchType === 'if_else') return ['true', 'false'];
  if (branchType === 'switch') {
    const count = Math.max(2, requiredSlotCount);
    return Array.from({ length: count }, (_, i) => `case_${i + 1}`);
  }
  return [];
}

export function buildBranchSlotContract(
  nodeTypes: string[],
  signals: BranchIntentSignals
): BranchSlotContract {
  const branchType = inferBranchType(nodeTypes);
  const registryFloor = expectedTargetsFromRegistry(nodeTypes);
  const intentFloor = expectedBranchTargetCount(signals);
  const requiredSlotCount = signals.hasBranchingIntent
    ? Math.max(registryFloor, intentFloor)
    : registryFloor;

  return {
    branchType,
    requiredSlotCount,
    requiredSlots: buildRequiredBranchSlots(branchType, requiredSlotCount),
  };
}

