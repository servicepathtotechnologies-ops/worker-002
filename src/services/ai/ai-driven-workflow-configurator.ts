/**
 * ✅ ROOT-LEVEL: AI-Driven Workflow Configurator
 * 
 * This REPLACES all fragmented node configuration logic:
 * - generateRequiredInputFields
 * - configureNodes
 * - input-field-mapper
 * - intelligent-config-filler
 * - node-auto-configurator
 * 
 * Architecture:
 * - AI analyzes ALL nodes comprehensively
 * - AI generates configs based on understanding
 * - AI maps fields semantically
 * - AI understands data flow
 * 
 * This ensures:
 * - No hardcoded logic
 * - No switch statements
 * - No rule-based matching
 * - AI handles EVERYTHING
 */

import { WorkflowNode } from '../../core/types/ai-types';
import { comprehensiveAINodeAnalyzer, NodeAnalysisContext } from './comprehensive-ai-node-analyzer';
import { nodeContextRegistry } from '../../core/registry/node-context-registry';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';

export interface WorkflowConfigContext {
  nodes: WorkflowNode[];
  edges: Array<{ source: string; target: string }>;
  userPrompt: string;
  workflowIntent: string;
  requirements?: any;
}

export interface ConfiguredWorkflow {
  nodes: WorkflowNode[];
  analyses: Map<string, any>; // nodeId -> ComprehensiveNodeAnalysis
  dataFlowMap: Map<string, any>; // nodeId -> data flow analysis
}

/**
 * ✅ ROOT-LEVEL: AI-Driven Workflow Configurator
 * 
 * Replaces ALL node configuration logic with unified AI-driven system
 */
export class AIDrivenWorkflowConfigurator {
  /**
   * ✅ CORE: Configure entire workflow using AI
   * 
   * AI analyzes ALL nodes and generates configs
   */
  async configureWorkflow(context: WorkflowConfigContext): Promise<ConfiguredWorkflow> {
    const { nodes, edges, userPrompt, workflowIntent } = context;
    
    console.log(`[AIDrivenWorkflowConfigurator] 🧠 Analyzing ${nodes.length} nodes with AI...`);
    
    const analyses = new Map<string, any>();
    const configuredNodes: WorkflowNode[] = [];
    
    // Analyze each node comprehensively
    for (let i = 0; i < nodes.length; i++) {
      const currentNode = nodes[i];
      const previousNode = i > 0 ? nodes[i - 1] : null;
      const nextNode = i < nodes.length - 1 ? nodes[i + 1] : null;
      
      // Find connected nodes from edges
      const incomingEdges = edges.filter(e => e.target === currentNode.id);
      const outgoingEdges = edges.filter(e => e.source === currentNode.id);
      
      const actualPreviousNode = incomingEdges.length > 0
        ? nodes.find(n => n.id === incomingEdges[0].source) || previousNode
        : previousNode;
      
      const actualNextNode = outgoingEdges.length > 0
        ? nodes.find(n => n.id === outgoingEdges[0].target) || nextNode
        : nextNode;
      
      // Analyze node comprehensively
      const analysisContext: NodeAnalysisContext = {
        currentNode,
        previousNode: actualPreviousNode,
        nextNode: actualNextNode,
        allNodes: nodes,
        nodeIndex: i,
        userPrompt,
        workflowIntent,
        edges,
      };
      
      try {
        const analysis = await comprehensiveAINodeAnalyzer.analyzeNode(analysisContext);
        analyses.set(currentNode.id, analysis);
        
        // Apply config from analysis
        const configuredNode = this.applyConfigFromAnalysis(currentNode, analysis);
        configuredNodes.push(configuredNode);
        
        console.log(
          `[AIDrivenWorkflowConfigurator] ✅ Analyzed ${currentNode.data?.type || currentNode.type} ` +
          `(confidence: ${analysis.configAnalysis.confidence.toFixed(2)})`
        );
      } catch (error: any) {
        console.error(
          `[AIDrivenWorkflowConfigurator] ❌ Failed to analyze node ${currentNode.id}:`,
          error.message
        );
        // Continue with node as-is
        configuredNodes.push(currentNode);
      }
    }
    
    // Build data flow map
    const dataFlowMap = this.buildDataFlowMap(analyses, edges);
    
    console.log(`[AIDrivenWorkflowConfigurator] ✅ Configured ${configuredNodes.length} nodes`);
    
    return {
      nodes: configuredNodes,
      analyses,
      dataFlowMap,
    };
  }
  
  /**
   * Apply config from AI analysis to node
   */
  private applyConfigFromAnalysis(
    node: WorkflowNode,
    analysis: any
  ): WorkflowNode {
    const config = {
      ...(node.data?.config || {}),
      ...analysis.configAnalysis.config,
    };
    
    return {
      ...node,
      data: {
        ...node.data,
        config: {
          ...config,
          // Store analysis metadata in config
          _analysis: {
            confidence: analysis.configAnalysis.confidence,
            reasoning: analysis.configAnalysis.reasoning,
            inputAnalysis: analysis.inputAnalysis,
            outputAnalysis: analysis.outputAnalysis,
          },
        },
      },
    };
  }
  
  /**
   * Build data flow map from analyses
   */
  private buildDataFlowMap(
    analyses: Map<string, any>,
    edges: Array<{ source: string; target: string }>
  ): Map<string, any> {
    const dataFlowMap = new Map();
    
    for (const [nodeId, analysis] of analyses.entries()) {
      const outgoingEdges = edges.filter(e => e.source === nodeId);
      
      dataFlowMap.set(nodeId, {
        output: analysis.outputAnalysis,
        toNodes: outgoingEdges.map(e => ({
          targetNodeId: e.target,
          fieldMappings: analysis.outputAnalysis.nextNodeRequirements || [],
        })),
      });
    }
    
    return dataFlowMap;
  }
  
  /**
   * ✅ CORE: Generate config for single node (replaces generateRequiredInputFields)
   * 
   * This is the unified method that replaces all fragmented logic
   */
  async generateNodeConfig(
    node: WorkflowNode,
    previousNode: WorkflowNode | null,
    nextNode: WorkflowNode | null,
    allNodes: WorkflowNode[],
    nodeIndex: number,
    userPrompt: string,
    workflowIntent: string,
    edges: Array<{ source: string; target: string }>
  ): Promise<Record<string, any>> {
    const analysisContext: NodeAnalysisContext = {
      currentNode: node,
      previousNode,
      nextNode,
      allNodes,
      nodeIndex,
      userPrompt,
      workflowIntent,
      edges,
    };
    
    const analysis = await comprehensiveAINodeAnalyzer.analyzeNode(analysisContext);
    return analysis.configAnalysis.config;
  }
}

// Export singleton instance
export const aiDrivenWorkflowConfigurator = new AIDrivenWorkflowConfigurator();
