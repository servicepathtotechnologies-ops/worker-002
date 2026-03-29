import type { Workflow } from '../../core/types/ai-types';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeType } from '../../core/utils/unified-node-type-normalizer';
import { isStructuralOwnership } from '../../core/utils/field-ownership';
import {
  conditionsReferenceInputPaths,
  findUpstreamFormContextForIfElse,
  resolveFormFieldKeyForConditionOperand,
} from '../../core/orchestration/form-ifelse-binding';
import { normalizeFormFieldsIdentity } from '../../core/utils/form-field-identity';
import { buildEffectiveFillModes } from '../../core/utils/fill-mode-resolver';

type StructuralIssue = {
  nodeId: string;
  nodeType: string;
  fieldName: string;
  reason: 'missing_structural_value';
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

function normalizeFieldKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

const FIELD_HEAD_ALIASES: Record<string, string> = {
  age: 'age',
  email: 'email',
  e_mail: 'email',
  mail: 'email',
  phone: 'phone',
  mobile: 'phone',
  tel: 'phone',
  name: 'name',
  full_name: 'name',
  first_name: 'first_name',
  last_name: 'last_name',
  status: 'status',
  color: 'color',
  message: 'message',
  comment: 'comment',
  description: 'description',
  details: 'details',
};

const FIELD_NOISE_TOKENS = new Set([
  'details',
  'detail',
  'through',
  'including',
  'include',
  'form',
  'submission',
  'submit',
  'submitted',
  'user',
  'workflow',
  'where',
  'with',
  'and',
  'or',
  'a',
  'an',
  'the',
]);

function splitSemanticTokens(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9_ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(' ')
    .map((token) => normalizeFieldKey(token))
    .filter(Boolean);
}

function extractSemanticFieldCandidate(raw: string): string | null {
  const key = normalizeFieldKey(raw);
  if (!key) return null;
  if (FIELD_HEAD_ALIASES[key]) return FIELD_HEAD_ALIASES[key];

  const tokens = splitSemanticTokens(raw);
  // Prefer known semantic field tokens over long phrase chunks.
  for (const token of tokens) {
    if (FIELD_HEAD_ALIASES[token] && !FIELD_NOISE_TOKENS.has(token)) {
      return FIELD_HEAD_ALIASES[token];
    }
  }

  // Accept compact keys that are not noise-heavy phrase fragments.
  if (!key.includes('_')) return key;
  const parts = key.split('_').filter(Boolean);
  const noiseCount = parts.filter((p) => FIELD_NOISE_TOKENS.has(p)).length;
  const noiseRatio = parts.length === 0 ? 1 : noiseCount / parts.length;
  if (parts.length <= 3 && noiseRatio < 0.5) {
    return key;
  }
  return null;
}

function toTitleLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function inferFieldTypeFromKey(key: string): string {
  const k = key.toLowerCase();
  if (k === 'age' || k.endsWith('_age') || k.startsWith('age_')) return 'number';
  if (k.includes('email')) return 'email';
  if (k.includes('age') || k.includes('count') || k.includes('qty') || k.includes('number')) return 'number';
  if (k.includes('phone') || k.includes('mobile') || k.includes('contact')) return 'tel';
  if (k.includes('message') || k.includes('description') || k.includes('comment') || k.includes('notes')) return 'textarea';
  if (k.includes('file') || k.includes('attachment')) return 'file';
  return 'text';
}

/**
 * Drop tokens that match registered node type ids (e.g. google_gmail, if_else) so planner
 * parentheticals never become form fields. Prefer underscore + registry hit to avoid rejecting
 * legitimate single-token keys like "email".
 */
function filterNodeTypeLikeFieldKeys(keys: string[]): string[] {
  return keys.filter((key) => {
    if (!key.includes('_')) return true;
    return !unifiedNodeRegistry.has(key);
  });
}

function extractFieldNamesFromIntent(intentText: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const key = extractSemanticFieldCandidate(raw);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };

  // Pattern: "(Name, Email, Color)" or "fields: Name, Email, Color"
  const parenthetical = intentText.match(/\(([^)]+)\)/g) || [];
  for (const chunk of parenthetical) {
    const inner = chunk.slice(1, -1);
    inner
      .split(/,|\/|\bor\b|\band\b/gi)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach(push);
  }

  const fieldsClauses = intentText.match(/\b(fields?|inputs?)\b[\s:=-]*([^\n.]+)/gi) || [];
  for (const clause of fieldsClauses) {
    const rhs = clause.replace(/\b(fields?|inputs?)\b[\s:=-]*/i, '');
    rhs
      .split(/,|\/|\bor\b|\band\b/gi)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach(push);
  }

  // Pattern: "collect/capture/submit ... name, email and age"
  const collectionClauses =
    intentText.match(/\b(collect|capture|submit(?:ted|s)?|asks?\s+for|including|include)\b[\s\S]{0,120}/gi) || [];
  for (const clause of collectionClauses) {
    const firstSentence = clause.split(/[.\n]/)[0] || clause;
    firstSentence
      .split(/,|\/|\bor\b|\band\b/gi)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((token) => {
        // Keep only likely field tokens (skip stop text).
        const cleaned = token.replace(/\b(collect|capture|submit(?:ted|s)?|asks?\s+for|including|include|with|fields?|inputs?)\b/gi, '').trim();
        if (cleaned) push(cleaned);
      });
  }

  return out;
}

/** User-only text for form field extraction — never the merged planner blob when original is set. */
export function getFormStructuralIntentText(workflow: Workflow): string {
  const metadata = (workflow as any)?.metadata || {};
  const requirements = metadata.requirements || {};
  const originalUserPrompt = String(metadata.originalUserPrompt || '').trim();
  if (originalUserPrompt) return originalUserPrompt;
  const userOnly = String(metadata.userPrompt || metadata.prompt || '').trim();
  if (userOnly) return userOnly;
  return String(
    requirements.originalPrompt ||
      requirements.primaryGoal ||
      getWorkflowIntentText(workflow) ||
      ''
  );
}

function getWorkflowIntentText(workflow: Workflow): string {
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
  return {
    ...(workflow as any),
    metadata: {
      ...((workflow as any).metadata || {}),
      originalUserPrompt: originalPrompt.trim(),
    },
  } as Workflow;
}

function deriveFormFieldsFromIntent(intentText: string): Array<Record<string, unknown>> {
  if (!intentText) return [];
  const extracted = filterNodeTypeLikeFieldKeys(extractFieldNamesFromIntent(intentText));
  if (extracted.length === 0) return [];
  const raw = extracted.map((key) => ({
    id: `field_${key}`,
    key,
    name: key,
    label: toTitleLabel(key),
    type: inferFieldTypeFromKey(key),
    required: true,
  }));
  return normalizeFormFieldsIdentity(raw as Array<Record<string, unknown>>) as Array<Record<string, unknown>>;
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
    if (!conditionsReferenceInputPaths(cond)) return node;
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
  const lower = intentText.toLowerCase();

  // Pattern: "if color is blue / black / red"
  const conditionList = lower.match(/\bif\s+([a-z_][a-z0-9_]*)\s*(?:is|equals?|==|=)\s*([a-z0-9 _-]+(?:\s*(?:,|\/|\bor\b)\s*[a-z0-9 _-]+)+)/i);
  if (conditionList) {
    const values = conditionList[2]
      .split(/,|\/|\bor\b/gi)
      .map((s) => normalizeFieldKey(s))
      .filter(Boolean);
    const uniq = [...new Set(values)];
    if (uniq.length >= 2) {
      return uniq.map((value) => ({ value, label: toTitleLabel(value) }));
    }
  }

  const categoryMatch = lower.match(/\b(classify|categorize|category|route)\b[\s\S]{0,140}\b(as|into)\s+([^.\n]+)/i);
  const extractedList = categoryMatch?.[3] || '';
  const rawCandidates = extractedList
    .split(/,|\/|\bor\b/g)
    .map((s) => s.replace(/[^a-zA-Z0-9 _-]/g, '').trim())
    .filter(Boolean)
    .slice(0, 6);

  const normalized = rawCandidates
    .map((v) => normalizeFieldKey(v))
    .filter((v, idx, arr) => v.length > 0 && arr.indexOf(v) === idx);

  if (normalized.length >= 2) {
    return normalized.map((value) => ({
      value,
      label: value.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
    }));
  }

  // Pattern: "cases blue, black, red"
  const caseListMatch = lower.match(/\bcases?\b[\s:=-]*([^\n.]+)/i);
  if (caseListMatch?.[1]) {
    const values = caseListMatch[1]
      .split(/,|\/|\bor\b|\band\b/gi)
      .map((s) => normalizeFieldKey(s))
      .filter(Boolean);
    const uniq = [...new Set(values)];
    if (uniq.length >= 2) {
      return uniq.map((value) => ({ value, label: toTitleLabel(value) }));
    }
  }

  // Common intent fallback for triage/routing.
  if (
    lower.includes('sales') ||
    lower.includes('support') ||
    lower.includes('general')
  ) {
    return ['sales', 'support', 'general'].map((value) => ({
      value,
      label: value.charAt(0).toUpperCase() + value.slice(1),
    }));
  }

  // No reliable intent-derived cases -> leave unresolved instead of hardcoded defaults.
  return [];
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
    return deriveFormFieldsFromIntent(formText || intentText);
  }
  if (nodeType === 'if_else' && fieldName === 'conditions') {
    return deriveIfElseConditionsFromIntent(intentText);
  }
  if (nodeType === 'switch' && fieldName === 'cases') {
    return deriveSwitchCasesFromIntent(intentText);
  }
  if (nodeType === 'switch' && fieldName === 'expression') {
    const cases = deriveSwitchCasesFromIntent(intentText);
    return deriveSwitchExpressionFromIntent(intentText, cases);
  }
  return undefined;
}

export function materializeStructuralFields(workflow: Workflow): Workflow {
  const intentText = getWorkflowIntentText(workflow);
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
      if (normalizedCases.length > 0 && JSON.stringify(currentCases) !== JSON.stringify(normalizedCases)) {
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
      if (isMissingStructuralValue(current, fieldDef.required)) {
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
