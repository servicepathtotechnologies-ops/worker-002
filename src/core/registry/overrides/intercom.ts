import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { authHeaderFromToken, integrationJsonRequest, mergeContextInputs } from './http-integration-utils';

export function overrideIntercom(def: UnifiedNodeDefinition, _schema: NodeSchema): UnifiedNodeDefinition {
  const manualStatic = { default: 'manual_static' as const, supportsRuntimeAI: false, supportsBuildtimeAI: false };
  const runtimeValue = { default: 'runtime_ai' as const, supportsRuntimeAI: true, supportsBuildtimeAI: true };
  const operationOptions = ['send', 'get', 'list'].map((value) => ({
    label: value.charAt(0).toUpperCase() + value.slice(1),
    value,
  }));

  const inputSchema = {
    ...def.inputSchema,
    operation: {
      ...def.inputSchema.operation,
      ui: { ...(def.inputSchema.operation?.ui || {}), options: operationOptions },
    },
    accessToken: {
      type: 'string' as const,
      description: 'Intercom OAuth access token',
      required: true,
      ownership: 'credential' as const,
      role: 'config' as const,
      helpCategory: 'oauth_token' as const,
      fillMode: manualStatic,
    },
    conversationId: {
      ...def.inputSchema.conversationId,
      required: false,
      role: 'id' as const,
    },
    message: {
      type: 'string' as const,
      description: 'Message body for the conversation reply',
      required: false,
      role: 'long_body' as const,
      fillMode: { default: 'runtime_ai' as const, supportsRuntimeAI: true, supportsBuildtimeAI: true },
    },
    adminId: {
      type: 'string' as const,
      description: 'Intercom admin ID used when replying as an admin',
      required: false,
      role: 'id' as const,
      fillMode: manualStatic,
    },
    perPage: {
      type: 'number' as const,
      description: 'Number of conversations to list',
      required: false,
      default: 20,
      role: 'config' as const,
      fillMode: manualStatic,
    },
    startingAfter: {
      type: 'string' as const,
      description: 'Pagination cursor for listing conversations',
      required: false,
      role: 'id' as const,
      fillMode: manualStatic,
    },
    data: {
      type: 'object' as const,
      description: 'Raw Intercom API payload override',
      required: false,
      role: 'raw_json' as const,
      fillMode: runtimeValue,
    },
  };

  return {
    ...def,
    inputSchema,
    requiredInputs: Array.from(new Set([...(def.requiredInputs || []), 'accessToken'])),
    credentialSchema: {
      requirements: [{ provider: 'intercom', category: 'oauth', required: true, description: 'Intercom OAuth access token' }],
      credentialFields: ['accessToken'],
    },
    execute: async (context) => {
      const inputs = mergeContextInputs(context);
      const operation = String(inputs.operation || 'list');
      const accessToken = String(inputs.accessToken || '').trim();
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Intercom-Version': String(inputs.apiVersion || '2.11'),
        ...authHeaderFromToken(accessToken),
      };

      try {
        if (!accessToken) throw new Error('accessToken is required');
        let output: any;
        if (operation === 'list') {
          const params = new URLSearchParams({ per_page: String(inputs.perPage || 20) });
          if (inputs.startingAfter) params.set('starting_after', String(inputs.startingAfter));
          output = await integrationJsonRequest(`https://api.intercom.io/conversations?${params.toString()}`, { headers });
        } else if (operation === 'get') {
          const conversationId = String(inputs.conversationId || '').trim();
          if (!conversationId) throw new Error('conversationId is required for get');
          output = await integrationJsonRequest(`https://api.intercom.io/conversations/${encodeURIComponent(conversationId)}`, { headers });
        } else if (operation === 'send') {
          const conversationId = String(inputs.conversationId || '').trim();
          const message = String(inputs.message || inputs.body || '').trim();
          const adminId = String(inputs.adminId || '').trim();
          if (!conversationId) throw new Error('conversationId is required for send');
          if (!message && !inputs.data) throw new Error('message is required for send');
          if (!adminId && !inputs.data) throw new Error('adminId is required for admin conversation replies');
          output = await integrationJsonRequest(
            `https://api.intercom.io/conversations/${encodeURIComponent(conversationId)}/reply`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify(inputs.data || {
                message_type: 'comment',
                type: 'admin',
                admin_id: adminId,
                body: message,
              }),
            },
          );
        } else {
          throw new Error(`Unsupported Intercom operation: ${operation}`);
        }

        return { success: true, output: { operation, data: output } };
      } catch (error: any) {
        return { success: false, error: { code: 'INTERCOM_FAILED', message: error?.message || 'Intercom operation failed' } };
      }
    },
  };
}
