/**
 * Node Definitions API Endpoint
 * 
 * Returns node schemas to frontend.
 * Backend is the source of truth for all node definitions.
 */

import { Request, Response } from 'express';
import { nodeDefinitionRegistry } from '../core/types/node-definition';

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

      return res.json({
        type: definition.type,
        label: definition.label,
        category: definition.category,
        description: definition.description,
        icon: definition.icon,
        inputSchema: definition.inputSchema,
        outputSchema: definition.outputSchema,
        requiredInputs: definition.requiredInputs,
        outgoingPorts: definition.outgoingPorts,
        incomingPorts: definition.incomingPorts,
        isBranching: definition.isBranching,
        defaultInputs: definition.defaultInputs(),
      });
    }

    // If category requested
    if (category && typeof category === 'string') {
      const byCategory = nodeDefinitionRegistry.getAllByCategory();
      const nodes = byCategory[category] || [];
      
      return res.json({
        category,
        nodes: nodes.map(def => ({
          type: def.type,
          label: def.label,
          description: def.description,
          icon: def.icon,
          inputSchema: def.inputSchema,
          requiredInputs: def.requiredInputs,
          outgoingPorts: def.outgoingPorts,
          incomingPorts: def.incomingPorts,
          isBranching: def.isBranching,
        })),
      });
    }

    // Return all node definitions
    const allDefinitions = nodeDefinitionRegistry.getAll();
    
    return res.json({
      nodes: allDefinitions.map(def => ({
        type: def.type,
        label: def.label,
        category: def.category,
        description: def.description,
        icon: def.icon,
        inputSchema: def.inputSchema,
        outputSchema: def.outputSchema,
        requiredInputs: def.requiredInputs,
        outgoingPorts: def.outgoingPorts,
        incomingPorts: def.incomingPorts,
        isBranching: def.isBranching,
        defaultInputs: def.defaultInputs(),
      })),
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
