import type { NormalizedOperationContract } from '../operation-contract-resolver';
import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';

jest.mock('../operation-contract-resolver', () => ({
  fieldAllowsEmptyValue: jest.fn(),
  fieldIsActiveForOperation: jest.fn(),
  resolveOperationContract: jest.fn(),
}));

jest.mock('../../utils/field-ownership', () => ({
  isCredentialOwnership: jest.fn(),
}));

import { pickActiveInputSchema, resolveFieldPolicyForNode } from '../field-policy-resolver';
import {
  fieldAllowsEmptyValue,
  fieldIsActiveForOperation,
  resolveOperationContract,
} from '../operation-contract-resolver';
import { isCredentialOwnership } from '../../utils/field-ownership';

const mockFieldAllowsEmptyValue = fieldAllowsEmptyValue as jest.Mock;
const mockFieldIsActiveForOperation = fieldIsActiveForOperation as jest.Mock;
const mockResolveOperationContract = resolveOperationContract as jest.Mock;
const mockIsCredentialOwnership = isCredentialOwnership as jest.Mock;

function makeContract(overrides: Partial<NormalizedOperationContract> = {}): NormalizedOperationContract {
  return {
    operation: 'send',
    resource: undefined,
    requiredFields: [],
    optionalFields: [],
    conditionallyRequiredFields: [],
    forbiddenFields: [],
    payloadGroups: [],
    emptyValuePolicy: {},
    providerDefaultFields: [],
    fieldSourcePolicy: {},
    runtimeAiPolicy: {},
    activeFields: [],
    diagnostics: [],
    generated: false,
    ...overrides,
  } as NormalizedOperationContract;
}

function makeDef(inputSchema: UnifiedNodeDefinition['inputSchema'] = {}): UnifiedNodeDefinition {
  return {
    type: 'test_node',
    label: 'Test',
    description: '',
    category: 'action',
    inputSchema: inputSchema || {},
    outputSchema: {},
    execute: jest.fn() as any,
  } as unknown as UnifiedNodeDefinition;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsCredentialOwnership.mockReturnValue(false);
  mockFieldIsActiveForOperation.mockReturnValue(true);
  mockFieldAllowsEmptyValue.mockReturnValue(false);
  mockResolveOperationContract.mockReturnValue(makeContract());
});

describe('pickActiveInputSchema', () => {
  it('returns only fields listed in activeFields', () => {
    const inputSchema = { foo: { type: 'string' } as any, bar: { type: 'string' } as any };
    const policy = { activeFields: ['foo'] } as any;
    const result = pickActiveInputSchema(inputSchema, policy);
    expect(result).toEqual({ foo: { type: 'string' } });
    expect(result.bar).toBeUndefined();
  });

  it('skips activeField names absent from inputSchema', () => {
    const inputSchema = { foo: { type: 'string' } as any };
    const policy = { activeFields: ['foo', 'missing'] } as any;
    const result = pickActiveInputSchema(inputSchema, policy);
    expect(Object.keys(result)).toEqual(['foo']);
  });
});

describe('resolveFieldPolicyForNode', () => {
  it('returns empty policy when inputSchema is empty', () => {
    mockResolveOperationContract.mockReturnValue(makeContract({ operation: 'noop' }));
    const result = resolveFieldPolicyForNode(makeDef({}), {});
    expect(result.activeFields).toEqual([]);
    expect(result.requiredFields).toEqual([]);
    expect(result.inactiveFields).toEqual([]);
    expect(result.operation).toBe('noop');
  });

  it('exposes operation and resource from the contract', () => {
    mockResolveOperationContract.mockReturnValue(makeContract({ operation: 'create', resource: 'contact' }));
    const result = resolveFieldPolicyForNode(makeDef({}), {});
    expect(result.operation).toBe('create');
    expect(result.resource).toBe('contact');
  });

  it('marks field inactive when visibleIf condition fails', () => {
    const inputSchema = { email: { type: 'string', ui: { visibleIf: { field: 'mode', equals: 'advanced' } } } as any };
    const def = makeDef(inputSchema);
    mockResolveOperationContract.mockReturnValue(makeContract());
    const result = resolveFieldPolicyForNode(def, { mode: 'basic' });
    expect(result.fields['email'].active).toBe(false);
    expect(result.inactiveFields).toContain('email');
  });

  it('marks field inactive when fieldIsActiveForOperation returns false', () => {
    mockFieldIsActiveForOperation.mockReturnValue(false);
    const def = makeDef({ subject: { type: 'string' } as any });
    const result = resolveFieldPolicyForNode(def, {});
    expect(result.fields['subject'].active).toBe(false);
  });

  it('keeps credential field active even when visibleIf fails', () => {
    const inputSchema = {
      apiKey: { type: 'string', ui: { visibleIf: { field: 'mode', equals: 'advanced' } } } as any,
    };
    mockIsCredentialOwnership.mockReturnValue(true);
    mockResolveOperationContract.mockReturnValue(makeContract());
    const result = resolveFieldPolicyForNode(makeDef(inputSchema), { mode: 'basic' });
    expect(result.fields['apiKey'].active).toBe(true);
    expect(result.credentialFields).toContain('apiKey');
  });

  it('sets allowsEmpty true when fieldAllowsEmptyValue returns true', () => {
    mockFieldAllowsEmptyValue.mockReturnValue(true);
    const def = makeDef({ body: { type: 'string' } as any });
    const result = resolveFieldPolicyForNode(def, {});
    expect(result.fields['body'].allowsEmpty).toBe(true);
  });

  it('sets required false when allowsEmpty is true', () => {
    mockFieldAllowsEmptyValue.mockReturnValue(true);
    const contract = makeContract({ requiredFields: ['body'] });
    mockResolveOperationContract.mockReturnValue(contract);
    const def = makeDef({ body: { type: 'string', required: true } as any });
    const result = resolveFieldPolicyForNode(def, {});
    expect(result.fields['body'].required).toBe(false);
  });

  it('sets required true when contract requiredFields includes field', () => {
    mockResolveOperationContract.mockReturnValue(makeContract({ requiredFields: ['to'] }));
    const def = makeDef({ to: { type: 'string' } as any });
    const result = resolveFieldPolicyForNode(def, {});
    expect(result.fields['to'].required).toBe(true);
    expect(result.requiredFields).toContain('to');
  });

  it('sets required true from conditionallyRequiredFields when condition matches', () => {
    const contract = makeContract({
      conditionallyRequiredFields: [{ field: 'subject', when: { format: 'html' } }],
    });
    mockResolveOperationContract.mockReturnValue(contract);
    const def = makeDef({ subject: { type: 'string' } as any });
    const result = resolveFieldPolicyForNode(def, { format: 'html' });
    expect(result.fields['subject'].required).toBe(true);
  });

  it('leaves required false from conditionallyRequiredFields when condition does not match', () => {
    const contract = makeContract({
      conditionallyRequiredFields: [{ field: 'subject', when: { format: 'html' } }],
    });
    mockResolveOperationContract.mockReturnValue(contract);
    const def = makeDef({ subject: { type: 'string' } as any });
    const result = resolveFieldPolicyForNode(def, { format: 'text' });
    expect(result.fields['subject'].required).toBe(false);
  });

  it('blocks runtimeAiAllowed for credential fields', () => {
    mockIsCredentialOwnership.mockReturnValue(true);
    const def = makeDef({ token: { type: 'string', fillMode: { supportsRuntimeAI: true } } as any });
    const result = resolveFieldPolicyForNode(def, {}, { token: 'runtime_ai' });
    expect(result.fields['token'].runtimeAiAllowed).toBe(false);
  });

  it('allows runtimeAiAllowed when mode is runtime_ai and field is not protected', () => {
    const def = makeDef({ message: { type: 'string', fillMode: { supportsRuntimeAI: true } } as any });
    const result = resolveFieldPolicyForNode(def, {}, { message: 'runtime_ai' });
    expect(result.fields['message'].runtimeAiAllowed).toBe(true);
  });

  it('allows buildtimeAiAllowed when fillMode.supportsBuildtimeAI is true', () => {
    const def = makeDef({ summary: { type: 'string', fillMode: { supportsBuildtimeAI: true } } as any });
    const result = resolveFieldPolicyForNode(def, {});
    expect(result.fields['summary'].buildtimeAiAllowed).toBe(true);
  });

  it('populates credentialFields, optionalFields, inactiveFields correctly', () => {
    mockIsCredentialOwnership.mockImplementation((_name: string) => _name === 'apiKey');
    mockResolveOperationContract.mockReturnValue(makeContract({ requiredFields: ['to'] }));
    const def = makeDef({
      to: { type: 'string' } as any,
      cc: { type: 'string' } as any,
      apiKey: { type: 'string' } as any,
      hidden: { type: 'string', ui: { visibleIf: { field: 'x', equals: 'y' } } } as any,
    });
    const result = resolveFieldPolicyForNode(def, {});
    expect(result.credentialFields).toContain('apiKey');
    expect(result.requiredFields).toContain('to');
    expect(result.optionalFields).toContain('cc');
    expect(result.optionalFields).not.toContain('apiKey');
    expect(result.inactiveFields).toContain('hidden');
  });
});
