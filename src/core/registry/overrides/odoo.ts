/**
 * ✅ ODOO NODE - Migrated to Registry
 *
 * Odoo ERP integration node.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { runOdooNode } from '../../../services/database/odooNode';

export function overrideOdoo(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  const manualStatic = {
    default: 'manual_static' as const,
    supportsRuntimeAI: false,
    supportsBuildtimeAI: false,
  };
  const buildtime = {
    default: 'buildtime_ai_once' as const,
    supportsRuntimeAI: false,
    supportsBuildtimeAI: true,
  };
  const inputSchema = {
    ...def.inputSchema,
    url: {
      type: 'string' as const,
      description: 'Odoo base URL, for example https://yourcompany.odoo.com',
      required: true,
      ownership: 'value' as const,
      role: 'config' as const,
      helpCategory: 'base_url' as const,
      fillMode: manualStatic,
      examples: ['https://yourcompany.odoo.com'],
    },
    db: {
      type: 'string' as const,
      description: 'Odoo database name',
      required: true,
      ownership: 'value' as const,
      role: 'config' as const,
      fillMode: manualStatic,
    },
    username: {
      type: 'string' as const,
      description: 'Odoo username or login email',
      required: true,
      ownership: 'credential' as const,
      role: 'credential' as any,
      fillMode: manualStatic,
    },
    password: {
      type: 'string' as const,
      description: 'Odoo password or API key',
      required: true,
      ownership: 'credential' as const,
      role: 'credential' as any,
      helpCategory: 'generic_credential' as const,
      fillMode: manualStatic,
    },
    operation: {
      ...def.inputSchema.operation,
      ui: {
        ...(def.inputSchema.operation?.ui || {}),
        options: [
          { label: 'Get Records', value: 'getRecords' },
          { label: 'Create Record', value: 'createRecord' },
          { label: 'Update Record', value: 'updateRecord' },
          { label: 'Delete Record', value: 'deleteRecord' },
          { label: 'Execute Method', value: 'executeMethod' },
        ],
      },
      fillMode: buildtime,
      ownership: 'structural' as const,
    },
  };

  return {
    ...def,
    inputSchema,
    requiredInputs: Array.from(new Set([...(def.requiredInputs || []), 'url', 'db', 'username', 'password'])),
    credentialSchema: {
      requirements: [
        {
          provider: 'odoo',
          category: 'credential',
          required: true,
          description: 'Odoo username and password/API key',
        },
      ],
      credentialFields: ['username', 'password'],
    },
    execute: async (context) => {
      const inputs = { ...(context.config || {}), ...(context.inputs || {}) };
      const result = await runOdooNode({ ...(context as any), inputs } as any);
      if (result?.success === false) {
        return {
          success: false,
          error: {
            code: 'ODOO_OPERATION_FAILED',
            message: result?.error?.message || 'Odoo operation failed',
            details: result,
          },
        };
      }
      return { success: true, output: result };
    },
  };
}
