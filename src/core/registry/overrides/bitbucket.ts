/**
 * ✅ BITBUCKET NODE - Migrated to Registry
 * 
 * Bitbucket integration.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { basicAuthHeader, integrationJsonRequest, mergeContextInputs } from './http-integration-utils';

export function overrideBitbucket(
  def: UnifiedNodeDefinition,
  _schema: NodeSchema
): UnifiedNodeDefinition {
  const manualStatic = { default: 'manual_static' as const, supportsRuntimeAI: false, supportsBuildtimeAI: false };
  const buildtimeValue = { default: 'buildtime_ai_once' as const, supportsRuntimeAI: false, supportsBuildtimeAI: true };
  const inputSchema = {
    ...def.inputSchema,
    operation: {
      ...def.inputSchema.operation,
      ui: {
        ...(def.inputSchema.operation?.ui || {}),
        options: ['read', 'create', 'update', 'delete'].map((value) => ({ label: value.charAt(0).toUpperCase() + value.slice(1), value })),
      },
    },
    workspace: { type: 'string' as const, description: 'Bitbucket workspace', required: false, role: 'id' as const, fillMode: buildtimeValue },
    repoSlug: { type: 'string' as const, description: 'Bitbucket repository slug', required: false, role: 'id' as const, fillMode: buildtimeValue },
    username: { type: 'string' as const, description: 'Bitbucket username', required: false, ownership: 'credential' as const, role: 'config' as const, fillMode: manualStatic },
    appPassword: { type: 'string' as const, description: 'Bitbucket app password', required: false, ownership: 'credential' as const, role: 'config' as const, fillMode: manualStatic },
    accessToken: { type: 'string' as const, description: 'Bitbucket OAuth access token', required: false, ownership: 'credential' as const, role: 'config' as const, fillMode: manualStatic },
  };

  return {
    ...def,
    inputSchema,
    credentialSchema: {
      requirements: [{ provider: 'bitbucket', category: 'credential', required: true, description: 'Bitbucket app password or OAuth access token' }],
      credentialFields: ['username', 'appPassword', 'accessToken'],
    },
    execute: async (context) => {
      const inputs = mergeContextInputs(context);
      const operation = String(inputs.operation || 'read');
      const repoParts = String(inputs.repo || '').split('/');
      const workspace = String(inputs.workspace || repoParts[0] || '').trim();
      const repoSlug = String(inputs.repoSlug || repoParts[1] || '').trim();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(inputs.accessToken
          ? { Authorization: `Bearer ${inputs.accessToken}` }
          : basicAuthHeader(String(inputs.username || ''), String(inputs.appPassword || ''))),
      };
      try {
        if (!workspace) throw new Error('workspace is required');
        let output: any;
        if (operation === 'read') {
          const url = repoSlug
            ? `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}`
            : `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(workspace)}`;
          output = await integrationJsonRequest(url, { headers });
        } else if (operation === 'create' || operation === 'update') {
          if (!repoSlug) throw new Error('repoSlug is required');
          output = await integrationJsonRequest(
            `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}`,
            {
              method: operation === 'create' ? 'POST' : 'PUT',
              headers,
              body: JSON.stringify(inputs.data || { scm: 'git', is_private: inputs.isPrivate ?? true, description: inputs.description }),
            },
          );
        } else if (operation === 'delete') {
          if (!repoSlug) throw new Error('repoSlug is required');
          await integrationJsonRequest(`https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}`, {
            method: 'DELETE',
            headers,
          });
          output = { deleted: true, workspace, repoSlug };
        } else {
          throw new Error(`Unsupported Bitbucket operation: ${operation}`);
        }
        return { success: true, output: { operation, data: output } };
      } catch (error: any) {
        return { success: false, error: { code: 'BITBUCKET_FAILED', message: error?.message || 'Bitbucket operation failed' } };
      }
    },
  };
}
