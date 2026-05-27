import type {
  NodeInputField,
  NodeOperationContract,
  UnifiedNodeDefinition,
} from '../types/unified-node-contract';

export interface NormalizedOperationContract extends NodeOperationContract {
  forbiddenFields: string[];
  conditionallyRequiredFields: Array<{ field: string; when: Record<string, unknown> }>;
  payloadGroups: Array<{ name: string; anyOf: string[]; required: boolean }>;
  emptyValuePolicy: Record<string, 'invalid' | 'optional' | 'provider_default' | 'allow_empty'>;
  providerDefaultFields: string[];
  fieldSourcePolicy: NonNullable<NodeOperationContract['fieldSourcePolicy']>;
  runtimeAiPolicy: NonNullable<NodeOperationContract['runtimeAiPolicy']>;
  activeFields: string[];
  diagnostics: string[];
  generated: boolean;
}

function optionValues(field: NodeInputField | undefined): string[] {
  const values: string[] = [];
  const options = field?.ui?.options || [];
  if (Array.isArray(options)) {
    for (const option of options) {
      if (typeof option === 'string') values.push(option);
      else if (option && typeof option.value === 'string') values.push(option.value);
    }
  }
  if (typeof field?.default === 'string') values.push(field.default);
  return Array.from(new Set(values.filter(Boolean)));
}

function labelForValue(value: string): string {
  return value === 'default'
    ? 'Default'
    : value.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(b)) return b.some((item) => valuesEqual(a, item));
  return a === b;
}

function conditionMatches(
  condition: { field: string; equals?: unknown; notEquals?: unknown },
  config: Record<string, unknown>
): boolean {
  const value = config[condition.field];
  if ('equals' in condition) return valuesEqual(value, condition.equals);
  if ('notEquals' in condition) return !valuesEqual(value, condition.notEquals);
  return true;
}

function fieldRequiredBySchema(fieldName: string, fieldDef: NodeInputField, config: Record<string, unknown>): boolean {
  if (fieldDef.ui?.visibleIf && !conditionMatches(fieldDef.ui.visibleIf, config)) return false;
  if (fieldDef.ui?.requiredIf) return conditionMatches(fieldDef.ui.requiredIf, config);
  if (Array.isArray(fieldDef.runtimeContract?.requiredWhen)) {
    return fieldDef.runtimeContract.requiredWhen.some((condition) => conditionMatches(condition, config));
  }
  return fieldDef.required === true;
}

function baseContractForOperation(
  def: UnifiedNodeDefinition,
  operation: string,
  resource: string | undefined,
  config: Record<string, unknown>
): NodeOperationContract {
  const inputSchema = def.inputSchema || {};
  const allFields = Object.keys(inputSchema);
  const required = new Set<string>(def.requiredInputs || []);
  for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
    if (fieldRequiredBySchema(fieldName, fieldDef, config)) required.add(fieldName);
  }
  if (inputSchema.operation) required.add('operation');
  if (inputSchema.resource && resource) required.add('resource');

  const requiredFields = allFields.filter((field) => required.has(field));
  const optionalFields = allFields.filter((field) => !required.has(field));
  const providerDefaultFields = allFields.filter((field) => {
    const fd = inputSchema[field];
    return fd?.runtimeContract?.validation?.allowEmpty === true;
  });
  const emptyValuePolicy = Object.fromEntries(
    providerDefaultFields.map((field) => [field, 'provider_default' as const])
  );

  return {
    resource,
    operation,
    label: operation === 'default' ? def.label : labelForValue(operation),
    requiredFields,
    optionalFields,
    providerDefaultFields,
    emptyValuePolicy,
    credentialProviders: Array.from(
      new Set((def.credentialSchema?.requirements || []).map((req) => req.provider).filter(Boolean))
    ),
    outputFields: Object.keys(def.outputSchema || {}),
    legacyAliases: [],
    status: 'implemented',
  };
}

function normalizeContract(
  def: UnifiedNodeDefinition,
  contract: NodeOperationContract,
  generated: boolean,
  diagnostics: string[] = []
): NormalizedOperationContract {
  const allFields = Object.keys(def.inputSchema || {});
  const providerDefaultFields = Array.from(new Set(contract.providerDefaultFields || []));
  const payloadGroups = (contract.payloadGroups || []).map((group) => ({
    ...group,
    required: group.required !== false,
  }));
  const activeSet = new Set<string>([
    ...contract.requiredFields,
    ...contract.optionalFields,
    ...providerDefaultFields,
    ...payloadGroups.flatMap((group) => group.anyOf),
  ]);
  if (contract.resource) activeSet.add('resource');
  if (contract.operation) activeSet.add('operation');

  const explicitForbidden = new Set(contract.forbiddenFields || []);
  const inferredForbidden = generated
    ? []
    : allFields.filter((field) => !activeSet.has(field) && field !== 'credentialId');
  const forbiddenFields = Array.from(new Set([...explicitForbidden, ...inferredForbidden]));
  const activeFields = allFields.filter((field) => !forbiddenFields.includes(field));

  const emptyValuePolicy = {
    ...(contract.emptyValuePolicy || {}),
    ...Object.fromEntries(providerDefaultFields.map((field) => [field, 'provider_default' as const])),
  };

  return {
    ...contract,
    forbiddenFields,
    conditionallyRequiredFields: contract.conditionallyRequiredFields || [],
    payloadGroups,
    emptyValuePolicy,
    providerDefaultFields,
    fieldSourcePolicy: contract.fieldSourcePolicy || {},
    runtimeAiPolicy: contract.runtimeAiPolicy || {},
    activeFields,
    diagnostics,
    generated,
  };
}

function selectExplicitContract(
  contracts: NodeOperationContract[],
  config: Record<string, unknown>
): NodeOperationContract | undefined {
  const operation = String(config.operation || 'default');
  const resource = config.resource === undefined || config.resource === null ? undefined : String(config.resource);
  return contracts.find((contract) => {
    const operationMatches =
      contract.operation === operation ||
      (contract.legacyAliases || []).includes(operation);
    const resourceMatches =
      !contract.resource ||
      !resource ||
      contract.resource === resource;
    return operationMatches && resourceMatches && contract.status === 'implemented';
  });
}

export function getOperationContractsForNode(def: UnifiedNodeDefinition): NormalizedOperationContract[] {
  const config = def.defaultConfig?.() || {};
  const operationValues = optionValues(def.inputSchema?.operation);
  const resourceValues = optionValues(def.inputSchema?.resource);
  const operations = operationValues.length > 0 ? operationValues : ['default'];
  const resources = resourceValues.length > 0 ? resourceValues : [undefined];
  const generatedContracts = resources.flatMap((resource) =>
    operations.map((operation) =>
      normalizeContract(def, baseContractForOperation(def, operation, resource, { ...config, operation, resource }), true, [
        def.inputSchema?.operation ? 'generated_from_schema_operation_options' : 'generated_default_contract',
      ])
    )
  );

  if (def.operationContracts?.length) {
    const explicitContracts = def.operationContracts
      .filter((contract) => contract.status === 'implemented')
      .map((contract) => normalizeContract(def, contract, false));
    const covered = new Set(
      explicitContracts.flatMap((contract) => [
        `${contract.resource || ''}:${contract.operation}`,
        ...(contract.legacyAliases || []).map((alias) => `${contract.resource || ''}:${alias}`),
      ])
    );
    const generatedMissing = generatedContracts.filter(
      (contract) => !covered.has(`${contract.resource || ''}:${contract.operation}`)
    );
    return [...explicitContracts, ...generatedMissing];
  }

  return generatedContracts;
}

export function resolveOperationContract(
  def: UnifiedNodeDefinition,
  config: Record<string, unknown>
): NormalizedOperationContract {
  const diagnostics: string[] = [];
  const explicit = selectExplicitContract(def.operationContracts || [], config);
  if (explicit) return normalizeContract(def, explicit, false);

  const requestedOperation = String(config.operation || def.inputSchema?.operation?.default || 'default');
  const requestedResource =
    config.resource === undefined || config.resource === null ? undefined : String(config.resource);
  if (def.inputSchema?.operation && def.operationContracts?.length) {
    diagnostics.push(`no_explicit_contract_for_operation:${requestedOperation}`);
  }
  return normalizeContract(
    def,
    baseContractForOperation(def, requestedOperation, requestedResource, config),
    true,
    diagnostics.length > 0 ? diagnostics : ['generated_runtime_contract']
  );
}

export function fieldIsActiveForOperation(contract: NormalizedOperationContract, fieldName: string): boolean {
  return !contract.forbiddenFields.includes(fieldName);
}

export function fieldAllowsEmptyValue(contract: NormalizedOperationContract, fieldName: string): boolean {
  const policy = contract.emptyValuePolicy[fieldName];
  return policy === 'provider_default' || policy === 'optional' || policy === 'allow_empty';
}

export function fieldRequiredByOperationContract(
  contract: NormalizedOperationContract,
  fieldName: string
): boolean {
  if (contract.requiredFields.includes(fieldName)) return true;
  return contract.conditionallyRequiredFields.some(
    (condition) => condition.field === fieldName
  );
}
