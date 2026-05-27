import type { CapabilityContainer, NodeSelectionMap, UseCaseUnit } from './capability-types';

export interface CapabilitySelectionValidationContainer {
  containerId: string;
  label: string;
  semanticRole: UseCaseUnit['semanticRole'];
  description: string;
}

export interface CapabilitySelectionValidationResult {
  valid: boolean;
  code?: 'MISSING_TRIGGER_SELECTION' | 'MULTIPLE_TRIGGER_SELECTION';
  message?: string;
  selectedCount: number;
  requiredCount: number;
  triggerContainers: CapabilitySelectionValidationContainer[];
  selectedTriggerContainers: CapabilitySelectionValidationContainer[];
  invalidSelections: CapabilitySelectionValidationContainer[];
  missingIntentSteps: CapabilitySelectionValidationContainer[];
}

function toValidationContainer(container: CapabilityContainer): CapabilitySelectionValidationContainer {
  return {
    containerId: container.containerId,
    label: container.label || container.useCaseUnit.label,
    semanticRole: container.useCaseUnit.semanticRole,
    description: container.useCaseUnit.description,
  };
}

export function validateCapabilitySelections(
  containers: CapabilityContainer[],
  selections: NodeSelectionMap,
): CapabilitySelectionValidationResult {
  const selectedCount = Object.keys(selections || {}).length;
  const triggerContainers = containers
    .filter((container) => container.useCaseUnit.semanticRole === 'trigger')
    .map(toValidationContainer);

  const selectedTriggerContainers = containers
    .filter((container) => container.useCaseUnit.semanticRole === 'trigger' && Boolean(selections[container.containerId]))
    .map(toValidationContainer);

  const invalidSelections = containers
    .filter((container) => {
      const selected = selections[container.containerId];
      return Boolean(selected) && !container.candidates.some((candidate) => candidate.nodeType === selected);
    })
    .map(toValidationContainer);

  const missingIntentSteps = containers
    .filter((container) => container.useCaseUnit.semanticRole !== 'trigger' && !selections[container.containerId])
    .map(toValidationContainer);

  if (selectedTriggerContainers.length === 0) {
    return {
      valid: false,
      code: 'MISSING_TRIGGER_SELECTION',
      message: 'Select one trigger before continuing. Every workflow needs a starting point.',
      selectedCount,
      requiredCount: containers.length,
      triggerContainers,
      selectedTriggerContainers,
      invalidSelections,
      missingIntentSteps,
    };
  }

  if (selectedTriggerContainers.length > 1) {
    return {
      valid: false,
      code: 'MULTIPLE_TRIGGER_SELECTION',
      message: 'Select exactly one trigger so CtrlChecks knows which event starts this workflow.',
      selectedCount,
      requiredCount: containers.length,
      triggerContainers,
      selectedTriggerContainers,
      invalidSelections,
      missingIntentSteps,
    };
  }

  return {
    valid: true,
    selectedCount,
    requiredCount: containers.length,
    triggerContainers,
    selectedTriggerContainers,
    invalidSelections,
    missingIntentSteps,
  };
}
