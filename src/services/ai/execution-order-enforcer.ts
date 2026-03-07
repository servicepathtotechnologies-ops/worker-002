/**
 * Execution Order Enforcer
 * 
 * Enforces strict execution ordering rules:
 * 
 * Execution order (strict):
 * 1. Triggers (manual_trigger, schedule, webhook, form)
 * 2. Data sources (read operations: google_sheets, database_read, http_request)
 * 3. Transformations (AI, logic: text_summarizer, ai_agent, if_else, transform)
 * 4. Actions (email, slack, CRM: google_gmail, slack_message, hubspot, airtable)
 * 
 * Workflow must be topologically sorted based on:
 * - Category priority (strict order above)
 * - Data dependencies (edges)
 * 
 * If order invalid → auto reorder.
 * 
 * Example:
 * If planner produces: fetch → send → summarize
 * Automatically reorder to: trigger → fetch → summarize → send
 */

import { WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { nodeLibrary } from '../nodes/node-library';

export enum NodeCategory {
  PRODUCER = 'producer',      // Data sources
  TRANSFORMER = 'transformer', // Data processors
  OUTPUT = 'output',          // Final actions
  TRIGGER = 'trigger',        // Workflow triggers
  CONDITION = 'condition',    // Conditional logic
}

export interface ExecutionOrderResult {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  reordered: boolean;
  ordering: Array<{
    nodeId: string;
    nodeType: string;
    category: NodeCategory;
    originalOrder: number;
    finalOrder: number;
  }>;
}

/**
 * Execution Order Enforcer
 * Enforces strict execution ordering based on data dependencies
 */
export class ExecutionOrderEnforcer {
  /**
   * Enforce execution ordering on workflow
   * 
   * @param nodes - Workflow nodes
   * @param edges - Workflow edges
   * @returns Reordered workflow with topological sort
   */
  enforceOrdering(nodes: WorkflowNode[], edges: WorkflowEdge[]): ExecutionOrderResult {
    console.log('[ExecutionOrderEnforcer] Enforcing strict execution ordering...');
    console.log('[ExecutionOrderEnforcer] Order: 1. triggers → 2. data sources (read) → 3. transformations (AI, logic) → 4. actions (email, slack, CRM)');
    
    // Step 1: Categorize nodes
    const categorizedNodes = this.categorizeNodes(nodes);
    
    // Log categorization
    const categoryCounts = new Map<NodeCategory, number>();
    categorizedNodes.forEach(category => {
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    });
    console.log('[ExecutionOrderEnforcer] Node categorization:');
    categoryCounts.forEach((count, category) => {
      console.log(`[ExecutionOrderEnforcer]   ${category}: ${count} nodes`);
    });
    
    // Step 2: Validate current order
    const orderIssues = this.validateOrder(nodes, edges, categorizedNodes);
    if (orderIssues.length > 0) {
      console.log(`[ExecutionOrderEnforcer] ⚠️  Found ${orderIssues.length} ordering issues, will auto-reorder:`);
      orderIssues.forEach(issue => {
        console.log(`[ExecutionOrderEnforcer]   - ${issue}`);
      });
    }
    
    // Step 3: Build dependency graph
    const dependencyGraph = this.buildDependencyGraph(nodes, edges, categorizedNodes);
    
    // Step 4: Topological sort based on categories and dependencies
    const sortedNodes = this.topologicalSort(nodes, edges, categorizedNodes, dependencyGraph);
    
    // Step 5: Rebuild edges based on new order
    const reorderedEdges = this.rebuildEdges(sortedNodes, edges);
    
    // Step 6: Check if reordering occurred
    const reordered = this.wasReordered(nodes, sortedNodes);
    
    // Step 7: Build ordering metadata
    const ordering = sortedNodes.map((node, index) => {
      const originalIndex = nodes.findIndex(n => n.id === node.id);
      return {
        nodeId: node.id,
        nodeType: unifiedNormalizeNodeType(node),
        category: categorizedNodes.get(node.id) || NodeCategory.TRANSFORMER,
        originalOrder: originalIndex,
        finalOrder: index,
      };
    });
    
    if (reordered) {
      console.log(`[ExecutionOrderEnforcer] ✅ Workflow auto-reordered: ${nodes.length} nodes`);
      ordering.forEach(item => {
        if (item.originalOrder !== item.finalOrder) {
          console.log(`[ExecutionOrderEnforcer]   ${item.nodeType}: ${item.originalOrder} → ${item.finalOrder} (${item.category})`);
        }
      });
    } else {
      console.log(`[ExecutionOrderEnforcer] ✅ Workflow already correctly ordered`);
    }
    
    return {
      nodes: sortedNodes,
      edges: reorderedEdges,
      reordered,
      ordering,
    };
  }
  
  /**
   * Validate execution order
   * Returns list of ordering issues
   */
  private validateOrder(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    categories: Map<string, NodeCategory>
  ): string[] {
    const issues: string[] = [];
    
    const categoryPriority: Record<NodeCategory, number> = {
      [NodeCategory.TRIGGER]: 0,
      [NodeCategory.PRODUCER]: 1,
      [NodeCategory.TRANSFORMER]: 2,
      [NodeCategory.CONDITION]: 2,
      [NodeCategory.OUTPUT]: 3,
    };
    
    // Check edges for correct order
    edges.forEach(edge => {
      const sourceCategory = categories.get(edge.source);
      const targetCategory = categories.get(edge.target);
      
      if (sourceCategory && targetCategory) {
        const sourcePriority = categoryPriority[sourceCategory];
        const targetPriority = categoryPriority[targetCategory];
        
        if (sourcePriority > targetPriority) {
          const sourceNode = nodes.find(n => n.id === edge.source);
          const targetNode = nodes.find(n => n.id === edge.target);
          if (sourceNode && targetNode) {
            const sourceType = unifiedNormalizeNodeType(sourceNode);
            const targetType = unifiedNormalizeNodeType(targetNode);
            issues.push(`Invalid order: ${sourceType} (${sourceCategory}) → ${targetType} (${targetCategory})`);
          }
        }
      }
    });
    
    return issues;
  }
  
  /**
   * Categorize nodes into producers, transformers, and outputs
   */
  private categorizeNodes(nodes: WorkflowNode[]): Map<string, NodeCategory> {
    const categories = new Map<string, NodeCategory>();
    
    for (const node of nodes) {
      const nodeType = unifiedNormalizeNodeType(node);
      const category = this.getNodeCategory(nodeType);
      categories.set(node.id, category);
    }
    
    return categories;
  }
  
  /**
   * Get node category based on node type
   * 
   * Strict categorization:
   * 1. TRIGGER: workflow triggers
   * 2. PRODUCER: data sources (read operations only)
   * 3. TRANSFORMER: transformations (AI, logic)
   * 4. CONDITION: conditional logic (same priority as transformer)
   * 5. OUTPUT: actions (email, slack, CRM)
   */
  private getNodeCategory(nodeType: string): NodeCategory {
    const nodeTypeLower = nodeType.toLowerCase();
    const schema = nodeLibrary.getSchema(nodeTypeLower);
    const capabilities: string[] = (schema?.capabilities || []) as string[];
    
    // 1. Triggers (first)
    if (nodeTypeLower.includes('trigger') || 
        nodeTypeLower === 'schedule' || 
        nodeTypeLower === 'webhook' || 
        nodeTypeLower === 'form' ||
        nodeTypeLower === 'interval' ||
        nodeTypeLower === 'chat_trigger') {
      return NodeCategory.TRIGGER;
    }

    // Contract-driven: treat write-capable nodes as OUTPUT actions (terminal sinks).
    // This prevents misclassifying storage/CRM nodes like Airtable as producers.
    const hasWriteCapability =
      capabilities.some(c => (c || '').toLowerCase().includes('.write')) ||
      capabilities.some(c => (c || '').toLowerCase().includes('database.write')) ||
      capabilities.some(c => (c || '').toLowerCase().includes('crm.write')) ||
      capabilities.some(c => (c || '').toLowerCase().includes('storage.write'));
    if (hasWriteCapability) {
      return NodeCategory.OUTPUT;
    }
    
    // 2. Data Sources (read operations only - second)
    if (this.isDataProducer(nodeTypeLower)) {
      return NodeCategory.PRODUCER;
    }
    
    // 3. Transformations (AI, logic - third)
    if (this.isTransformer(nodeTypeLower)) {
      return NodeCategory.TRANSFORMER;
    }
    
    // 3. Conditions (logic - same priority as transformer)
    if (nodeTypeLower.includes('if_else') || 
        nodeTypeLower.includes('switch') || 
        nodeTypeLower.includes('condition')) {
      return NodeCategory.CONDITION;
    }
    
    // 4. Output Actions (email, slack, CRM - last)
    if (this.isOutputAction(nodeTypeLower)) {
      return NodeCategory.OUTPUT;
    }
    
    // Default: treat as transformer
    return NodeCategory.TRANSFORMER;
  }
  
  /**
   * Check if node is a transformer (AI, logic)
   */
  private isTransformer(nodeType: string): boolean {
    const transformerTypes = [
      'summarizer', 'summarize', 'classifier', 'classify',
      'ai_agent', 'ai_service', 'ollama', 'openai', 'anthropic', 'gemini',
      'transform', 'format', 'parse', 'filter', 'map', 'reduce',
      'javascript', 'code', 'function',
    ];
    
    return transformerTypes.some(type => nodeType.includes(type));
  }
  
  /**
   * Check if node is a data producer (read operations only)
   * 
   * Note: Write operations (database_write, google_sheets write) are OUTPUT actions
   */
  private isDataProducer(nodeType: string): boolean {
    // Read operations only
    const producerTypes = [
      'google_sheets', // Read from sheets
      'postgresql', 'postgres', 'mysql', 'mongodb', 'database_read', 'database', // Read from database
      'aws_s3', 's3', 'dropbox', 'storage_read', 'storage', // Read from storage
      'airtable', 'notion', 'csv', 'excel', // Read from data sources
      'google_drive', 'drive', // Read from drive
      'http_request', 'http_get', 'api', 'fetch', // Read from API
    ];
    
    // Exclude write operations (these are OUTPUT actions)
    if (nodeType.includes('write') || 
        nodeType.includes('create') || 
        nodeType.includes('update') ||
        nodeType.includes('delete')) {
      return false;
    }
    
    return producerTypes.some(type => nodeType.includes(type));
  }
  
  /**
   * Check if node is an output action (email, slack, CRM, write operations)
   */
  private isOutputAction(nodeType: string): boolean {
    const outputTypes = [
      // Communication
      'gmail', 'google_gmail', 'email', 'mail',
      'slack', 'slack_message', 'discord', 'telegram', 'teams',
      'twitter', 'instagram', 'facebook', 'linkedin',
      'notification', 'notify',
      'webhook_response',
      // CRM/Actions
      'hubspot', 'salesforce', 'pipedrive', 'zoho_crm', 'airtable', // CRM operations
      // Write operations
      'database_write', 'google_sheets', // Write to sheets/database (if write operation)
      'http_post', 'http_put', 'http_patch', 'http_delete', // Write to API
    ];
    
    // Check if it's a write operation
    if (nodeType.includes('write') || 
        nodeType.includes('create') || 
        nodeType.includes('update') ||
        nodeType.includes('delete') ||
        nodeType.includes('append')) {
      return true;
    }
    
    return outputTypes.some(type => nodeType.includes(type));
  }
  
  /**
   * Build dependency graph based on categories and edges
   */
  private buildDependencyGraph(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    categories: Map<string, NodeCategory>
  ): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    
    // Initialize graph
    nodes.forEach(node => {
      graph.set(node.id, []);
    });
    
    // Add explicit edges
    edges.forEach(edge => {
      const sourceDeps = graph.get(edge.source) || [];
      if (!sourceDeps.includes(edge.target)) {
        sourceDeps.push(edge.target);
        graph.set(edge.source, sourceDeps);
      }
    });
    
    // ✅ FIXED: Add implicit dependencies based on strict category order
    // Rule: trigger → producer → transformer/condition → output
    // If transformation exists → enforce sequential chain (no direct producer → output)
    
    // Check if workflow contains transformation nodes
    const hasTransform = Array.from(categories.values()).some(cat => cat === NodeCategory.TRANSFORMER);
    
    // Find transformer node IDs
    const transformerNodeIds = new Set<string>();
    nodes.forEach(node => {
      const category = categories.get(node.id);
      if (category === NodeCategory.TRANSFORMER) {
        transformerNodeIds.add(node.id);
      }
    });
    
    // Find last transformer (if any) - use the one with most outgoing edges
    let lastTransformerId: string | null = null;
    if (transformerNodeIds.size > 0) {
      let maxOutgoing = -1;
      for (const transformerId of transformerNodeIds) {
        const outgoing = edges.filter(e => e.source === transformerId).length;
        if (outgoing > maxOutgoing) {
          maxOutgoing = outgoing;
          lastTransformerId = transformerId;
        }
      }
      // If no outgoing edges, use first transformer found
      if (!lastTransformerId) {
        lastTransformerId = Array.from(transformerNodeIds)[0];
      }
    }
    
    console.log(`[ExecutionOrderEnforcer] Building dependency graph: hasTransform=${hasTransform}, lastTransformer=${lastTransformerId}`);
    
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    for (const node of nodes) {
      const nodeCategory = categories.get(node.id);
      const nodeType = unifiedNormalizeNodeType(node);
      
      if (!nodeCategory) continue;
      
      // Triggers should come before all other nodes
      if (nodeCategory === NodeCategory.TRIGGER) {
        nodes.forEach(otherNode => {
          if (otherNode.id === node.id) return;
          
          const otherCategory = categories.get(otherNode.id);
          if (otherCategory !== NodeCategory.TRIGGER) {
            const deps = graph.get(node.id) || [];
            if (!deps.includes(otherNode.id)) {
              deps.push(otherNode.id);
              graph.set(node.id, deps);
            }
          }
        });
      }
      
      // ✅ FIXED: Producers should come before transformers, conditions, and outputs
      // If transformation exists → producer should NOT connect directly to output
      if (nodeCategory === NodeCategory.PRODUCER) {
        nodes.forEach(otherNode => {
          if (otherNode.id === node.id) return;
          
          const otherCategory = categories.get(otherNode.id);
          // ✅ FIXED: If transformation exists, producer should NOT connect directly to output
          if (hasTransform && otherCategory === NodeCategory.OUTPUT) {
            // Skip direct producer → output when transformer exists
            return;
          }
          
          if (otherCategory === NodeCategory.TRANSFORMER || 
              otherCategory === NodeCategory.CONDITION ||
              (!hasTransform && otherCategory === NodeCategory.OUTPUT)) {
            const deps = graph.get(node.id) || [];
            if (!deps.includes(otherNode.id)) {
              deps.push(otherNode.id);
              graph.set(node.id, deps);
            }
          }
        });
      }
      
      // Transformers and conditions should come before outputs
      if (nodeCategory === NodeCategory.TRANSFORMER || nodeCategory === NodeCategory.CONDITION) {
        nodes.forEach(otherNode => {
          if (otherNode.id === node.id) return;
          
          const otherCategory = categories.get(otherNode.id);
          if (otherCategory === NodeCategory.OUTPUT) {
            const deps = graph.get(node.id) || [];
            if (!deps.includes(otherNode.id)) {
              deps.push(otherNode.id);
              graph.set(node.id, deps);
            }
          }
        });
      }
      
      // ✅ FIXED: If transformation exists, output must depend on last transformer (not producer)
      if (hasTransform && nodeCategory === NodeCategory.OUTPUT && lastTransformerId) {
        // Ensure output depends on last transformer
        const deps = graph.get(node.id) || [];
        if (!deps.includes(lastTransformerId)) {
          deps.push(lastTransformerId);
          graph.set(node.id, deps);
          console.log(`[ExecutionOrderEnforcer] ✅ Enforced output ${node.id} depends on last transformer ${lastTransformerId}`);
        }
        
        // Remove any direct producer → output dependencies
        const producerDeps = deps.filter(depId => {
          const depCategory = categories.get(depId);
          return depCategory === NodeCategory.PRODUCER;
        });
        if (producerDeps.length > 0) {
          producerDeps.forEach(producerId => {
            const index = deps.indexOf(producerId);
            if (index >= 0) {
              deps.splice(index, 1);
              console.log(`[ExecutionOrderEnforcer] ✅ Removed direct producer → output dependency: ${producerId} → ${node.id}`);
            }
          });
          graph.set(node.id, deps);
        }
      }
    }
    
    return graph;
  }
  
  /**
   * Topological sort based on categories and dependencies
   */
  private topologicalSort(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    categories: Map<string, NodeCategory>,
    dependencyGraph: Map<string, string[]>
  ): WorkflowNode[] {
    // Build in-degree map
    const inDegree = new Map<string, number>();
    nodes.forEach(node => {
      inDegree.set(node.id, 0);
    });
    
    // Calculate in-degrees
    dependencyGraph.forEach((deps, nodeId) => {
      deps.forEach(depId => {
        inDegree.set(depId, (inDegree.get(depId) || 0) + 1);
      });
    });
    
    // Also consider explicit edges
    edges.forEach(edge => {
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    });
    
    // Priority queue: process nodes by strict category order
    // Order: 1. triggers → 2. data sources (read) → 3. transformations (AI, logic) → 4. actions (email, slack, CRM)
    const categoryPriority: Record<NodeCategory, number> = {
      [NodeCategory.TRIGGER]: 0,      // 1. Triggers first
      [NodeCategory.PRODUCER]: 1,     // 2. Data sources (read) second
      [NodeCategory.TRANSFORMER]: 2,  // 3. Transformations (AI, logic) third
      [NodeCategory.CONDITION]: 2,    // 3. Conditions (logic) - same priority as transformer
      [NodeCategory.OUTPUT]: 3,       // 4. Actions (email, slack, CRM) last
    };
    
    // Find nodes with no dependencies
    const queue: Array<{ nodeId: string; priority: number }> = [];
    nodes.forEach(node => {
      const degree = inDegree.get(node.id) || 0;
      if (degree === 0) {
        const category = categories.get(node.id) || NodeCategory.TRANSFORMER;
        queue.push({
          nodeId: node.id,
          priority: categoryPriority[category],
        });
      }
    });
    
    // Sort queue by category priority
    queue.sort((a, b) => a.priority - b.priority);
    
    const sorted: WorkflowNode[] = [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    // Process queue
    while (queue.length > 0) {
      // Get node with highest priority (lowest number)
      const { nodeId } = queue.shift()!;
      const node = nodeMap.get(nodeId);
      if (!node) continue;
      
      sorted.push(node);
      
      // Update in-degrees of dependent nodes
      const deps = dependencyGraph.get(nodeId) || [];
      deps.forEach(depId => {
        const currentDegree = inDegree.get(depId) || 0;
        inDegree.set(depId, currentDegree - 1);
        
        if (inDegree.get(depId) === 0) {
          const category = categories.get(depId) || NodeCategory.TRANSFORMER;
          queue.push({
            nodeId: depId,
            priority: categoryPriority[category],
          });
          // Re-sort queue to maintain priority order
          queue.sort((a, b) => a.priority - b.priority);
        }
      });
      
      // Also update explicit edges
      edges.forEach(edge => {
        if (edge.source === nodeId) {
          const currentDegree = inDegree.get(edge.target) || 0;
          inDegree.set(edge.target, currentDegree - 1);
          
          if (inDegree.get(edge.target) === 0) {
            const category = categories.get(edge.target) || NodeCategory.TRANSFORMER;
            queue.push({
              nodeId: edge.target,
              priority: categoryPriority[category],
            });
            queue.sort((a, b) => a.priority - b.priority);
          }
        }
      });
    }
    
    // Add any remaining nodes (shouldn't happen in valid DAG, but handle gracefully)
    const remaining = nodes.filter(node => !sorted.some(s => s.id === node.id));
    if (remaining.length > 0) {
      console.warn(`[ExecutionOrderEnforcer] ⚠️  ${remaining.length} nodes not included in topological sort (possible cycle)`);
      // Add remaining nodes in category order
      remaining.sort((a, b) => {
        const catA = categories.get(a.id) || NodeCategory.TRANSFORMER;
        const catB = categories.get(b.id) || NodeCategory.TRANSFORMER;
        return categoryPriority[catA] - categoryPriority[catB];
      });
      sorted.push(...remaining);
    }
    
    return sorted;
  }
  
  /**
   * Rebuild edges based on new node order
   */
  private rebuildEdges(sortedNodes: WorkflowNode[], originalEdges: WorkflowEdge[]): WorkflowEdge[] {
    const nodeIds = new Set(sortedNodes.map(n => n.id));
    const nodeMap = new Map(sortedNodes.map(n => [n.id, n]));
    
    // Filter edges to only include nodes in sorted list
    const validEdges = originalEdges.filter(edge => 
      nodeIds.has(edge.source) && nodeIds.has(edge.target)
    );
    
    // Rebuild edges to maintain connections
    // Since nodes are topologically sorted, edges should already be in correct order
    const rebuiltEdges: WorkflowEdge[] = [];
    
    // ✅ FIXED: Remove sequential connection fallback
    // Only keep existing edges - do not create implicit edges
    // If compatible handles not found → workflow invalid (no fallback)
    for (const edge of validEdges) {
      rebuiltEdges.push(edge);
    }
    
    // ✅ FIXED: All valid edges are already added above
    // No need to add remaining edges - they're already included
    
    return rebuiltEdges;
  }
  
  // ✅ REMOVED: shouldConnectSequentially - no sequential connection fallback
  // Edge creation must ONLY use schema-defined handles
  // If compatible handles not found → workflow invalid
  
  /**
   * Check if workflow was reordered
   */
  private wasReordered(originalNodes: WorkflowNode[], sortedNodes: WorkflowNode[]): boolean {
    if (originalNodes.length !== sortedNodes.length) {
      return true;
    }
    
    for (let i = 0; i < originalNodes.length; i++) {
      if (originalNodes[i].id !== sortedNodes[i].id) {
        return true;
      }
    }
    
    return false;
  }
}

// Export singleton instance
export const executionOrderEnforcer = new ExecutionOrderEnforcer();

// Export convenience function
export function enforceExecutionOrder(nodes: WorkflowNode[], edges: WorkflowEdge[]): ExecutionOrderResult {
  return executionOrderEnforcer.enforceOrdering(nodes, edges);
}
