import { describe, expect, it } from '@jest/globals';
import { getDiscriminantFieldForUpstreamType, planSwitchCasesFromPrompt } from '../switch-case-plan';

describe('switch-case-plan', () => {
  it('extracts sales/support/general from classify prompt', () => {
    const prompt =
      'From the form input, classify the message as sales, support, or general. Return only one word.';
    const r = planSwitchCasesFromPrompt(prompt, 'ollama', undefined);
    expect(r.cases.map(c => c.value).sort()).toEqual(['general', 'sales', 'support']);
    expect(r.expressionTemplate).toContain('$json');
    expect(r.discriminantField).toBe('response');
  });

  it('uses registry-aware discriminant for ollama', () => {
    expect(getDiscriminantFieldForUpstreamType('ollama')).toBe('response');
  });

  it('extracts priority cases in prompt order: high, medium, low (repeated if priority is …)', () => {
    const prompt =
      'If priority is high, send via Slack. If priority is medium, send via Gmail. If priority is low, send via Gmail.';
    const r = planSwitchCasesFromPrompt(prompt, 'form', undefined);
    expect(r.cases.map((c) => c.value)).toEqual(['high', 'medium', 'low']);
  });

  it('extracts priority cases in order for abbreviated follow-on clauses ("If medium,")', () => {
    const prompt =
      'If priority is high, send via Slack. If medium, send via Gmail. If low, send via Gmail.';
    const r = planSwitchCasesFromPrompt(prompt, 'form', undefined);
    expect(r.cases.map((c) => c.value)).toEqual(['high', 'medium', 'low']);
  });
});
