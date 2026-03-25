import { mergePrimaryPlannerPrompt } from '../planner-prompt-merge';

describe('mergePrimaryPlannerPrompt', () => {
  it('returns structured when original empty', () => {
    expect(mergePrimaryPlannerPrompt('', 'hello')).toBe('hello');
  });

  it('returns original when same as structured', () => {
    expect(mergePrimaryPlannerPrompt('same', 'same')).toBe('same');
  });

  it('prepends original user intent before structured phrasing', () => {
    const o = 'get data from google sheets and summarize and send gmail';
    const s = 'Initiate with manual_trigger';
    const m = mergePrimaryPlannerPrompt(o, s);
    expect(m.startsWith(o)).toBe(true);
    expect(m).toContain('Structured understanding');
    expect(m).toContain(s);
  });
});
