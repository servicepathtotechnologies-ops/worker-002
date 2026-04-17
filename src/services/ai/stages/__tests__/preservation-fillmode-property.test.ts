/**
 * Preservation Property Tests — AI Pre-Build Value Persistence Fix
 *
 * Task 2: Write preservation property tests (BEFORE implementing fix)
 *
 * OBSERVATION-FIRST METHODOLOGY:
 * These tests observe and assert EXISTING (unfixed) behavior for all inputs where
 * isBugCondition is FALSE. They MUST PASS on unfixed code — they lock in baseline behavior.
 *
 * isBugCondition(node, fieldName) is FALSE when:
 *   - The field is manual_static (not buildtime_ai_once)
 *   - The field is credential-owned
 *   - The field is a branch field (cases/rules)
 *   - The AI value is empty (nothing to protect)
 *   - The incoming value is non-empty (user is actively providing a value)
 *
 * EXPECTED OUTCOME: ALL tests PASS on unfixed code.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 */

import { describe, it, expect } from 'vitest';
import { shouldPreserveExistingBuildtimeValue } from '../../../../core/utils/attach-inputs-merge-guard';
import { resolveEffectiveFieldFillMode } from '../../../../core/utils/fill-mode-resolver';
import { materializeStructuralFields } from '../../structure-materializer';
import type { NodeInputSchema } from '../../../../core/types/unified-node-contract';
import type { Workflow } from '../../../../core/types/ai-types';

// ─── Shared schema fixtures ───────────────────────────────────────────────────

/**
 * Schema with a manual_static field (no fillMode.default or explicit manual_static).
 * Represents a typical user-owned field like a webhook URL or static label.
 */
const MANUAL_STATIC_SCHEMA: NodeInputSchema = {
  subject: {
    type: 'string',
    required: false,
    description: 'Email subject',
    fillMode: { default: 'manual_static' },
    ownership: 'value',
  },
};

/**
 * Schema with a credential-owned field (ownership: 'credential').
 * Represents OAuth tokens, webhook URLs, API keys.
 */
const CREDENTIAL_SCHEMA: NodeInputSchema = {
  webhookUrl: {
    type: 'string',
    required: false,
    description: 'Slack webhook URL',
    fillMode: { default: 'manual_static' },
    ownership: 'credential',
    credentialTogglePolicy: 'locked',
  },
};

/**
 * Schema with a buildtime_ai_once field.
 * Represents AI-generated content like Slack message text.
 */
const BUILDTIME_AI_SCHEMA: NodeInputSchema = {
  text: {
    type: 'string',
    required: false,
    description: 'Message text',
    fillMode: { default: 'buildtime_ai_once' },
    ownership: 'value',
  },
};

/**
 * Schema with a switch cases field (STRUCTURAL_BRANCH_FIELDS exempt).
 */
const SWITCH_SCHEMA: NodeInputSchema = {
  cases: {
    type: 'array',
    required: false,
    description: 'Switch cases',
    fillMode: { default: 'buildtime_ai_once' },
    ownership: 'value',
  },
  rules: {
    type: 'array',
    required: false,
    description: 'Switch rules (alias for cases)',
    fillMode: { default: 'buildtime_ai_once' },
    ownership: 'value',
  },
};

// ─── Helper: build a minimal frozen workflow ──────────────────────────────────

function makeFrozenWorkflow(nodes: any[]): Workflow {
  return {
    nodes,
    edges: [],
    metadata: {
      freezeBoundary: { frozen: true },
    },
  } as any;
}

function makeUnfrozenWorkflow(nodes: any[]): Workflow {
  return {
    nodes,
    edges: [],
  } as any;
}

// ─── Preservation 3.1: manual_static field freely overwritten ────────────────

/**
 * Requirement 3.1: WHEN a user explicitly sets a field's fill mode to manual_static,
 * THEN the system SHALL CONTINUE TO accept and apply the user-supplied value.
 *
 * isBugCondition is FALSE here because the field is manual_static.
 * shouldPreserveExistingBuildtimeValue must return { preserve: false }.
 *
 * **Validates: Requirements 3.1**
 */
describe('Preservation 3.1 — manual_static field with non-empty incoming value is applied (not preserved)', () => {
  it('shouldPreserveExistingBuildtimeValue returns { preserve: false } for manual_static field with non-empty incoming', () => {
    // Config: _fillMode.subject = 'manual_static' (user-owned field)
    const config: Record<string, unknown> = {
      subject: 'Old subject from AI',
      _fillMode: { subject: 'manual_static' },
    };

    const result = shouldPreserveExistingBuildtimeValue(
      'subject',
      MANUAL_STATIC_SCHEMA,
      config,
      'Old subject from AI',   // existing non-empty value
      'New subject from user', // incoming non-empty value
    );

    // Preservation: manual_static fields must never be blocked
    expect(result.preserve).toBe(false);
  });

  it('shouldPreserveExistingBuildtimeValue returns { preserve: false } for manual_static field with empty incoming', () => {
    // Even with empty incoming, manual_static fields must be freely overwritten
    const config: Record<string, unknown> = {
      subject: 'Old subject',
      _fillMode: { subject: 'manual_static' },
    };

    const result = shouldPreserveExistingBuildtimeValue(
      'subject',
      MANUAL_STATIC_SCHEMA,
      config,
      'Old subject',
      '', // empty incoming — still must not be preserved for manual_static
    );

    expect(result.preserve).toBe(false);
  });

  it('resolveEffectiveFieldFillMode returns manual_static when _fillMode entry is manual_static', () => {
    const config = { _fillMode: { subject: 'manual_static' } };
    const mode = resolveEffectiveFieldFillMode('subject', MANUAL_STATIC_SCHEMA, config);
    expect(mode).toBe('manual_static');
  });

  it('resolveEffectiveFieldFillMode returns manual_static when no _fillMode entry and schema default is manual_static', () => {
    const config = {}; // no _fillMode at all
    const mode = resolveEffectiveFieldFillMode('subject', MANUAL_STATIC_SCHEMA, config);
    expect(mode).toBe('manual_static');
  });
});

// ─── Preservation 3.2: non-empty incoming for buildtime_ai_once with empty stored → applied ──

/**
 * Requirement 3.2: WHEN attach-inputs receives a non-empty incoming value for a
 * buildtime_ai_once field and the existing stored value is empty, THEN the system
 * SHALL CONTINUE TO apply the incoming value (no false preservation of empty defaults).
 *
 * isBugCondition is FALSE here because the incoming value is non-empty.
 * shouldPreserveExistingBuildtimeValue must return { preserve: false }.
 *
 * **Validates: Requirements 3.2**
 */
describe('Preservation 3.2 — buildtime_ai_once field with non-empty incoming value is applied', () => {
  it('shouldPreserveExistingBuildtimeValue returns { preserve: false } when existing is empty and incoming is non-empty', () => {
    // Config: _fillMode.text = 'buildtime_ai_once', but stored value is empty
    const config: Record<string, unknown> = {
      text: '',  // empty stored value — nothing to protect
      _fillMode: { text: 'buildtime_ai_once' },
    };

    const result = shouldPreserveExistingBuildtimeValue(
      'text',
      BUILDTIME_AI_SCHEMA,
      config,
      '',                    // existing empty value
      'User-provided text',  // incoming non-empty value
    );

    // Preservation: non-empty incoming must be applied when stored is empty
    expect(result.preserve).toBe(false);
  });

  it('shouldPreserveExistingBuildtimeValue returns { preserve: false } when both existing and incoming are non-empty', () => {
    // Config: _fillMode.text = 'buildtime_ai_once', both values non-empty
    const config: Record<string, unknown> = {
      text: 'AI-generated text',
      _fillMode: { text: 'buildtime_ai_once' },
    };

    const result = shouldPreserveExistingBuildtimeValue(
      'text',
      BUILDTIME_AI_SCHEMA,
      config,
      'AI-generated text',   // existing non-empty value
      'User-provided text',  // incoming non-empty value (user is actively replacing)
    );

    // Preservation: non-empty incoming must be applied (no false preservation)
    expect(result.preserve).toBe(false);
  });

  it('shouldPreserveExistingBuildtimeValue returns { preserve: false } when existing is undefined and incoming is non-empty', () => {
    const config: Record<string, unknown> = {
      _fillMode: { text: 'buildtime_ai_once' },
    };

    const result = shouldPreserveExistingBuildtimeValue(
      'text',
      BUILDTIME_AI_SCHEMA,
      config,
      undefined,             // no existing value
      'User-provided text',  // incoming non-empty value
    );

    expect(result.preserve).toBe(false);
  });
});

// ─── Preservation 3.3: credential-owned fields route through credential guard ─

/**
 * Requirement 3.3: WHEN attach-inputs processes credential-owned fields,
 * THEN the system SHALL CONTINUE TO route those fields through the existing
 * credential guard unchanged.
 *
 * isBugCondition is FALSE here because credential fields are not buildtime_ai_once.
 * resolveEffectiveFieldFillMode must coerce credential fields to manual_static (locked).
 *
 * **Validates: Requirements 3.3**
 */
describe('Preservation 3.3 — credential-owned field is rejected by credential guard (not preserved as buildtime_ai_once)', () => {
  it('resolveEffectiveFieldFillMode coerces credential field to manual_static (locked policy)', () => {
    // Credential field with locked policy — must not be treated as buildtime_ai_once
    const config: Record<string, unknown> = {
      webhookUrl: 'https://hooks.slack.com/services/xxx',
      _fillMode: { webhookUrl: 'buildtime_ai_once' }, // even if someone tried to stamp it
    };

    const mode = resolveEffectiveFieldFillMode('webhookUrl', CREDENTIAL_SCHEMA, config);

    // Credential guard coerces to manual_static (locked policy)
    // The field is NOT treated as buildtime_ai_once
    expect(mode).toBe('manual_static');
  });

  it('shouldPreserveExistingBuildtimeValue returns { preserve: false } for credential field (mode coerced to manual_static)', () => {
    const config: Record<string, unknown> = {
      webhookUrl: 'https://hooks.slack.com/services/xxx',
      _fillMode: { webhookUrl: 'buildtime_ai_once' },
    };

    const result = shouldPreserveExistingBuildtimeValue(
      'webhookUrl',
      CREDENTIAL_SCHEMA,
      config,
      'https://hooks.slack.com/services/xxx', // existing non-empty
      '',                                      // incoming empty
    );

    // Credential guard coerces mode to manual_static → preserve: false
    expect(result.preserve).toBe(false);
  });

  it('resolveEffectiveFieldFillMode returns manual_static for credential field with no _fillMode entry', () => {
    const config: Record<string, unknown> = {
      webhookUrl: 'https://hooks.slack.com/services/xxx',
      // no _fillMode
    };

    const mode = resolveEffectiveFieldFillMode('webhookUrl', CREDENTIAL_SCHEMA, config);
    expect(mode).toBe('manual_static');
  });
});

// ─── Preservation 3.4: cases/rules array shrink is allowed ───────────────────

/**
 * Requirement 3.4: WHEN attach-inputs processes switch cases or rules fields,
 * THEN the system SHALL CONTINUE TO allow the user to reduce the number of cases
 * freely (the STRUCTURAL_BRANCH_FIELDS exemption must remain in effect).
 *
 * isBugCondition is FALSE here because cases/rules are in STRUCTURAL_BRANCH_FIELDS.
 * shouldPreserveExistingBuildtimeValue must return { preserve: false } for cases/rules.
 *
 * **Validates: Requirements 3.4**
 */
describe('Preservation 3.4 — cases/rules array shrink on switch node is accepted (STRUCTURAL_BRANCH_FIELDS exempt)', () => {
  it('shouldPreserveExistingBuildtimeValue returns { preserve: false } for cases field even when incoming is shorter', () => {
    const config: Record<string, unknown> = {
      cases: [{ value: 'a' }, { value: 'b' }, { value: 'c' }],
      _fillMode: { cases: 'buildtime_ai_once' },
    };

    const result = shouldPreserveExistingBuildtimeValue(
      'cases',
      SWITCH_SCHEMA,
      config,
      [{ value: 'a' }, { value: 'b' }, { value: 'c' }], // existing: 3 cases
      [{ value: 'a' }],                                   // incoming: 1 case (shrink)
    );

    // STRUCTURAL_BRANCH_FIELDS exemption: cases shrink must be allowed
    expect(result.preserve).toBe(false);
  });

  it('shouldPreserveExistingBuildtimeValue returns { preserve: false } for rules field even when incoming is shorter', () => {
    const config: Record<string, unknown> = {
      rules: [{ value: 'x' }, { value: 'y' }],
      _fillMode: { rules: 'buildtime_ai_once' },
    };

    const result = shouldPreserveExistingBuildtimeValue(
      'rules',
      SWITCH_SCHEMA,
      config,
      [{ value: 'x' }, { value: 'y' }], // existing: 2 rules
      [],                                 // incoming: empty (full shrink)
    );

    // STRUCTURAL_BRANCH_FIELDS exemption: rules shrink must be allowed
    expect(result.preserve).toBe(false);
  });

  it('shouldPreserveExistingBuildtimeValue returns { preserve: false } for cases with empty incoming', () => {
    const config: Record<string, unknown> = {
      cases: [{ value: 'a' }, { value: 'b' }],
      _fillMode: { cases: 'buildtime_ai_once' },
    };

    const result = shouldPreserveExistingBuildtimeValue(
      'cases',
      SWITCH_SCHEMA,
      config,
      [{ value: 'a' }, { value: 'b' }],
      [],
    );

    expect(result.preserve).toBe(false);
  });
});

// ─── Preservation 3.5: unknown node types skipped without error ───────────────

/**
 * Requirement 3.5: WHEN the property-population-stage encounters a node type not
 * found in the registry, THEN the system SHALL CONTINUE TO skip that node without error.
 *
 * This is tested via materializeStructuralFields: unknown node types have no inputSchema
 * in the registry, so the node is returned unchanged.
 *
 * **Validates: Requirements 3.5**
 */
describe('Preservation 3.5 — unknown node types are skipped without error by materializeStructuralFields', () => {
  it('materializeStructuralFields returns unknown node unchanged (no inputSchema in registry)', () => {
    const unknownNode = {
      id: 'unknown_node_1',
      type: '__unknown_node_type_xyz__',
      data: {
        type: '__unknown_node_type_xyz__',
        label: 'Unknown',
        config: {
          someField: 'someValue',
        },
      },
    };

    const workflow = makeUnfrozenWorkflow([unknownNode]);
    let result: Workflow;
    let threw = false;

    try {
      result = materializeStructuralFields(workflow);
    } catch {
      threw = true;
      result = workflow;
    }

    // Must not throw
    expect(threw).toBe(false);

    // Unknown node must be returned unchanged (no _fillMode added, no config mutation)
    const resultNode = result!.nodes[0] as any;
    expect(resultNode.data.config.someField).toBe('someValue');
  });

  it('materializeStructuralFields handles workflow with mix of known and unknown nodes without error', () => {
    const nodes = [
      {
        id: 'unknown_1',
        type: '__totally_unknown_type__',
        data: {
          type: '__totally_unknown_type__',
          label: 'Unknown',
          config: { value: 42 },
        },
      },
      {
        id: 'if_1',
        type: 'if_else',
        data: {
          type: 'if_else',
          label: 'If',
          config: {
            conditions: [{ expression: '$json.x > 0' }],
            _fillMode: { conditions: 'manual_static' },
          },
        },
      },
    ];

    const workflow = makeUnfrozenWorkflow(nodes);
    let threw = false;
    let result: Workflow = workflow;

    try {
      result = materializeStructuralFields(workflow);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);

    // Unknown node unchanged
    const unknownResult = result.nodes[0] as any;
    expect(unknownResult.data.config.value).toBe(42);

    // Known node processed normally
    const ifResult = result.nodes[1] as any;
    expect(ifResult.data.config._fillMode.conditions).toBe('manual_static');
  });
});

// ─── Preservation 3.6: post-freeze readonly mode returns workflow unchanged ───

/**
 * Requirement 3.6: WHEN the structure-materializer runs in post-freeze readonly mode,
 * THEN the system SHALL CONTINUE TO return the workflow unchanged without stamping
 * any _fillMode entries.
 *
 * isBugCondition is FALSE here because frozen workflows are not processed.
 *
 * **Validates: Requirements 3.6**
 */
describe('Preservation 3.6 — materializeStructuralFields with freezeBoundary.frozen = true returns workflow unchanged', () => {
  it('returns exact same workflow reference when freezeBoundary.frozen = true', () => {
    const node = {
      id: 'slack_1',
      type: 'slack_message',
      data: {
        type: 'slack_message',
        label: 'Slack',
        config: {
          text: 'AI-generated message',
          channel: '#general',
          // No _fillMode — simulates pre-fix state
        },
      },
    };

    const frozenWorkflow = makeFrozenWorkflow([node]);
    const result = materializeStructuralFields(frozenWorkflow);

    // Must return the exact same reference (no processing)
    expect(result).toBe(frozenWorkflow);
  });

  it('does not add _fillMode entries when freezeBoundary.frozen = true', () => {
    const node = {
      id: 'form_1',
      type: 'form',
      data: {
        type: 'form',
        label: 'Form',
        config: {
          fields: [{ id: 'f1', key: 'name', label: 'Name', type: 'text' }],
          // No _fillMode
        },
      },
    };

    const frozenWorkflow = makeFrozenWorkflow([node]);
    const result = materializeStructuralFields(frozenWorkflow);

    // No _fillMode should be added
    const resultConfig = (result.nodes[0] as any).data.config;
    expect(resultConfig._fillMode).toBeUndefined();
  });

  it('does not add _fillMode entries when postFreezeReadonly option is true', () => {
    const node = {
      id: 'if_1',
      type: 'if_else',
      data: {
        type: 'if_else',
        label: 'If',
        config: {
          conditions: [{ expression: '$json.x > 0' }],
          // No _fillMode
        },
      },
    };

    const workflow = makeUnfrozenWorkflow([node]);
    const result = materializeStructuralFields(workflow, { postFreezeReadonly: true });

    // Must return same reference
    expect(result).toBe(workflow);

    // No _fillMode should be added
    const resultConfig = (result.nodes[0] as any).data.config;
    expect(resultConfig._fillMode).toBeUndefined();
  });

  it('processes workflow normally when freezeBoundary is absent', () => {
    const node = {
      id: 'if_1',
      type: 'if_else',
      data: {
        type: 'if_else',
        label: 'If',
        config: {
          conditions: [{ expression: '$json.x > 0' }],
          _fillMode: { conditions: 'manual_static' },
        },
      },
    };

    const workflow = makeUnfrozenWorkflow([node]);
    const result = materializeStructuralFields(workflow);

    // Should be processed (not returned as-is)
    // _fillMode.conditions should remain manual_static (not overwritten)
    const resultConfig = (result.nodes[0] as any).data.config;
    expect(resultConfig._fillMode.conditions).toBe('manual_static');
  });
});

// ─── Preservation: buildtime_ai_once field with EMPTY AI value → no _fillMode stamp ──

/**
 * From design.md: "If the LLM returns an empty value for a field, the stage falls back
 * to defaultConfig(). No _fillMode entry is written. This is correct: an empty value
 * should not be protected."
 *
 * This tests the guard logic: shouldPreserveExistingBuildtimeValue must return
 * { preserve: false } when the existing value is empty (nothing to protect).
 *
 * **Validates: Requirements 3.2 (edge case — empty stored value not protected)**
 */
describe('Preservation — buildtime_ai_once field with empty stored value is not preserved', () => {
  it('shouldPreserveExistingBuildtimeValue returns { preserve: false } when existing value is empty string', () => {
    const config: Record<string, unknown> = {
      text: '',  // empty — no AI value was written
      _fillMode: { text: 'buildtime_ai_once' },
    };

    const result = shouldPreserveExistingBuildtimeValue(
      'text',
      BUILDTIME_AI_SCHEMA,
      config,
      '',  // existing empty
      '',  // incoming empty
    );

    // Empty existing value must not be preserved
    expect(result.preserve).toBe(false);
  });

  it('shouldPreserveExistingBuildtimeValue returns { preserve: false } when existing value is empty array', () => {
    const schemaWithArray: NodeInputSchema = {
      conditions: {
        type: 'array',
        required: false,
        description: 'Conditions',
        fillMode: { default: 'buildtime_ai_once' },
        ownership: 'value',
      },
    };

    const config: Record<string, unknown> = {
      conditions: [],  // empty array — no AI value was written
      _fillMode: { conditions: 'buildtime_ai_once' },
    };

    const result = shouldPreserveExistingBuildtimeValue(
      'conditions',
      schemaWithArray,
      config,
      [],  // existing empty array
      [],  // incoming empty array
    );

    // Empty existing array must not be preserved
    expect(result.preserve).toBe(false);
  });

  it('shouldPreserveExistingBuildtimeValue returns { preserve: false } when existing value is null', () => {
    const config: Record<string, unknown> = {
      text: null,
      _fillMode: { text: 'buildtime_ai_once' },
    };

    const result = shouldPreserveExistingBuildtimeValue(
      'text',
      BUILDTIME_AI_SCHEMA,
      config,
      null,
      '',
    );

    expect(result.preserve).toBe(false);
  });
});

// ─── Preservation: buildtime_ai_once with non-empty existing AND non-empty incoming → applied ──

/**
 * From design.md Preservation Requirements:
 * "When attach-inputs receives a non-empty incoming value for a buildtime_ai_once field
 * whose existing stored value is empty, it must continue to apply the incoming value
 * (no false preservation of empty defaults)."
 *
 * Extended: when BOTH existing and incoming are non-empty, the incoming IS applied
 * (the guard only fires when incoming is empty/weaker).
 *
 * **Validates: Requirements 3.2**
 */
describe('Preservation — buildtime_ai_once field with non-empty existing AND non-empty incoming → incoming applied', () => {
  it('shouldPreserveExistingBuildtimeValue returns { preserve: false } when both existing and incoming are non-empty strings', () => {
    const config: Record<string, unknown> = {
      text: 'AI wrote this',
      _fillMode: { text: 'buildtime_ai_once' },
    };

    const result = shouldPreserveExistingBuildtimeValue(
      'text',
      BUILDTIME_AI_SCHEMA,
      config,
      'AI wrote this',   // existing non-empty
      'User wrote this', // incoming non-empty — user is actively replacing
    );

    // Non-empty incoming must be applied (no false preservation)
    expect(result.preserve).toBe(false);
  });

  it('shouldPreserveExistingBuildtimeValue returns { preserve: false } when incoming array is same length as existing', () => {
    const schemaWithArray: NodeInputSchema = {
      conditions: {
        type: 'array',
        required: false,
        description: 'Conditions',
        fillMode: { default: 'buildtime_ai_once' },
        ownership: 'value',
      },
    };

    const config: Record<string, unknown> = {
      conditions: [{ expression: '$json.x > 0' }],
      _fillMode: { conditions: 'buildtime_ai_once' },
    };

    const result = shouldPreserveExistingBuildtimeValue(
      'conditions',
      schemaWithArray,
      config,
      [{ expression: '$json.x > 0' }],    // existing: 1 item
      [{ expression: '$json.y === true' }], // incoming: 1 item (same length, different content)
    );

    // Same-length array replacement must be applied
    expect(result.preserve).toBe(false);
  });
});
