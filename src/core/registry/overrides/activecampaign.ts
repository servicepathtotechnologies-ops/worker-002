import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { integrationJsonRequest, mergeContextInputs, stripTrailingSlash } from './http-integration-utils';

export function overrideActivecampaign(def: UnifiedNodeDefinition, _schema: NodeSchema): UnifiedNodeDefinition {
  const manualStatic = { default: 'manual_static' as const, supportsRuntimeAI: false, supportsBuildtimeAI: false };
  const runtimeValue = { default: 'runtime_ai' as const, supportsRuntimeAI: true, supportsBuildtimeAI: true };
  const inputSchema = {
    ...def.inputSchema,
    operation: {
      ...def.inputSchema.operation,
      ui: { ...(def.inputSchema.operation?.ui || {}), options: ['add', 'update', 'delete'].map((value) => ({ label: value.charAt(0).toUpperCase() + value.slice(1), value })) },
    },
    apiUrl: { type: 'string' as const, description: 'ActiveCampaign API URL, e.g. https://account.api-us1.com', required: true, role: 'config' as const, helpCategory: 'base_url' as const, fillMode: manualStatic },
    apiKey: { type: 'string' as const, description: 'ActiveCampaign API key', required: true, ownership: 'credential' as const, role: 'config' as const, helpCategory: 'api_key' as const, fillMode: manualStatic },
    email: { type: 'string' as const, description: 'Contact email address', required: false, role: 'recipient' as const, fillMode: runtimeValue },
    firstName: { type: 'string' as const, description: 'Contact first name', required: false, role: 'title_like' as const, fillMode: runtimeValue },
    lastName: { type: 'string' as const, description: 'Contact last name', required: false, role: 'title_like' as const, fillMode: runtimeValue },
    data: { type: 'object' as const, description: 'Raw ActiveCampaign contact payload override', required: false, role: 'raw_json' as const, fillMode: runtimeValue },
  };

  return {
    ...def,
    inputSchema,
    requiredInputs: Array.from(new Set([...(def.requiredInputs || []), 'apiUrl', 'apiKey'])),
    credentialSchema: {
      requirements: [{ provider: 'activecampaign', category: 'api_key', required: true, description: 'ActiveCampaign API key' }],
      credentialFields: ['apiKey'],
    },
    execute: async (context) => {
      const inputs = mergeContextInputs(context);
      const operation = String(inputs.operation || 'add');
      const baseUrl = stripTrailingSlash(String(inputs.apiUrl || ''));
      const apiKey = String(inputs.apiKey || '');
      const headers = { 'Content-Type': 'application/json', 'Api-Token': apiKey };
      try {
        if (!baseUrl) throw new Error('apiUrl is required');
        if (!apiKey) throw new Error('apiKey is required');
        let output: any;
        if (operation === 'add') {
          if (!inputs.email && !inputs.data?.email) throw new Error('email is required for add');
          output = await integrationJsonRequest(`${baseUrl}/api/3/contacts`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ contact: inputs.data || { email: inputs.email, firstName: inputs.firstName, lastName: inputs.lastName } }),
          });
        } else if (operation === 'update') {
          if (!inputs.contactId) throw new Error('contactId is required for update');
          output = await integrationJsonRequest(`${baseUrl}/api/3/contacts/${encodeURIComponent(String(inputs.contactId))}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ contact: inputs.data || { email: inputs.email, firstName: inputs.firstName, lastName: inputs.lastName } }),
          });
        } else if (operation === 'delete') {
          if (!inputs.contactId) throw new Error('contactId is required for delete');
          await integrationJsonRequest(`${baseUrl}/api/3/contacts/${encodeURIComponent(String(inputs.contactId))}`, { method: 'DELETE', headers });
          output = { deleted: true, contactId: inputs.contactId };
        } else {
          throw new Error(`Unsupported ActiveCampaign operation: ${operation}`);
        }
        return { success: true, output: { operation, data: output } };
      } catch (error: any) {
        return { success: false, error: { code: 'ACTIVECAMPAIGN_FAILED', message: error?.message || 'ActiveCampaign operation failed' } };
      }
    },
  };
}
