import { enforceRuntimeFieldContracts } from '../runtime-field-contract';
import type { NodeInputSchema } from '../../types/unified-node-contract';

describe('runtime-field-contract', () => {
  it('repairs row values from upstream object payload', () => {
    const inputSchema: NodeInputSchema = {
      operation: {
        type: 'string',
        description: 'operation',
        required: false,
        runtimeContract: { protected: true },
      },
      values: {
        type: 'array',
        description: 'rows',
        required: false,
        runtimeContract: {
          requiredWhen: [{ field: 'operation', equals: 'append' }],
          requiredGroup: 'write_payload',
          validation: { format: 'row_values' },
          repair: ['object_to_row_values'],
        },
      },
      data: {
        type: 'object',
        description: 'data',
        required: false,
        runtimeContract: {
          requiredWhen: [{ field: 'operation', equals: 'append' }],
          requiredGroup: 'write_payload',
          validation: { format: 'object_payload' },
        },
      },
    };

    const result = enforceRuntimeFieldContracts(
      { operation: 'append', values: [] },
      { operation: 'static_config', values: 'static_config' },
      {
        inputSchema,
        config: { operation: 'append' },
        effectiveFillModes: { operation: 'manual_static', values: 'runtime_ai', data: 'runtime_ai' },
        upstreamPayload: {
          name: 'Vusala Shiva kumar',
          age: 15,
          gmailAddress: 'vusalashivakumar@gmail.com',
          resumeLink: 'https://drive.example/resume',
        },
      }
    );

    expect(result.errors).toEqual([]);
    expect(result.resolvedInputs.values).toEqual([
      ['Vusala Shiva kumar', 15, 'vusalashivakumar@gmail.com', 'https://drive.example/resume'],
    ]);
    expect(result.inputSources.values).toBe('deterministic_runtime');
  });

  it('clears invalid optional A1 ranges before execution', () => {
    const inputSchema: NodeInputSchema = {
      range: {
        type: 'string',
        description: 'range',
        required: false,
        runtimeContract: {
          validation: { format: 'a1_range', allowEmpty: true },
          repair: ['clear_invalid_optional'],
        },
      },
    };

    const result = enforceRuntimeFieldContracts(
      { range: 'https://drive.google.com/file/d/resume/view' },
      { range: 'static_config' },
      {
        inputSchema,
        config: {},
        effectiveFillModes: { range: 'manual_static' },
        upstreamPayload: {},
      }
    );

    expect(result.errors).toEqual([]);
    expect(result.resolvedInputs.range).toBe('');
    expect(result.inputSources.range).toBe('deterministic_runtime');
  });

  it('extracts recipient emails from workflow lineage', () => {
    const inputSchema: NodeInputSchema = {
      recipientEmails: {
        type: 'string',
        description: 'emails',
        required: false,
        role: 'recipient',
        runtimeContract: {
          requiredWhen: [{ field: 'operation', equals: 'send' }],
          validation: { format: 'email_list' },
          repair: ['extract_email'],
        },
      },
      operation: { type: 'string', description: 'operation', required: false },
    };

    const result = enforceRuntimeFieldContracts(
      { operation: 'send', recipientEmails: 'v' },
      { operation: 'static_config', recipientEmails: 'static_config' },
      {
        inputSchema,
        config: { operation: 'send' },
        effectiveFillModes: { operation: 'manual_static', recipientEmails: 'runtime_ai' },
        upstreamPayload: { _error: 'upstream failed' },
        allOutputs: {
          trigger: { gmailAddress: 'vusalashivakumar@gmail.com' },
        },
      }
    );

    expect(result.errors).toEqual([]);
    expect(result.resolvedInputs.recipientEmails).toEqual(['vusalashivakumar@gmail.com']);
  });

  it('does not allow static config to satisfy required runtime_ai fields', () => {
    const inputSchema: NodeInputSchema = {
      operation: { type: 'string', description: 'operation', required: false },
      recipientEmails: {
        type: 'string',
        description: 'emails',
        required: false,
        role: 'recipient',
        runtimeContract: {
          requiredWhen: [{ field: 'operation', equals: 'send' }],
          validation: { format: 'email_list' },
        },
      },
    };

    const result = enforceRuntimeFieldContracts(
      { operation: 'send', recipientEmails: 'someone@example.com' },
      { operation: 'static_config', recipientEmails: 'static_config' },
      {
        inputSchema,
        config: { operation: 'send' },
        effectiveFillModes: { operation: 'manual_static', recipientEmails: 'runtime_ai' },
        upstreamPayload: { email: 'runtime@example.com' },
      }
    );

    expect(result.errors.some((error) => error.includes('static_config'))).toBe(true);
  });

  it('blocks missing function code when code contract is required', () => {
    const inputSchema: NodeInputSchema = {
      description: { type: 'string', description: 'description', required: true },
      code: {
        type: 'string',
        description: 'code',
        required: false,
        runtimeContract: {
          requiredWhen: [{ field: 'description', notEquals: '' }],
          validation: { format: 'code' },
        },
      },
    };

    const result = enforceRuntimeFieldContracts(
      { description: 'Transform form data', code: '' },
      { description: 'static_config', code: 'runtime_ai' },
      {
        inputSchema,
        config: { description: 'Transform form data' },
        effectiveFillModes: { description: 'manual_static', code: 'runtime_ai' },
        upstreamPayload: { name: 'Vusala Shiva kumar' },
      }
    );

    expect(result.errors.some((error) => error.includes('code'))).toBe(true);
  });
});
