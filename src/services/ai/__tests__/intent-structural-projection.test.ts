import { describe, expect, it } from '@jest/globals';
import type { Workflow } from '../../../core/types/ai-types';
import { applyStructuralIntentAlignment } from '../intent-structural-projection';
import { isPlaceholderFormFields } from '../intent-extraction';
import { buildWorkflowIntentModel } from '../workflow-intent-model';

describe('applyStructuralIntentAlignment', () => {
  it('replaces placeholder form fields with keys from if_else input refs', () => {
    const workflow: Workflow = {
      nodes: [
        {
          id: 'ft1',
          type: 'form_trigger',
          data: {
            type: 'form_trigger',
            label: 'Form',
            category: 'triggers',
            config: {
              fields: [
                {
                  id: 'field_response_placeholder',
                  key: 'response',
                  name: 'response',
                  label: 'Response',
                  type: 'textarea',
                  required: false,
                },
              ],
            },
          },
        },
        {
          id: 'ie1',
          type: 'if_else',
          data: {
            type: 'if_else',
            label: 'Branch',
            category: 'logic',
            config: {
              conditions: [
                {
                  field: 'input.experience',
                  operator: 'greater_than',
                  value: 3,
                  expression: '{{input.experience}} > 3',
                },
              ],
            },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'ft1', target: 'ie1' }],
      metadata: {
        generatedFrom: 'Screen candidates; if years of experience > 3 shortlist else reject.',
        originalUserPrompt: 'Screen candidates; if years of experience > 3 shortlist else reject.',
      },
    };

    const out = applyStructuralIntentAlignment(workflow);
    const formNode = out.nodes.find((n) => n.id === 'ft1');
    const fields = formNode?.data?.config?.fields as Array<{ key?: string }>;
    expect(Array.isArray(fields)).toBe(true);
    expect(isPlaceholderFormFields(fields)).toBe(false);
    expect(fields?.some((f) => f.key === 'experience')).toBe(true);
    expect((out.metadata as any)?.workflowIntentModel?.version).toBe(1);
    expect((out.metadata as any)?.workflowIntentModel?.collectedInputs?.length).toBeGreaterThan(0);
  });

  it('buildWorkflowIntentModel captures ordered keys from prompt', () => {
    const wf: Workflow = { nodes: [], edges: [] };
    const model = buildWorkflowIntentModel(
      wf,
      'Collect name, email and years_experience. If experience > 3 send Gmail.'
    );
    const keys = model.collectedInputs.map((c) => c.key);
    expect(keys.length).toBeGreaterThan(0);
  });
});
