import type {
  FieldFillMode,
  FieldIntelligence,
  FieldRelevanceResult,
  FieldValidationHintTrigger,
  NodeInputField,
  NodeInputSchema,
} from '../types/unified-node-contract';
import { resolveEffectiveFieldFillMode } from './fill-mode-resolver';

export interface NodeFieldIntelligenceIssue {
  nodeId: string;
  nodeType: string;
  nodeLabel?: string;
  fieldName: string;
  severity: 'error' | 'warning' | 'info';
  reason: string;
  suggestedValue?: unknown;
  source: 'node_intelligence';
}

export interface FieldGuidanceDescription {
  what: string;
  setupSummary: string;
  needed: string;
  dataImpact: string;
  you: string;
  aiBuild: string;
  aiRun: string;
  example: string;
  actionableExample?: {
    value: unknown;
    displayValue: string;
    canApply: boolean;
    applyMode: 'buildtime_ai_once';
    reason: string;
    source: 'ai_field_guidance' | 'deterministic_field_guidance';
  };
  offBehavior: string;
  emptyBehavior: string;
  defaultBehaviorLabel: string;
  recommendedOwner: 'You' | 'AI Build' | 'AI Runtime';
  ownerReason: string;
  validationConfidence: 'high' | 'medium' | 'low';
  warnings: string[];
  safeValueSuggestion?: string;
}

type IntelligenceBuildArgs = {
  nodeType: string;
  fieldName: string;
  field: Pick<NodeInputField, 'type' | 'description' | 'required' | 'default' | 'role' | 'ownership' | 'helpCategory' | 'ui' | 'fillMode'> & {
    fieldIntelligence?: FieldIntelligence;
  };
};

type WorkflowLike = {
  nodes?: Array<{
    id?: string;
    type?: string;
    data?: { type?: string; label?: string; config?: Record<string, unknown> };
  }>;
  edges?: Array<{ source?: string; target?: string }>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  );
}

function emptyValueMeaning(value: unknown): FieldIntelligence['runtimeBehavior'] extends infer R
  ? R extends { emptyValueMeaning?: infer M }
    ? M
    : never
  : never {
  if (value === undefined) return 'unset' as any;
  if (value === null) return 'null' as any;
  if (value === 0) return 'zero' as any;
  if (value === '') return 'empty_string' as any;
  return 'unset' as any;
}

function fieldLooksLike(fieldName: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(fieldName));
}

function boundedFieldSafeDefaults(fieldName: string): FieldIntelligence['safeDefaults'] {
  if (fieldLooksLike(fieldName, [/token/])) {
    return [
      {
        value: 1024,
        when: 'AI generation, extraction, or transformation needs a bounded response.',
        reason: 'Gives the model enough space to answer while preventing runaway output.',
      },
    ];
  }

  if (fieldLooksLike(fieldName, [/result/, /item/, /row/, /record/, /limit/, /count/])) {
    return [
      {
        value: 50,
        when: 'Reading, searching, listing, looping, or fetching records.',
        reason: 'Keeps the workflow useful without pulling an unexpectedly large dataset.',
      },
    ];
  }

  return [
    {
      value: 150,
      when: 'The output goes to email, Slack, SMS, notifications, or another compact destination.',
      reason: 'Keeps the generated output useful while preventing an oversized downstream message.',
    },
    {
      value: 300,
      when: 'The output is used in a report, document, or longer internal note.',
      reason: 'Allows more detail while still bounding the generated result.',
    },
  ];
}

function mergeIntelligence(base: FieldIntelligence, override?: FieldIntelligence): FieldIntelligence {
  if (!override) return base;
  return {
    ...base,
    ...override,
    runtimeBehavior: { ...(base.runtimeBehavior || {}), ...(override.runtimeBehavior || {}) },
    importance: { ...(base.importance || {}), ...(override.importance || {}) } as FieldIntelligence['importance'],
    safeDefaults: override.safeDefaults || base.safeDefaults,
    useCaseNotes: override.useCaseNotes || base.useCaseNotes,
    validationHints: override.validationHints || base.validationHints,
  };
}

function highRiskOverride(args: IntelligenceBuildArgs): FieldIntelligence | undefined {
  const fieldName = args.fieldName;
  const lower = fieldName.toLowerCase();

  if (fieldLooksLike(lower, [/^temperature$/, /temperature/])) {
    return {
      purpose: args.field.description || 'Controls how creative or variable the AI response is.',
      importance: { base: 'recommended', dangerousIfWrong: true, dependsOnUseCase: true },
      safeDefaults: [
        { value: 0.2, when: 'Extraction, classification, validation, or deterministic business automation', reason: 'Reduces variation and hallucinated output.' },
        { value: 0.7, when: 'Drafting, brainstorming, or creative writing', reason: 'Allows more variety when exact repeatability is less important.' },
      ],
    };
  }

  if (
    fieldLooksLike(lower, [
      /maxtokens/,
      /max_tokens/,
      /maxlength/,
      /max_length/,
      /maximumlength/,
      /maximum_length/,
      /^limit$/,
      /maxresults/,
      /max_results/,
      /maxitems/,
      /max_items/,
      /maxrows/,
      /max_rows/,
    ])
  ) {
    const isHardOutputBound = fieldLooksLike(lower, [
      /maxtokens/,
      /max_tokens/,
      /maxlength/,
      /max_length/,
      /maximumlength/,
      /maximum_length/,
    ]);
    const emptyIsRisky = isHardOutputBound || args.field.default === 0;
    const safeDefaults = boundedFieldSafeDefaults(lower);
    const suggestedValue = safeDefaults?.[0]?.value ?? 100;
    const validationHints: FieldIntelligence['validationHints'] = [
      ...(emptyIsRisky
        ? [
            {
              severity: 'warning' as const,
              when: 'empty' as const,
              message: `${fieldName} is empty. For bounded outputs or reads, provide a safe value instead of relying on an unknown runtime default.`,
              suggestedValue,
            },
          ]
        : []),
      {
        severity: 'warning',
        when: 'zero',
        message: `${fieldName} is 0, which can prevent useful output or data processing.`,
        suggestedValue,
      },
    ];

    return {
      purpose: args.field.description || 'Controls the maximum amount of data or text this node can produce or process.',
      runtimeBehavior: {
        backendDefault: args.field.default,
        emptyValueMeaning: args.field.default === 0 ? 'zero' : emptyValueMeaning(args.field.default),
        whenMissing: 'If no value is provided, do not assume the runtime will choose the best limit for this workflow.',
        whenEmpty: emptyIsRisky
          ? 'An empty or zero-like value can produce unusable, overly constrained, or unexpectedly unbounded results.'
          : 'Leaving this empty uses the node default or provider behavior for the limit.',
      },
      importance: {
        base: args.field.required ? 'required' : 'recommended',
        dangerousIfEmpty: emptyIsRisky,
        dangerousIfWrong: true,
        dependsOnUseCase: true,
      },
      safeDefaults,
      useCaseNotes: [
        {
          when: 'The field controls generated text size, fetched record count, loop size, or downstream message length.',
          importance: args.field.required ? 'required' : 'recommended',
          guidance: 'Choose an explicit value that matches the destination and workflow goal instead of guessing from technical requiredness.',
        },
      ],
      validationHints,
    };
  }

  if (fieldLooksLike(lower, [/condition/, /^cases$/, /^rules$/, /^expression$/])) {
    return {
      purpose: args.field.description || 'Defines the decision logic this node uses to route or filter workflow data.',
      importance: { base: args.field.required ? 'required' : 'recommended', dangerousIfEmpty: true, dangerousIfWrong: true, dependsOnUseCase: true },
    };
  }

  return undefined;
}

export function buildFieldIntelligence(args: IntelligenceBuildArgs): FieldIntelligence {
  const { fieldName, field } = args;
  const lower = fieldName.toLowerCase();
  const role = String(field.role || '');
  const help = String(field.helpCategory || '');
  const hasRequiredIf = !!field.ui?.requiredIf;
  const hasDefault = Object.prototype.hasOwnProperty.call(field, 'default');
  const defaultValue = field.default;
  const textLike =
    ['title_like', 'long_body', 'short_summary', 'prompt', 'content', 'query'].includes(role) ||
    fieldLooksLike(lower, [/subject/, /body/, /message/, /content/, /prompt/, /summary/, /text/, /query/]);
  const selectorLike = role.endsWith('_selector') || fieldLooksLike(lower, [/operation/, /resource/, /mode/, /method/, /type$/]);
  const idUrlOrCredential =
    field.ownership === 'credential' ||
    role === 'id' ||
    fieldLooksLike(lower, [/id$/, /url/, /endpoint/, /token/, /secret/, /password/, /apikey/, /api_key/, /credential/]) ||
    /api_key|oauth|token|webhook_url/i.test(help);
  const rangeOrLimit = fieldLooksLike(lower, [/range/, /limit/, /max/, /count/, /timeout/]);

  const base =
    field.required
      ? 'required'
      : hasRequiredIf
        ? 'conditionally_required'
        : textLike
          ? 'recommended'
          : selectorLike || rangeOrLimit
            ? 'recommended'
            : 'optional';

  const dangerousIfWrong = idUrlOrCredential || selectorLike || rangeOrLimit || fieldLooksLike(lower, [/condition/, /case/, /rule/, /expression/]);
  const dangerousIfEmpty = !!field.required || hasRequiredIf || (isEmptyValue(defaultValue) && dangerousIfWrong);

  const baseIntel: FieldIntelligence = {
    purpose: field.description || `${fieldName} configures this node.`,
    runtimeBehavior: {
      ...(hasDefault ? { backendDefault: defaultValue, emptyValueMeaning: emptyValueMeaning(defaultValue) } : {}),
      whenMissing: field.required
        ? 'The node expects this value before execution unless runtime AI ownership intentionally supplies it.'
        : 'If omitted, the node uses its backend/default behavior or skips this optional behavior.',
      whenEmpty: dangerousIfEmpty
        ? 'Leaving this empty can change behavior, fail execution, or produce incomplete output.'
        : 'Leaving this empty normally means this optional behavior is not applied.',
    },
    importance: {
      base,
      dangerousIfEmpty,
      dangerousIfWrong,
      dependsOnUseCase: !field.required && (textLike || selectorLike || rangeOrLimit),
    },
    validationHints: dangerousIfEmpty
      ? [
          {
            severity: field.required || hasRequiredIf ? 'error' : 'warning',
            when: 'empty',
            message: `${fieldName} is empty, but this field affects whether ${args.nodeType} can run or produce useful output.`,
          },
        ]
      : undefined,
  };

  return mergeIntelligence(mergeIntelligence(baseIntel, highRiskOverride(args)), field.fieldIntelligence);
}

export function summarizeFieldIntelligenceForPrompt(inputSchema: NodeInputSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [fieldName, field] of Object.entries(inputSchema || {})) {
    const intel = field.fieldIntelligence;
    if (!intel) continue;
    out[fieldName] = {
      purpose: intel.purpose,
      importance: intel.importance,
      runtimeBehavior: intel.runtimeBehavior,
      safeDefaults: intel.safeDefaults,
      validationHints: intel.validationHints,
    };
  }
  return out;
}

function matchHint(when: FieldValidationHintTrigger, value: unknown): boolean {
  if (when === 'missing') return value === undefined || value === null;
  if (when === 'empty') return isEmptyValue(value);
  if (when === 'zero') return value === 0 || value === '0';
  return false;
}

function firstSafeDefault(intel?: FieldIntelligence): unknown {
  return intel?.safeDefaults?.[0]?.value;
}

function roleLabel(role?: string): string {
  return String(role || 'configuration').replace(/_/g, ' ');
}

function composeWhat(args: {
  nodeLabel: string;
  fieldName: string;
  label: string;
  field: Partial<NodeInputField>;
  relevance?: FieldRelevanceResult;
  operation?: string;
}): string {
  const purpose = args.field.fieldIntelligence?.purpose || args.field.description || `${args.label} configures ${args.nodeLabel}.`;
  const operationText = args.operation ? ` It applies to the "${args.operation}" operation.` : args.relevance?.operationRole ? ` ${args.relevance.operationRole}` : '';
  const downstreamText = args.relevance?.downstreamDependency ? ` ${args.relevance.downstreamDependency}` : '';
  return `${purpose}${operationText}${downstreamText}`;
}

function composeNeeded(args: {
  relevance?: FieldRelevanceResult;
  importance?: FieldIntelligence['importance'];
  safeText: string;
  emptyBehavior: string;
}): string {
  const relevance = args.relevance;
  if (relevance?.userAction) {
    const riskText = relevance.relevance === 'recommended' && relevance.riskIfEmpty === 'high'
      ? ' Leaving it empty can make this step fail or produce an unusable result.'
      : '';
    return `${relevance.userAction}${riskText}`;
  }
  if (relevance?.relevance === 'not_applicable') return `Leave this off for this workflow. ${relevance.reason}`;
  if (relevance?.relevance === 'required') return `Turn this on and provide a value before running.${args.safeText}`;
  if (relevance?.relevance === 'recommended') {
    return `Recommended for this workflow. ${relevance.reason}${relevance.riskIfEmpty === 'high' ? ` ${args.emptyBehavior}` : ''}${args.safeText}`;
  }
  if (args.importance?.base === 'required') return `Turn this on and provide a value before running.${args.safeText}`;
  if (args.importance?.base === 'conditionally_required') return `Use this when the selected operation needs it. ${args.emptyBehavior}${args.safeText}`;
  if (args.importance?.base === 'recommended' || args.importance?.dangerousIfEmpty) {
    return `Recommended for this workflow when it affects the result. ${args.emptyBehavior}${args.safeText}`;
  }
  return `Usually optional for this step. ${args.emptyBehavior}`;
}

function composeDataImpact(args: {
  nodeLabel: string;
  fieldName: string;
  relevance?: FieldRelevanceResult;
  importance?: FieldIntelligence['importance'];
  useCaseGuidance?: string;
}): string {
  const relevance = args.relevance;
  if (relevance?.relevance === 'not_applicable') return 'This field is not used by the current operation or dependency state.';
  const role = relevance?.fieldRole;
  if (role === 'operation_selector') return `Changing this changes which action ${args.nodeLabel} performs before connected steps run.`;
  if (role === 'resource_identifier') return `Changing this points ${args.nodeLabel} at a different resource, so later steps receive or update different data.`;
  if (role === 'range') return `Changing this changes exactly which records, rows, columns, or cells this step reads or writes.`;
  if (role === 'bound') return `Changing this changes how much data or text flows from ${args.nodeLabel} into the next step.`;
  if (role === 'recipient') return 'Changing this changes who receives the workflow result.';
  if (role === 'title') return 'Changing this changes how the delivered result is labeled for the recipient or downstream system.';
  if (role === 'content') return `Changing this changes the main content ${args.nodeLabel} passes forward or sends out.`;
  if (role === 'query') return `Changing this changes which matching records ${args.nodeLabel} finds before later steps use them.`;
  if (role === 'condition') return 'Changing this changes how the workflow filters, branches, or routes the incoming data.';
  if (role === 'endpoint') return `Changing this changes the external route or service ${args.nodeLabel} calls.`;
  if (role === 'payload') return `Changing this changes the data ${args.nodeLabel} writes, transforms, or sends.`;
  if (role === 'selector') return `Changing this changes the mode, format, or source ${args.nodeLabel} uses.`;
  if (args.useCaseGuidance) return args.useCaseGuidance;
  if (args.importance?.dangerousIfWrong) return `Changing this value can change what ${args.nodeLabel} reads, writes, routes, or produces.`;
  return relevance?.wrongValueRisk || `Changing this value adjusts ${roleLabel(role)} behavior for ${args.nodeLabel}.`;
}

function normalizeGuidanceText(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureSentence(value: string): string {
  const text = normalizeGuidanceText(value);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function lowerFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function stripConditionLead(value: string): string {
  return normalizeGuidanceText(value)
    .replace(/^if\s+(?:this\s+)?(?:field\s+)?(?:is\s+)?(?:enabled\s+but\s+)?empty,?\s*/i, '')
    .replace(/^if\s+empty,?\s*/i, '')
    .replace(/^if\s+(?:this\s+)?(?:field\s+)?(?:is\s+)?off,?\s*/i, '')
    .trim();
}

function composeNeedSummary(args: {
  field: Partial<NodeInputField>;
  relevance?: FieldRelevanceResult;
  importance?: FieldIntelligence['importance'];
}): string {
  if (args.relevance?.relevance === 'not_applicable') return 'It is not needed for the selected operation.';
  if (args.field.required || args.relevance?.relevance === 'required' || args.importance?.base === 'required') {
    return 'It must be set before the workflow can run.';
  }
  if (args.relevance?.relevance === 'recommended' || args.importance?.base === 'recommended' || args.importance?.dangerousIfEmpty) {
    return 'It is recommended when this value affects the workflow result.';
  }
  if (args.importance?.base === 'conditionally_required') return 'It is needed only when this selected operation depends on it.';
  return 'It is optional, so set it only when this workflow needs this behavior.';
}

function composeSetupSummary(args: {
  what: string;
  field: Partial<NodeInputField>;
  fieldName: string;
  relevance?: FieldRelevanceResult;
  importance?: FieldIntelligence['importance'];
  emptyBehavior: string;
  recommendedOwner: FieldGuidanceDescription['recommendedOwner'];
  ownerReason: string;
  actionableExample?: FieldGuidanceDescription['actionableExample'];
}): string {
  const sentences: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const sentence = ensureSentence(value);
    const key = sentence.toLowerCase();
    if (!sentence || seen.has(key)) return;
    seen.add(key);
    sentences.push(sentence);
  };

  push(args.what);
  const emptyText = stripConditionLead(args.emptyBehavior);
  const needSummary = composeNeedSummary({
    field: args.field,
    relevance: args.relevance,
    importance: args.importance,
  });
  if (emptyText) {
    push(`${needSummary} When no value is set, ${lowerFirst(emptyText)}`);
  } else {
    push(needSummary);
  }

  const ownerText = args.ownerReason
    ? `Recommended owner: ${args.recommendedOwner}. ${args.ownerReason}`
    : `Recommended owner: ${args.recommendedOwner}.`;
  push(ownerText);

  if (isCredentialLikeField(args.field, args.fieldName)) {
    push('Connect or enter credentials manually; AI will not create fake secret values.');
  } else if (args.actionableExample?.canApply) {
    push('A safe suggested value is available below and can be applied as AI Build.');
  } else if (args.actionableExample?.reason && !/no safe typed example/i.test(args.actionableExample.reason)) {
    push(args.actionableExample.reason);
  }

  return sentences.slice(0, 4).join(' ');
}

function isUsefulSetupSummary(value: unknown, deterministic: FieldGuidanceDescription): value is string {
  const summary = normalizeGuidanceText(value);
  if (summary.length < 40) return false;
  if (/configured default behavior|vague default behavior/i.test(summary)) return false;
  if (/if\s+this\s+is\s+off[\s\S]*if\s+this\s+is\s+empty/i.test(summary)) return false;
  if (
    /required|must be set|provide a value/i.test(deterministic.needed) &&
    /leave\s+(this\s+)?(off|empty)|optional/i.test(summary) &&
    !/must|required/i.test(summary)
  ) {
    return false;
  }
  return true;
}

function composeYouGuidance(args: {
  relevance?: FieldRelevanceResult;
  importance?: FieldIntelligence['importance'];
  fieldName?: string;
  options?: Array<{ label: string; value: string }>;
  label: string;
  example: string;
}): string {
  const role = args.relevance?.fieldRole;
  if (args.relevance?.relevance === 'not_applicable') return 'Leave this disabled unless you change the selected operation or dependency.';
  if (role === 'credential') return 'Connect or select the correct credential from the Credentials step.';
  if (isModelField(args.fieldName || '', args.label) && args.options?.length) {
    return `Choose one of the available model options for this node. ${args.example}`;
  }
  if (args.options?.length) {
    return `Choose one of the available dropdown options. ${args.example}`;
  }
  if (role === 'resource_identifier') return `Paste the exact identifier or name from the source system. ${args.example}`;
  if (role === 'endpoint') return `Paste the exact URL or route from the system that should receive the request. ${args.example}`;
  if (role === 'recipient') return `Enter the exact destination recipient value. ${args.example}`;
  if (role === 'condition') return `Enter the exact rule that decides which data should continue. ${args.example}`;
  if (role === 'bound') return `Enter a clear numeric limit that matches the destination and expected output size. ${args.example}`;
  if (args.importance?.dangerousIfWrong) return `Provide the exact value from the source system or workflow requirement. Use You when it must stay stable.`;
  return `Enter a fixed value yourself when ${args.label} should stay the same on every run.`;
}

function requiredIfApplies(field: NodeInputField, config: Record<string, unknown>): boolean {
  const requiredIf = field.ui?.requiredIf;
  if (!requiredIf) return true;
  const current = config[String(requiredIf.field)];
  if ('equals' in requiredIf) return current === requiredIf.equals;
  return true;
}

function fieldHasExplicitDefault(field: Partial<NodeInputField>): boolean {
  return Object.prototype.hasOwnProperty.call(field, 'default');
}

function stringifyDefault(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function displayActionableValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeActionableOptions(field: Partial<NodeInputField>): Array<{ label: string; value: string }> {
  const options = (field as any).options || field.ui?.options || (field as any).ui?.options;
  if (!Array.isArray(options)) return [];
  return options
    .map((option: any) => {
      if (typeof option === 'string') return { label: option, value: option };
      if (!option || typeof option !== 'object') return null;
      const value = String(option.value ?? option.id ?? option.key ?? option.label ?? '').trim();
      if (!value) return null;
      return { label: String(option.label ?? value), value };
    })
    .filter(Boolean) as Array<{ label: string; value: string }>;
}

function isModelField(fieldName: string, label?: string): boolean {
  return /\bmodel\b/i.test(`${fieldName} ${label || ''}`);
}

function isCredentialLikeField(field: Partial<NodeInputField>, fieldName?: string): boolean {
  const role = normalizeSemanticRole(field.role || field.helpCategory || field.ownership);
  const searchable = `${fieldName || ''} ${(field as any).label || ''} ${field.description || ''} ${role}`.toLowerCase();
  return (
    field.ownership === 'credential' ||
    ['credential', 'api_key', 'oauth', 'token', 'secret'].includes(role) ||
    /\b(api[_-\s]?key|secret|password|passphrase|access[_-\s]?token|refresh[_-\s]?token|bearer[_-\s]?token|client[_-\s]?secret|private[_-\s]?key|oauth)\b/i.test(searchable)
  );
}

function selectActionableValue(field: Partial<NodeInputField>, rawValue: unknown): unknown {
  const options = normalizeActionableOptions(field);
  if (!options.length) return rawValue;
  const allowed = new Set(options.map((option) => option.value));
  const candidates = [
    rawValue,
    field.default,
    (field as any).currentValue,
    (field as any).defaultValue,
    options[0]?.value,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const value = String(candidate);
    if (allowed.has(value)) return value;
  }
  return undefined;
}

function stripExamplePrefix(value: string): string {
  return value
    .trim()
    .replace(/^(?:e\.?\s*g\.?|eg|example|examples?|suggested(?:\s+value)?|sample)\s*[:.-]\s*/i, '')
    .trim();
}

function firstJsonLikeSubstring(value: string): string | null {
  const trimmed = value.trim();
  const objectStart = trimmed.indexOf('{');
  const arrayStart = trimmed.indexOf('[');
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const open = trimmed[start];
  const close = open === '{' ? '}' : ']';
  const end = trimmed.lastIndexOf(close);
  if (end <= start) return null;
  return trimmed.slice(start, end + 1);
}

function normalizeExampleCandidate(rawValue: unknown, field: Partial<NodeInputField>): unknown {
  if (rawValue === undefined || rawValue === null) return undefined;
  const fieldType = String(field.type || '').toLowerCase();

  if (typeof rawValue !== 'string') return rawValue;

  const cleaned = stripExamplePrefix(rawValue);
  if (!cleaned) return undefined;

  if (['json', 'object', 'array'].includes(fieldType)) {
    const jsonText = firstJsonLikeSubstring(cleaned) || cleaned;
    try {
      const parsed = JSON.parse(jsonText);
      if (fieldType === 'object' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) return undefined;
      if (fieldType === 'array' && !Array.isArray(parsed)) return undefined;
      return parsed;
    } catch {
      return undefined;
    }
  }

  if (fieldType === 'number') {
    const match = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (!match) return undefined;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  if (fieldType === 'boolean') {
    if (/^(true|yes|on|enabled)$/i.test(cleaned)) return true;
    if (/^(false|no|off|disabled)$/i.test(cleaned)) return false;
    return undefined;
  }

  if (
    /^sample[-_\s]/i.test(cleaned) ||
    /^example[-_\s]/i.test(cleaned) ||
    /^your[-_\s]/i.test(cleaned) ||
    /^set\s+(this|the)\b/i.test(cleaned) ||
    /^<[^>]+>$/.test(cleaned)
  ) {
    return undefined;
  }

  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    return cleaned.slice(1, -1);
  }
  return cleaned;
}

function actionableCandidateValues(field: Partial<NodeInputField>, safe: unknown): unknown[] {
  const anyField = field as any;
  const candidates: unknown[] = [];
  const push = (value: unknown) => {
    if (value !== undefined && value !== null) candidates.push(value);
  };

  push(safe);
  push(anyField.exampleValue);
  push(anyField.example);
  if (Array.isArray(anyField.examples)) {
    for (const example of anyField.examples) push(example);
  }
  push(anyField.currentValue);
  push(anyField.defaultValue);
  push(field.default);

  return candidates;
}

function selectUniversalActionableValue(field: Partial<NodeInputField>, safe: unknown): unknown {
  const options = normalizeActionableOptions(field);
  const candidates = actionableCandidateValues(field, safe);

  if (options.length) {
    for (const candidate of candidates) {
      const selected = selectActionableValue(field, normalizeExampleCandidate(candidate, field));
      if (selected !== undefined && selected !== null) return selected;
    }
    return selectActionableValue(field, undefined);
  }

  for (const candidate of candidates) {
    const normalized = normalizeExampleCandidate(candidate, field);
    if (normalized === undefined || normalized === null) continue;
    if (String(displayActionableValue(normalized)).trim() === '') continue;
    return normalized;
  }

  return undefined;
}

function deterministicActionableValue(args: {
  field: Partial<NodeInputField> & { supportsBuildtimeAI?: boolean };
  safe: unknown;
  recommendedOwner: FieldGuidanceDescription['recommendedOwner'];
  fieldName?: string;
}): FieldGuidanceDescription['actionableExample'] {
  const field = args.field;
  if (isCredentialLikeField(field, args.fieldName)) {
    return {
      value: '',
      displayValue: '',
      canApply: false,
      applyMode: 'buildtime_ai_once',
      reason: 'Credential and secret values must be connected or entered by the user, not generated as fake examples.',
      source: 'deterministic_field_guidance',
    };
  }

  const selectedValue = selectUniversalActionableValue(field, args.safe);

  if (selectedValue === undefined || selectedValue === null || String(displayActionableValue(selectedValue)).trim() === '') {
    return {
      value: '',
      displayValue: '',
      canApply: false,
      applyMode: 'buildtime_ai_once',
      reason: normalizeActionableOptions(field).length
        ? 'No available option could be selected safely for one-click application.'
        : 'No safe typed example is available for one-click application.',
      source: 'deterministic_field_guidance',
    };
  }

  return {
    value: selectedValue,
    displayValue: displayActionableValue(selectedValue),
    canApply: field.supportsBuildtimeAI !== false,
    applyMode: 'buildtime_ai_once',
    reason:
      args.recommendedOwner === 'AI Runtime'
        ? 'This example is a setup-time value; keep runtime-owned fields as AI Runtime when they must change per execution.'
        : 'This safe example can be reviewed and applied as an AI Build setup value.',
    source: 'deterministic_field_guidance',
  };
}

function humanFieldName(fieldName: string): string {
  return String(fieldName || 'this field')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
}

function isGenericEmptyBehavior(text: string | undefined): boolean {
  return !text || /configured default behavior|change behavior|produce incomplete output|optional setting is not applied|extra behavior|backend\/default behavior/i.test(text);
}

function normalizeSemanticRole(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function inferPlainFieldRole(field: Partial<NodeInputField>, relevance?: FieldRelevanceResult): string {
  const semanticRole = normalizeSemanticRole(relevance?.fieldRole || field.role || field.helpCategory || field.ownership);
  if (field.ownership === 'credential' || ['credential', 'api_key', 'oauth', 'token', 'secret'].includes(semanticRole)) return 'credential';
  if (['operation_selector', 'operation', 'action', 'method'].includes(semanticRole)) return 'operation';
  if (['resource_identifier', 'id', 'resource', 'field_name'].includes(semanticRole)) return 'resource';
  if (['range'].includes(semanticRole)) return 'range';
  if (['selector', 'type_selector', 'format', 'mode', 'source'].includes(semanticRole)) return 'format';
  if (['recipient'].includes(semanticRole)) return 'recipient';
  if (['title', 'title_like'].includes(semanticRole)) return 'title';
  if (['content', 'long_body', 'short_summary', 'prompt'].includes(semanticRole)) return 'content';
  if (['bound', 'limit', 'count'].includes(semanticRole)) return 'bound';
  if (['query'].includes(semanticRole)) return 'query';
  if (['condition'].includes(semanticRole)) return 'condition';
  if (['endpoint', 'base_url', 'webhook_url', 'url'].includes(semanticRole)) return 'endpoint';
  if (['payload', 'raw_json', 'value'].includes(semanticRole)) return 'payload';
  return 'configuration';
}

function roleBasedEmptyBehavior(args: {
  nodeLabel: string;
  fieldName: string;
  field: Partial<NodeInputField>;
  relevance?: FieldRelevanceResult;
  operation?: string;
  defaultText?: string;
  required: boolean;
}): { emptyBehavior: string; defaultBehaviorLabel: string } {
  const fieldLabel = humanFieldName(args.fieldName);
  const role = inferPlainFieldRole(args.field, args.relevance);
  const operationText = args.operation ? ` for the "${args.operation}" operation` : '';
  const defaultText = args.defaultText;

  if (args.required) {
    const requiredByRole: Record<string, string> = {
      credential: `If empty, ${args.nodeLabel} cannot connect to the account or service it needs.`,
      operation: `If empty, ${args.nodeLabel} does not know which action to perform${operationText}.`,
      resource: `If empty, ${args.nodeLabel} does not know which exact resource to use.`,
      endpoint: `If empty, ${args.nodeLabel} does not know which URL or service route to call.`,
      recipient: `If empty, ${args.nodeLabel} has no recipient for the result.`,
      content: `If empty, ${args.nodeLabel} has no main content to process or send.`,
    };
    return {
      emptyBehavior: requiredByRole[role] || `If empty, ${args.nodeLabel} is missing the ${fieldLabel} value it needs to run.`,
      defaultBehaviorLabel: 'Required value',
    };
  }

  const optionalByRole: Record<string, { emptyBehavior: string; defaultBehaviorLabel: string }> = {
    credential: {
      emptyBehavior: `If empty, ${args.nodeLabel} uses the connected account or credential chosen in the Credentials step.`,
      defaultBehaviorLabel: 'Uses connected credential',
    },
    operation: {
      emptyBehavior: defaultText
        ? `If empty, ${args.nodeLabel} uses "${defaultText}" as the action. Change it only when this step should do something else.`
        : `If empty, ${args.nodeLabel} keeps the action already selected for this workflow.`,
      defaultBehaviorLabel: defaultText ? `Default action: ${defaultText}` : 'Uses selected action',
    },
    resource: {
      emptyBehavior: `If empty, ${args.nodeLabel} may use the resource already selected in setup. Enter this when the workflow must use one exact resource.`,
      defaultBehaviorLabel: 'Uses selected resource when available',
    },
    range: {
      emptyBehavior: `If empty, ${args.nodeLabel} may use a broader data range than expected. Enter a range when only specific records, rows, columns, or items should be used.`,
      defaultBehaviorLabel: 'No exact range',
    },
    format: {
      emptyBehavior: defaultText
        ? `If empty, ${args.nodeLabel} returns data as ${defaultText}. Use a different value only when the next step needs another format.`
        : `If empty, ${args.nodeLabel} uses its standard data format for the next step.`,
      defaultBehaviorLabel: defaultText ? `Default: ${defaultText}` : 'Uses standard format',
    },
    recipient: {
      emptyBehavior: `If empty, ${args.nodeLabel} must get recipients from AI Runtime or earlier workflow data. Enter recipients yourself when they should stay fixed.`,
      defaultBehaviorLabel: 'Needs recipients from data or AI',
    },
    title: {
      emptyBehavior: `If empty, ${args.nodeLabel} may send or create the result without a clear title or subject. Set it when people need to recognize the message quickly.`,
      defaultBehaviorLabel: 'No custom title',
    },
    content: {
      emptyBehavior: `If empty, ${args.nodeLabel} must use content from earlier workflow data or AI Runtime. Enter text yourself when the message or prompt should stay fixed.`,
      defaultBehaviorLabel: 'Needs content from data or AI',
    },
    bound: {
      emptyBehavior: defaultText
        ? `If empty, ${args.nodeLabel} uses ${defaultText} as the limit. Set your own number when the output must be shorter, longer, or safer for the next step.`
        : `If empty, ${args.nodeLabel} may use an unsuitable size limit. Set a number when the output length or record count matters.`,
      defaultBehaviorLabel: defaultText ? `Default limit: ${defaultText}` : 'No explicit limit',
    },
    query: {
      emptyBehavior: `If empty, ${args.nodeLabel} searches less specifically or uses the incoming data as-is. Enter a query when only matching records should continue.`,
      defaultBehaviorLabel: 'No custom search query',
    },
    condition: {
      emptyBehavior: `If empty, ${args.nodeLabel} has no clear rule for filtering or branching. Add a condition when the workflow must choose between paths.`,
      defaultBehaviorLabel: 'No decision rule',
    },
    endpoint: {
      emptyBehavior: `If empty, ${args.nodeLabel} has no custom URL or route to call. Enter this when the request must go to a specific endpoint.`,
      defaultBehaviorLabel: 'No custom endpoint',
    },
    payload: {
      emptyBehavior: `If empty, ${args.nodeLabel} uses data from earlier steps when available. Map this field when you need a specific row, object, or message structure.`,
      defaultBehaviorLabel: 'Uses incoming data when available',
    },
    configuration: {
      emptyBehavior: `If empty, ${args.nodeLabel} skips this ${fieldLabel || 'optional'} setting. Fill it only when this workflow needs that exact setting.`,
      defaultBehaviorLabel: 'Optional setting skipped',
    },
  };

  return optionalByRole[role] || optionalByRole.configuration;
}

function composeConcreteEmptyBehavior(args: {
  nodeLabel: string;
  fieldName: string;
  field: Partial<NodeInputField>;
  relevance?: FieldRelevanceResult;
  importance?: FieldIntelligence['importance'];
  operation?: string;
}): { emptyBehavior: string; defaultBehaviorLabel: string } {
  const { field, relevance, importance } = args;
  const runtime = field.fieldIntelligence?.runtimeBehavior;
  const explicitDefault = fieldHasExplicitDefault(field);
  const defaultText = explicitDefault ? stringifyDefault(field.default) : '';
  const required = !!(field.required || relevance?.relevance === 'required' || importance?.base === 'required');

  if (relevance?.emptyBehavior && !isGenericEmptyBehavior(relevance.emptyBehavior)) {
    return {
      emptyBehavior: relevance.emptyBehavior,
      defaultBehaviorLabel: relevance.riskIfEmpty === 'high' ? 'Risky when empty' : 'Workflow-specific empty behavior',
    };
  }
  if (runtime?.whenEmpty && !isGenericEmptyBehavior(runtime.whenEmpty)) {
    return {
      emptyBehavior: runtime.whenEmpty,
      defaultBehaviorLabel: explicitDefault ? `Uses default ${defaultText || 'value'}` : 'Provider or node empty behavior',
    };
  }
  if (runtime?.whenMissing && !isGenericEmptyBehavior(runtime.whenMissing)) {
    return {
      emptyBehavior: runtime.whenMissing,
      defaultBehaviorLabel: explicitDefault ? `Uses default ${defaultText || 'value'}` : 'Provider or node missing-value behavior',
    };
  }
  if (relevance?.relevance === 'not_applicable') {
    return {
      emptyBehavior: 'If empty, this input is ignored because the selected operation does not use it.',
      defaultBehaviorLabel: 'Ignored for this operation',
    };
  }
  const roleBased = roleBasedEmptyBehavior({
    nodeLabel: args.nodeLabel,
    fieldName: args.fieldName,
    field,
    relevance,
    operation: args.operation,
    defaultText,
    required,
  });
  if (importance?.dangerousIfEmpty || relevance?.riskIfEmpty === 'high') {
    return {
      emptyBehavior: `${roleBased.emptyBehavior} This field affects whether the step gives a useful result.`,
      defaultBehaviorLabel: roleBased.defaultBehaviorLabel === 'Optional setting skipped' ? 'Risky when empty' : roleBased.defaultBehaviorLabel,
    };
  }
  return roleBased;
}

function composeOffBehavior(args: {
  nodeLabel: string;
  fieldName: string;
  field: Partial<NodeInputField>;
  relevance?: FieldRelevanceResult;
  emptyBehavior: string;
}): string {
  const fieldLabel = args.fieldName.replace(/([A-Z])/g, ' $1').replace(/[_-]+/g, ' ').trim().toLowerCase();
  if (args.relevance?.relevance === 'not_applicable') {
    return `If off, ${args.nodeLabel} will not send this ${fieldLabel || 'field'} because the selected operation does not use it.`;
  }
  if (args.field.required || args.relevance?.relevance === 'required') {
    return `If off, ${args.nodeLabel} will still need this ${fieldLabel || 'value'} before the workflow can run.`;
  }
  if (args.relevance?.relevance === 'recommended') {
    return `If off, ${args.nodeLabel} will continue without this ${fieldLabel || 'setting'}, but the result may be less accurate for this workflow.`;
  }
  return `If off, ${args.nodeLabel} leaves this ${fieldLabel || 'setting'} out of the setup. ${args.emptyBehavior}`;
}

function recommendOwner(args: {
  field: Partial<NodeInputField> & { supportsRuntimeAI?: boolean; supportsBuildtimeAI?: boolean };
  relevance?: FieldRelevanceResult;
  importance?: FieldIntelligence['importance'];
}): { recommendedOwner: FieldGuidanceDescription['recommendedOwner']; ownerReason: string } {
  const role = args.relevance?.fieldRole || args.field.role || '';
  if (args.field.ownership === 'credential' || role === 'credential') {
    return { recommendedOwner: 'You', ownerReason: 'Credential and account-specific values should be connected or provided by the user.' };
  }
  if (args.relevance?.relevance === 'required' || args.importance?.dangerousIfWrong || role === 'resource_identifier' || role === 'endpoint') {
    return { recommendedOwner: 'You', ownerReason: 'Use a user-provided value because this field points to a specific resource, destination, or stable workflow setting.' };
  }
  if (args.field.supportsRuntimeAI !== false && ['recipient', 'title', 'content', 'query', 'payload'].includes(String(role))) {
    return { recommendedOwner: 'AI Runtime', ownerReason: 'Use runtime AI when the value should be created from live upstream data on each execution.' };
  }
  if (args.field.supportsBuildtimeAI !== false) {
    return { recommendedOwner: 'AI Build', ownerReason: 'AI can suggest a setup-time value, but the user should review it before running the workflow.' };
  }
  return { recommendedOwner: 'You', ownerReason: 'This field does not support AI ownership, so the user should provide or confirm the value.' };
}

function validationConfidenceFor(args: {
  field: Partial<NodeInputField>;
  relevance?: FieldRelevanceResult;
  importance?: FieldIntelligence['importance'];
}): FieldGuidanceDescription['validationConfidence'] {
  if (args.relevance?.guidanceQualitySignals?.usesStructuredMetadata || args.field.fieldIntelligence?.runtimeBehavior) return 'high';
  if (args.importance || args.field.description) return 'medium';
  return 'low';
}

function warningsFor(args: {
  field: Partial<NodeInputField> & { supportsRuntimeAI?: boolean; supportsBuildtimeAI?: boolean };
  relevance?: FieldRelevanceResult;
  importance?: FieldIntelligence['importance'];
  emptyBehavior: string;
}): string[] {
  const warnings: string[] = [];
  if (args.importance?.dangerousIfEmpty || args.relevance?.riskIfEmpty === 'high') warnings.push(args.emptyBehavior);
  if (args.field.supportsBuildtimeAI !== false) warnings.push('Review AI Build values before running; AI suggestions can be wrong for account-specific or business-specific settings.');
  if (args.field.supportsRuntimeAI === false) warnings.push('AI Runtime is not available for this field.');
  return Array.from(new Set(warnings.filter(Boolean)));
}

export function validateWorkflowNodeIntelligence(workflow: WorkflowLike): NodeFieldIntelligenceIssue[] {
  const issues: NodeFieldIntelligenceIssue[] = [];
  const { unifiedNodeRegistry } = require('../registry/unified-node-registry') as typeof import('../registry/unified-node-registry');
  const { evaluateSelectedFieldRelevance } = require('./selected-workflow-intelligence') as typeof import('./selected-workflow-intelligence');

  for (const node of workflow.nodes || []) {
    const nodeType = String(node.data?.type || node.type || '');
    const def = unifiedNodeRegistry.get(nodeType);
    if (!def?.inputSchema) continue;
    const config = node.data?.config || {};
    const nodeLabel = node.data?.label || nodeType;

    for (const [fieldName, field] of Object.entries(def.inputSchema)) {
      const mode: FieldFillMode = resolveEffectiveFieldFillMode(fieldName, def.inputSchema, config as Record<string, any>);
      const value = (config as Record<string, unknown>)[fieldName];
      const intel = field.fieldIntelligence;
      if (!intel) continue;
      const relevance = evaluateSelectedFieldRelevance({ workflow, node, fieldName, field });
      if (relevance.relevance === 'not_applicable') continue;
      const conditionalApplies = requiredIfApplies(field, config as Record<string, unknown>);

      if (
        mode !== 'runtime_ai' &&
        (field.required || relevance.relevance === 'required') &&
        isEmptyValue(value)
      ) {
        issues.push({
          nodeId: String(node.id || ''),
          nodeType,
          nodeLabel,
          fieldName,
          severity: 'error',
          reason: intel.validationHints?.find((h) => h.when === 'empty' || h.when === 'missing')?.message || `${fieldName} is required for ${nodeLabel}.`,
          suggestedValue: firstSafeDefault(intel),
          source: 'node_intelligence',
        });
        continue;
      }

      for (const hint of intel.validationHints || []) {
        if (!conditionalApplies && (hint.when === 'empty' || hint.when === 'missing')) continue;
        if (!matchHint(hint.when, value)) continue;
        if (mode === 'runtime_ai' && (hint.when === 'empty' || hint.when === 'missing')) continue;
        issues.push({
          nodeId: String(node.id || ''),
          nodeType,
          nodeLabel,
          fieldName,
          severity: hint.severity,
          reason: hint.message,
          suggestedValue: hint.suggestedValue ?? firstSafeDefault(intel),
          source: 'node_intelligence',
        });
      }
    }
  }

  return issues;
}

export function buildFieldGuidanceDescription(args: {
  nodeType: string;
  nodeLabel: string;
  fieldName: string;
  field: Partial<NodeInputField> & {
    label?: string;
    selectedMode?: string;
    fieldEnabled?: boolean;
    supportsRuntimeAI?: boolean;
    supportsBuildtimeAI?: boolean;
    fieldRelevance?: FieldRelevanceResult;
  };
  workflowGoal?: string;
  operation?: string;
  fieldRelevance?: FieldRelevanceResult;
}): FieldGuidanceDescription {
  const field = args.field;
  const intel = field.fieldIntelligence;
  const label = String((field as any).label || args.fieldName);
  const importance = intel?.importance;
  const relevance = args.fieldRelevance || field.fieldRelevance;
  const safe = firstSafeDefault(intel);
  const safeText = safe !== undefined ? ` A safe starting value is ${JSON.stringify(safe)}.` : '';
  const fieldOptions = normalizeActionableOptions(field);
  const optionExample = fieldOptions[0]?.value;
  const example = safe !== undefined
    ? `e.g. ${String(safe)}`
    : field.exampleValue
      ? `e.g. ${field.exampleValue}`
      : optionExample
        ? `e.g. ${optionExample}`
        : `e.g. sample-${args.fieldName}`;
  const { emptyBehavior, defaultBehaviorLabel } = composeConcreteEmptyBehavior({
    nodeLabel: args.nodeLabel,
    fieldName: args.fieldName,
    field,
    relevance,
    importance,
    operation: args.operation,
  });
  const offBehavior = composeOffBehavior({
    nodeLabel: args.nodeLabel,
    fieldName: args.fieldName,
    field,
    relevance,
    emptyBehavior,
  });
  const owner = recommendOwner({ field, relevance, importance });
  const needed = composeNeeded({ relevance, importance, safeText, emptyBehavior });
  const validationConfidence = validationConfidenceFor({ field, relevance, importance });
  const warnings = warningsFor({ field, relevance, importance, emptyBehavior });
  const actionableExample = deterministicActionableValue({
    field,
    safe,
    recommendedOwner: owner.recommendedOwner,
    fieldName: args.fieldName,
  });
  const what = composeWhat({
    nodeLabel: args.nodeLabel,
    fieldName: args.fieldName,
    label,
    field,
    relevance,
    operation: args.operation,
  });
  const dataImpact = composeDataImpact({
    nodeLabel: args.nodeLabel,
    fieldName: args.fieldName,
    relevance,
    importance,
    useCaseGuidance: intel?.useCaseNotes?.[0]?.guidance,
  });
  const you = composeYouGuidance({ relevance, importance, fieldName: args.fieldName, options: fieldOptions, label, example });
  const aiBuild =
    field.supportsBuildtimeAI === false
      ? 'Not available for this field.'
      : relevance?.relevance === 'not_applicable'
        ? 'Not needed for this selected operation.'
        : isModelField(args.fieldName, label) && fieldOptions.length
          ? 'AI can choose one of this node field\'s current model options during setup, then keep that model fixed. It will not use removed or unrelated API model names.'
        : `AI can choose this once during setup from the workflow goal, then keep it fixed. Use this for stable ${roleLabel(relevance?.fieldRole)} values. Registry importance: ${importance?.base || relevance?.relevance || 'optional'}.`;
  const aiRun =
    field.supportsRuntimeAI === false
      ? 'Not available for this field.'
      : relevance?.relevance === 'not_applicable'
        ? 'Not needed for this selected operation.'
        : `AI can decide this during each run from live upstream data only when the ${roleLabel(relevance?.fieldRole)} value should change per execution.`;
  const setupSummary = composeSetupSummary({
    what,
    field,
    fieldName: args.fieldName,
    relevance,
    importance,
    emptyBehavior,
    recommendedOwner: owner.recommendedOwner,
    ownerReason: owner.ownerReason,
    actionableExample,
  });

  return {
    what,
    setupSummary,
    needed,
    dataImpact,
    you,
    aiBuild,
    aiRun,
    example,
    actionableExample,
    offBehavior,
    emptyBehavior,
    defaultBehaviorLabel,
    recommendedOwner: owner.recommendedOwner,
    ownerReason: owner.ownerReason,
    validationConfidence,
    warnings,
    safeValueSuggestion: safe !== undefined ? String(safe) : undefined,
  };
}

export function mergeGuidanceWithDeterministic(
  deterministic: FieldGuidanceDescription,
  ai: Partial<FieldGuidanceDescription> | null | undefined,
): FieldGuidanceDescription {
  if (!ai || !isPlainObject(ai)) return deterministic;
  const deterministicReason = String(deterministic.actionableExample?.reason || '');
  const deterministicSecurityBlocked =
    deterministic.actionableExample?.canApply === false &&
    /credential|secret|token|api key|oauth|password/i.test(deterministicReason);
  const deterministicCanApply = deterministic.actionableExample?.canApply === true;
  const deterministicHasValue =
    deterministic.actionableExample?.value !== undefined &&
    deterministic.actionableExample?.value !== null &&
    String(displayActionableValue(deterministic.actionableExample.value)).trim() !== '';
  const aiActionable =
    ai.actionableExample && isPlainObject(ai.actionableExample)
      ? ai.actionableExample
      : undefined;
  const aiCanApply = aiActionable ? (aiActionable as any).canApply !== false : false;
  const aiHasValue =
    aiActionable &&
    Object.prototype.hasOwnProperty.call(aiActionable, 'value') &&
    (aiActionable as any).value !== undefined &&
    (aiActionable as any).value !== null &&
    String(displayActionableValue((aiActionable as any).value)).trim() !== '';
  const useDeterministicActionable =
    !!aiActionable &&
    deterministicCanApply &&
    deterministicHasValue &&
    (!aiCanApply || !aiHasValue);
  const mergedActionable = aiActionable
    ? useDeterministicActionable
      ? deterministic.actionableExample
      : {
          value:
            Object.prototype.hasOwnProperty.call(aiActionable, 'value')
              ? (aiActionable as any).value
              : deterministic.actionableExample?.value,
          displayValue: String(
            (aiActionable as any).displayValue ||
            displayActionableValue((aiActionable as any).value) ||
            deterministic.actionableExample?.displayValue ||
            ''
          ),
          canApply:
            deterministicSecurityBlocked
              ? false
              : (aiActionable as any).canApply !== false,
          applyMode: 'buildtime_ai_once' as const,
          reason: String((aiActionable as any).reason || deterministic.actionableExample?.reason || ''),
          source: 'ai_field_guidance' as const,
        }
    : deterministic.actionableExample;
  return {
    what: String(ai.what || deterministic.what),
    setupSummary: isUsefulSetupSummary(ai.setupSummary, deterministic)
      ? String(ai.setupSummary)
      : deterministic.setupSummary,
    needed: deterministic.needed,
    dataImpact: deterministic.dataImpact,
    you: String(ai.you || deterministic.you),
    aiBuild: String(ai.aiBuild || deterministic.aiBuild),
    aiRun: String(ai.aiRun || deterministic.aiRun),
    example: String(ai.example || deterministic.example),
    actionableExample: mergedActionable,
    offBehavior: deterministic.offBehavior,
    emptyBehavior: deterministic.emptyBehavior,
    defaultBehaviorLabel: deterministic.defaultBehaviorLabel,
    recommendedOwner: deterministic.recommendedOwner,
    ownerReason: deterministic.ownerReason,
    validationConfidence: deterministic.validationConfidence,
    warnings: Array.isArray(deterministic.warnings) ? deterministic.warnings : [],
    safeValueSuggestion: deterministic.safeValueSuggestion,
  };
}
