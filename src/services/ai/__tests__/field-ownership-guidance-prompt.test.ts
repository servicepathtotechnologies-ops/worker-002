import {
  buildDeterministicFieldOwnershipGuidance,
  buildFieldOwnershipGuidancePrompt,
  fallbackFieldOwnershipGuidance,
} from '../field-ownership-guidance-prompt';

describe('field ownership guidance prompt', () => {
  it('builds prompt with question and context', () => {
    const deterministicGuidance = buildDeterministicFieldOwnershipGuidance(
      'What should I do with spreadsheetId?',
      { workflowId: 'wf_1', selectedField: { nodeId: 'n1', fieldName: 'spreadsheetId' } }
    );
    const out = buildFieldOwnershipGuidancePrompt({
      question: 'What should I do with spreadsheetId?',
      context: { workflowId: 'wf_1', selectedField: { nodeId: 'n1', fieldName: 'spreadsheetId' } },
      deterministicGuidance,
    });
    expect(out).toContain('What should I do with spreadsheetId?');
    expect(out).toContain('"workflowId": "wf_1"');
    expect(out).toContain('selectedField');
    expect(out).toContain('Baseline guidance');
  });

  it('creates operation-aware deterministic guidance for Google Sheets IDs', () => {
    const guidance = buildDeterministicFieldOwnershipGuidance('Where do I get this?', {
      selectedField: { nodeId: 'sheet1', fieldName: 'spreadsheetId' },
      selectedRow: {
        nodeId: 'sheet1',
        nodeLabel: 'Google Sheets',
        nodeType: 'google_sheets',
        fieldName: 'spreadsheetId',
        required: true,
        supportsRuntimeAI: false,
        supportsBuildtimeAI: false,
        effectiveMode: 'manual_static',
      },
      selectedNode: {
        id: 'sheet1',
        type: 'google_sheets',
        config: { operation: 'append' },
      },
      operation: 'append',
    });

    expect(guidance.whatThisFieldDoes).toContain('spreadsheetId');
    expect(guidance.whatThisFieldDoes).toContain('append');
    expect(guidance.whereToGetValue).toContain('/d/');
    expect(guidance.ifYouChooseAIRuntime).toContain('not supported');
  });

  it('provides complete fallback sections', () => {
    const fallback = fallbackFieldOwnershipGuidance();
    expect(fallback.whatThisFieldDoes.length).toBeGreaterThan(0);
    expect(fallback.ifYouChooseYou.length).toBeGreaterThan(0);
    expect(fallback.ifYouChooseAIBuild.length).toBeGreaterThan(0);
    expect(fallback.ifYouChooseAIRuntime.length).toBeGreaterThan(0);
    expect(fallback.isActuallyRequired.length).toBeGreaterThan(0);
    expect(fallback.whereToGetValue.length).toBeGreaterThan(0);
    expect(fallback.nextStepExpectations.length).toBeGreaterThan(0);
  });
});
