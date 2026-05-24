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
  needed: string;
  dataImpact: string;
  you: string;
  aiBuild: string;
  aiRun: string;
  example: string;
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
  dangerText: string;
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
    return `Recommended for this workflow. ${relevance.reason}${relevance.riskIfEmpty === 'high' ? ' Leaving it empty can make this step fail or produce an unusable result.' : ''}${args.safeText}`;
  }
  if (args.importance?.base === 'required') return `Turn this on and provide a value before running.${args.safeText}`;
  if (args.importance?.base === 'conditionally_required') return `Use this when the selected operation needs it.${args.dangerText}${args.safeText}`;
  if (args.importance?.base === 'recommended' || args.importance?.dangerousIfEmpty) {
    return `Recommended for this workflow when it affects the result.${args.dangerText}${args.safeText}`;
  }
  return `Usually optional for this step.${args.dangerText}`;
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

function composeYouGuidance(args: {
  relevance?: FieldRelevanceResult;
  importance?: FieldIntelligence['importance'];
  label: string;
  example: string;
}): string {
  const role = args.relevance?.fieldRole;
  if (args.relevance?.relevance === 'not_applicable') return 'Leave this disabled unless you change the selected operation or dependency.';
  if (role === 'credential') return 'Connect or select the correct credential from the Credentials step.';
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
  const dangerText = importance?.dangerousIfEmpty
    ? ' Leaving it empty can make this step fail or produce an unusable result.'
    : ' Leaving it empty keeps this field at its configured default behavior.';
  const example = safe !== undefined ? `e.g. ${String(safe)}` : field.exampleValue ? `e.g. ${field.exampleValue}` : `e.g. sample-${args.fieldName}`;
  const needed = composeNeeded({ relevance, importance, safeText, dangerText });

  return {
    what: composeWhat({
      nodeLabel: args.nodeLabel,
      fieldName: args.fieldName,
      label,
      field,
      relevance,
      operation: args.operation,
    }),
    needed,
    dataImpact: composeDataImpact({
      nodeLabel: args.nodeLabel,
      fieldName: args.fieldName,
      relevance,
      importance,
      useCaseGuidance: intel?.useCaseNotes?.[0]?.guidance,
    }),
    you: composeYouGuidance({ relevance, importance, label, example }),
    aiBuild:
      field.supportsBuildtimeAI === false
        ? 'Not available for this field.'
        : relevance?.relevance === 'not_applicable'
          ? 'Not needed for this selected operation.'
          : `AI can choose this once during setup from the workflow goal, then keep it fixed. Use this for stable ${roleLabel(relevance?.fieldRole)} values. Registry importance: ${importance?.base || relevance?.relevance || 'optional'}.`,
    aiRun:
      field.supportsRuntimeAI === false
        ? 'Not available for this field.'
        : relevance?.relevance === 'not_applicable'
          ? 'Not needed for this selected operation.'
          : `AI can decide this during each run from live upstream data only when the ${roleLabel(relevance?.fieldRole)} value should change per execution.`,
    example,
  };
}

export function mergeGuidanceWithDeterministic(
  deterministic: FieldGuidanceDescription,
  ai: Partial<FieldGuidanceDescription> | null | undefined,
): FieldGuidanceDescription {
  if (!ai || !isPlainObject(ai)) return deterministic;
  return {
    what: String(ai.what || deterministic.what),
    needed: deterministic.needed,
    dataImpact: deterministic.dataImpact,
    you: String(ai.you || deterministic.you),
    aiBuild: String(ai.aiBuild || deterministic.aiBuild),
    aiRun: String(ai.aiRun || deterministic.aiRun),
    example: String(ai.example || deterministic.example),
  };
}
