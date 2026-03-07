/**
 * Workflow Auto-Repair System
 * Automatically fixes common workflow errors
 */

import { NodeSchemaRegistry } from './node-schema-registry';
import { unifiedNormalizeNodeType } from '../utils/unified-node-type-normalizer';
import { Workflow, WorkflowNode, WorkflowEdge } from '../types/ai-types';
import type { 
  WorkflowRepairResult, 
  ValidationError,
  RepairResult 
} from './types';

// Re-export types for backward compatibility
export type { RepairResult, ValidationError, WorkflowRepairResult };

/**
 * Workflow Auto-Repair System
 * Attempts to automatically fix common workflow errors
 */
export class WorkflowAutoRepair {
  private schemaRegistry: NodeSchemaRegistry;

  constructor() {
    this.schemaRegistry = NodeSchemaRegistry.getInstance();
  }

  /**
   * Repair a workflow by applying common fixes
   */
  repair(workflow: Workflow): RepairResult {
    const fixes: string[] = [];
    let nodes = [...workflow.nodes];
    let edges = [...workflow.edges];

    // Fix 1: Ensure schedule nodes have cron
    nodes = nodes.map(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      if (nodeType === 'schedule') {
        const config = node.data?.config || node.data || {};
        if (!config.cron) {
          fixes.push(`Added default cron to schedule node: ${node.id}`);
          return {
            ...node,
            data: {
              ...node.data,
              config: {
                ...config,
                cron: '0 9 * * *' // Default to 9 AM daily
              }
            }
          };
        }
      }
      return node;
    });

    // Fix 2: Fix orphan nodes (connect to trigger if logical)
    const triggers = nodes.filter(n => {
      const type = unifiedNormalizeNodeType(n);
      return ['manual_trigger', 'schedule', 'webhook', 'chat_trigger'].includes(type);
    });

    if (triggers.length > 0) {
      const mainTrigger = triggers[0];
      // NOTE: Auto-connecting orphans directly to the trigger breaks strict linear flow
      // (it gives the trigger multiple outgoing edges). We've moved orphan handling into
      // the connection builder, so here we only log potential orphans for diagnostics.
      nodes.forEach(node => {
        if (node.id !== mainTrigger.id) {
          const hasIncoming = edges.some(e => e.target === node.id);
          if (!hasIncoming) {
            const nodeType = unifiedNormalizeNodeType(node);
            if (!['manual_trigger', 'schedule', 'webhook', 'chat_trigger'].includes(nodeType)) {
              fixes.push(
                `Orphan node ${node.id} (${nodeType}) detected during auto-repair (no auto-connection to trigger; handled by linear connection logic).`
              );
            }
          }
        }
      });
    }

    // Fix 3: Fix edge port names
    edges = edges.map(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);

      if (!sourceNode || !targetNode) return edge;

      const sourceType = unifiedNormalizeNodeType(sourceNode);
      const targetType = unifiedNormalizeNodeType(targetNode);

      let modified = false;
      const newEdge = { ...edge };

      // Fix for manual_trigger output
      if (sourceType === 'manual_trigger' && edge.sourceHandle === 'data') {
        newEdge.sourceHandle = 'inputData';
        modified = true;
        fixes.push(`Fixed manual_trigger output port from 'data' to 'inputData' for edge ${edge.id}`);
      }

      // Fix for slack input
      if (targetType === 'slack_message' && edge.targetHandle === 'input') {
        newEdge.targetHandle = 'text';
        modified = true;
        fixes.push(`Fixed slack input port from 'input' to 'text' for edge ${edge.id}`);
      }

      return modified ? newEdge : edge;
    });

    return {
      repairedWorkflow: { nodes, edges },
      fixes,
      remainingErrors: []
    };
  }

  /**
   * Validate and repair workflow with multiple iterations
   */
  validateAndRepair(
    workflow: Workflow,
    maxAttempts: number = 3
  ): {
    valid: boolean;
    repairedWorkflow: Workflow;
    fixes: string[];
    errors: string[];
  } {
    const allFixes: string[] = [];
    const allErrors: string[] = [];
    let currentWorkflow = JSON.parse(JSON.stringify(workflow)) as Workflow;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Validate
      const validation = this.validateWorkflow(currentWorkflow);

      if (validation.valid) {
      // Ensure all nodes have required label field
      const repairedNodes = currentWorkflow.nodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          label: node.data?.label || node.data?.type || 'Node'
        }
      }));

      return {
        valid: true,
        repairedWorkflow: {
          ...currentWorkflow,
          nodes: repairedNodes
        },
        fixes: allFixes,
        errors: []
      };
      }

      // Repair
      const repairResult = this.repair(currentWorkflow);
      allFixes.push(...repairResult.fixes);
      // Ensure labels and category are present in repaired workflow
      currentWorkflow = {
        ...repairResult.repairedWorkflow,
        nodes: repairResult.repairedWorkflow.nodes.map(node => ({
          ...node,
          data: {
            ...node.data,
            label: node.data?.label || node.data?.type || 'Node',
            category: node.data?.category || '',
            config: node.data?.config || {}
          }
        }))
      };

      // If no fixes were made in this iteration, break
      if (repairResult.fixes.length === 0) {
        allErrors.push(...validation.errors.map(e => e.message));
        break;
      }
    }

    // Final validation
    const finalValidation = this.validateWorkflow(currentWorkflow);

    // Ensure all nodes have required fields
    const finalNodes = currentWorkflow.nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        label: node.data?.label || node.data?.type || 'Node',
        category: node.data?.category || '',
        config: node.data?.config || {}
      }
    }));

    return {
      valid: finalValidation.valid,
      repairedWorkflow: {
        ...currentWorkflow,
        nodes: finalNodes
      },
      fixes: allFixes,
      errors: finalValidation.errors.map(e => e.message)
    };
  }

  /**
   * Validate workflow
   */
  private validateWorkflow(workflow: Workflow): {
    valid: boolean;
    errors: ValidationError[];
  } {
    const errors: ValidationError[] = [];
    const schemaRegistry = NodeSchemaRegistry.getInstance();

    // Validate nodes
    workflow.nodes.forEach((node: WorkflowNode) => {
      const validation = schemaRegistry.validateNode(node);
      if (!validation.valid) {
        validation.errors.forEach(error => {
          errors.push({
            type: 'node_validation',
            message: `Node ${node.id}: ${error}`,
            nodeId: node.id,
            recoverable: true
          });
        });
      }
    });

    // Validate edges
    workflow.edges.forEach((edge: WorkflowEdge) => {
      const sourceNode = workflow.nodes.find((n: WorkflowNode) => n.id === edge.source);
      const targetNode = workflow.nodes.find((n: WorkflowNode) => n.id === edge.target);

      if (!sourceNode || !targetNode) {
        errors.push({
          type: 'edge_validation',
          message: `Edge ${edge.id}: Missing source or target node`,
          edgeId: edge.id,
          recoverable: false
        });
        return;
      }

      const validation = schemaRegistry.validateEdge(sourceNode, targetNode, edge);
      if (!validation.valid) {
        validation.errors.forEach(error => {
          errors.push({
            type: 'edge_validation',
            message: `Edge ${edge.id}: ${error}`,
            edgeId: edge.id,
            recoverable: true
          });
        });
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get default output port for trigger
   */
  private getTriggerOutputPort(triggerType: string): string {
    if (triggerType === 'manual_trigger') {
      return 'inputData';
    }
    return 'output';
  }

  /**
   * Get default input port for node
   */
  private getDefaultInputPort(nodeType: string): string {
    if (nodeType === 'slack_message') {
      return 'text';
    }
    return 'input';
  }
}
