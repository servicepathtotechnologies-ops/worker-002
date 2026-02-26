/**
 * Workflow Policy Enforcer V2
 * 
 * Enforces policies on workflow structure:
 * - Trigger must have outgoing edge
 * - No self-loops
 * - No multiple CRM write nodes unless explicitly requested
 * - If condition exists → auto insert if_else node
 * - If form fields referenced → auto insert extractor node
 */

import { WorkflowStructure } from './workflow-structure-builder';
import { WorkflowNode, WorkflowEdge, Workflow } from '../../core/types/ai-types';
import { normalizeNodeType } from '../../core/utils/node-type-normalizer';

export interface PolicyEnforcementResult {
  valid: boolean;
  workflow: Workflow;
  errors: string[];
  warnings: string[];
  fixes_applied: string[];
}

export class WorkflowPolicyEnforcerV2 {
  /**
   * Enforce all policies on workflow
   */
  enforcePolicies(workflow: Workflow): PolicyEnforcementResult {
    console.log(`[PolicyEnforcer] Enforcing policies on workflow`);

    const errors: string[] = [];
    const warnings: string[] = [];
    const fixes_applied: string[] = [];
    let updatedWorkflow = { ...workflow };

    // Policy 1: Trigger must have outgoing edge
    const triggerPolicyResult = this.enforceTriggerPolicy(updatedWorkflow);
    if (!triggerPolicyResult.valid) {
      errors.push(...triggerPolicyResult.errors);
    }
    if (triggerPolicyResult.fixes_applied.length > 0) {
      fixes_applied.push(...triggerPolicyResult.fixes_applied);
      updatedWorkflow = triggerPolicyResult.workflow;
    }

    // Policy 2: No self-loops
    const selfLoopResult = this.enforceNoSelfLoops(updatedWorkflow);
    if (!selfLoopResult.valid) {
      errors.push(...selfLoopResult.errors);
    }
    if (selfLoopResult.fixes_applied.length > 0) {
      fixes_applied.push(...selfLoopResult.fixes_applied);
      updatedWorkflow = selfLoopResult.workflow;
    }

    // Policy 3: No multiple CRM write nodes unless explicitly requested
    const crmPolicyResult = this.enforceSingleCrmPolicy(updatedWorkflow);
    if (!crmPolicyResult.valid) {
      warnings.push(...crmPolicyResult.warnings);
    }
    if (crmPolicyResult.fixes_applied.length > 0) {
      fixes_applied.push(...crmPolicyResult.fixes_applied);
      updatedWorkflow = crmPolicyResult.workflow;
    }

    // Policy 4: All nodes must be connected (no orphaned nodes)
    const connectionPolicyResult = this.enforceConnectionPolicy(updatedWorkflow);
    if (!connectionPolicyResult.valid) {
      errors.push(...connectionPolicyResult.errors);
    }
    if (connectionPolicyResult.fixes_applied.length > 0) {
      fixes_applied.push(...connectionPolicyResult.fixes_applied);
      updatedWorkflow = connectionPolicyResult.workflow;
    }

    // Policy 5: Validate field mappings
    const fieldMappingResult = this.enforceFieldMappingPolicy(updatedWorkflow);
    if (!fieldMappingResult.valid) {
      errors.push(...fieldMappingResult.errors);
    }
    if (fieldMappingResult.fixes_applied.length > 0) {
      fixes_applied.push(...fieldMappingResult.fixes_applied);
      updatedWorkflow = fieldMappingResult.workflow;
    }

    return {
      valid: errors.length === 0,
      workflow: updatedWorkflow,
      errors,
      warnings,
      fixes_applied,
    };
  }

  /**
   * Policy 1: Trigger must have outgoing edge
   */
  private enforceTriggerPolicy(workflow: Workflow): PolicyEnforcementResult {
    const errors: string[] = [];
    const fixes_applied: string[] = [];
    
    // Find trigger node
    const triggerNode = workflow.nodes.find(n => {
      const type = normalizeNodeType(n);
      return ['manual_trigger', 'schedule', 'webhook', 'form', 'chat_trigger'].includes(type);
    });

    if (!triggerNode) {
      errors.push('No trigger node found in workflow');
      return { valid: false, workflow, errors, warnings: [], fixes_applied: [] };
    }

    // Check if trigger has outgoing edge
    const triggerHasOutgoing = workflow.edges.some(e => e.source === triggerNode.id);
    
    if (!triggerHasOutgoing) {
      // Find first non-trigger node
      const firstNode = workflow.nodes.find(n => {
        const type = normalizeNodeType(n);
        return !['manual_trigger', 'schedule', 'webhook', 'form', 'chat_trigger'].includes(type);
      });

      if (firstNode) {
        // Add connection from trigger to first node
        const newEdge: WorkflowEdge = {
          id: `edge_${Date.now()}`,
          source: triggerNode.id,
          target: firstNode.id,
          type: 'default',
          sourceHandle: 'output',
          targetHandle: 'input',
        };
        
        workflow.edges.push(newEdge);
        fixes_applied.push(`Added connection from trigger to first node`);
      } else {
        errors.push('Trigger has no outgoing edge and no nodes to connect to');
      }
    }

    return {
      valid: errors.length === 0,
      workflow,
      errors,
      warnings: [],
      fixes_applied,
    };
  }

  /**
   * Policy 2: No self-loops
   */
  private enforceNoSelfLoops(workflow: Workflow): PolicyEnforcementResult {
    const errors: string[] = [];
    const fixes_applied: string[] = [];
    
    // Remove self-loop edges
    const originalEdgeCount = workflow.edges.length;
    workflow.edges = workflow.edges.filter(e => {
      if (e.source === e.target) {
        errors.push(`Self-loop detected: ${e.source} → ${e.target}`);
        return false;
      }
      return true;
    });

    const removedCount = originalEdgeCount - workflow.edges.length;
    if (removedCount > 0) {
      fixes_applied.push(`Removed ${removedCount} self-loop edge(s)`);
    }

    return {
      valid: errors.length === 0,
      workflow,
      errors,
      warnings: [],
      fixes_applied,
    };
  }

  /**
   * Policy 3: No multiple CRM write nodes unless explicitly requested
   */
  private enforceSingleCrmPolicy(workflow: Workflow): PolicyEnforcementResult {
    const warnings: string[] = [];
    const fixes_applied: string[] = [];
    
    const crmWriteNodes = workflow.nodes.filter(n => {
      const type = normalizeNodeType(n);
      const isCrm = ['hubspot', 'zoho_crm', 'salesforce', 'pipedrive'].includes(type);
      if (!isCrm) return false;
      
      const operation = (n.data as any)?.config?.operation || '';
      return ['create', 'update', 'write'].includes(operation.toLowerCase());
    });

    if (crmWriteNodes.length > 1) {
      warnings.push(`Multiple CRM write nodes detected: ${crmWriteNodes.length}. Consider consolidating.`);
      // Don't auto-fix this - let user decide
    }

    return {
      valid: true,
      workflow,
      errors: [],
      warnings,
      fixes_applied,
    };
  }

  /**
   * Policy 4: All nodes must be connected
   */
  private enforceConnectionPolicy(workflow: Workflow): PolicyEnforcementResult {
    const errors: string[] = [];
    const fixes_applied: string[] = [];
    
    // Find trigger node
    const triggerNode = workflow.nodes.find(n => {
      const type = normalizeNodeType(n);
      return ['manual_trigger', 'schedule', 'webhook', 'form', 'chat_trigger'].includes(type);
    });

    const nonTriggerNodes = workflow.nodes.filter(n => {
      const type = normalizeNodeType(n);
      return !['manual_trigger', 'schedule', 'webhook', 'form', 'chat_trigger'].includes(type);
    });

    // Check each non-trigger node has incoming connection
    const orphanedNodes: WorkflowNode[] = [];
    nonTriggerNodes.forEach(node => {
      const hasIncoming = workflow.edges.some(e => e.target === node.id);
      if (!hasIncoming) {
        orphanedNodes.push(node);
      }
    });

    if (orphanedNodes.length > 0) {
      // Try to connect orphaned nodes to the last connected node
      const connectedNodes = new Set(workflow.edges.map(e => e.target));
      const lastConnectedNode = workflow.nodes.find(n => connectedNodes.has(n.id));

      if (lastConnectedNode) {
        orphanedNodes.forEach(orphan => {
          const newEdge: WorkflowEdge = {
            id: `edge_${Date.now()}_${Math.random()}`,
            source: lastConnectedNode.id,
            target: orphan.id,
            type: 'default',
            sourceHandle: 'output',
            targetHandle: 'input',
          };
          workflow.edges.push(newEdge);
          fixes_applied.push(`Connected orphaned node ${orphan.id} to last connected node`);
        });
      } else {
        errors.push(`Found ${orphanedNodes.length} orphaned node(s) with no way to connect them`);
      }
    }

    return {
      valid: errors.length === 0,
      workflow,
      errors,
      warnings: [],
      fixes_applied,
    };
  }

  /**
   * Policy 5: Validate field mappings
   */
  private enforceFieldMappingPolicy(workflow: Workflow): PolicyEnforcementResult {
    const errors: string[] = [];
    const fixes_applied: string[] = [];
    
    workflow.edges.forEach(edge => {
      const sourceNode = workflow.nodes.find(n => n.id === edge.source);
      const targetNode = workflow.nodes.find(n => n.id === edge.target);

      if (!sourceNode || !targetNode) {
        errors.push(`Edge references non-existent node: ${edge.source} → ${edge.target}`);
        return;
      }

      // Validate sourceHandle exists in source node
      if (edge.sourceHandle) {
        const sourceType = normalizeNodeType(sourceNode);
        const validOutputs = this.getValidOutputFields(sourceType);
        if (!validOutputs.includes(edge.sourceHandle)) {
          // Fix: use default output field
          edge.sourceHandle = validOutputs[0] || 'output';
          fixes_applied.push(`Fixed invalid sourceHandle for edge ${edge.id}`);
        }
      }

      // Validate targetHandle exists in target node
      if (edge.targetHandle) {
        const targetType = normalizeNodeType(targetNode);
        const validInputs = this.getValidInputFields(targetType);
        if (!validInputs.includes(edge.targetHandle)) {
          // Fix: use default input field
          edge.targetHandle = validInputs[0] || 'input';
          fixes_applied.push(`Fixed invalid targetHandle for edge ${edge.id}`);
        }
      }
    });

    return {
      valid: errors.length === 0,
      workflow,
      errors,
      warnings: [],
      fixes_applied,
    };
  }

  /**
   * Get valid output fields for node type
   */
  private getValidOutputFields(nodeType: string): string[] {
    // Default output fields
    const defaults = ['output', 'data', 'result'];
    
    // Special cases
    if (nodeType === 'if_else') {
      return ['true', 'false', 'output', 'data'];
    }
    
    return defaults;
  }

  /**
   * Get valid input fields for node type
   */
  private getValidInputFields(nodeType: string): string[] {
    // Default input fields
    const defaults = ['input', 'inputData', 'data', 'main'];
    
    // Special cases
    if (nodeType === 'ai_agent') {
      return ['userInput', 'chat_model', 'memory', 'tool', 'input', 'inputData', 'data'];
    }
    
    return defaults;
  }
}

export const workflowPolicyEnforcerV2 = new WorkflowPolicyEnforcerV2();
