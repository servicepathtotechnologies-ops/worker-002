/**
 * Universal Node Injection Guard
 * 
 * ✅ ROOT-LEVEL FIX: Prevents unnecessary node and edge injection
 * 
 * This guard ensures that nodes are only injected when:
 * 1. They are explicitly required by the user prompt
 * 2. They are necessary for workflow functionality
 * 3. They don't create unnecessary branches or duplicates
 * 
 * Prevents:
 * - Unnecessary HTTP request nodes
 * - Unnecessary memory nodes
 * - Unnecessary API nodes
 * - Unnecessary branches/edges
 * - Duplicate nodes
 */

import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';

export interface InjectionGuardResult {
  shouldInject: boolean;
  reason?: string;
  existingNode?: WorkflowNode;
}

export class UniversalNodeInjectionGuard {
  /**
   * Check if a node should be injected
   * 
   * @param nodeType - Node type to check
   * @param workflow - Current workflow
   * @param userPrompt - User prompt (for context)
   * @param injectionReason - Why this node is being injected
   * @returns Whether node should be injected
   */
  static shouldInjectNode(
    nodeType: string,
    workflow: Workflow,
    userPrompt: string,
    injectionReason?: string
  ): InjectionGuardResult {
    const normalizedType = unifiedNormalizeNodeTypeString(nodeType);
    
    // ✅ RULE 1: Check if node already exists (prevent duplicates)
    const existingNode = workflow.nodes.find(n => {
      const existingType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return existingType === normalizedType;
    });
    
    if (existingNode) {
      return {
        shouldInject: false,
        reason: `Node type "${nodeType}" already exists in workflow`,
        existingNode,
      };
    }
    
    // ✅ RULE 2: Check if node is explicitly mentioned in user prompt
    const promptLower = (userPrompt || '').toLowerCase();
    const nodeTypeLower = normalizedType.toLowerCase();
    const isExplicitlyMentioned = this.isNodeExplicitlyMentioned(nodeTypeLower, promptLower);
    
    // ✅ RULE 3: For specific node types, apply stricter rules
    if (normalizedType === 'http_request' || normalizedType === 'http_post' || normalizedType === 'http_get') {
      return this.shouldInjectHttpRequest(workflow, promptLower, injectionReason);
    }
    
    if (normalizedType.includes('memory')) {
      return this.shouldInjectMemoryNode(workflow, promptLower, injectionReason);
    }
    
    if (normalizedType.includes('api') && !normalizedType.includes('http')) {
      return this.shouldInjectApiNode(workflow, promptLower, injectionReason);
    }
    
    // ✅ RULE 4: If not explicitly mentioned and not critical, don't inject
    if (!isExplicitlyMentioned && !this.isCriticalNode(normalizedType)) {
      return {
        shouldInject: false,
        reason: `Node type "${nodeType}" not explicitly mentioned in prompt and not critical`,
      };
    }
    
    return {
      shouldInject: true,
    };
  }
  
  /**
   * Check if HTTP request node should be injected
   */
  private static shouldInjectHttpRequest(
    workflow: Workflow,
    promptLower: string,
    injectionReason?: string
  ): InjectionGuardResult {
    // ✅ STRICT: Only inject if URL is explicitly mentioned
    const hasExplicitUrl = /\b(https?:\/\/|www\.|api\.|endpoint|url|fetch|get|post|put|delete|patch)\b/i.test(promptLower);
    
    if (!hasExplicitUrl) {
      return {
        shouldInject: false,
        reason: 'HTTP request node not needed - no URL or API endpoint mentioned in prompt',
      };
    }
    
    // Check if HTTP node already exists
    const existingHttpNode = workflow.nodes.find(n => {
      const type = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return type === 'http_request' || type === 'http_post' || type === 'http_get';
    });
    
    if (existingHttpNode) {
      return {
        shouldInject: false,
        reason: 'HTTP request node already exists in workflow',
        existingNode: existingHttpNode,
      };
    }
    
    return {
      shouldInject: true,
    };
  }
  
  /**
   * Check if memory node should be injected
   */
  private static shouldInjectMemoryNode(
    workflow: Workflow,
    promptLower: string,
    injectionReason?: string
  ): InjectionGuardResult {
    // ✅ STRICT: Only inject if memory/chatbot/context is explicitly mentioned
    const hasExplicitMemory = /\b(memory|remember|context|conversation|chatbot|chat history|session)\b/i.test(promptLower);
    
    if (!hasExplicitMemory) {
      return {
        shouldInject: false,
        reason: 'Memory node not needed - no memory/chatbot/context mentioned in prompt',
      };
    }
    
    // Check if memory node already exists
    const existingMemoryNode = workflow.nodes.find(n => {
      const type = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return type.includes('memory');
    });
    
    if (existingMemoryNode) {
      return {
        shouldInject: false,
        reason: 'Memory node already exists in workflow',
        existingNode: existingMemoryNode,
      };
    }
    
    return {
      shouldInject: true,
    };
  }
  
  /**
   * Check if API node should be injected
   */
  private static shouldInjectApiNode(
    workflow: Workflow,
    promptLower: string,
    injectionReason?: string
  ): InjectionGuardResult {
    // ✅ STRICT: Only inject if API is explicitly mentioned (not just "api" as part of other words)
    const hasExplicitApi = /\b(api|rest api|graphql|webhook|endpoint)\b/i.test(promptLower);
    
    if (!hasExplicitApi) {
      return {
        shouldInject: false,
        reason: 'API node not needed - no API/endpoint mentioned in prompt',
      };
    }
    
    // Check if API node already exists
    const existingApiNode = workflow.nodes.find(n => {
      const type = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      return type.includes('api') && !type.includes('http');
    });
    
    if (existingApiNode) {
      return {
        shouldInject: false,
        reason: 'API node already exists in workflow',
        existingNode: existingApiNode,
      };
    }
    
    return {
      shouldInject: true,
    };
  }
  
  /**
   * Check if node is explicitly mentioned in prompt
   */
  private static isNodeExplicitlyMentioned(nodeType: string, promptLower: string): boolean {
    // Common node type keywords
    const nodeKeywords: Record<string, string[]> = {
      'http_request': ['http request', 'http request', 'api call', 'fetch', 'get data from url'],
      'memory': ['memory', 'remember', 'context', 'conversation'],
      'api': ['api', 'rest api', 'graphql', 'webhook'],
      'if_else': ['if', 'condition', 'check if', 'when', 'unless'],
      'limit': ['limit', 'max', 'top', 'first n'],
      'sort': ['sort', 'order', 'ascending', 'descending'],
      'aggregate': ['aggregate', 'group', 'sum', 'count', 'total'],
    };
    
    const keywords = nodeKeywords[nodeType] || [];
    return keywords.some(keyword => promptLower.includes(keyword));
  }
  
  /**
   * Check if node is critical (must be injected even if not mentioned)
   */
  private static isCriticalNode(nodeType: string): boolean {
    // Only safety nodes are critical
    const criticalNodes = ['limit', 'if_else', 'stop_and_error'];
    return criticalNodes.includes(nodeType);
  }
  
  /**
   * Check if edge should be created (prevent unnecessary branches)
   * 
   * @param sourceNode - Source node
   * @param targetNode - Target node
   * @param workflow - Current workflow
   * @returns Whether edge should be created
   */
  static shouldCreateEdge(
    sourceNode: WorkflowNode,
    targetNode: WorkflowNode,
    workflow: Workflow
  ): { shouldCreate: boolean; reason?: string } {
    const sourceType = unifiedNormalizeNodeTypeString(sourceNode.type || sourceNode.data?.type || '');
    const targetType = unifiedNormalizeNodeTypeString(targetNode.type || targetNode.data?.type || '');
    
    // ✅ RULE 1: Check if edge already exists
    const existingEdge = workflow.edges.find(e => 
      e.source === sourceNode.id && e.target === targetNode.id
    );
    
    if (existingEdge) {
      return {
        shouldCreate: false,
        reason: 'Edge already exists',
      };
    }
    
    // ✅ RULE 2: Check if source node allows branching
    const sourceNodeDef = unifiedNodeRegistry.get(sourceType);
    const allowsBranching = sourceNodeDef?.isBranching || false;
    
    // ✅ RULE 3: Check if creating edge would create unnecessary branching
    const existingOutgoingEdges = workflow.edges.filter(e => e.source === sourceNode.id);
    
    if (existingOutgoingEdges.length > 0 && !allowsBranching) {
      // Source already has outgoing edges and doesn't allow branching
      return {
        shouldCreate: false,
        reason: `Source node "${sourceType}" already has outgoing edges and doesn't allow branching`,
      };
    }
    
    // ✅ RULE 4: Check if target node already has incoming edges (prevent multiple inputs to non-merge nodes)
    const existingIncomingEdges = workflow.edges.filter(e => e.target === targetNode.id);
    const targetNodeDef = unifiedNodeRegistry.get(targetType);
    // Check if node is a merge node (allows multiple inputs)
    const allowsMultipleInputs = targetType === 'merge' || (targetNodeDef?.category === 'logic' && targetType.includes('merge'));
    
    if (existingIncomingEdges.length > 0 && !allowsMultipleInputs) {
      return {
        shouldCreate: false,
        reason: `Target node "${targetType}" already has incoming edges and doesn't allow multiple inputs`,
      };
    }
    
    return {
      shouldCreate: true,
    };
  }
}
