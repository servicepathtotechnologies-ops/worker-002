import { describe, expect, it } from '@jest/globals';
import { buildStructuralBlueprint } from '../structural-blueprint-builder';

describe('structural blueprint builder', () => {
  it('describes form and if/else semantics with branch observability', () => {
    const workflow: any = {
      nodes: [
        {
          id: 'form_1',
          type: 'form',
          data: {
            type: 'form',
            label: 'Form Trigger',
            config: {
              fields: [
                { key: 'name', label: 'Name', type: 'text', required: true },
                { key: 'age', label: 'Age', type: 'number', required: true },
              ],
            },
          },
        },
        {
          id: 'if_1',
          type: 'if_else',
          data: {
            type: 'if_else',
            label: 'If/Else',
            config: {
              conditions: [{ expression: '{{input.age}} > 18' }],
            },
          },
        },
        {
          id: 'log_t',
          type: 'log_output',
          data: { type: 'log_output', label: 'Log True', config: { level: 'info' } },
        },
        {
          id: 'log_f',
          type: 'log_output',
          data: { type: 'log_output', label: 'Log False', config: { level: 'warn' } },
        },
      ],
      edges: [],
    };

    const blueprint = buildStructuralBlueprint(workflow);
    expect(blueprint.overviewText).toContain('Form Trigger captures input data');
    expect(blueprint.nodeNarratives.some((n) => n.text.includes('captures input data'))).toBe(
      true
    );
    expect(blueprint.nodeNarratives.some((n) => n.text.includes('evaluates'))).toBe(true);
    expect(blueprint.branchNarratives.length).toBeGreaterThanOrEqual(2);
    expect(blueprint.terminalObservability.length).toBeGreaterThanOrEqual(2);
  });

  it('describes switch case routing and target nodes clearly', () => {
    const workflow: any = {
      nodes: [
        {
          id: 'form_1',
          type: 'form',
          data: {
            type: 'form',
            label: 'Student Form',
            config: {
              fields: [
                { key: 'name', label: 'Name' },
                { key: 'marks', label: 'Marks' },
              ],
            },
          },
        },
        {
          id: 'switch_1',
          type: 'switch',
          data: {
            type: 'switch',
            label: 'Marks Switch',
            config: {
              expression: '{{$json.result}}',
              cases: [{ value: 'pass' }, { value: 'fail' }],
            },
          },
        },
        {
          id: 'gmail_1',
          type: 'google_gmail',
          data: { type: 'google_gmail', label: 'Pass Email', config: {} },
        },
        {
          id: 'slack_1',
          type: 'slack_message',
          data: { type: 'slack_message', label: 'Fail Slack', config: {} },
        },
      ],
      edges: [
        { id: 'e1', source: 'form_1', target: 'switch_1', type: 'main' },
        { id: 'e2', source: 'switch_1', target: 'gmail_1', type: 'case_1' },
        { id: 'e3', source: 'switch_1', target: 'slack_1', type: 'case_2' },
      ],
    };

    const blueprint = buildStructuralBlueprint(workflow);
    expect(blueprint.nodeNarratives.some((n) => n.text.includes('checks "result"'))).toBe(true);
    expect(blueprint.branchNarratives).toContain('Case "pass" routes to Pass Email.');
    expect(blueprint.branchNarratives).toContain('Case "fail" routes to Fail Slack.');
  });
});
