// Deterministic Workflow Policy Enforcer
// Rule-based enforcement of workflow structure constraints

import type { WorkflowGenerationStructure, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { unifiedNormalizeNodeType } from '../../core/utils/unified-node-type-normalizer';

export interface PolicyViolation {
  type: 'crm_policy' | 'graph_policy' | 'edge_policy' | 'node_policy';
  severity: 'error' | 'warning';
  message: string;
  suggestion: string;
}

export interface PolicyEnforcementResult {
  valid: boolean;
  violations: PolicyViolation[];
  normalizedStructure: WorkflowGenerationStructure;
  normalizedNodes: WorkflowNode[];
  normalizedEdges: WorkflowEdge[];
}

export class WorkflowPolicyEnforcer {
  /**
   * Enforce all workflow policies
   */
  enforcePolicies(
    structure: WorkflowGenerationStructure,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    userPrompt: string
  ): PolicyEnforcementResult {
    const violations: PolicyViolation[] = [];
    
    // 1. CRM Policy Enforcement
    const crmViolations = this.enforceCRMPolicy(structure, nodes, userPrompt);
    violations.push(...crmViolations);
    
    // 2. Graph Policy Enforcement
    const graphViolations = this.enforceGraphPolicy(structure, nodes, edges);
    violations.push(...graphViolations);
    
    // 3. Edge Policy Enforcement
    const edgeViolations = this.enforceEdgePolicy(nodes, edges);
    violations.push(...edgeViolations);
    
    // 4. Normalize structure based on violations
    const normalized = this.normalizeStructure(structure, nodes, edges, violations);
    
    return {
      valid: violations.filter(v => v.severity === 'error').length === 0,
      violations,
      normalizedStructure: normalized.structure,
      normalizedNodes: normalized.nodes,
      normalizedEdges: normalized.edges
    };
  }
  
  /**
   * CRM Policy: Max 1 write CRM node unless explicitly requested
   */
  private enforceCRMPolicy(
    structure: WorkflowGenerationStructure,
    nodes: WorkflowNode[],
    userPrompt: string
  ): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    const promptLower = userPrompt.toLowerCase();
    
    // Detect CRM nodes
    const crmNodeTypes = ['hubspot', 'zoho_crm', 'salesforce', 'pipedrive'];
    const crmNodes = nodes.filter(n => {
      const type = unifiedNormalizeNodeType(n) || n.type || '';
      return crmNodeTypes.includes(type);
    });
    
    // Check for write operations
    const writeCrmNodes = crmNodes.filter(n => {
      const config = (n.data as any)?.config || {};
      const operation = (config.operation || '').toLowerCase();
      return ['create', 'update', 'write', 'upsert'].includes(operation) || !operation;
    });
    
    // Policy: Max 1 write CRM node unless sync is explicitly mentioned
    const isSyncRequested = promptLower.includes('sync') || 
                           promptLower.includes('synchronize') ||
                           promptLower.includes('from') && promptLower.includes('to') ||
                           promptLower.includes('and also');
    
    if (writeCrmNodes.length > 1 && !isSyncRequested) {
      violations.push({
        type: 'crm_policy',
        severity: 'error',
        message: `Multiple CRM write nodes detected (${writeCrmNodes.length}). Only one CRM write operation is allowed unless sync is explicitly requested.`,
        suggestion: 'Keep only one CRM node. If you need to sync between CRMs, explicitly mention "sync" in your prompt.'
      });
    }
    
    // Policy: Write CRM nodes must have data source OR static payload
    writeCrmNodes.forEach(crmNode => {
      const hasDataSource = nodes.some(n => {
        const type = unifiedNormalizeNodeType(n) || n.type || '';
        return ['google_sheets', 'database_read', 'airtable', 'http_request', 'form'].includes(type);
      });
      
      if (!hasDataSource) {
        violations.push({
          type: 'crm_policy',
          severity: 'warning',
          message: `CRM write node "${crmNode.id}" has no data source. It will use static/default data.`,
          suggestion: 'Add a data source node (e.g., Google Sheets, form) before the CRM node, or specify static data in the CRM node configuration.'
        });
      }
    });
    
    // Policy: No write → write → write chains
    const writeNodes = nodes.filter(n => {
      const type = unifiedNormalizeNodeType(n) || n.type || '';
      const config = (n.data as any)?.config || {};
      const operation = (config.operation || '').toLowerCase();
      return ['create', 'update', 'write', 'upsert'].includes(operation) || 
             (crmNodeTypes.includes(type) && !operation);
    });
    
    if (writeNodes.length >= 3) {
      violations.push({
        type: 'crm_policy',
        severity: 'error',
        message: `Detected write → write → write chain (${writeNodes.length} write nodes). This is invalid without data sources.`,
        suggestion: 'Add data source nodes (read operations) between write operations, or reduce the number of write nodes.'
      });
    }
    
    return violations;
  }
  
  /**
   * Graph Policy: Structural constraints
   */
  private enforceGraphPolicy(
    structure: WorkflowGenerationStructure,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    
    // Policy: Trigger must have ≥ 1 outgoing edge
    const triggerNode = nodes.find(n => {
      const type = unifiedNormalizeNodeType(n) || n.type || '';
      return ['schedule', 'webhook', 'manual_trigger', 'form', 'interval', 'chat_trigger'].includes(type);
    });
    
    if (triggerNode) {
      const triggerOutgoing = edges.filter(e => e.source === triggerNode.id);
      if (triggerOutgoing.length === 0) {
        violations.push({
          type: 'graph_policy',
          severity: 'error',
          message: `Trigger node "${triggerNode.id}" has no outgoing connections.`,
          suggestion: 'Connect trigger node to at least one action node.'
        });
      }
    }
    
    // Policy: Every non-trigger node must have 1 incoming edge
    const nonTriggerNodes = nodes.filter(n => {
      const type = unifiedNormalizeNodeType(n) || n.type || '';
      return !['schedule', 'webhook', 'manual_trigger', 'form', 'interval', 'chat_trigger'].includes(type);
    });
    
    nonTriggerNodes.forEach(node => {
      const incoming = edges.filter(e => e.target === node.id);
      if (incoming.length === 0) {
        violations.push({
          type: 'graph_policy',
          severity: 'error',
          message: `Node "${node.id}" has no incoming connections.`,
          suggestion: `Connect this node to a trigger or previous node.`
        });
      }
    });
    
    // Policy: No self-loop edges
    const selfLoops = edges.filter(e => e.source === e.target);
    selfLoops.forEach(edge => {
      violations.push({
        type: 'graph_policy',
        severity: 'error',
        message: `Self-loop detected: node "${edge.source}" connects to itself.`,
        suggestion: 'Remove self-loop or connect to a different node.'
      });
    });
    
    // Policy: No duplicate CRM providers unless requested
    const crmNodeTypes = ['hubspot', 'zoho_crm', 'salesforce', 'pipedrive'];
    const crmProviders = new Set<string>();
    nodes.forEach(n => {
      const type = unifiedNormalizeNodeType(n) || n.type || '';
      if (crmNodeTypes.includes(type)) {
        crmProviders.add(type);
      }
    });
    
    // This is handled by CRM policy, but we log it here too
    if (crmProviders.size > 1) {
      // Check if it's a sync workflow (handled by CRM policy)
      // This is just for logging
    }
    
    return violations;
  }
  
  /**
   * Edge Policy: Schema validation
   */
  private enforceEdgePolicy(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (!sourceNode || !targetNode) {
        violations.push({
          type: 'edge_policy',
          severity: 'error',
          message: `Edge references non-existent node: ${edge.source} → ${edge.target}`,
          suggestion: 'Remove invalid edge or ensure nodes exist.'
        });
        return;
      }
      
      // Validate output field exists in source node (using sourceHandle)
      if (edge.sourceHandle) {
        const sourceType = unifiedNormalizeNodeType(sourceNode) || sourceNode.type || '';
        const validOutputFields = this.getValidOutputFields(sourceType);
        if (!validOutputFields.includes(edge.sourceHandle)) {
          violations.push({
            type: 'edge_policy',
            severity: 'error',
            message: `Edge output field "${edge.sourceHandle}" does not exist in source node "${sourceNode.id}" (type: ${sourceType}). Available: ${validOutputFields.join(', ')}`,
            suggestion: `Use one of the valid output fields: ${validOutputFields.join(', ')}`
          });
        }
      }
      
      // Validate input field exists in target node (using targetHandle)
      if (edge.targetHandle) {
        const targetType = unifiedNormalizeNodeType(targetNode) || targetNode.type || '';
        const validInputFields = this.getValidInputFields(targetType);
        if (!validInputFields.includes(edge.targetHandle)) {
          violations.push({
            type: 'edge_policy',
            severity: 'error',
            message: `Edge input field "${edge.targetHandle}" does not exist in target node "${targetNode.id}" (type: ${targetType}). Available: ${validInputFields.join(', ')}`,
            suggestion: `Use one of the valid input fields: ${validInputFields.join(', ')}`
          });
        }
      }
    });
    
    return violations;
  }
  
  /**
   * Get valid output fields for a node type
   */
  private getValidOutputFields(nodeType: string): string[] {
    // Common output fields
    const commonOutputs = ['output', 'data', 'result', 'main'];
    
    // Type-specific outputs
    const typeOutputs: Record<string, string[]> = {
      'schedule': ['triggerTime', 'executionId', 'output'],
      'webhook': ['body', 'headers', 'query', 'output'],
      'form': ['inputData', 'output'],
      'if_else': ['true', 'false', 'output', 'data'],
      'loop': ['output', 'data'],
    };
    
    return typeOutputs[nodeType] || commonOutputs;
  }
  
  /**
   * Get valid input fields for a node type
   */
  private getValidInputFields(nodeType: string): string[] {
    // Common input fields
    const commonInputs = ['input', 'inputData', 'data', 'main'];
    
    // Type-specific inputs
    const typeInputs: Record<string, string[]> = {
      'log_output': ['text', 'input', 'inputData', 'data'],
      'slack_message': ['message', 'text', 'input', 'inputData'],
      'email': ['to', 'subject', 'text', 'input', 'inputData'],
      'if_else': ['input', 'inputData', 'data', 'conditions'],
    };
    
    return typeInputs[nodeType] || commonInputs;
  }
  
  /**
   * Normalize structure based on violations
   */
  private normalizeStructure(
    structure: WorkflowGenerationStructure,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    violations: PolicyViolation[]
  ): {
    structure: WorkflowGenerationStructure;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  } {
    let normalizedNodes = [...nodes];
    let normalizedEdges = [...edges];
    
    // Fix CRM policy violations
    const crmViolations = violations.filter(v => v.type === 'crm_policy' && v.severity === 'error');
    if (crmViolations.length > 0) {
      // Remove duplicate CRM nodes (keep first one)
      const crmNodeTypes = ['hubspot', 'zoho_crm', 'salesforce', 'pipedrive'];
      const crmNodes = normalizedNodes.filter(n => {
        const type = unifiedNormalizeNodeType(n) || n.type || '';
        return crmNodeTypes.includes(type);
      });
      
      if (crmNodes.length > 1) {
        // Keep first CRM node, remove others
        const firstCrm = crmNodes[0];
        const otherCrms = crmNodes.slice(1);
        normalizedNodes = normalizedNodes.filter(n => !otherCrms.includes(n));
        
        // Remove edges connected to removed nodes
        normalizedEdges = normalizedEdges.filter(e => 
          !otherCrms.some(crm => crm.id === e.source || crm.id === e.target)
        );
      }
    }
    
    // Fix graph policy violations
    const graphViolations = violations.filter(v => v.type === 'graph_policy' && v.severity === 'error');
    
    // 🚨 CRITICAL FIX: Fix trigger outgoing connections
    const triggerNode = normalizedNodes.find(n => {
      const type = unifiedNormalizeNodeType(n) || n.type || '';
      return ['schedule', 'webhook', 'manual_trigger', 'form', 'interval', 'chat_trigger'].includes(type);
    });
    
    if (triggerNode) {
      const triggerOutgoing = normalizedEdges.filter(e => e.source === triggerNode.id);
      if (triggerOutgoing.length === 0) {
        // Connect trigger to first non-trigger, non-chat_model node
        const firstActionNode = normalizedNodes.find(n => {
          const type = unifiedNormalizeNodeType(n) || n.type || '';
          return n.id !== triggerNode.id && 
                 type !== 'chat_model' &&
                 !['schedule', 'webhook', 'manual_trigger', 'form', 'interval', 'chat_trigger'].includes(type);
        });
        if (firstActionNode) {
          // Determine correct field mapping based on trigger type
          const triggerType = unifiedNormalizeNodeType(triggerNode) || triggerNode.type || '';
          const targetType = unifiedNormalizeNodeType(firstActionNode) || firstActionNode.type || '';
          
          // ✅ CRITICAL: Use correct output handles for each trigger type
          const sourceHandle = (triggerType === 'schedule' || triggerType === 'interval') ? 'output' : 
                              (triggerType === 'manual_trigger' || triggerType === 'workflow_trigger') ? 'inputData' :
                              (triggerType === 'chat_trigger') ? 'message' :
                              (triggerType === 'form') ? 'formData' :
                              (triggerType === 'webhook') ? 'body' : 'output';
          
          const targetHandle = targetType === 'ai_agent' ? 'userInput' : 'input';
          
          normalizedEdges.push({
            id: `edge_${Date.now()}_${Math.random()}`,
            source: triggerNode.id,
            target: firstActionNode.id,
            sourceHandle,
            targetHandle
          });
          console.log(`✅ [Policy Enforcer] Connected orphan trigger ${triggerType} → ${targetType}`);
        } else {
          console.warn(`⚠️  [Policy Enforcer] Trigger node found but no action node to connect to`);
        }
      }
    }
    
    // Fix orphaned nodes
    const nonTriggerNodes = normalizedNodes.filter(n => {
      const type = unifiedNormalizeNodeType(n) || n.type || '';
      return !['schedule', 'webhook', 'manual_trigger', 'form', 'interval', 'chat_trigger'].includes(type);
    });
    
    nonTriggerNodes.forEach(node => {
      const incoming = normalizedEdges.filter(e => e.target === node.id);
      if (incoming.length === 0) {
        // Connect to trigger or previous node
        const sourceNode = triggerNode || normalizedNodes[normalizedNodes.indexOf(node) - 1];
        if (sourceNode && sourceNode.id !== node.id) {
          normalizedEdges.push({
            id: `edge_${Date.now()}_${Math.random()}`,
            source: sourceNode.id,
            target: node.id,
            sourceHandle: 'output',
            targetHandle: 'input'
          });
        }
      }
    });
    
    // 🚨 CRITICAL FIX: Remove self-loops and log them
    const selfLoopsRemoved = normalizedEdges.filter(e => e.source === e.target);
    if (selfLoopsRemoved.length > 0) {
      console.warn(`⚠️  [Policy Enforcer] Removed ${selfLoopsRemoved.length} self-loop edge(s):`, 
        selfLoopsRemoved.map(e => `${e.source} → ${e.target}`).join(', '));
    }
    normalizedEdges = normalizedEdges.filter(e => e.source !== e.target);
    
    // Fix edge field violations
    normalizedEdges = normalizedEdges.map(edge => {
      const sourceNode = normalizedNodes.find(n => n.id === edge.source);
      const targetNode = normalizedNodes.find(n => n.id === edge.target);
      
      if (sourceNode && targetNode) {
        const sourceType = unifiedNormalizeNodeType(sourceNode) || sourceNode.type || '';
        const targetType = unifiedNormalizeNodeType(targetNode) || targetNode.type || '';
        
        const validOutputFields = this.getValidOutputFields(sourceType);
        const validInputFields = this.getValidInputFields(targetType);
        
        // Fix invalid output field (using sourceHandle)
        if (edge.sourceHandle && !validOutputFields.includes(edge.sourceHandle)) {
          edge.sourceHandle = validOutputFields[0] || 'output';
        }
        
        // Fix invalid input field (using targetHandle)
        if (edge.targetHandle && !validInputFields.includes(edge.targetHandle)) {
          edge.targetHandle = validInputFields[0] || 'input';
        }
      }
      
      return edge;
    });
    
    return {
      structure,
      nodes: normalizedNodes,
      edges: normalizedEdges
    };
  }
}

export const workflowPolicyEnforcer = new WorkflowPolicyEnforcer();
