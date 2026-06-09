import { validateCapabilitySelections } from '../capability-selection-validation';
import type { CapabilityContainer, UseCaseUnit } from '../capability-types';

function makeContainer(params: {
  containerId: string;
  semanticRole: UseCaseUnit['semanticRole'];
  nodeType: string;
  label?: string;
  unitLabel?: string;
  orderIndex?: number;
}): CapabilityContainer {
  const { containerId, semanticRole, nodeType, label, unitLabel, orderIndex = 0 } = params;

  return {
    containerId,
    label: label ?? `${semanticRole} container`,
    useCaseUnit: {
      unitId: `${containerId}-unit`,
      label: unitLabel ?? `${semanticRole} unit`,
      semanticRole,
      description: `${semanticRole} description`,
      orderIndex,
    },
    candidates: [
      {
        nodeType,
        label: nodeType,
        description: `${nodeType} description`,
        credentialRequirements: [],
        hasCredentials: true,
      },
    ],
  };
}

describe('capability selection validation trigger gate', () => {
  it('rejects selections when more than one trigger container is selected', () => {
    const containers = [
      makeContainer({ containerId: 'manual-trigger', semanticRole: 'trigger', nodeType: 'manual_trigger' }),
      makeContainer({ containerId: 'schedule-trigger', semanticRole: 'trigger', nodeType: 'schedule_trigger' }),
      makeContainer({ containerId: 'email-step', semanticRole: 'communication', nodeType: 'google_gmail' }),
    ];

    const result = validateCapabilitySelections(containers, {
      'manual-trigger': 'manual_trigger',
      'schedule-trigger': 'schedule_trigger',
      'email-step': 'google_gmail',
    });

    expect(result.valid).toBe(false);
    expect(result.code).toBe('MULTIPLE_TRIGGER_SELECTION');
    expect(result.selectedCount).toBe(3);
    expect(result.requiredCount).toBe(3);
    expect(result.selectedTriggerContainers.map((container) => container.containerId)).toEqual([
      'manual-trigger',
      'schedule-trigger',
    ]);
    expect(result.triggerContainers.map((container) => container.containerId)).toEqual([
      'manual-trigger',
      'schedule-trigger',
    ]);
  });

  it('still reports invalid selections and missing non-trigger intent steps with trigger gate metadata', () => {
    const containers = [
      makeContainer({ containerId: 'manual-trigger', semanticRole: 'trigger', nodeType: 'manual_trigger' }),
      makeContainer({ containerId: 'lookup-step', semanticRole: 'data_source', nodeType: 'google_sheets' }),
      makeContainer({ containerId: 'email-step', semanticRole: 'communication', nodeType: 'google_gmail' }),
    ];

    const result = validateCapabilitySelections(containers, {
      'manual-trigger': 'manual_trigger',
      'lookup-step': 'not_a_candidate',
    });

    expect(result.valid).toBe(true);
    expect(result.invalidSelections.map((container) => container.containerId)).toEqual(['lookup-step']);
    expect(result.missingIntentSteps.map((container) => container.containerId)).toEqual(['email-step']);
    expect(result.selectedTriggerContainers).toHaveLength(1);
    expect(result.triggerContainers).toHaveLength(1);
  });

  it('falls back to the use-case unit label when a container label is empty', () => {
    const containers = [
      makeContainer({
        containerId: 'manual-trigger',
        semanticRole: 'trigger',
        nodeType: 'manual_trigger',
        label: '',
        unitLabel: 'Start from manual input',
      }),
      makeContainer({
        containerId: 'email-step',
        semanticRole: 'communication',
        nodeType: 'google_gmail',
        label: '',
        unitLabel: 'Notify the reviewer',
        orderIndex: 1,
      }),
    ];

    const result = validateCapabilitySelections(containers, {
      'manual-trigger': 'manual_trigger',
    });

    expect(result.valid).toBe(true);
    expect(result.selectedTriggerContainers[0]).toMatchObject({
      containerId: 'manual-trigger',
      label: 'Start from manual input',
      semanticRole: 'trigger',
      description: 'trigger description',
    });
    expect(result.missingIntentSteps[0]).toMatchObject({
      containerId: 'email-step',
      label: 'Notify the reviewer',
      semanticRole: 'communication',
      description: 'communication description',
    });
  });
});
