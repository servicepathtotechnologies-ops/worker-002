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

  it('upgrades marks field to number from numeric if_else condition evidence', () => {
    const workflow: Workflow = {
      nodes: [
        {
          id: 'f1',
          type: 'form',
          data: {
            type: 'form',
            label: 'Form',
            category: 'triggers',
            config: {
              fields: [
                { id: 'field_marks', key: 'marks', name: 'marks', label: 'Marks', type: 'text', required: true },
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
                { field: '$json.marks', operator: 'greater_than', value: 35 },
              ],
            },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'f1', target: 'ie1' }],
      metadata: { originalUserPrompt: 'If marks > 35 mark pass else fail.' },
    };

    const out = applyStructuralIntentAlignment(workflow);
    const formNode = out.nodes.find((n) => n.id === 'f1') as any;
    expect(formNode?.data?.config?.fields?.[0]?.type).toBe('number');
  });

  it('is idempotent for field type self-healing', () => {
    const workflow: Workflow = {
      nodes: [
        {
          id: 'f1',
          type: 'form',
          data: {
            type: 'form',
            label: 'Form',
            category: 'triggers',
            config: {
              fields: [
                { id: 'field_marks', key: 'marks', name: 'marks', label: 'Marks', type: 'text', required: true },
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
              conditions: [{ field: '$json.marks', operator: 'greater_than', value: 35 }],
            },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'f1', target: 'ie1' }],
      metadata: { originalUserPrompt: 'If marks > 35 mark pass else fail.' },
    };

    const first = applyStructuralIntentAlignment(workflow);
    const second = applyStructuralIntentAlignment(first);
    const firstForm = (first.nodes.find((n) => n.id === 'f1') as any)?.data?.config?.fields;
    const secondForm = (second.nodes.find((n) => n.id === 'f1') as any)?.data?.config?.fields;
    expect(secondForm).toEqual(firstForm);
    const firstCond = (first.nodes.find((n) => n.id === 'ie1') as any)?.data?.config?.conditions;
    const secondCond = (second.nodes.find((n) => n.id === 'ie1') as any)?.data?.config?.conditions;
    expect(secondCond).toEqual(firstCond);
  });

  it('removes spurious form fields not in intent-derived key list when originalUserPrompt is set', () => {
    const workflow: Workflow = {
      nodes: [
        {
          id: 'f1',
          type: 'form',
          data: {
            type: 'form',
            label: 'Form',
            category: 'triggers',
            config: {
              fields: [
                { id: 'field_name', key: 'name', name: 'name', label: 'Name', type: 'text', required: true },
                { id: 'field_email', key: 'email', name: 'email', label: 'Email', type: 'text', required: true },
                { id: 'field_se', key: 'se', name: 'se', label: 'Se', type: 'text', required: true },
              ],
            },
          },
        },
      ],
      edges: [],
      metadata: {
        originalUserPrompt:
          'When I submit a form with name and email, send a welcome email, then write a log entry',
      },
    };

    const out = applyStructuralIntentAlignment(workflow);
    const formNode = out.nodes.find((n) => n.id === 'f1') as any;
    const fields = formNode?.data?.config?.fields as Array<{ key?: string }>;
    expect(fields?.length).toBe(2);
    expect(fields?.map((f) => f.key)).toEqual(['name', 'email']);
  });

  it('preserves custom labels when reconciling to intent-derived keys', () => {
    const workflow: Workflow = {
      nodes: [
        {
          id: 'f1',
          type: 'form',
          data: {
            type: 'form',
            label: 'Form',
            category: 'triggers',
            config: {
              fields: [
                {
                  id: 'field_name',
                  key: 'name',
                  name: 'name',
                  label: 'Full Name',
                  type: 'text',
                  required: true,
                },
                {
                  id: 'field_email',
                  key: 'email',
                  name: 'email',
                  label: 'Work Email',
                  type: 'text',
                  required: true,
                },
                { id: 'field_se', key: 'se', name: 'se', label: 'Se', type: 'text', required: true },
              ],
            },
          },
        },
      ],
      edges: [],
      metadata: {
        originalUserPrompt:
          'When I submit a form with name and email, send a welcome email, then write a log entry',
      },
    };

    const out = applyStructuralIntentAlignment(workflow);
    const formNode = out.nodes.find((n) => n.id === 'f1') as any;
    const fields = formNode?.data?.config?.fields as Array<{ key?: string; label?: string }>;
    expect(fields?.find((f) => f.key === 'name')?.label).toBe('Full Name');
    expect(fields?.find((f) => f.key === 'email')?.label).toBe('Work Email');
  });

  it('keeps if_else-referenced keys when prompt does not repeat the operand', () => {
    const workflow: Workflow = {
      nodes: [
        {
          id: 'f1',
          type: 'form',
          data: {
            type: 'form',
            label: 'Form',
            category: 'triggers',
            config: {
              fields: [
                { id: 'field_name', key: 'name', name: 'name', label: 'Name', type: 'text', required: true },
                { id: 'field_noise', key: 'noise', name: 'noise', label: 'Noise', type: 'text', required: true },
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
      edges: [{ id: 'e1', source: 'f1', target: 'ie1' }],
      metadata: {
        originalUserPrompt: 'Collect name only from the form.',
      },
    };

    const out = applyStructuralIntentAlignment(workflow);
    const formNode = out.nodes.find((n) => n.id === 'f1') as any;
    const keys = (formNode?.data?.config?.fields as Array<{ key?: string }>).map((f) => f.key);
    expect(keys).toContain('name');
    expect(keys).toContain('experience');
    expect(keys).not.toContain('noise');
  });

  it('does not wipe form fields when intent text is empty and graph has no operand refs', () => {
    const workflow: Workflow = {
      nodes: [
        {
          id: 'f1',
          type: 'form',
          data: {
            type: 'form',
            label: 'Form',
            category: 'triggers',
            config: {
              fields: [
                { id: 'field_name', key: 'name', name: 'name', label: 'Name', type: 'text', required: true },
                { id: 'field_se', key: 'se', name: 'se', label: 'Se', type: 'text', required: true },
              ],
            },
          },
        },
      ],
      edges: [],
      metadata: {
        generatedFrom:
          'Goal:\nDetected nodes: 2\nExecution:\n1. Form (form) → Gmail (google_gmail)\n## Configuration contract',
      },
    };

    const out = applyStructuralIntentAlignment(workflow);
    const formNode = out.nodes.find((n) => n.id === 'f1') as any;
    const fields = formNode?.data?.config?.fields as Array<{ key?: string }>;
    expect(fields?.length).toBe(2);
    expect(fields?.some((f) => f.key === 'se')).toBe(true);
  });

  it('skips intent prune when metadata.disableFormFieldIntentPrune is true', () => {
    const workflow: Workflow = {
      nodes: [
        {
          id: 'f1',
          type: 'form',
          data: {
            type: 'form',
            label: 'Form',
            category: 'triggers',
            config: {
              fields: [
                { id: 'field_name', key: 'name', name: 'name', label: 'Name', type: 'text', required: true },
                { id: 'field_email', key: 'email', name: 'email', label: 'Email', type: 'text', required: true },
                { id: 'field_se', key: 'se', name: 'se', label: 'Se', type: 'text', required: true },
              ],
            },
          },
        },
      ],
      edges: [],
      metadata: {
        originalUserPrompt:
          'When I submit a form with name and email, send a welcome email, then write a log entry',
        disableFormFieldIntentPrune: true,
      },
    };

    const out = applyStructuralIntentAlignment(workflow);
    const formNode = out.nodes.find((n) => n.id === 'f1') as any;
    const fields = formNode?.data?.config?.fields as Array<{ key?: string }>;
    expect(fields?.length).toBe(3);
    expect(fields?.some((f) => f.key === 'se')).toBe(true);
  });
});
