/**
 * ✅ HUBSPOT NODE - Migrated to Registry
 * 
 * HubSpot CRM integration.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

const manualStatic = {
  default: 'manual_static' as const,
  supportsRuntimeAI: false,
  supportsBuildtimeAI: true,
};

const runtimeValue = {
  default: 'runtime_ai' as const,
  supportsRuntimeAI: true,
  supportsBuildtimeAI: true,
};

const resourceOptions = [
  { label: 'Contact', value: 'contact' },
  { label: 'Company', value: 'company' },
  { label: 'Deal', value: 'deal' },
  { label: 'Ticket', value: 'ticket' },
];

const operationOptions = [
  { label: 'Get', value: 'get' },
  { label: 'Get Many', value: 'getMany' },
  { label: 'Create', value: 'create' },
  { label: 'Update', value: 'update' },
  { label: 'Delete', value: 'delete' },
  { label: 'Search', value: 'search' },
  { label: 'Create Multiple', value: 'batchCreate' },
];

const operationContracts: UnifiedNodeDefinition['operationContracts'] = [
  {
    operation: 'get',
    label: 'Get',
    requiredFields: ['resource', 'operation', 'id'],
    optionalFields: [],
    credentialProviders: ['hubspot'],
    outputFields: ['id', 'record', 'properties'],
    legacyAliases: [],
    status: 'implemented',
  },
  {
    operation: 'getMany',
    label: 'Get Many',
    requiredFields: ['resource', 'operation'],
    optionalFields: ['limit', 'after'],
    credentialProviders: ['hubspot'],
    outputFields: ['results', 'total', 'paging'],
    legacyAliases: ['getAll', 'list'],
    status: 'implemented',
  },
  {
    operation: 'create',
    label: 'Create',
    requiredFields: ['resource', 'operation', 'properties'],
    optionalFields: [],
    credentialProviders: ['hubspot'],
    outputFields: ['id', 'record', 'properties', 'createdAt', 'updatedAt'],
    legacyAliases: [],
    status: 'implemented',
  },
  {
    operation: 'update',
    label: 'Update',
    requiredFields: ['resource', 'operation', 'id', 'properties'],
    optionalFields: [],
    credentialProviders: ['hubspot'],
    outputFields: ['id', 'record', 'properties'],
    legacyAliases: [],
    status: 'implemented',
  },
  {
    operation: 'delete',
    label: 'Delete',
    requiredFields: ['resource', 'operation', 'id'],
    optionalFields: [],
    credentialProviders: ['hubspot'],
    outputFields: ['id', 'deleted'],
    legacyAliases: [],
    status: 'implemented',
  },
  {
    operation: 'search',
    label: 'Search',
    requiredFields: ['resource', 'operation', 'searchQuery'],
    optionalFields: ['limit'],
    credentialProviders: ['hubspot'],
    outputFields: ['results', 'total'],
    legacyAliases: [],
    status: 'implemented',
  },
  {
    operation: 'batchCreate',
    label: 'Create Multiple',
    requiredFields: ['resource', 'operation', 'records'],
    optionalFields: [],
    credentialProviders: ['hubspot'],
    outputFields: ['results', 'status', 'requestedAt', 'startedAt', 'completedAt'],
    legacyAliases: [],
    status: 'implemented',
  },
  {
    operation: 'batchUpdate',
    label: 'Batch Update',
    requiredFields: ['resource', 'operation', 'records'],
    optionalFields: [],
    credentialProviders: ['hubspot'],
    outputFields: ['results', 'status'],
    legacyAliases: [],
    status: 'deprecated',
  },
  {
    operation: 'batchDelete',
    label: 'Batch Delete',
    requiredFields: ['resource', 'operation', 'records'],
    optionalFields: [],
    credentialProviders: ['hubspot'],
    outputFields: ['success'],
    legacyAliases: [],
    status: 'deprecated',
  },
];

export function overrideHubspot(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  const inputSchema = { ...def.inputSchema };
  delete (inputSchema as Record<string, unknown>).apiKey;
  delete (inputSchema as Record<string, unknown>).accessToken;
  delete (inputSchema as Record<string, unknown>).credentialId;
  delete (inputSchema as Record<string, unknown>).objectId;

  return {
    ...def,
    inputSchema: {
      ...inputSchema,
      resource: {
        type: 'string',
        description: 'HubSpot CRM object type',
        required: true,
        default: 'contact',
        role: 'type_selector',
        ownership: 'structural',
        fillMode: manualStatic,
        ui: { options: resourceOptions },
      },
      operation: {
        type: 'string',
        description: 'HubSpot operation to perform',
        required: true,
        default: 'getMany',
        role: 'operation_selector',
        ownership: 'structural',
        fillMode: manualStatic,
        ui: { options: operationOptions },
      },
      id: {
        ...(def.inputSchema.id || {
          type: 'string',
          description: 'HubSpot object ID',
          required: false,
        }),
        required: false,
        role: 'id',
        ownership: 'value',
        fillMode: runtimeValue,
        ui: { visibleIf: { field: 'operation', equals: ['get', 'update', 'delete'] } },
      },
      properties: {
        type: 'object',
        description: 'HubSpot contact/company fields for create and update',
        required: false,
        role: 'raw_json',
        ownership: 'value',
        fillMode: runtimeValue,
        ui: {
          visibleIf: { field: 'operation', equals: ['create', 'update'] },
          requiredIf: { field: 'operation', equals: ['create', 'update'] },
        },
      },
      records: {
        type: 'array',
        description: 'HubSpot records for creating multiple contacts or companies',
        required: false,
        role: 'raw_json',
        ownership: 'value',
        fillMode: runtimeValue,
        ui: {
          visibleIf: { field: 'operation', equals: 'batchCreate' },
          requiredIf: { field: 'operation', equals: 'batchCreate' },
        },
      },
      searchQuery: {
        ...(def.inputSchema.searchQuery || {
          type: 'string',
          description: 'Search query',
          required: false,
        }),
        required: false,
        role: 'query',
        ownership: 'value',
        fillMode: runtimeValue,
        ui: {
          visibleIf: { field: 'operation', equals: 'search' },
          requiredIf: { field: 'operation', equals: 'search' },
        },
      },
      limit: {
        ...(def.inputSchema.limit || {
          type: 'number',
          description: 'Number of records to return',
          required: false,
          default: 10,
        }),
        required: false,
        role: 'config',
        ownership: 'value',
        fillMode: manualStatic,
        ui: { visibleIf: { field: 'operation', equals: ['getMany', 'search'] } },
      },
      after: {
        ...(def.inputSchema.after || {
          type: 'string',
          description: 'Pagination token for next page',
          required: false,
        }),
        required: false,
        role: 'config',
        ownership: 'value',
        fillMode: manualStatic,
        ui: { visibleIf: { field: 'operation', equals: 'getMany' } },
      },
    },
    requiredInputs: ['resource', 'operation'],
    credentialSchema: {
      requirements: [
        {
          provider: 'hubspot',
          category: 'oauth',
          required: true,
          description: 'HubSpot connection',
        },
      ],
      credentialFields: [],
    },
    operationContracts,
    execute: async (context) => {
      // Use legacy executor for now (complex HubSpot API integration)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
