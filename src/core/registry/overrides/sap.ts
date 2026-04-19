/**
 * ✅ SAP NODE - Registry Override
 *
 * SAP ERP/CRM integration via OData v2/v4 and REST APIs.
 * Supports SAP S/4HANA, SAP Business One, and SAP ECC.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideSap(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  return {
    ...def,
    tags: [...(def.tags || []), 'erp', 'enterprise', 'sap', 'odata'],

    inputSchema: {
      ...def.inputSchema,
      operation: def.inputSchema.operation
        ? {
            ...def.inputSchema.operation,
            ownership: 'structural' as const,
            fillMode: {
              default: 'buildtime_ai_once' as const,
              supportsRuntimeAI: false,
              supportsBuildtimeAI: true,
            },
          }
        : def.inputSchema.operation,
      endpoint: def.inputSchema.endpoint
        ? {
            ...def.inputSchema.endpoint,
            ownership: 'structural' as const,
            fillMode: {
              default: 'buildtime_ai_once' as const,
              supportsRuntimeAI: true,
              supportsBuildtimeAI: true,
            },
          }
        : def.inputSchema.endpoint,
      payload: def.inputSchema.payload
        ? {
            ...def.inputSchema.payload,
            ownership: 'value' as const,
            fillMode: {
              default: 'buildtime_ai_once' as const,
              supportsRuntimeAI: true,
              supportsBuildtimeAI: true,
            },
          }
        : def.inputSchema.payload,
      baseUrl: def.inputSchema.baseUrl
        ? {
            ...def.inputSchema.baseUrl,
            ownership: 'value' as const,
            fillMode: {
              default: 'manual_static' as const,
              supportsRuntimeAI: false,
              supportsBuildtimeAI: false,
            },
          }
        : def.inputSchema.baseUrl,
      accessToken: def.inputSchema.accessToken
        ? {
            ...def.inputSchema.accessToken,
            ownership: 'credential' as const,
            fillMode: {
              default: 'manual_static' as const,
              supportsRuntimeAI: false,
              supportsBuildtimeAI: false,
            },
          }
        : def.inputSchema.accessToken,
      username: def.inputSchema.username
        ? {
            ...def.inputSchema.username,
            ownership: 'credential' as const,
            fillMode: {
              default: 'manual_static' as const,
              supportsRuntimeAI: false,
              supportsBuildtimeAI: false,
            },
          }
        : def.inputSchema.username,
      password: def.inputSchema.password
        ? {
            ...def.inputSchema.password,
            ownership: 'credential' as const,
            fillMode: {
              default: 'manual_static' as const,
              supportsRuntimeAI: false,
              supportsBuildtimeAI: false,
            },
          }
        : def.inputSchema.password,
    },

    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
