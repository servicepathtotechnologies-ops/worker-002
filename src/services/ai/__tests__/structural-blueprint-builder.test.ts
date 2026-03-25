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
    expect(blueprint.overviewText).toContain('Workflow structure');
    expect(blueprint.nodeNarratives.some((n) => n.text.includes('captures input data'))).toBe(
      true
    );
    expect(blueprint.nodeNarratives.some((n) => n.text.includes('evaluates'))).toBe(true);
    expect(blueprint.branchNarratives.length).toBeGreaterThanOrEqual(2);
    expect(blueprint.terminalObservability.length).toBeGreaterThanOrEqual(2);
  });
});
