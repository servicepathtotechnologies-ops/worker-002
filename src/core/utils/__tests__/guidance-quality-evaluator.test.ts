import { evaluateGuidanceQuality } from '../guidance-quality-evaluator';
import type { FieldGuidanceDescription } from '../node-field-intelligence';
import type { FieldRelevanceResult } from '../../types/unified-node-contract';

const base: FieldGuidanceDescription = {
  what: 'The subject line of the email message.',
  setupSummary: 'Set the email subject.',
  needed: 'Enter the subject line for your email.',
  dataImpact: 'Controls what recipients see in their inbox.',
  you: 'Provide a descriptive subject that matches your use case.',
  aiBuild: 'Use a context-specific subject derived from the workflow goal.',
  aiRun: 'Pass the desired subject from upstream data.',
  example: 'e.g. "Monthly report for June"',
  offBehavior: 'The email will not be sent without a subject.',
  emptyBehavior: 'The field is left empty.',
  defaultBehaviorLabel: 'No default — user must supply a value.',
  recommendedOwner: 'You',
  ownerReason: 'You know the context best.',
  validationConfidence: 'high',
  warnings: [],
};

const baseRelevance: FieldRelevanceResult = {
  relevance: 'optional',
  shouldAskUser: false,
  shouldShowInOwnership: false,
  reason: 'Test relevance',
  source: 'registry',
};

describe('evaluateGuidanceQuality', () => {
  test('returns perfect score with no issues when guidance is clean and no relevance provided', () => {
    const result = evaluateGuidanceQuality(base);
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test('emits generic_guidance warning when combined text matches a broad fallback pattern', () => {
    const guidance = { ...base, what: 'adjusts optional behavior for this node' };
    const result = evaluateGuidanceQuality(guidance);
    const issue = result.issues.find((i) => i.code === 'generic_guidance');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
  });

  test('emits missing_example warning when example does not start with e.g.', () => {
    const guidance = { ...base, example: 'Your subject here' };
    const result = evaluateGuidanceQuality(guidance);
    const issue = result.issues.find((i) => i.code === 'missing_example');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
  });

  test('does not emit missing_example when example starts with e.g.', () => {
    const guidance = { ...base, example: 'e.g. Monthly report' };
    const result = evaluateGuidanceQuality(guidance);
    expect(result.issues.find((i) => i.code === 'missing_example')).toBeUndefined();
  });

  test('emits contradicts_relevance error when field is not_applicable but needed lacks leave/not-used language', () => {
    const guidance = { ...base, needed: 'Enter the subject.' };
    const relevance: FieldRelevanceResult = { ...baseRelevance, relevance: 'not_applicable' };
    const result = evaluateGuidanceQuality(guidance, relevance);
    const issue = result.issues.find((i) => i.code === 'contradicts_relevance');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('error');
  });

  test('does not emit contradicts_relevance when not_applicable field uses "not used" language', () => {
    const guidance = { ...base, needed: 'Not used for this node type — leave it off.' };
    const relevance: FieldRelevanceResult = { ...baseRelevance, relevance: 'not_applicable' };
    const result = evaluateGuidanceQuality(guidance, relevance);
    expect(result.issues.find((i) => i.code === 'contradicts_relevance')).toBeUndefined();
  });

  test('emits contradicts_relevance error when required field is described as safe to leave', () => {
    const guidance = { ...base, needed: 'Usually optional — safe to leave blank.' };
    const relevance: FieldRelevanceResult = { ...baseRelevance, relevance: 'required' };
    const result = evaluateGuidanceQuality(guidance, relevance);
    const issue = result.issues.find((i) => i.code === 'contradicts_relevance');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('error');
  });

  test('emits missing_action warning when required field needed text has no direct user action verb', () => {
    const guidance = { ...base, needed: 'This is the email subject field.' };
    const relevance: FieldRelevanceResult = { ...baseRelevance, relevance: 'required' };
    const result = evaluateGuidanceQuality(guidance, relevance);
    const issue = result.issues.find((i) => i.code === 'missing_action');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
  });

  test('does not emit missing_action when required field needed text contains an action verb', () => {
    const guidance = { ...base, needed: 'Enter the subject line for your email.' };
    const relevance: FieldRelevanceResult = { ...baseRelevance, relevance: 'required' };
    const result = evaluateGuidanceQuality(guidance, relevance);
    expect(result.issues.find((i) => i.code === 'missing_action')).toBeUndefined();
  });

  test('emits missing_risk warning when riskIfEmpty is high and no risk-related words appear in combined text', () => {
    const guidance: FieldGuidanceDescription = {
      ...base,
      what: 'Target bucket name.',
      setupSummary: 'Set bucket.',
      needed: 'Provide the bucket name.',
      dataImpact: 'Determines where data goes.',
      you: 'Select the correct bucket.',
      aiBuild: 'Use the appropriate bucket.',
      aiRun: 'Pass the bucket name.',
      example: 'e.g. my-data-bucket',
    };
    const relevance: FieldRelevanceResult = { ...baseRelevance, relevance: 'required', riskIfEmpty: 'high' };
    const result = evaluateGuidanceQuality(guidance, relevance);
    const issue = result.issues.find((i) => i.code === 'missing_risk');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
  });

  test('does not emit missing_risk when wrongValueRisk is set and combined text contains a risk word', () => {
    const guidance = { ...base, dataImpact: 'The workflow will fail if wrong.' };
    const relevance: FieldRelevanceResult = {
      ...baseRelevance,
      wrongValueRisk: 'Data goes to the wrong bucket.',
    };
    const result = evaluateGuidanceQuality(guidance, relevance);
    expect(result.issues.find((i) => i.code === 'missing_risk')).toBeUndefined();
  });

  test('emits fallback_intelligence info when usesInferenceFallback is true', () => {
    const relevance: FieldRelevanceResult = {
      ...baseRelevance,
      guidanceQualitySignals: {
        specificity: 'fallback',
        usesStructuredMetadata: false,
        usesInferenceFallback: true,
      },
    };
    const result = evaluateGuidanceQuality(base, relevance);
    const issue = result.issues.find((i) => i.code === 'fallback_intelligence');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('info');
  });

  test('deducts 15 points per warning: one warning gives score 85 and passed true', () => {
    const guidance = { ...base, example: 'No e.g. prefix here' };
    const result = evaluateGuidanceQuality(guidance);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe('warning');
    expect(result.score).toBe(85);
    expect(result.passed).toBe(true);
  });

  test('passed is false when any issue has severity error', () => {
    const guidance = { ...base, needed: 'This is the subject.' };
    const relevance: FieldRelevanceResult = { ...baseRelevance, relevance: 'not_applicable' };
    const result = evaluateGuidanceQuality(guidance, relevance);
    expect(result.issues.some((i) => i.severity === 'error')).toBe(true);
    expect(result.passed).toBe(false);
  });
});
