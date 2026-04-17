import type { Workflow } from '../../core/types/ai-types';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeType } from '../../core/utils/unified-node-type-normalizer';
import { isStructuralOwnership } from '../../core/utils/field-ownership';
import {
  conditionsReferenceInputPaths,
  conditionsHaveMismatchedJsonPaths,
  findUpstreamFormContextForIfElse,
  resolveFormFieldKeyForConditionOperand,
} from '../../core/orchestration/form-ifelse-binding';
import { normalizeFormFieldsIdentity } from '../../core/utils/form-field-identity';
import { buildEffectiveFillModes } from '../../core/utils/fill-mode-resolver';
import { normalizeIfElseConfig } from '../../core/utils/if-else-conditions';
import {
  buildFormFieldRecordsFromKeys,
  deriveOrderedFieldKeysForForm,
  formFieldsMissingReferencedKeys,
  isPlaceholderFormFields,
  normalizeFieldKey,
  toTitleLabel,
  FORM_FIELDS_PLACEHOLDER_FIELD_ID,
} from './intent-extraction';

type StructuralIssue = {
  nodeId: string;
  nodeType: string;
  fieldName: string;
  reason: 'missing_structural_value';
  confidence: 'high' | 'low';
  requiresUserConfirmation: boolean;
};

type StructuralDiagnostics = {
  unresolved: StructuralIssue[];
};

function structuralFallback(type: string): unknown {
  const t = (type || 'string').toLowerCase();
  if (t === 'array') return [];
  if (t === 'object' || t === 'json') return {};
  if (t === 'boolean') return false;
  if (t === 'number') return 0;
  return '';
}

function isMissingStructuralValue(value: unknown, required?: boolean): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0 && !!required)
  );
}

/** Placeholder or graph mismatch: treat as unfilled so keys can be re-derived. */
function formFieldsEffectivelyMissing(
  value: unknown,
  workflow: Workflow,
  combinedIntentText: string
): boolean {
  if (!Array.isArray(value)) return true;
  if (value.length === 0) return true;
  if (isPlaceholderFormFields(value)) return true;
  if (formFieldsMissingReferencedKeys(workflow, value as Array<Record<string, unknown>>)) {
    const keys = deriveOrderedFieldKeysForForm(combinedIntentText, workflow);
    return keys.length > 0;
  }
  return false;
}

/** Last-resort single field so strict structural readiness never fails on an empty `fields` array. */
function minimalPlaceholderFormFields(): Array<Record<string, unknown>> {
  return normalizeFormFieldsIdentity([
    {
      id: FORM_FIELDS_PLACEHOLDER_FIELD_ID,
      key: 'response',
      name: 'response',
      label: 'Response',
      type: 'textarea',
      required: false,
    },
  ] as Array<Record<string, unknown>>) as Array<Record<string, unknown>>;
}

function isLikelyPlannerNarrative(text: string): boolean {
  const t = String(text || '').toLowerCase();
  if (!t) return false;
  return (
    t.includes('detected nodes:') ||
    t.includes('branch slots:') ||
    t.includes('execution:') ||
    t.includes('terminal:') ||
    t.includes('terminals:') ||
    t.includes('configuration contract') ||
    t.includes('planner rules:')
  );
}

/** User-only text for form field extraction — never the merged planner blob when original is set. */
export function getFormStructuralIntentText(workflow: Workflow): string {
  const metadata = (workflow as any)?.metadata || {};
  const requirements = metadata.requirements || {};
  const originalUserPrompt = String(metadata.originalUserPrompt || '').trim();
  if (originalUserPrompt) return originalUserPrompt;
  const userOnly = String(metadata.userPrompt || metadata.prompt || '').trim();
  if (userOnly) return userOnly;
  const reqOriginal = String(requirements.originalPrompt || '').trim();
  if (reqOriginal && !isLikelyPlannerNarrative(reqOriginal)) return reqOriginal;
  const reqGoal = String(requirements.primaryGoal || '').trim();
  if (reqGoal && !isLikelyPlannerNarrative(reqGoal)) return reqGoal;
  return '';
}

export function getWorkflowIntentText(workflow: Workflow): string {
  const metadata = (workflow as any)?.metadata || {};
  const requirements = metadata.requirements || {};
  return String(
    metadata.generatedFrom ||
      metadata.prompt ||
      metadata.userPrompt ||
      metadata.workflowPrompt ||
      metadata.structuredIntent ||
      requirements.originalPrompt ||
      requirements.primaryGoal ||
      ''
  );
}

/**
 * Attach the API / lifecycle original user prompt so form structural extraction does not scan
 * merged planner text (e.g. "Label (google_gmail)").
 */
export function mergeOriginalUserPromptMetadata(
  workflow: Workflow | undefined,
  originalPrompt?: string | null
): Workflow | undefined {
  if (!workflow || !originalPrompt?.trim()) return workflow;
  const cleanPrompt = originalPrompt.trim();
  return {
    ...(workflow as any),
    metadata: {
      ...((workflow as any).metadata || {}),
      originalUserPrompt: cleanPrompt,
    },
  } as Workflow;
}

function deriveFormFieldsFromIntent(intentText: string, workflow: Workflow): Array<Record<string, unknown>> {
  const keys = deriveOrderedFieldKeysForForm(intentText, workflow);
  if (keys.length === 0) {
    return minimalPlaceholderFormFields();
  }
  return buildFormFieldRecordsFromKeys(keys);
}

function operatorMeta(op: string): { normalizedOp: string; ruleOperator: string } {
  const normalizedOp =
    op === 'equal to' ? '==' :
    op === 'equals' ? '==' :
    op === '=' ? '==' :
    op === 'greater than' ? '>' :
    op === 'less than' ? '<' :
    op;
  const ruleOperator =
    normalizedOp === '>=' ? 'greater_than_or_equal' :
    normalizedOp === '<=' ? 'less_than_or_equal' :
    normalizedOp === '>' ? 'greater_than' :
    normalizedOp === '<' ? 'less_than' :
    normalizedOp === '!=' ? 'not_equals' :
    'equals';
  return { normalizedOp, ruleOperator };
}

/**
 * Structural defaults for if_else. When `formFields` is set (upstream form output keys),
 * emit `$json.<internalKey>` so conditions match runtime merged input / $json.
 */
export function deriveIfElseConditionsFromIntent(
  intentText: string,
  formFields?: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  if (!intentText) return [];
  const canonical = intentText
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/–/g, '-')
    .replace(/—/g, '-');
  const patterns: RegExp[] = [
    /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|<=|>|<|==|=|!=)\s*([0-9]+(?:\.[0-9]+)?|[a-zA-Z_][a-zA-Z0-9_]*)/,
    /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(greater than|less than|equals|equal to)\s*([0-9]+(?:\.[0-9]+)?|[a-zA-Z_][a-zA-Z0-9_]*)/i,
    /\bif\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+is\s+(greater than|less than|equal to)\s+([0-9]+(?:\.[0-9]+)?)/i,
  ];

  const jsonCondition = (
    internalKey: string,
    ruleOperator: string,
    normalizedOp: string,
    value: unknown,
    rightDisplay: string
  ) => ({
    field: `$json.${internalKey}`,
    operator: ruleOperator,
    value,
    expression: `{{$json.${internalKey}}} ${normalizedOp} ${rightDisplay}`,
  });

  for (const pattern of patterns) {
    const m = canonical.match(pattern);
    if (!m) continue;
    const left = normalizeFieldKey(m[1]);
    const op = m[2].toLowerCase();
    const rightRaw = m[3];
    const isNumber = /^[0-9]+(?:\.[0-9]+)?$/.test(rightRaw);
    const right = isNumber ? rightRaw : `'${normalizeFieldKey(rightRaw)}'`;
    const { normalizedOp, ruleOperator } = operatorMeta(op);
    const resolved =
      formFields && formFields.length > 0 ? resolveFormFieldKeyForConditionOperand(left, formFields) : null;
    if (resolved) {
      return [
        jsonCondition(
          resolved,
          ruleOperator,
          normalizedOp,
          isNumber ? Number(rightRaw) : normalizeFieldKey(rightRaw),
          right
        ),
      ];
    }
    return [
      {
        field: `input.${left}`,
        operator: ruleOperator,
        value: isNumber ? Number(rightRaw) : normalizeFieldKey(rightRaw),
        expression: `{{input.${left}}} ${normalizedOp} ${right}`,
      },
    ];
  }

  return [];
}

/**
 * After form fields are materialized, re-bind if_else conditions that still use `input.*`
 * to `$json.<internalKey>` using upstream form fields (same graph traversal as repair pass).
 */
function bindIfElseConditionsToUpstreamForms(workflow: Workflow): Workflow {
  const intentText = getWorkflowIntentText(workflow);
  const nodes = (workflow.nodes || []).map((node: any) => {
    const nodeType = unifiedNormalizeNodeType(node);
    if (nodeType !== 'if_else') return node;
    const ctx = findUpstreamFormContextForIfElse(workflow, String(node.id));
    if (!ctx?.fields?.length) return node;
    const cond = node.data?.config?.conditions;
    if (!conditionsReferenceInputPaths(cond) && !conditionsHaveMismatchedJsonPaths(cond, ctx.fields)) return node;
    const next = deriveIfElseConditionsFromIntent(intentText, ctx.fields);
    if (!next.length) return node;
    const config = { ...(node.data?.config || {}) };
    config.conditions = next;
    return {
      ...node,
      data: {
        ...node.data,
        config,
      },
    };
  });
  return { ...workflow, nodes };
}

function deriveSwitchCasesFromIntent(intentText: string): Array<Record<string, unknown>> {
  if (!intentText) return [];
  // Delegate to the canonical, registry-driven extractor — single source of truth.
  const { planSwitchCasesFromPrompt } = require('./switch-case-plan');
  const plan = planSwitchCasesFromPrompt(intentText, undefined);
  return plan.cases as Array<Record<string, unknown>>;
}

function deriveSwitchExpressionFromIntent(intentText: string, cases: Array<Record<string, unknown>>): string {
  if (!intentText) return '';
  const lower = intentText.toLowerCase();
  const fieldMatch =
    lower.match(/\b(?:switch|route|classify|categorize)\b[\s\S]{0,30}\b(?:on|by|using|from)\s+([a-z_][a-z0-9_]*)/i) ||
    lower.match(/\bevaluate\s+([a-z_][a-z0-9_]*)/i) ||
    lower.match(/\bif\s+([a-z_][a-z0-9_]*)\s*(?:is|equals?|==|=)/i);
  if (fieldMatch?.[1]) {
    const key = normalizeFieldKey(fieldMatch[1]);
    return `{{$json.${key}}}`;
  }
  if (lower.includes('classify') || lower.includes('categorize') || lower.includes('route')) {
    // Canonical expression placeholder resolved at runtime by upstream classifier output.
    return '{{$json.category}}';
  }
  const firstCase = String(cases[0]?.value || '');
  return firstCase ? `{{$json.route || '${firstCase}'}}` : '';
}

function normalizeSwitchCasesValue(raw: unknown): Array<Record<string, unknown>> {
  let candidate: unknown = raw;
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (!trimmed) return [];
    try {
      candidate = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(candidate)) return [];

  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const item of candidate) {
    const valueRaw =
      typeof item === 'string' ? item : (item as Record<string, unknown>)?.value != null ? String((item as any).value) : '';
    const value = normalizeFieldKey(String(valueRaw || ''));
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const label =
      typeof item === 'object' && item !== null && typeof (item as any).label === 'string'
        ? String((item as any).label)
        : toTitleLabel(value);
    out.push({ value, label });
  }
  return out;
}

/** Form Trigger shares the same `fields` shape as Form; intent derivation must run for both. */
function isFormLikeNodeType(nodeType: string): boolean {
  return nodeType === 'form' || nodeType === 'form_trigger';
}

function deriveStructuralValueFromIntent(
  nodeType: string,
  fieldName: string,
  intentText: string,
  workflow: Workflow
): unknown {
  if (isFormLikeNodeType(nodeType) && fieldName === 'fields') {
    const formText = getFormStructuralIntentText(workflow);
    return deriveFormFieldsFromIntent(formText || intentText, workflow);
  }
  if (nodeType === 'if_else' && fieldName === 'conditions') {
    return deriveIfElseConditionsFromIntent(intentText);
  }
  if (nodeType === 'switch' && fieldName === 'cases') {
    // Use the clean user-only prompt for switch case extraction — never the full generated blob.
    const switchIntentText = getFormStructuralIntentText(workflow);
    return deriveSwitchCasesFromIntent(switchIntentText || intentText);
  }
  if (nodeType === 'switch' && fieldName === 'expression') {
    const switchIntentText = getFormStructuralIntentText(workflow);
    const cases = deriveSwitchCasesFromIntent(switchIntentText || intentText);
    return deriveSwitchExpressionFromIntent(switchIntentText || intentText, cases);
  }
  return undefined;
}

export function materializeStructuralFields(
  workflow: Workflow,
  options?: { postFreezeReadonly?: boolean }
): Workflow {
  const freezeBoundary = (workflow as any)?.metadata?.freezeBoundary;
  if (options?.postFreezeReadonly || freezeBoundary?.frozen === true) {
    return workflow;
  }
  const intentText = getWorkflowIntentText(workflow);
  const combinedIntentText = getFormStructuralIntentText(workflow) || intentText;
  const unresolved: StructuralIssue[] = [];
  const nodes = (workflow.nodes || []).map((node: any) => {
    const nodeType = unifiedNormalizeNodeType(node);
    let def = unifiedNodeRegistry.get(nodeType);
    // Library registers Form Trigger as `form`; workflows often use `form_trigger`. Share one definition.
    if (!def?.inputSchema && isFormLikeNodeType(nodeType)) {
      def = unifiedNodeRegistry.get('form');
    }
    if (!def?.inputSchema) return node;

    const inputSchema = def.inputSchema;
    const config = { ...(node.data?.config || {}) } as Record<string, unknown>;
    let changed = false;
    if (nodeType === 'switch') {
      const normalizedCasesPrimary = normalizeSwitchCasesValue(config.cases);
      const normalizedCasesFallback = normalizeSwitchCasesValue(config.rules);
      const normalizedCases =
        normalizedCasesPrimary.length > 0 ? normalizedCasesPrimary : normalizedCasesFallback;
      const currentCases = normalizeSwitchCasesValue(config.cases);

      // ✅ UNIVERSAL FIX: Detect contaminated or truncated cases.
      // Always use the clean user-only prompt — never the full generated blob which contains
      // configuration contract boilerplate that would pollute case extraction.
      const switchIntentText = getFormStructuralIntentText(workflow) || combinedIntentText;
      const { planSwitchCasesFromPrompt } = require('./switch-case-plan');
      const freshPlan = planSwitchCasesFromPrompt(switchIntentText, undefined);

      const hasContaminatedCases = currentCases.some((c) => {
        const v = String(c?.value || '');
        return v.includes('_via_') || v.length > 32;
      });
      // Only consider truncation when there are actual saved cases to compare against.
      // If currentCases is empty but normalizedCases (from rules fallback) is valid, use that instead.
      const effectiveSavedCases = currentCases.length > 0 ? currentCases : normalizedCases;
      const isTruncated =
        effectiveSavedCases.length > 0 &&
        freshPlan.cases.length > effectiveSavedCases.length &&
        freshPlan.cases.length >= 2;

      // Re-derive from intent if cases are contaminated, truncated, or structurally wrong
      if ((hasContaminatedCases || isTruncated) && freshPlan.cases.length > 0) {
        config.cases = freshPlan.cases;
        config.rules = freshPlan.cases;
        changed = true;
        console.log(`[StructureMaterializer] ✅ Replaced ${hasContaminatedCases ? 'contaminated' : 'truncated'} switch cases with intent-derived: ${freshPlan.cases.map((c: any) => c.value).join(', ')}`);
      } else if (normalizedCases.length > 0 && JSON.stringify(currentCases) !== JSON.stringify(normalizedCases)) {
        config.cases = normalizedCases;
        changed = true;
      }
    }
    if (!config._fillMode || typeof config._fillMode !== 'object') {
      config._fillMode = {};
    }
    const fillMode = config._fillMode as Record<string, string>;

    for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
      if (!isStructuralOwnership(fieldName, fieldDef)) continue;
      const current = config[fieldName];
      const missingBase = isMissingStructuralValue(current, fieldDef.required);
      const formFieldsStale =
        isFormLikeNodeType(nodeType) &&
        fieldName === 'fields' &&
        formFieldsEffectivelyMissing(current, workflow, combinedIntentText);
      if (missingBase || formFieldsStale) {
        const intentDerived = deriveStructuralValueFromIntent(nodeType, fieldName, intentText, workflow);
        if (intentDerived !== undefined && !isMissingStructuralValue(intentDerived, fieldDef.required)) {
          config[fieldName] = intentDerived;
          changed = true;
        } else if (fieldDef.default !== undefined && !isMissingStructuralValue(fieldDef.default, fieldDef.required)) {
          config[fieldName] = fieldDef.default;
          changed = true;
        } else {
          const fallback = structuralFallback(fieldDef.type);
          config[fieldName] = fallback;
          if (fieldDef.required) {
            unresolved.push({
              nodeId: node.id,
              nodeType,
              fieldName,
              reason: 'missing_structural_value',
              confidence: 'low',
              requiresUserConfirmation: true,
            });
          }
          changed = true;
        }
      }

      if (fillMode[fieldName] === 'runtime_ai') {
        fillMode[fieldName] = 'buildtime_ai_once';
        changed = true;
      }
    }

    // ── NEW: Stamp _fillMode for non-structural buildtime_ai_once fields ─────
    // property-population-stage may have written values without stamping _fillMode
    // (pre-fix workflows in DB). Ensure every field with fillMode.default === 'buildtime_ai_once'
    // and a non-empty stored value carries the stamp so attach-inputs can guard it.
    for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
      if (isStructuralOwnership(fieldName, fieldDef)) continue; // already handled above
      if (fieldDef.fillMode?.default !== 'buildtime_ai_once') continue;
      if (fieldDef.ownership === 'credential') continue;
      if (fillMode[fieldName] !== undefined) continue; // already stamped — don't overwrite

      const storedValue = config[fieldName];
      const isEmpty =
        storedValue === undefined ||
        storedValue === null ||
        storedValue === '' ||
        (Array.isArray(storedValue) && storedValue.length === 0) ||
        (typeof storedValue === 'object' &&
          !Array.isArray(storedValue) &&
          Object.keys(storedValue as object).length === 0);

      if (!isEmpty) {
        fillMode[fieldName] = 'buildtime_ai_once';
        changed = true;
      }
    }

    const effectiveFillModes = buildEffectiveFillModes(inputSchema, config);
    for (const fieldName of Object.keys(inputSchema)) {
      const cur = fillMode[fieldName];
      const explicitValid =
        cur === 'manual_static' || cur === 'runtime_ai' || cur === 'buildtime_ai_once';
      if (!explicitValid && effectiveFillModes[fieldName] !== undefined) {
        fillMode[fieldName] = effectiveFillModes[fieldName];
        changed = true;
      }
    }
    for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
      if (!isStructuralOwnership(fieldName, fieldDef)) continue;
      if (fillMode[fieldName] === 'runtime_ai') {
        fillMode[fieldName] = 'buildtime_ai_once';
        changed = true;
      }
    }

    if (isFormLikeNodeType(nodeType) && Array.isArray(config.fields)) {
      const normalizedFields = normalizeFormFieldsIdentity(config.fields as Array<Record<string, unknown>>);
      if (JSON.stringify(normalizedFields) !== JSON.stringify(config.fields)) {
        config.fields = normalizedFields;
        changed = true;
      }
    }

    if (!changed) return node;
    return {
      ...node,
      data: {
        ...(node.data || {}),
        config,
      },
    };
  });
  const metadata = {
    ...((workflow as any).metadata || {}),
    structuralDiagnostics: {
      unresolved,
    } as StructuralDiagnostics,
  };
  let withMeta = { ...(workflow as any), nodes, metadata };
  withMeta = bindIfElseConditionsToUpstreamForms(withMeta);
  return withMeta;
}

export function getStructuralDiagnostics(workflow: Workflow): StructuralDiagnostics {
  const diagnostics = (workflow as any)?.metadata?.structuralDiagnostics;
  if (!diagnostics || !Array.isArray(diagnostics.unresolved)) {
    return { unresolved: [] };
  }
  return diagnostics as StructuralDiagnostics;
}
