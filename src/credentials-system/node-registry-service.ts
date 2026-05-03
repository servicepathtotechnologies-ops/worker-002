import { nodeDefinitionRegistry } from '../core/types/node-definition';
import { connectorRegistry } from '../services/connectors/connector-registry';
import type { NodeDefinitionRecord } from './types';

function mapCredentialType(provider: string, type: string): string {
  if (type === 'oauth') return `${provider}_oauth2`;
  if (type === 'token') return 'bearer_token';
  if (type === 'basic_auth') return 'basic_auth';
  if (type === 'webhook') return 'custom_header';
  if (type === 'api_key') return 'api_key';
  return 'api_key';
}

export class NodeRegistryService {
  listNodeDefinitions(): NodeDefinitionRecord[] {
    const connectors = connectorRegistry.getAllConnectors();
    return nodeDefinitionRegistry.getAll().map((definition) => {
      const nodeConnectors = connectors.filter((connector) => connector.nodeTypes.includes(definition.type));
      const credentialRequirements = nodeConnectors.map((connector) => ({
        credentialTypeId: mapCredentialType(connector.credentialContract.provider, connector.credentialContract.type),
        required: connector.credentialContract.required,
        scopes: connector.credentialContract.scopes,
      }));

      return {
        id: definition.type,
        type: definition.type,
        displayName: definition.label,
        provider: nodeConnectors[0]?.provider,
        category: definition.category,
        resources: Array.from(new Set(nodeConnectors.map((connector) => connector.service).filter(Boolean))),
        operations: [
          {
            id: 'default',
            displayName: 'Default',
            resource: nodeConnectors[0]?.service || definition.category,
            operation: 'execute',
            inputFields: Object.entries(definition.inputSchema || {}).map(([name, field]) => ({
              name,
              label: name,
              type: field.type === 'number' ? 'number' : field.type === 'object' || field.type === 'json' ? 'textarea' : 'text',
              required: field.required,
              placeholder: field.exampleValue,
              helpText: field.description,
            })),
            outputSchema: definition.outputSchema,
          },
        ],
        inputFields: Object.entries(definition.inputSchema || {}).map(([name, field]) => ({
          name,
          label: name,
          type: field.type === 'number' ? 'number' : 'text',
          required: field.required,
          helpText: field.description,
        })),
        outputSchema: definition.outputSchema,
        credentialRequirements,
      };
    });
  }
}

export const nodeRegistryService = new NodeRegistryService();
