import { describe, expect, it } from '@jest/globals';
import {
  normalizeFormFieldsIdentity,
  normalizeWorkflowFormFieldIdentities,
} from '../form-field-identity';

describe('form field identity canonicalizer', () => {
  it('shortens long keys/labels and enforces snake_case', () => {
    const fields = normalizeFormFieldsIdentity([
      {
        label: 'Details Through A Form Including Age',
        key: 'details_through_a_form_including_age',
        type: 'number',
        required: true,
      },
    ]);
    expect(fields[0].key.length).toBeLessThanOrEqual(32);
    expect(fields[0].label.length).toBeLessThanOrEqual(40);
    expect(fields[0].key).toMatch(/^[a-z0-9_]+$/);
    expect(fields[0].name).toBe(fields[0].key);
  });

  it('resolves key collisions deterministically', () => {
    const fields = normalizeFormFieldsIdentity([
      { label: 'Customer Name', key: 'customer_name', type: 'text', required: true },
      { label: 'Customer Name', key: 'customer_name', type: 'text', required: true },
    ]);
    expect(fields[0].key).not.toBe(fields[1].key);
  });

  it('normalizes all form nodes in workflow', () => {
    const wf: any = {
      nodes: [
        {
          id: 'f1',
          data: {
            type: 'form',
            config: {
              fields: [
                { label: 'Very Long Label For User Age In Years Input', key: 'very_long_label_for_user_age_in_years_input', type: 'number', required: true },
              ],
            },
          },
        },
      ],
      edges: [],
    };
    const out = normalizeWorkflowFormFieldIdentities(wf);
    const normalizedField = (out as any).nodes[0].data.config.fields[0];
    expect(String(normalizedField.key).length).toBeLessThanOrEqual(32);
  });
});
