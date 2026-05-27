import type {
  FieldRelevanceResult,
  NodeInputField,
  UnifiedNodeDefinition,
} from '../types/unified-node-contract';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { isEmptyValue } from './is-empty-value';
import { resolveEffectiveFieldFillMode } from './fill-mode-resolver';
import { resolveFieldPolicyForNode } from '../operations/field-policy-resolver';

type WorkflowNodeLike = {
  id?: string;
  type?: string;
  data?: {
    type?: string;
    label?: string;
    config?: Record<string, unknown>;
  };
};

type WorkflowLike = {
  nodes?: WorkflowNodeLike[];
  edges?: Array<{ source?: string; target?: string }>;
};

export interface SelectedWorkflowFieldIntelligence {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  fieldName: string;
  relevance: FieldRelevanceResult;
}

export interface SelectedWorkflowNodeIntelligence {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  operation?: string;
  fields: Record<string, FieldRelevanceResult>;
}

export interface SelectedWorkflowIntelligence {
  nodes: SelectedWorkflowNodeIntelligence[];
  fields: SelectedWorkflowFieldIntelligence[];
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '_');
}

function human(value: unknown): string {
  return String(value ?? '').trim();
}

function getNodeType(node: WorkflowNodeLike): string {
  return human(node.data?.type || node.type);
}

function getNodeConfig(node: WorkflowNodeLike): Record<string, unknown> {
  return node.data?.config || {};
}

function withSchemaDefaults(config: Record<string, unknown>, def?: UnifiedNodeDefinition): Record<string, unknown> {
  const out = { ...(def?.defaultConfig?.() || {}), ...config };
  for (const [fieldName, field] of Object.entries(def?.inputSchema || {})) {
    if (out[fieldName] === undefined && Object.prototype.hasOwnProperty.call(field, 'default')) {
      out[fieldName] = field.default;
    }
  }
  return out;
}

function getSelectedOperation(config: Record<string, unknown>, def?: UnifiedNodeDefinition): string {
  return human(
    config.operation ||
      config.action ||
      config.method ||
      def?.inputSchema?.operation?.default ||
      def?.inputSchema?.action?.default ||
      def?.inputSchema?.method?.default ||
      '',
  );
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return expected.some((item) => valuesEqual(actual, item));
  return normalize(actual) === normalize(expected);
}

function conditionApplies(condition: unknown, config: Record<string, unknown>): boolean {
  if (!condition || typeof condition !== 'object') return true;
  const c = condition as Record<string, unknown>;
  const field = human(c.field);
  if (!field) return true;
  const actual = config[field];
  if ('equals' in c) return valuesEqual(actual, c.equals);
  if ('notEquals' in c) return !valuesEqual(actual, c.notEquals);
  return true;
}

function firstSafeDefault(field: NodeInputField): unknown {
  return field.fieldIntelligence?.safeDefaults?.[0]?.value;
}

function missingFactsForField(field: NodeInputField): string[] {
  const missing: string[] = [];
  if (!field.fieldIntelligence?.purpose && !field.description) missing.push('purpose');
  if (!field.fieldIntelligence?.runtimeBehavior) missing.push('runtimeBehavior');
  if (!field.fieldIntelligence?.importance) missing.push('importance');
  if (field.fieldIntelligence?.importance?.dangerousIfEmpty && !field.fieldIntelligence?.validationHints?.length) {
    missing.push('validationHints');
  }
  return missing;
}

function riskForField(field: NodeInputField): FieldRelevanceResult['riskIfEmpty'] {
  if (field.fieldIntelligence?.importance?.dangerousIfEmpty) return 'high';
  if (field.required || field.ui?.requiredIf) return 'high';
  if (field.fieldIntelligence?.importance?.dangerousIfWrong) return 'medium';
  return 'none';
}

function classifyFieldRole(fieldName: string, field: NodeInputField): string {
  const text = normalize(`${fieldName} ${field.role || ''} ${field.helpCategory || ''} ${field.description || ''}`);
  if (field.ownership === 'credential' || /(credential|api_key|apikey|token|secret|password|oauth)/.test(text)) return 'credential';
  if (/^(operation|action|method)$/.test(normalize(fieldName)) || /(operation_selector|method|action)/.test(text)) return 'operation_selector';
  if (/(max|limit|count|timeout|tokens?|length|results?)/.test(text)) return 'bound';
  if (/(recipient|email_address|\bto\b|cc|bcc)/.test(text)) return 'recipient';
  if (/(subject|title)/.test(text)) return 'title';
  if (/(body|message|content|text|prompt|summary)/.test(text)) return 'content';
  if (/(query|search|filter_text)/.test(text)) return 'query';
  if (/(condition|case|rule|expression)/.test(text)) return 'condition';
  if (/(range|cell|row|column|record)/.test(text)) return 'range';
  if (/(url|endpoint|uri|webhook)/.test(text)) return 'endpoint';
  if (/(^|_)id$|identifier|resource|sheet|tab|table|document|file|folder|channel|calendar|repository/.test(text)) return 'resource_identifier';
  if (/(values?|data|payload|fields?|mapping|json)/.test(text)) return 'payload';
  if (/(format|mode|type|source|selector)/.test(text)) return 'selector';
  return 'configuration';
}

function operationRole(operation: string): string | undefined {
  if (!operation) return undefined;
  return `Used while this node performs the "${operation}" operation.`;
}

function connectedNodes(node: WorkflowNodeLike, workflow: WorkflowLike, direction: 'upstream' | 'downstream'): WorkflowNodeLike[] {
  const ids = new Set(
    (workflow.edges || [])
      .filter((edge) => direction === 'upstream' ? edge.target === node.id : edge.source === node.id)
      .map((edge) => direction === 'upstream' ? edge.source : edge.target)
      .filter(Boolean),
  );
  return (workflow.nodes || []).filter((candidate) => ids.has(candidate.id));
}

function summarizeConnectedDependency(nodes: WorkflowNodeLike[], direction: 'upstream' | 'downstream'): string | undefined {
  if (!nodes.length) return undefined;
  const labels = nodes
    .map((node) => human(node.data?.label || getNodeType(node)))
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
  if (!labels) return undefined;
  return direction === 'upstream'
    ? `Uses data produced by ${labels} before this node runs.`
    : `Feeds its result into ${labels} after this node runs.`;
}

function compactDownstream(node: WorkflowNodeLike, workflow: WorkflowLike): boolean {
  const text = connectedNodes(node, workflow, 'downstream')
    .map((n) => {
      const def = unifiedNodeRegistry.get(getNodeType(n));
      return `${n.data?.label || ''} ${getNodeType(n)} ${def?.category || ''} ${def?.description || ''}`;
    })
    .join(' ');
  return /(mail|email|message|notify|notification|chat|sms|channel|inbox|post)/i.test(text);
}

function emptyBehaviorFor(field: NodeInputField, relevance: FieldRelevanceResult['relevance']): string {
  const runtime = field.fieldIntelligence?.runtimeBehavior;
  if (runtime?.whenEmpty && !/change behavior|produce incomplete output|optional setting|default behavior/i.test(runtime.whenEmpty)) return runtime.whenEmpty;
  if (runtime?.whenMissing && !/backend\/default behavior|optional behavior|default behavior/i.test(runtime.whenMissing)) return runtime.whenMissing;
  if (relevance === 'not_applicable') return 'This value is ignored for the selected operation or dependency state.';
  if (relevance === 'required') return 'The workflow cannot safely run this step without this exact value.';
  if (riskForField(field) === 'high') return 'If empty, this step may use the wrong data, miss the needed data, or stop before it finishes.';
  return 'If empty, this optional setting is skipped unless the selected operation needs it.';
}

function fieldRoleEmptyBehavior(fieldRole: string, nodeLabel: string, fieldName: string, field: NodeInputField, operation: string): string {
  const hasDefault = Object.prototype.hasOwnProperty.call(field, 'default');
  const defaultValue = hasDefault ? String(field.default) : '';
  const opText = operation ? ` for the "${operation}" operation` : '';
  const optional: Record<string, string> = {
    credential: `If empty, ${nodeLabel} uses the connected account or credential selected in the Credentials step.`,
    operation_selector: defaultValue
      ? `If empty, ${nodeLabel} uses "${defaultValue}" as the action${opText}.`
      : `If empty, ${nodeLabel} keeps the action already selected for this workflow.`,
    resource_identifier: `If empty, ${nodeLabel} may use the resource already selected in setup. Enter this when the workflow must use one exact file, sheet, table, channel, or record.`,
    range: `If empty, ${nodeLabel} may read or write a broad area instead of exact cells or records. Enter a range when only specific data should be used.`,
    recipient: `If empty, ${nodeLabel} must get recipients from AI Runtime or earlier workflow data.`,
    title: `If empty, ${nodeLabel} may create or send the result without a clear title or subject.`,
    content: `If empty, ${nodeLabel} must use content from earlier workflow data or AI Runtime.`,
    bound: defaultValue
      ? `If empty, ${nodeLabel} uses ${defaultValue} as the limit.`
      : `If empty, ${nodeLabel} may use an unsuitable size or count limit.`,
    query: `If empty, ${nodeLabel} searches less specifically or uses incoming data as-is.`,
    condition: `If empty, ${nodeLabel} has no clear rule for filtering or branching.`,
    endpoint: `If empty, ${nodeLabel} has no custom URL or route to call.`,
    payload: `If empty, ${nodeLabel} uses data from earlier steps when available.`,
    selector: defaultValue
      ? `If empty, ${nodeLabel} uses ${defaultValue} for ${fieldName}.`
      : `If empty, ${nodeLabel} uses its standard mode or format for ${fieldName}.`,
  };
  return optional[fieldRole] || `If empty, ${nodeLabel} skips ${fieldName} unless this workflow needs it.`;
}

function wrongValueRiskFor(fieldRole: string, field: NodeInputField, nodeLabel: string): string {
  if (field.fieldIntelligence?.importance?.dangerousIfWrong) {
    return `A wrong value can change what ${nodeLabel} reads, writes, routes, sends, or produces.`;
  }
  const risks: Record<string, string> = {
    credential: 'A wrong credential prevents the provider request from running.',
    operation_selector: `A wrong operation makes ${nodeLabel} perform the wrong action.`,
    recipient: 'A wrong recipient sends the result to the wrong destination.',
    title: 'A wrong title makes the delivered result harder to identify.',
    content: 'A wrong content value changes the main output passed to later steps or users.',
    query: 'A wrong query returns the wrong matching records.',
    condition: 'A wrong condition routes, filters, or branches the workflow incorrectly.',
    range: 'A wrong range reads or writes the wrong records.',
    bound: 'A wrong limit can produce too much, too little, or empty output.',
    endpoint: 'A wrong endpoint sends the request to the wrong service or route.',
    resource_identifier: 'A wrong resource identifier points the workflow at the wrong source or destination.',
    payload: 'A wrong payload changes the data written, transformed, or sent by this step.',
    selector: 'A wrong selector changes which mode or format this step uses.',
  };
  return risks[fieldRole] || `A wrong value can change the behavior of ${nodeLabel}.`;
}

function userActionFor(args: {
  relevance: FieldRelevanceResult['relevance'];
  fieldRole: string;
  fieldName: string;
  reason: string;
  suggestedValue?: unknown;
}): string {
  const valueHint = args.suggestedValue !== undefined ? ` A safe starting value is ${JSON.stringify(args.suggestedValue)}.` : '';
  if (args.relevance === 'not_applicable') return `Leave this off for this workflow. ${args.reason}`;
  if (args.relevance === 'required') return `Turn this on and provide the ${args.fieldRole.replace(/_/g, ' ')} value before running.${valueHint}`;
  if (args.relevance === 'recommended') return `Review this ${args.fieldRole.replace(/_/g, ' ')} for this workflow. ${args.reason}${valueHint}`;
  if (args.relevance === 'advanced') return `Leave this in advanced settings unless you intentionally need to tune ${args.fieldName}.`;
  return `Leave this unset unless you need to customize ${args.fieldName} for this workflow.`;
}

function enrichResult(args: {
  workflow: WorkflowLike;
  node: WorkflowNodeLike;
  fieldName: string;
  field: NodeInputField;
  operation: string;
  result: FieldRelevanceResult;
}): FieldRelevanceResult {
  const nodeLabel = human(args.node.data?.label || getNodeType(args.node));
  const role = classifyFieldRole(args.fieldName, args.field);
  const upstreamDependency = summarizeConnectedDependency(connectedNodes(args.node, args.workflow, 'upstream'), 'upstream');
  const downstreamDependency = summarizeConnectedDependency(connectedNodes(args.node, args.workflow, 'downstream'), 'downstream');
  const missingFacts = missingFactsForField(args.field);
  const sourceIsFallback = args.result.source === 'inferred';

  return {
    ...args.result,
    fieldRole: role,
    operationRole: operationRole(args.operation),
    upstreamDependency,
    downstreamDependency,
    emptyBehavior:
      args.result.relevance === 'not_applicable' || args.result.relevance === 'required' || riskForField(args.field) === 'high'
        ? emptyBehaviorFor(args.field, args.result.relevance)
        : fieldRoleEmptyBehavior(role, nodeLabel, args.fieldName, args.field, args.operation),
    wrongValueRisk: wrongValueRiskFor(role, args.field, nodeLabel),
    userAction: userActionFor({
      relevance: args.result.relevance,
      fieldRole: role,
      fieldName: args.fieldName,
      reason: args.result.reason,
      suggestedValue: args.result.suggestedValue,
    }),
    guidanceQualitySignals: {
      specificity: sourceIsFallback ? 'partial' : missingFacts.length ? 'partial' : 'strong',
      usesStructuredMetadata: !!args.field.fieldIntelligence || args.result.source === 'registry' || args.result.source === 'operation_contract' || args.result.source === 'dependency_rule',
      usesInferenceFallback: sourceIsFallback,
      missingFacts: missingFacts.length ? missingFacts : undefined,
      warnings: sourceIsFallback ? ['Used conservative inference because structured operation/field metadata was incomplete.'] : undefined,
    },
  };
}

const OPERATION_WORDS = [
  'read',
  'list',
  'get',
  'search',
  'send',
  'write',
  'append',
  'update',
  'create',
  'delete',
  'upload',
  'download',
  'insert',
  'select',
  'query',
  'post',
  'put',
  'patch',
];

function operationAliases(operation: string): string[] {
  const op = normalize(operation);
  const aliases = new Set([op]);
  if (['get_many', 'getmany'].includes(op)) aliases.add('list');
  if (['send_email', 'sendemail'].includes(op)) aliases.add('send');
  if (op.includes('search')) aliases.add('search');
  if (op.includes('list')) aliases.add('list');
  if (op.includes('get')) aliases.add('get');
  if (op.includes('create')) aliases.add('create');
  if (op.includes('update')) aliases.add('update');
  if (op.includes('delete')) aliases.add('delete');
  if (op.includes('append')) aliases.add('append');
  if (op.includes('write')) aliases.add('write');
  if (op.includes('read')) aliases.add('read');
  return Array.from(aliases).filter(Boolean);
}

function extractOperationMentions(description: string): string[] {
  const text = normalize(description);
  if (!text) return [];
  return OPERATION_WORDS.filter((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const suffix = word === 'select' ? '(s)?' : '(ing|s|ed)?';
    return new RegExp(`(^|[^a-z0-9])${escaped}${suffix}([^a-z0-9]|$)`).test(text);
  });
}

function descriptionScopesFieldToOperations(
  fieldName: string,
  field: NodeInputField,
  operation: string,
): FieldRelevanceResult | null {
  if (!operation) return null;
  const description = field.description || '';
  const text = normalize(description);
  const currentAliases = operationAliases(operation);
  const mentioned = extractOperationMentions(description);
  if (mentioned.length === 0) return null;

  const matchesCurrent = currentAliases.some((alias) => mentioned.includes(alias));
  const explicitlyNegativeForCurrent =
    currentAliases.some((alias) => text.includes(`not_for_${alias}`) || text.includes(`not_${alias}`));
  const operationScoped =
    text.includes('for_') ||
    text.includes('_for_') ||
    text.includes('_to_') ||
    text.includes('required') ||
    text.includes('only') ||
    text.includes('operation') ||
    text.includes('ignored') ||
    text.includes('active_when');

  if ((operationScoped && explicitlyNegativeForCurrent) || (operationScoped && !matchesCurrent)) {
    return {
      relevance: 'not_applicable',
      shouldAskUser: false,
      shouldShowInOwnership: false,
      reason: `${fieldName} is scoped to ${mentioned.join('/')} behavior, not the selected ${operation} operation.`,
      riskIfEmpty: 'none',
      source: 'inferred',
    };
  }

  if (!operationScoped) return null;

  const required = /\brequired\b/.test(text);
  return {
    relevance: required ? 'required' : 'recommended',
    shouldAskUser: true,
    shouldShowInOwnership: true,
    reason: `${fieldName} applies to the selected ${operation} operation.`,
    riskIfEmpty: required ? 'high' : riskForField(field),
    suggestedValue: firstSafeDefault(field),
    source: 'inferred',
  };
}

function readOnlyOperationMakesDeliveryFieldIrrelevant(
  fieldName: string,
  field: NodeInputField,
  operation: string,
): FieldRelevanceResult | null {
  const op = normalize(operation);
  const isReadOnly = ['read', 'list', 'get', 'search', 'query', 'select'].some((word) => op === word || op.includes(word));
  if (!isReadOnly) return null;
  const fieldText = normalize(`${fieldName} ${field.description || ''}`);
  const deliveryField =
    /(recipient|recipients|subject|message|body|sender|from|to|email_address)/i.test(fieldName) ||
    /(recipient|subject|email_body|message_text|sender|send|sending)/.test(fieldText);
  if (!deliveryField) return null;
  return {
    relevance: 'not_applicable',
    shouldAskUser: false,
    shouldShowInOwnership: false,
    reason: `${fieldName} is a delivery/content field, but the selected ${operation} operation only reads or searches data.`,
    riskIfEmpty: 'none',
    source: 'inferred',
  };
}

function operationContractRelevance(
  def: UnifiedNodeDefinition | undefined,
  fieldName: string,
  field: NodeInputField,
  operation: string,
): FieldRelevanceResult | null {
  if (!def || !operation || !def.operationContracts?.length) return null;
  const contract = def.operationContracts.find((c) => normalize(c.operation) === normalize(operation));
  if (!contract) return null;
  if (contract.requiredFields.includes(fieldName)) {
    return {
      relevance: 'required',
      shouldAskUser: true,
      shouldShowInOwnership: true,
      reason: `${fieldName} is required by the selected ${operation} operation contract.`,
      riskIfEmpty: 'high',
      suggestedValue: firstSafeDefault(field),
      source: 'operation_contract',
    };
  }
  if (
    !contract.optionalFields.includes(fieldName) &&
    fieldName !== 'operation' &&
    field.ownership !== 'credential' &&
    !field.required
  ) {
    return {
      relevance: 'not_applicable',
      shouldAskUser: false,
      shouldShowInOwnership: false,
      reason: `${fieldName} is not used by the selected ${operation} operation contract.`,
      riskIfEmpty: 'none',
      source: 'operation_contract',
    };
  }
  return null;
}

export function evaluateSelectedFieldRelevance(args: {
  workflow: WorkflowLike;
  node: WorkflowNodeLike;
  fieldName: string;
  field: NodeInputField;
}): FieldRelevanceResult {
  const { workflow, node, fieldName, field } = args;
  const def = unifiedNodeRegistry.get(getNodeType(node));
  const config = withSchemaDefaults(getNodeConfig(node), def);
  const operation = getSelectedOperation(config, def);
  const done = (result: FieldRelevanceResult): FieldRelevanceResult =>
    enrichResult({ workflow, node, fieldName, field, operation, result });
  const fieldPolicy = def ? resolveFieldPolicyForNode(def, config as Record<string, unknown>) : null;
  const policyEntry = fieldPolicy?.fields[fieldName];

  if (policyEntry && !policyEntry.active && field.ownership !== 'credential') {
    return done({
      relevance: 'not_applicable',
      shouldAskUser: false,
      shouldShowInOwnership: false,
      reason: `${fieldName} is not active for the selected ${operation} configuration.`,
      riskIfEmpty: 'none',
      source: 'operation_contract',
    });
  }

  if (field.ui?.visibleIf && !conditionApplies(field.ui.visibleIf, config)) {
    return done({
      relevance: 'not_applicable',
      shouldAskUser: false,
      shouldShowInOwnership: false,
      reason: `${fieldName} is hidden because its dependency condition is not active for this configuration.`,
      riskIfEmpty: 'none',
      source: 'dependency_rule',
    });
  }

  if (policyEntry?.required) {
    return done({
      relevance: 'required',
      shouldAskUser: true,
      shouldShowInOwnership: true,
      reason: `${fieldName} is required for the selected ${operation} configuration.`,
      riskIfEmpty: 'high',
      suggestedValue: firstSafeDefault(field),
      source: 'operation_contract',
    });
  }

  const contractRelevance = operationContractRelevance(def, fieldName, field, operation);
  if (contractRelevance) return done(contractRelevance);

  const describedOperation = descriptionScopesFieldToOperations(fieldName, field, operation);
  if (describedOperation?.relevance === 'not_applicable') return done(describedOperation);

  const irrelevantDeliveryField = readOnlyOperationMakesDeliveryFieldIrrelevant(fieldName, field, operation);
  if (irrelevantDeliveryField) return done(irrelevantDeliveryField);

  if (field.ui?.requiredIf && conditionApplies(field.ui.requiredIf, config)) {
    return done({
      relevance: 'required',
      shouldAskUser: true,
      shouldShowInOwnership: true,
      reason: `${fieldName} is required because its dependency condition is active.`,
      riskIfEmpty: 'high',
      suggestedValue: firstSafeDefault(field),
      source: 'dependency_rule',
    });
  }

  if (field.required) {
    return done({
      relevance: 'required',
      shouldAskUser: true,
      shouldShowInOwnership: true,
      reason: `${fieldName} is required by the node registry.`,
      riskIfEmpty: 'high',
      suggestedValue: firstSafeDefault(field),
      source: 'registry',
    });
  }

  const importance = field.fieldIntelligence?.importance;
  const mode = def?.inputSchema
    ? resolveEffectiveFieldFillMode(fieldName, def.inputSchema, config as Record<string, any>)
    : field.fillMode?.default;
  const hasCompactDownstream = compactDownstream(node, workflow);
  const boundedOutputForCompactDestination =
    hasCompactDownstream &&
    /max(length|tokens?)|maximum(length|tokens?)|limit/i.test(fieldName);
  const resourceIdentifier =
    /(id|name)$/i.test(fieldName) &&
    /(sheet|tab|table|document|resource|channel|calendar|repository|file|folder)/i.test(field.description || '');

  if (importance?.base === 'recommended' || importance?.dangerousIfEmpty) {
    return done({
      relevance: 'recommended',
      shouldAskUser: mode !== 'runtime_ai',
      shouldShowInOwnership: true,
      reason: `${fieldName} is recommended by registry field intelligence for this workflow.`,
      riskIfEmpty: riskForField(field),
      suggestedValue: firstSafeDefault(field),
      source: 'registry',
    });
  }

  if (boundedOutputForCompactDestination || resourceIdentifier) {
    return done({
      relevance: 'recommended',
      shouldAskUser: mode !== 'runtime_ai',
      shouldShowInOwnership: true,
      reason: boundedOutputForCompactDestination
        ? `${fieldName} is recommended because this node feeds a compact downstream message or notification.`
        : `${fieldName} identifies the resource or location this selected workflow will use.`,
      riskIfEmpty: riskForField(field),
      suggestedValue: firstSafeDefault(field),
      source: 'inferred',
    });
  }

  if (importance?.base === 'advanced') {
    return done({
      relevance: 'advanced',
      shouldAskUser: false,
      shouldShowInOwnership: true,
      reason: `${fieldName} is an advanced optional setting.`,
      riskIfEmpty: 'none',
      source: 'registry',
    });
  }

  if (describedOperation) return done(describedOperation);

  return done({
    relevance: 'optional',
    shouldAskUser: false,
    shouldShowInOwnership: true,
    reason: isEmptyValue(config[fieldName])
      ? `${fieldName} can use the node default or be left unset for this workflow.`
      : `${fieldName} is already configured.`,
    riskIfEmpty: riskForField(field),
    suggestedValue: firstSafeDefault(field),
    source: 'registry',
  });
}

export function analyzeSelectedWorkflowIntelligence(workflow: WorkflowLike): SelectedWorkflowIntelligence {
  const nodes: SelectedWorkflowNodeIntelligence[] = [];
  const fields: SelectedWorkflowFieldIntelligence[] = [];

  for (const node of workflow.nodes || []) {
    const nodeType = getNodeType(node);
    const def = unifiedNodeRegistry.get(nodeType);
    if (!def?.inputSchema) continue;
    const nodeId = human(node.id);
    const nodeLabel = human(node.data?.label || nodeType);
    const operation = getSelectedOperation(withSchemaDefaults(getNodeConfig(node), def), def) || undefined;
    const fieldMap: Record<string, FieldRelevanceResult> = {};

    for (const [fieldName, field] of Object.entries(def.inputSchema)) {
      const relevance = evaluateSelectedFieldRelevance({ workflow, node, fieldName, field });
      fieldMap[fieldName] = relevance;
      fields.push({ nodeId, nodeType, nodeLabel, fieldName, relevance });
    }

    nodes.push({ nodeId, nodeType, nodeLabel, operation, fields: fieldMap });
  }

  return { nodes, fields };
}

export function getSelectedFieldRelevance(
  workflow: WorkflowLike,
  nodeId: string,
  fieldName: string,
): FieldRelevanceResult | undefined {
  return analyzeSelectedWorkflowIntelligence(workflow).nodes
    .find((node) => node.nodeId === nodeId)
    ?.fields[fieldName];
}
