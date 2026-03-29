import { describe, expect, it } from '@jest/globals';
import { validateStructuralReadiness } from '../../../core/validation/workflow-save-validator';
import { getStructuralDiagnostics, materializeStructuralFields } from '../structure-materializer';

describe('structure materializer', () => {
  it('stamps missing _fillMode keys from effective defaults without overwriting explicit entries', () => {
    const workflow: any = {
      nodes: [
        {
          id: 'if_1',
          type: 'if_else',
          data: {
            type: 'if_else',
            label: 'If',
            config: {
              conditions: [{ expression: '$json.x > 0' }],
              _fillMode: {
                conditions: 'manual_static',
              },
            },
          },
        },
      ],
      edges: [],
    };

    const out = materializeStructuralFields(workflow as any);
    const fm = (out.nodes[0] as any).data.config._fillMode as Record<string, string>;
    expect(fm.conditions).toBe('manual_static');
    expect(fm.combineOperation).toBe('manual_static');
  });

  it('materializes structural fields and coerces runtime ownership to buildtime', () => {
    const workflow: any = {
      nodes: [
        {
          id: 'n1',
          type: 'if_else',
          data: {
            type: 'if_else',
            label: 'If',
            config: {
              _fillMode: {
                conditions: 'runtime_ai',
              },
            },
          },
        },
      ],
      edges: [],
    };

    const out = materializeStructuralFields(workflow as any);
    const cfg: any = out.nodes[0].data.config;
    expect(Array.isArray(cfg.conditions)).toBe(true);
    expect(cfg._fillMode.conditions).toBe('buildtime_ai_once');
  });

  it('derives form.fields and if_else.conditions from intent prompt', () => {
    const workflow: any = {
      nodes: [
        {
          id: 'form_1',
          type: 'form',
          data: {
            type: 'form',
            label: 'Form',
            config: {
              fields: [],
              _fillMode: { fields: 'runtime_ai' },
            },
          },
        },
        {
          id: 'if_1',
          type: 'if_else',
          data: {
            type: 'if_else',
            label: 'If',
            config: {
              conditions: [],
              _fillMode: { conditions: 'runtime_ai' },
            },
          },
        },
      ],
      edges: [],
      metadata: {
        generatedFrom:
          'Create a workflow where user submits Name, Email and Age. If age > 18 send Gmail else send Slack.',
      },
    };

    const out = materializeStructuralFields(workflow);
    const formConfig: any = out.nodes[0].data.config;
    const ifConfig: any = out.nodes[1].data.config;
    expect(Array.isArray(formConfig.fields)).toBe(true);
    expect(formConfig.fields.length).toBeGreaterThan(0);
    expect(formConfig.fields.some((f: any) => f.key === 'age')).toBe(true);
    expect(formConfig.fields.every((f: any) => String(f.key).length <= 32)).toBe(true);
    expect(formConfig.fields.every((f: any) => String(f.label).length <= 40)).toBe(true);
    expect(Array.isArray(ifConfig.conditions)).toBe(true);
    expect(String(ifConfig.conditions[0]?.expression || '')).toContain('> 18');
    expect(JSON.stringify(ifConfig.conditions)).toMatch(/\$json\./);
    const unresolved = getStructuralDiagnostics(out as any).unresolved;
    expect(
      unresolved.some((u: any) => u.nodeType === 'form' && u.fieldName === 'fields')
    ).toBe(false);
    expect(
      unresolved.some((u: any) => u.nodeType === 'if_else' && u.fieldName === 'conditions')
    ).toBe(false);
  });

  it('derives form_trigger.fields from intent prompt same as form.fields', () => {
    const workflow: any = {
      nodes: [
        {
          id: 'ft_1',
          type: 'form_trigger',
          data: {
            type: 'form_trigger',
            label: 'Form',
            category: 'triggers',
            config: {
              fields: [],
              _fillMode: { fields: 'buildtime_ai_once' },
            },
          },
        },
      ],
      edges: [],
      metadata: {
        generatedFrom:
          'Create a workflow where user submits Name, Email and Phone. If age > 18 send Gmail else Slack.',
      },
    };

    const out = materializeStructuralFields(workflow);
    const cfg: any = out.nodes[0].data.config;
    expect(Array.isArray(cfg.fields)).toBe(true);
    expect(cfg.fields.length).toBeGreaterThan(0);
    expect(cfg.fields.some((f: any) => ['name', 'email', 'phone'].includes(String(f.key || '')))).toBe(true);
    const unresolved = getStructuralDiagnostics(out as any).unresolved;
    expect(unresolved.some((u: any) => u.nodeType === 'form_trigger' && u.fieldName === 'fields')).toBe(
      false
    );
  });

  it('derives switch.expression and switch.cases from intent prompt', () => {
    const workflow: any = {
      nodes: [
        {
          id: 'switch_1',
          type: 'switch',
          data: {
            type: 'switch',
            label: 'Switch',
            config: {
              expression: '',
              cases: [],
              _fillMode: { expression: 'runtime_ai', cases: 'runtime_ai' },
            },
          },
        },
      ],
      edges: [],
      metadata: {
        generatedFrom:
          'From form input classify message as sales, support, or general and route by switch.',
      },
    };

    const out = materializeStructuralFields(workflow);
    const cfg: any = out.nodes[0].data.config;
    expect(typeof cfg.expression).toBe('string');
    expect(cfg.expression.length).toBeGreaterThan(0);
    expect(Array.isArray(cfg.cases)).toBe(true);
    expect(cfg.cases.length).toBeGreaterThanOrEqual(2);
    expect(cfg._fillMode.expression).toBe('buildtime_ai_once');
    expect(cfg._fillMode.cases).toBe('buildtime_ai_once');
  });

  it('normalizes malformed persisted switch cases to canonical array shape', () => {
    const workflow: any = {
      nodes: [
        {
          id: 'switch_1',
          type: 'switch',
          data: {
            type: 'switch',
            label: 'Switch',
            config: {
              expression: '{{$json.color}}',
              cases: '/',
              rules: '[{\"value\":\"red\"},{\"value\":\"blue\"}]',
              _fillMode: { expression: 'manual_static', cases: 'manual_static' },
            },
          },
        },
      ],
      edges: [],
      metadata: { generatedFrom: 'route by color red or blue' },
    };

    const out = materializeStructuralFields(workflow);
    const cfg: any = out.nodes[0].data.config;
    expect(Array.isArray(cfg.cases)).toBe(true);
    expect(cfg.cases.map((c: any) => c.value)).toEqual(['red', 'blue']);
  });

  it('derives form fields and switch cases from explicit color intent', () => {
    const workflow: any = {
      nodes: [
        {
          id: 'form_1',
          type: 'form',
          data: {
            type: 'form',
            label: 'Form',
            config: {
              fields: [],
              _fillMode: { fields: 'runtime_ai' },
            },
          },
        },
        {
          id: 'switch_1',
          type: 'switch',
          data: {
            type: 'switch',
            label: 'Switch',
            config: {
              expression: '',
              cases: [],
              _fillMode: { expression: 'runtime_ai', cases: 'runtime_ai' },
            },
          },
        },
      ],
      edges: [],
      metadata: {
        generatedFrom:
          'Create a form with fields Name, Email, Color. Use a switch on Color with cases blue, black, red.',
      },
    };

    const out = materializeStructuralFields(workflow);
    const formCfg: any = out.nodes[0].data.config;
    const switchCfg: any = out.nodes[1].data.config;

    expect(Array.isArray(formCfg.fields)).toBe(true);
    expect(formCfg.fields.some((f: any) => f.key === 'color')).toBe(true);
    expect(formCfg.fields.some((f: any) => f.key === 'age')).toBe(false);
    expect(switchCfg.expression).toContain('{{$json.color}}');
    const caseValues = (switchCfg.cases || []).map((c: any) => c.value);
    expect(caseValues).toEqual(expect.arrayContaining(['blue', 'black', 'red']));
  });

  it('maintains multi-branch intent for color switch in structured summary', () => {
    // This mirrors the ball color example to ensure summarize-layer + branching
    // metadata treat switch as a 3-branch construct rather than collapsing to 2.
    const userPrompt =
      'Create an autonomous workflow with a form trigger that collects ball color as user input. ' +
      'Use a switch condition to evaluate the color: if red, send a notification via Slack; ' +
      'if blue, send an email via Gmail; if green, perform a logout action.';

    // Simulate a minimal proposed node chain from planner:
    const chain = ['form', 'switch', 'slack_message', 'google_gmail', 'log_output'];
    const clarifier: any = new (require('../summarize-layer').AIIntentClarifier)();
    const branching = clarifier['buildBranchMetadataForPlan'](userPrompt, chain);

    expect(branching).toBeDefined();
    expect(branching!.branchKind).toBe('switch');
    expect(branching!.cases.length).toBeGreaterThanOrEqual(3);
  });

  it('uses originalUserPrompt for form fields so merged planner text does not add node-like fields', () => {
    const workflow: any = {
      nodes: [
        {
          id: 'form_1',
          type: 'form',
          data: {
            type: 'form',
            label: 'Form',
            config: {
              fields: [],
              _fillMode: { fields: 'runtime_ai' },
            },
          },
        },
      ],
      edges: [],
      metadata: {
        generatedFrom: [
          'Connection plan:',
          '1. Form Trigger (form) -> If/Else (if_else)',
          '2. Gmail (google_gmail) -> Slack (slack_message)',
          'User intent:',
          'Create a workflow: when a form is submitted (Name, Email, Age). Branch by Age.',
        ].join('\n'),
        originalUserPrompt:
          'Create a workflow: when a form is submitted (Name, Email, Age). Branch by Age.',
      },
    };

    const out = materializeStructuralFields(workflow);
    const formConfig: any = out.nodes[0].data.config;
    const keys = (formConfig.fields || []).map((f: any) => f.key).sort();
    expect(keys).toEqual(['age', 'email', 'name']);
    expect(formConfig.fields.some((f: any) => f.key === 'google_gmail')).toBe(false);
    expect(formConfig.fields.some((f: any) => f.key === 'if_else')).toBe(false);
  });

  it('strict structural readiness passes after materialize (matches generate-workflow gate order)', () => {
    const workflow: any = {
      nodes: [
        {
          id: 'form_1',
          type: 'form',
          data: {
            type: 'form',
            label: 'Form',
            config: {
              fields: [],
              _fillMode: { fields: 'manual_static' },
            },
          },
        },
        {
          id: 'if_1',
          type: 'if_else',
          data: {
            type: 'if_else',
            label: 'If',
            config: {
              conditions: [],
              _fillMode: { conditions: 'manual_static' },
            },
          },
        },
      ],
      edges: [],
      metadata: {
        generatedFrom:
          'Collect name, email, age. If age is greater than 18 route to premium.',
      },
    };

    const before = validateStructuralReadiness(workflow.nodes, { strict: true });
    expect(before.errors.length).toBeGreaterThan(0);

    const out = materializeStructuralFields(workflow);
    const after = validateStructuralReadiness(out.nodes, { strict: true });
    expect(after.errors.length).toBe(0);
  });

  it('extracts semantic field "age" from long phrase prompts', () => {
    const workflow: any = {
      nodes: [
        {
          id: 'form_1',
          type: 'form',
          data: {
            type: 'form',
            label: 'Form',
            config: {
              fields: [],
              _fillMode: { fields: 'runtime_ai' },
            },
          },
        },
      ],
      edges: [],
      metadata: {
        generatedFrom:
          'Create an autonomous workflow where a user submits details through a form including age.',
      },
    };

    const out = materializeStructuralFields(workflow);
    const formConfig: any = out.nodes[0].data.config;
    expect(formConfig.fields.some((f: any) => f.key === 'age')).toBe(true);
    const ageField = formConfig.fields.find((f: any) => f.key === 'age');
    expect(ageField?.type).toBe('number');
    expect(formConfig.fields.some((f: any) => String(f.key).startsWith('details_through_a_form'))).toBe(false);
  });
});
