import { describe, expect, it } from '@jest/globals';
import type { Workflow } from '../../../core/types/ai-types';
import {
  deriveOrderedFieldKeysForForm,
  sanitizeIntentTextForFormFieldExtraction,
} from '../intent-extraction';

describe('sanitizeIntentTextForFormFieldExtraction', () => {
  it('removes Configuration contract and planner boilerplate', () => {
    const raw = `Goal:
Collect candidate info.

Execution:
1. Form Trigger (form) → If/Else (if_else)

## Configuration contract (registry — how fields are filled)
### Form Trigger (\`form\`)
- buildtime_ai_once: fields (required ownership=structural)

**Planner rules:** Enumerate every node.
`;
    const out = sanitizeIntentTextForFormFieldExtraction(raw);
    expect(out).not.toContain('Configuration contract');
    expect(out).not.toContain('Planner rules');
    expect(out).not.toContain('ownership=structural');
    expect(out).toContain('Goal:');
  });
});

describe('deriveOrderedFieldKeysForForm', () => {
  it('does not invent dozens of keys from merged structured summary + contract', () => {
    const huge = `Goal:
Create an autonomous workflow where a candidate submits details through a form including years of experience.
If experience > 3 years, shortlist.

Execution:
1. Form Trigger (form) → If/Else (if_else) — start workflow
2. If/Else (if_else) → Gmail (google_gmail) [true]

Terminals: 2 separate log_output nodes

## Configuration contract (registry — how fields are filled)

### Form Trigger (\`form\`)
- buildtime_ai_once: formTitle (required ownership=structural role=title_like); fields (required ownership=structural role=raw_json)

**Planner rules:** Enumerate every node in the architecture.
`;
    const wf: Workflow = {
      nodes: [
        {
          id: 'ie',
          type: 'if_else',
          data: {
            type: 'if_else',
            label: 'If',
            category: 'logic',
            config: {
              conditions: [
                {
                  field: '$json.experience',
                  operator: 'greater_than',
                  value: 3,
                  expression: '{{$json.experience}} > 3',
                },
              ],
            },
          },
        },
      ],
      edges: [],
    };
    const keys = deriveOrderedFieldKeysForForm(huge, wf);
    expect(keys).toContain('experience');
    expect(keys.filter((k) => k.includes('conditions') || k === 'form')).toEqual([]);
    expect(keys.length).toBeLessThan(8);
  });
});
