import {
  buildFieldOwnershipGuidancePrompt,
  fallbackFieldOwnershipGuidance,
} from '../field-ownership-guidance-prompt';

describe('field ownership guidance prompt', () => {
  it('builds prompt with question and context', () => {
    const out = buildFieldOwnershipGuidancePrompt({
      question: 'What should I do with spreadsheetId?',
      context: { workflowId: 'wf_1', selectedField: { nodeId: 'n1', fieldName: 'spreadsheetId' } },
    });
    expect(out).toContain('What should I do with spreadsheetId?');
    expect(out).toContain('"workflowId": "wf_1"');
    expect(out).toContain('selectedField');
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
