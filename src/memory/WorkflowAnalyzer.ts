/**
 * Workflow Analyzer - Analyzes workflow structure and provides insights
 */

import {
  WorkflowDefinition,
  WorkflowAnalysis,
  Suggestion,
} from './types';

/**
 * Workflow Analyzer - Analyzes workflows for complexity, issues, and optimizations
 */
export class WorkflowAnalyzer {
  /**
   * Analyze workflow definition
   */
  analyze(workflowDefinition: WorkflowDefinition): WorkflowAnalysis {
    return {
      complexity: this.calculateComplexity(workflowDefinition),
      dependencies: this.extractDependencies(workflowDefinition),
      resourceEstimate: this.estimateResources(workflowDefinition),
      potentialIssues: this.identifyIssues(workflowDefinition),
      optimizationSuggestions: this.suggestOptimizations(workflowDefinition),
    };
  }

  /**
   * Calculate workflow complexity
   */
  private calculateComplexity(workflowDefinition: WorkflowDefinition): {
    score: number;
    nodeCount: number;
    edgeCount: number;
    depth: number;
    branchingFactor: number;
  } {
    const nodes = workflowDefinition.nodes || [];
    const edges = workflowDefinition.edges || [];
    const nodeCount = nodes.length;
    const edgeCount = edges.length;

    // Calculate depth (longest path from start to end)
    const depth = this.calculateDepth(nodes, edges);

    // Calculate branching factor (average number of outgoing edges per node)
    const nodeOutgoingEdges = new Map<string, number>();
    edges.forEach(edge => {
      const count = nodeOutgoingEdges.get(edge.source) || 0;
      nodeOutgoingEdges.set(edge.source, count + 1);
    });
    const branchingFactor =
      nodeOutgoingEdges.size > 0
        ? Array.from(nodeOutgoingEdges.values()).reduce((a, b) => a + b, 0) /
          nodeOutgoingEdges.size
        : 0;

    // Complexity score (weighted combination)
    const score =
      nodeCount * 0.3 + depth * 0.3 + branchingFactor * 10 + edgeCount * 0.2;

    return {
      score: Math.round(score * 100) / 100,
      nodeCount,
      edgeCount,
      depth,
      branchingFactor: Math.round(branchingFactor * 100) / 100,
    };
  }

  /**
   * Calculate workflow depth (longest path)
   */
  private calculateDepth(nodes: any[], edges: any[]): number {
    if (nodes.length === 0) return 0;

    // Build adjacency list
    const graph = new Map<string, string[]>();
    nodes.forEach(node => {
      graph.set(node.id, []);
    });
    edges.forEach(edge => {
      const neighbors = graph.get(edge.source) || [];
      neighbors.push(edge.target);
      graph.set(edge.source, neighbors);
    });

    // Find start nodes (nodes with no incoming edges)
    const hasIncoming = new Set<string>();
    edges.forEach(edge => {
      hasIncoming.add(edge.target);
    });
    const startNodes = nodes.filter(node => !hasIncoming.has(node.id));

    if (startNodes.length === 0) {
      // If no clear start, use first node
      return nodes.length > 0 ? 1 : 0;
    }

    // BFS to find longest path
    let maxDepth = 0;
    for (const startNode of startNodes) {
      const depth = this.bfsDepth(startNode.id, graph);
      maxDepth = Math.max(maxDepth, depth);
    }

    return maxDepth;
  }

  /**
   * BFS to calculate depth from a start node
   */
  private bfsDepth(startId: string, graph: Map<string, string[]>): number {
    const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 1 }];
    const visited = new Set<string>();
    let maxDepth = 1;

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      maxDepth = Math.max(maxDepth, depth);

      const neighbors = graph.get(id) || [];
      neighbors.forEach(neighborId => {
        if (!visited.has(neighborId)) {
          queue.push({ id: neighborId, depth: depth + 1 });
        }
      });
    }

    return maxDepth;
  }

  /**
   * Extract dependencies from workflow
   */
  private extractDependencies(workflowDefinition: WorkflowDefinition): {
    nodeTypes: string[];
    externalServices: string[];
    credentials: string[];
  } {
    const nodes = workflowDefinition.nodes || [];
    const nodeTypes = new Set<string>();
    const externalServices = new Set<string>();
    const credentials = new Set<string>();

    nodes.forEach((node: any) => {
      const nodeType = node.type || node.data?.type;
      if (nodeType) {
        nodeTypes.add(nodeType);

        // Identify external services based on node type
        if (nodeType.includes('http') || nodeType.includes('api')) {
          externalServices.add('http');
        }
        if (nodeType.includes('database') || nodeType === 'supabase') {
          externalServices.add('database');
        }
        if (nodeType.includes('google') || nodeType.includes('gmail')) {
          externalServices.add('google');
        }
        if (nodeType.includes('slack') || nodeType.includes('discord')) {
          externalServices.add('messaging');
        }

        // Extract credentials from node config
        const config = node.data?.config || node.config || {};
        if (config.credentials) {
          credentials.add(config.credentials);
        }
        if (config.apiKey) {
          credentials.add('api_key');
        }
        if (config.oauth) {
          credentials.add('oauth');
        }
      }
    });

    return {
      nodeTypes: Array.from(nodeTypes),
      externalServices: Array.from(externalServices),
      credentials: Array.from(credentials),
    };
  }

  /**
   * Estimate resource requirements
   */
  private estimateResources(workflowDefinition: WorkflowDefinition): {
    memoryMB: number;
    executionTimeMs: number;
    costEstimate?: number;
  } {
    const nodes = workflowDefinition.nodes || [];
    const nodeCount = nodes.length;

    // Base estimates
    const baseMemoryPerNode = 5; // MB
    const baseTimePerNode = 100; // ms

    // Adjust based on node types
    let memoryMultiplier = 1;
    let timeMultiplier = 1;

    nodes.forEach((node: any) => {
      const nodeType = node.type || node.data?.type;
      if (nodeType === 'javascript' || nodeType === 'code') {
        memoryMultiplier += 0.2; // Code execution uses more memory
        timeMultiplier += 0.5; // Code execution takes longer
      }
      if (nodeType?.includes('http') || nodeType?.includes('api')) {
        timeMultiplier += 0.3; // Network calls take time
      }
      if (nodeType?.includes('database')) {
        memoryMultiplier += 0.1;
        timeMultiplier += 0.2;
      }
    });

    const memoryMB = Math.ceil(nodeCount * baseMemoryPerNode * memoryMultiplier);
    const executionTimeMs = Math.ceil(nodeCount * baseTimePerNode * timeMultiplier);

    return {
      memoryMB,
      executionTimeMs,
    };
  }

  /**
   * Identify potential issues
   */
  private identifyIssues(workflowDefinition: WorkflowDefinition): Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
    nodeId?: string;
  }> {
    const issues: Array<{
      type: string;
      severity: 'low' | 'medium' | 'high';
      message: string;
      nodeId?: string;
    }> = [];

    const nodes = workflowDefinition.nodes || [];
    const edges = workflowDefinition.edges || [];

    // Check for nodes without connections
    const connectedNodes = new Set<string>();
    edges.forEach(edge => {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    });
    nodes.forEach(node => {
      if (!connectedNodes.has(node.id)) {
        issues.push({
          type: 'disconnected_node',
          severity: 'medium',
          message: `Node "${node.data?.label || node.id}" is not connected to the workflow`,
          nodeId: node.id,
        });
      }
    });

    // Check for cycles (simplified - would need proper cycle detection)
    // Check for too many nodes
    if (nodes.length > 100) {
      issues.push({
        type: 'complexity',
        severity: 'medium',
        message: 'Workflow has many nodes. Consider breaking into smaller workflows.',
      });
    }

    // Check for error handling
    const hasErrorHandler = nodes.some(
      (node: any) =>
        (node.type || node.data?.type) === 'error_handler' ||
        (node.type || node.data?.type) === 'error_trigger'
    );
    if (!hasErrorHandler && nodes.length > 5) {
      issues.push({
        type: 'error_handling',
        severity: 'low',
        message: 'Consider adding error handling nodes for better reliability.',
      });
    }

    return issues;
  }

  /**
   * Suggest optimizations
   */
  private suggestOptimizations(workflowDefinition: WorkflowDefinition): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const nodes = workflowDefinition.nodes || [];

    // Check for duplicate operations
    const nodeTypes = new Map<string, number>();
    nodes.forEach((node: any) => {
      const nodeType = node.type || node.data?.type;
      if (nodeType) {
        nodeTypes.set(nodeType, (nodeTypes.get(nodeType) || 0) + 1);
      }
    });

    nodeTypes.forEach((count, nodeType) => {
      if (count > 3) {
        suggestions.push({
          type: 'optimization',
          message: `Multiple ${nodeType} nodes detected. Consider batching operations.`,
          priority: 'medium',
        });
      }
    });

    // Check for inefficient patterns
    const hasLoop = nodes.some(
      (node: any) => (node.type || node.data?.type) === 'loop'
    );
    const hasHttp = nodes.some(
      (node: any) =>
        (node.type || node.data?.type)?.includes('http') ||
        (node.type || node.data?.type) === 'http_request'
    );

    if (hasLoop && hasHttp) {
      suggestions.push({
        type: 'optimization',
        message:
          'HTTP requests in loops can be slow. Consider using batch operations or parallel execution.',
        priority: 'high',
      });
    }

    return suggestions;
  }
}
