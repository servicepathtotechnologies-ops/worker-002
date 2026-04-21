/**
 * ✅ VERCEL NODE - Migrated to Registry
 * 
 * Deploys projects to Vercel and manages deployments.
 * Supports two operations: deploy and list_deployments.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideVercel(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  const inputSchema = {
    ...def.inputSchema,
    // Operation: determines which Vercel API operation to perform
    operation: def.inputSchema.operation
      ? {
          ...def.inputSchema.operation,
          ownership: 'structural' as const,
          fillMode: {
            default: 'manual_static' as const,
            supportsRuntimeAI: false,
            supportsBuildtimeAI: true,
          },
          role: 'config' as const,
        }
      : def.inputSchema.operation,
    // ProjectName: required for deploy operation, optional for list_deployments
    projectName: def.inputSchema.projectName
      ? {
          ...def.inputSchema.projectName,
          ownership: 'value' as const,
          fillMode: {
            default: 'buildtime_ai_once' as const,
            supportsRuntimeAI: true,
            supportsBuildtimeAI: true,
          },
          role: 'id' as const,
          essentialForExecution: false,
        }
      : def.inputSchema.projectName,
    // Token: Vercel API token for authentication
    token: def.inputSchema.token
      ? {
          ...def.inputSchema.token,
          ownership: 'credential' as const,
          fillMode: {
            default: 'manual_static' as const,
            supportsRuntimeAI: false,
            supportsBuildtimeAI: false,
          },
          role: 'config' as const,
          essentialForExecution: true,
        }
      : def.inputSchema.token,
  };

  return {
    ...def,
    inputSchema,
    // ✅ TASK 10: Credential Resolution and Preflight Checks
    // Requirements 4.1, 4.2, 4.5, 8.5: Integrate with credential-preflight-check.ts
    credentialSchema: {
      requirements: [
        {
          provider: 'vercel',
          category: 'api_key',
          required: true,
          description: 'Vercel API token for deployment and management operations',
          scopes: ['deployments:read', 'deployments:write'],
        },
      ],
      credentialFields: ['token'],
    },
    tags: Array.from(
      new Set([...(def.tags || []), 'devops', 'deployment', 'vercel'])
    ),
    execute: async (context) => {
      // Use legacy executor for Vercel API integration
      // The legacy executor handles all Vercel operations (deploy, list_deployments)
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
