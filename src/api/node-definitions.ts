/**
 * Node Definitions API Endpoint
 * 
 * Returns node schemas to frontend.
 * Backend is the source of truth for all node definitions.
 */

import { Request, Response } from 'express';
import { nodeDefinitionRegistry } from '../core/types/node-definition';
import { unifiedNodeRegistry } from '../core/registry/unified-node-registry';
import type { UnifiedNodeDefinition } from '../core/types/unified-node-contract';

type OperationContract = ReturnType<typeof getOperationContracts>[number];

function optionValues(field: any): string[] {
  const values: string[] = [];
  const options = field?.ui?.options || field?.options || [];
  if (Array.isArray(options)) {
    for (const opt of options) {
      if (typeof opt === 'string') values.push(opt);
      else if (opt && typeof opt.value === 'string') values.push(opt.value);
    }
  }
  if (typeof field?.default === 'string') values.push(field.default);
  return Array.from(new Set(values.filter(Boolean)));
}

function getOperationContracts(nodeType: string) {
  const def = unifiedNodeRegistry.get(nodeType) as UnifiedNodeDefinition | undefined;
  if (!def) return [];
  if (def.operationContracts?.length) return def.operationContracts;

  const operationValues = optionValues((def.inputSchema || {}).operation);
  const resourceValues = optionValues((def.inputSchema || {}).resource);
  const requiredFields = def.requiredInputs || [];
  const optionalFields = Object.keys(def.inputSchema || {}).filter((key) => !requiredFields.includes(key));
  const credentialProviders = Array.from(new Set((def.credentialSchema?.requirements || []).map((r) => r.provider).filter(Boolean)));
  const outputFields = Object.keys(def.outputSchema || {});

  const operations = operationValues.length > 0 ? operationValues : ['default'];
  const resources = resourceValues.length > 0 ? resourceValues : [undefined];

  return resources.flatMap((resource) => operations.map((operation) => ({
    resource,
    operation,
    label: operation === 'default' ? def.label : operation.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
    requiredFields,
    optionalFields,
    credentialProviders,
    outputFields,
    legacyAliases: [],
    status: 'implemented' as const,
  })));
}

function labelForValue(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function implementedContracts(nodeType: string): OperationContract[] {
  return getOperationContracts(nodeType).filter((contract) => contract.status === 'implemented');
}

function filterSelectOptionsByContract(inputSchema: Record<string, any>, contracts: OperationContract[]) {
  const nextSchema = { ...inputSchema };
  const operations = Array.from(new Map(
    contracts
      .filter((contract) => contract.operation && contract.operation !== 'default')
      .map((contract) => [contract.operation, { label: contract.label || labelForValue(contract.operation), value: contract.operation }]),
  ).values());
  const resources = Array.from(new Map(
    contracts
      .filter((contract) => contract.resource)
      .map((contract) => [contract.resource as string, { label: labelForValue(contract.resource as string), value: contract.resource as string }]),
  ).values());

  if (operations.length > 0 && nextSchema.operation) {
    nextSchema.operation = {
      ...nextSchema.operation,
      ui: {
        ...(nextSchema.operation.ui || {}),
        options: operations,
      },
    };
  }

  if (resources.length > 0 && nextSchema.resource) {
    nextSchema.resource = {
      ...nextSchema.resource,
      ui: {
        ...(nextSchema.resource.ui || {}),
        options: resources,
      },
    };
  }

  return nextSchema;
}

function serializeNodeDefinition(definition: any) {
  const contracts = implementedContracts(definition.type);
  const inputSchema = filterSelectOptionsByContract(definition.inputSchema || {}, contracts);

  return {
    type: definition.type,
    label: definition.label,
    category: definition.category,
    description: definition.description,
    icon: definition.icon,
    inputSchema,
    outputSchema: definition.outputSchema,
    credentialSchema: definition.credentialSchema,
    operationContracts: contracts,
    requiredInputs: definition.requiredInputs,
    outgoingPorts: definition.outgoingPorts,
    incomingPorts: definition.incomingPorts,
    isBranching: definition.isBranching,
    defaultInputs: definition.defaultInputs(),
  };
}

export default async function nodeDefinitionsHandler(req: Request, res: Response) {
  try {
    const { type, category } = req.query;

    // If specific type requested
    if (type && typeof type === 'string') {
      const definition = nodeDefinitionRegistry.get(type);
      if (!definition) {
        return res.status(404).json({
          error: 'Node type not found',
          type,
        });
      }

      return res.json(serializeNodeDefinition(definition));
    }

    // If category requested
    if (category && typeof category === 'string') {
      const byCategory = nodeDefinitionRegistry.getAllByCategory();
      const nodes = byCategory[category] || [];
      
      return res.json({
        category,
        nodes: nodes.map(serializeNodeDefinition),
      });
    }

    // Return all node definitions
    const allDefinitions = nodeDefinitionRegistry.getAll();
    
    return res.json({
      nodes: allDefinitions.map(serializeNodeDefinition),
      byCategory: nodeDefinitionRegistry.getAllByCategory(),
    });
  } catch (error) {
    console.error('[NodeDefinitions] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch node definitions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
