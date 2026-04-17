import { describe, expect, it } from '@jest/globals';
import { runCapabilitySelectionStage } from '../stages/capability-selection-stage';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

describe('CapabilitySelectionStage', () => {
  const firstActionStep = (steps: any[]) =>
    steps.find((s) => s.stepId !== 'trigger' && String(s.stepId || '').startsWith('action_'));

  it('returns trigger plus action capability steps', () => {
    const result = runCapabilitySelectionStage({
      intent: 'Get data from sheets and send email summary',
      triggerType: 'manual_trigger',
      actions: ['get data from sheets', 'send email summary'],
      dataFlows: [],
      constraints: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps.length).toBeGreaterThanOrEqual(3);
    expect(result.steps[0].stepId).toBe('trigger');
  });

  it('returns registry-only node types for all candidates', () => {
    const result = runCapabilitySelectionStage({
      intent: 'Send notification to slack',
      triggerType: 'manual_trigger',
      actions: ['send notification'],
      dataFlows: [],
      constraints: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const step of result.steps) {
      for (const nodeType of step.candidateNodeTypes) {
        expect(unifiedNodeRegistry.get(nodeType)).toBeDefined();
      }
    }
  });

  it('classifies explicit underscore action as data_source and keeps focused candidates', () => {
    const result = runCapabilitySelectionStage({
      intent: 'get data from sheets',
      triggerType: 'manual_trigger',
      actions: ['google_sheets'],
      dataFlows: [],
      constraints: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const actionStep = firstActionStep(result.steps);
    expect(actionStep).toBeDefined();
    expect(actionStep?.intentClass).toBe('data_source');
    expect(actionStep?.candidateNodeTypes[0]).toBe('google_sheets');
    expect(actionStep?.candidateNodeTypes).not.toContain('google_gemini');
  });

  it('keeps communication-capable options for vague email intents', () => {
    const result = runCapabilitySelectionStage({
      intent: 'send an email notification',
      triggerType: 'manual_trigger',
      actions: ['send email'],
      dataFlows: [],
      constraints: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const actionStep = firstActionStep(result.steps);
    expect(actionStep).toBeDefined();
    expect(actionStep?.intentClass).toBe('communication');
    expect((actionStep?.candidateNodeTypes || []).length).toBeGreaterThan(0);
    expect((actionStep?.candidateNodeTypes || []).some((t: string) => t.includes('gmail') || t.includes('outlook') || t.includes('email'))).toBe(true);
  });

  it('collapses candidates into semantic-equivalent email family', () => {
    const result = runCapabilitySelectionStage({
      intent: 'send an email update',
      triggerType: 'manual_trigger',
      actions: ['send email update'],
      dataFlows: [],
      constraints: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const actionStep = firstActionStep(result.steps);
    expect(actionStep).toBeDefined();
    const candidates = actionStep?.candidateNodeTypes || [];
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((t: string) => t.includes('facebook') || t.includes('twitter') || t.includes('instagram'))).toBe(false);
  });
});

