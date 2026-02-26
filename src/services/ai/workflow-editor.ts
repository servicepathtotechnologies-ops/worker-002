// AI Workflow Editor
// In-workflow intelligence with node suggestions and code assist

import { ollamaOrchestrator } from './ollama-orchestrator';

interface WorkflowNode {
  id: string;
  type: string;
  data: {
    label: string;
    type: string;
    category: string;
    config: Record<string, unknown>;
  };
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
}

interface Workflow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata?: any;
}

interface NodeSuggestion {
  type: string;
  reason: string;
  confidence: number;
  impact: string;
}

interface NodeImprovement {
  suggestions: NodeSuggestion[];
  alternatives: any[];
  optimizations: any[];
  warnings: string[];
}

export class AIWorkflowEditor {
  async suggestNodeImprovements(
    workflow: Workflow,
    currentNode: WorkflowNode
  ): Promise<NodeImprovement> {
    const analysis = await this.analyzeNodeContext(workflow, currentNode);
    
    return {
      suggestions: await this.generateSuggestions(analysis, currentNode),
      alternatives: await this.findAlternativeNodes(currentNode, workflow),
      optimizations: await this.suggestOptimizations(currentNode, workflow),
      warnings: this.identifyPotentialIssues(currentNode, workflow),
    };
  }

  async replaceNode(
    workflow: Workflow,
    nodeId: string,
    replacementType: string
  ): Promise<{
    success: boolean;
    newNode?: any;
    impactAnalysis?: any;
    migrationSteps?: string[];
    errors?: string[];
    suggestions?: string[];
  }> {
    const node = workflow.nodes.find(n => n.id === nodeId);
    if (!node) {
      return {
        success: false,
        errors: ['Node not found'],
      };
    }
    
    const context = this.extractNodeContext(workflow, nodeId);
    
    // Generate new node configuration
    const newConfig = await this.generateNodeConfig(replacementType, context);
    
    // Validate the replacement
    const validation = await this.validateReplacement(workflow, nodeId, newConfig);
    
    if (validation.valid) {
      return {
        success: true,
        newNode: newConfig,
        impactAnalysis: validation.impact,
        migrationSteps: validation.migrationSteps,
      };
    }
    
    return {
      success: false,
      errors: validation.errors,
      suggestions: validation.suggestions,
    };
  }

  async realTimeCodeAssist(
    node: WorkflowNode,
    code: string,
    language: string
  ): Promise<{
    completions: string[];
    corrections: any[];
    optimizations: any[];
    documentation: string;
  }> {
    const context = {
      nodeType: node.type,
      nodeConfig: node.data.config,
      existingCode: code,
      language,
    };
    
    try {
      const result = await ollamaOrchestrator.processRequest('code-assistance', {
        prompt: `Provide code assistance for ${language} in this context: ${JSON.stringify(context, null, 2)}`,
        model: 'qwen2.5-coder:7b',
        temperature: 0.2,
      });
      
      // Parse AI response
      const parsed = typeof result === 'string' ? this.parseCodeAssistResponse(result) : result;
      
      return {
        completions: parsed.completions || [],
        corrections: parsed.corrections || [],
        optimizations: parsed.optimizations || [],
        documentation: parsed.documentation || '',
      };
    } catch (error) {
      console.error('Error in code assist:', error);
      return {
        completions: [],
        corrections: [],
        optimizations: [],
        documentation: '',
      };
    }
  }

  private async analyzeNodeContext(
    workflow: Workflow,
    node: WorkflowNode
  ): Promise<any> {
    // Analyze surrounding nodes and connections
    const incomingEdges = workflow.edges.filter(e => e.target === node.id);
    const outgoingEdges = workflow.edges.filter(e => e.source === node.id);
    
    const inputNodes = incomingEdges.map(e => 
      workflow.nodes.find(n => n.id === e.source)
    ).filter(Boolean);
    
    const outputNodes = outgoingEdges.map(e => 
      workflow.nodes.find(n => n.id === e.target)
    ).filter(Boolean);
    
    return {
      node,
      inputNodes: inputNodes.map(n => ({ type: n!.type, label: n!.data.label })),
      outputNodes: outputNodes.map(n => ({ type: n!.type, label: n!.data.label })),
      workflowSize: workflow.nodes.length,
      nodeCategory: node.data.category,
    };
  }

  private async generateSuggestions(
    analysis: any,
    currentNode: WorkflowNode
  ): Promise<NodeSuggestion[]> {
    const prompt = `Analyze this workflow node and suggest improvements:
Current Node: ${currentNode.data.label} (${currentNode.type})
Category: ${currentNode.data.category}
Input Nodes: ${analysis.inputNodes.map((n: any) => n.type).join(', ')}
Output Nodes: ${analysis.outputNodes.map((n: any) => n.type).join(', ')}

Suggest 3-5 improvements or alternative approaches. Respond with JSON:
{
  "suggestions": [
    {
      "type": "add_node|replace_node|optimize",
      "reason": "...",
      "confidence": 0.0-1.0,
      "impact": "..."
    }
  ]
}`;
    
    try {
      const result = await ollamaOrchestrator.processRequest('node-suggestion', {
        prompt,
        temperature: 0.5,
      });
      
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      return parsed.suggestions || [];
    } catch (error) {
      console.error('Error generating suggestions:', error);
      return [];
    }
  }

  private async findAlternativeNodes(
    currentNode: WorkflowNode,
    workflow: Workflow
  ): Promise<any[]> {
    // Find nodes that could replace the current node
    const alternatives: any[] = [];
    
    // Simple heuristic: find nodes in same category
    const sameCategoryNodes = workflow.nodes.filter(
      n => n.data.category === currentNode.data.category && n.id !== currentNode.id
    );
    
    alternatives.push(...sameCategoryNodes.map(n => ({
      node: n,
      reason: 'Same category',
      compatibility: this.checkCompatibility(currentNode, n),
    })));
    
    return alternatives.slice(0, 5);
  }

  private async suggestOptimizations(
    node: WorkflowNode,
    workflow: Workflow
  ): Promise<any[]> {
    const optimizations: any[] = [];
    
    // Check for common optimization patterns
    if (node.type === 'http_request') {
      optimizations.push({
        type: 'caching',
        suggestion: 'Consider adding caching for repeated requests',
        impact: 'high',
      });
    }
    
    if (node.type === 'javascript' || node.type === 'code') {
      optimizations.push({
        type: 'performance',
        suggestion: 'Review code for performance bottlenecks',
        impact: 'medium',
      });
    }
    
    return optimizations;
  }

  private identifyPotentialIssues(
    node: WorkflowNode,
    workflow: Workflow
  ): string[] {
    const warnings: string[] = [];
    
    // Check for common issues
    const incomingEdges = workflow.edges.filter(e => e.target === node.id);
    if (incomingEdges.length === 0 && node.type !== 'trigger') {
      warnings.push('Node has no input connections');
    }
    
    const outgoingEdges = workflow.edges.filter(e => e.source === node.id);
    if (outgoingEdges.length === 0) {
      warnings.push('Node has no output connections');
    }
    
    // Check for error handling
    if (node.type === 'http_request' && !workflow.nodes.some(n => 
      n.type === 'error_handler' && workflow.edges.some(e => 
        e.source === node.id && e.target === n.id
      )
    )) {
      warnings.push('HTTP request node lacks error handling');
    }
    
    return warnings;
  }

  private extractNodeContext(workflow: Workflow, nodeId: string): any {
    const node = workflow.nodes.find(n => n.id === nodeId);
    if (!node) return {};
    
    const incomingEdges = workflow.edges.filter(e => e.target === nodeId);
    const outgoingEdges = workflow.edges.filter(e => e.source === nodeId);
    
    return {
      node,
      inputs: incomingEdges.map(e => ({
        source: workflow.nodes.find(n => n.id === e.source),
        edge: e,
      })),
      outputs: outgoingEdges.map(e => ({
        target: workflow.nodes.find(n => n.id === e.target),
        edge: e,
      })),
      workflowContext: {
        totalNodes: workflow.nodes.length,
        categories: [...new Set(workflow.nodes.map(n => n.data.category))],
      },
    };
  }

  private async generateNodeConfig(
    replacementType: string,
    context: any
  ): Promise<any> {
    const prompt = `Generate configuration for a ${replacementType} node to replace the current node.
Context: ${JSON.stringify(context, null, 2)}

Provide a JSON configuration object with appropriate fields for this node type.`;
    
    try {
      const result = await ollamaOrchestrator.processRequest('code-generation', {
        prompt,
        temperature: 0.3,
      });
      
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      return {
        type: replacementType,
        data: {
          type: replacementType,
          label: replacementType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          config: parsed.config || parsed,
        },
      };
    } catch (error) {
      console.error('Error generating node config:', error);
      return {
        type: replacementType,
        data: {
          type: replacementType,
          label: replacementType,
          config: {},
        },
      };
    }
  }

  private async validateReplacement(
    workflow: Workflow,
    nodeId: string,
    newConfig: any
  ): Promise<{
    valid: boolean;
    impact?: any;
    migrationSteps?: string[];
    errors?: string[];
    suggestions?: string[];
  }> {
    const errors: string[] = [];
    const suggestions: string[] = [];
    
    // Basic validation
    if (!newConfig.type) {
      errors.push('New node type is required');
    }
    
    // Check compatibility with connections
    const node = workflow.nodes.find(n => n.id === nodeId);
    if (node) {
      const incomingEdges = workflow.edges.filter(e => e.target === nodeId);
      const outgoingEdges = workflow.edges.filter(e => e.source === nodeId);
      
      if (incomingEdges.length > 0) {
        suggestions.push(`Review ${incomingEdges.length} incoming connection(s)`);
      }
      
      if (outgoingEdges.length > 0) {
        suggestions.push(`Review ${outgoingEdges.length} outgoing connection(s)`);
      }
    }
    
    return {
      valid: errors.length === 0,
      impact: {
        affectedNodes: workflow.edges.filter(e => 
          e.source === nodeId || e.target === nodeId
        ).length,
        connections: workflow.edges.filter(e => 
          e.source === nodeId || e.target === nodeId
        ).length,
      },
      migrationSteps: [
        '1. Backup current workflow',
        '2. Replace node configuration',
        '3. Verify connections',
        '4. Test workflow execution',
      ],
      errors: errors.length > 0 ? errors : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  private checkCompatibility(node1: WorkflowNode, node2: WorkflowNode): 'high' | 'medium' | 'low' {
    if (node1.data.category === node2.data.category) {
      return 'high';
    }
    if (node1.type === node2.type) {
      return 'high';
    }
    return 'medium';
  }

  private parseCodeAssistResponse(response: string): any {
    try {
      // Try to parse as JSON first
      return JSON.parse(response);
    } catch {
      // If not JSON, try to extract structured information
      const completions: string[] = [];
      const corrections: any[] = [];
      const optimizations: any[] = [];
      
      // Simple pattern matching (can be enhanced)
      const completionMatches = response.match(/completion[s]?:?\s*(.+?)(?:\n|$)/gi);
      if (completionMatches) {
        completionMatches.forEach(match => {
          const content = match.replace(/completion[s]?:?\s*/i, '').trim();
          if (content) completions.push(content);
        });
      }
      
      return {
        completions,
        corrections,
        optimizations,
        documentation: response,
      };
    }
  }
}

// Export singleton instance
export const aiWorkflowEditor = new AIWorkflowEditor();
