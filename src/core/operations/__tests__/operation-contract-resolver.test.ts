import { unifiedNodeRegistry } from '../../registry/unified-node-registry';
import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import {
  fieldAllowsEmptyValue,
  getOperationContractsForNode,
  resolveOperationContract,
} from '../operation-contract-resolver';
import { resolveFieldPolicyForNode } from '../field-policy-resolver';

describe('operation-contract-resolver', () => {
  it('normalizes at least one operation contract for every registered node', () => {
    const definitions = unifiedNodeRegistry
      .getAllTypes()
      .map((type) => unifiedNodeRegistry.get(type))
      .filter((definition): definition is UnifiedNodeDefinition => Boolean(definition));
    expect(definitions.length).toBeGreaterThan(100);

    const missing = definitions
      .filter((definition) => getOperationContractsForNode(definition).length === 0)
      .map((definition) => definition.type);

    expect(missing).toEqual([]);
  });

  it('covers every operation option exposed by node schemas', () => {
    const failures: string[] = [];

    const definitions = unifiedNodeRegistry
      .getAllTypes()
      .map((type) => unifiedNodeRegistry.get(type))
      .filter((definition): definition is UnifiedNodeDefinition => Boolean(definition));

    for (const definition of definitions) {
      const options = definition.inputSchema?.operation?.ui?.options || [];
      const optionValues = options
        .map((option) => option.value)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
      if (optionValues.length === 0) continue;

      const contracts = getOperationContractsForNode(definition);
      const covered = new Set(contracts.flatMap((contract) => [contract.operation, ...(contract.legacyAliases || [])]));

      for (const operation of optionValues) {
        if (!covered.has(operation)) failures.push(`${definition.type}.${operation}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('treats Google Sheets append range as a provider-default optional field', () => {
    const definition = unifiedNodeRegistry.get('google_sheets');
    expect(definition).toBeDefined();

    const contract = resolveOperationContract(definition!, {
      operation: 'append',
      spreadsheetId: 'spreadsheet_123',
      sheetName: 'job',
    });

    expect(contract.requiredFields).toEqual(['operation', 'spreadsheetId', 'sheetName']);
    expect(contract.payloadGroups).toEqual([
      { name: 'google_sheets_write_payload', anyOf: ['values', 'data'], required: true },
    ]);
    expect(contract.providerDefaultFields).toContain('range');
    expect(fieldAllowsEmptyValue(contract, 'range')).toBe(true);
  });

  it('resolves Gmail send manual recipients without sheet fallback fields', () => {
    const definition = unifiedNodeRegistry.get('google_gmail');
    expect(definition).toBeDefined();

    const policy = resolveFieldPolicyForNode(definition!, {
      operation: 'send',
      recipientSource: 'manual_entry',
    });

    expect(policy.activeFields).toEqual(expect.arrayContaining([
      'operation',
      'recipientSource',
      'recipientEmails',
      'subject',
      'body',
    ]));
    expect(policy.requiredFields).toEqual(expect.arrayContaining([
      'operation',
      'recipientSource',
      'recipientEmails',
      'subject',
      'body',
    ]));
    expect(policy.inactiveFields).toEqual(expect.arrayContaining([
      'spreadsheetId',
      'sheetName',
      'range',
      'query',
      'messageId',
    ]));
    expect(policy.fields.range.active).toBe(false);
    expect(policy.fields.range.required).toBe(false);
  });

  it('resolves Gmail send sheet extraction fields as active but non-blocking where provider defaults apply', () => {
    const definition = unifiedNodeRegistry.get('google_gmail');
    expect(definition).toBeDefined();

    const policy = resolveFieldPolicyForNode(definition!, {
      operation: 'send',
      recipientSource: 'extract_from_sheet',
    });

    expect(policy.activeFields).toEqual(expect.arrayContaining([
      'operation',
      'recipientSource',
      'spreadsheetId',
      'sheetName',
      'range',
      'subject',
      'body',
    ]));
    expect(policy.requiredFields).not.toContain('recipientEmails');
    expect(policy.providerDefaultFields).toContain('range');
    expect(policy.fields.range.allowsEmpty).toBe(true);
    expect(policy.inactiveFields).toEqual(expect.arrayContaining(['query', 'messageId']));
  });

  it('keeps field policies internally consistent for operation-backed nodes', () => {
    const failures: string[] = [];
    const definitions = unifiedNodeRegistry
      .getAllTypes()
      .map((type) => unifiedNodeRegistry.get(type))
      .filter((definition): definition is UnifiedNodeDefinition => Boolean(definition));

    for (const definition of definitions) {
      for (const contract of getOperationContractsForNode(definition)) {
        const policy = resolveFieldPolicyForNode(definition, {
          ...(definition.defaultConfig?.() || {}),
          resource: contract.resource,
          operation: contract.operation,
        });
        for (const fieldName of policy.requiredFields) {
          if (!policy.activeFields.includes(fieldName)) {
            failures.push(`${definition.type}.${contract.operation}.${fieldName}:required_inactive`);
          }
        }
        for (const fieldName of policy.credentialFields) {
          const entry = policy.fields[fieldName];
          if (entry.runtimeAiAllowed || entry.buildtimeAiAllowed) {
            failures.push(`${definition.type}.${contract.operation}.${fieldName}:credential_ai_owned`);
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
