/**
 * Universal Node AI Context
 * 
 * ✅ ROOT-LEVEL ARCHITECTURE: Provides AI context understanding for ALL nodes
 * Every node has access to AI for auto-generating text fields
 */

import { WorkflowNode, Workflow } from '../../core/types/ai-types';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { nodeLibrary } from '../nodes/node-library';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { ollamaOrchestrator } from './ollama-orchestrator';
import { aiFieldDetector } from './ai-field-detector';

export interface NodeAIContext {
  nodeType: string;
  nodeLabel: string;
  nodePurpose: string;
  previousNodeOutputs: Record<string, any>;
  userPrompt: string;
  workflowIntent: string;
  availableData: Record<string, any>;
}

export interface AIGeneratedField {
  fieldName: string;
  generatedValue: string;
  confidence: number;
  reasoning: string;
}

/**
 * Universal Node AI Context Service
 * Provides AI context and auto-generation for all nodes
 */
export class UniversalNodeAIContext {
  /**
   * Get AI context for a node
   */
  async getNodeContext(
    node: WorkflowNode,
    workflow: Workflow,
    userPrompt: string,
    previousOutputs: Record<string, any> = {}
  ): Promise<NodeAIContext> {
    const nodeType = unifiedNormalizeNodeType(node);
    const schema = nodeLibrary.getSchema(nodeType);
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    
    // Build context
    const context: NodeAIContext = {
      nodeType,
      nodeLabel: node.data?.label || nodeType,
      nodePurpose: schema?.description || nodeDef?.description || `Process data using ${nodeType}`,
      previousNodeOutputs: previousOutputs,
      userPrompt,
      workflowIntent: userPrompt, // Can be enhanced with workflow analysis
      availableData: this.extractAvailableData(workflow, node, previousOutputs),
    };
    
    return context;
  }
  
  /**
   * Auto-generate text fields using AI
   */
  async autoGenerateTextFields(
    node: WorkflowNode,
    context: NodeAIContext,
    fieldsToGenerate: string[]
  ): Promise<Record<string, AIGeneratedField>> {
    const nodeType = unifiedNormalizeNodeType(node);
    const schema = nodeLibrary.getSchema(nodeType);
    
    if (!schema || !schema.configSchema) {
      return {};
    }
    
    const generatedFields: Record<string, AIGeneratedField> = {};
    
    // Build prompt for AI generation
    const systemPrompt = `You are an expert at generating appropriate text content for workflow automation nodes.

NODE CONTEXT:
- Node Type: ${context.nodeType}
- Node Label: ${context.nodeLabel}
- Node Purpose: ${context.nodePurpose}

USER INTENT: "${context.userPrompt}"

AVAILABLE DATA:
${JSON.stringify(context.availableData, null, 2)}

TASK: Generate appropriate text values for the following fields:
${fieldsToGenerate.map(f => `- ${f}`).join('\n')}

Return JSON object with field names as keys and generated values as strings.
Example: { "message": "Generated message text", "subject": "Generated subject" }`;

    try {
      const response = await ollamaOrchestrator.processRequest(
        'workflow-generation',
        {
          system: systemPrompt,
          message: `Generate text values for fields: ${fieldsToGenerate.join(', ')}`,
        },
        {
          temperature: 0.7,
          max_tokens: 1000,
        }
      );
      
      // Parse AI response
      let parsedResponse: Record<string, string>;
      try {
        parsedResponse = typeof response === 'string' ? JSON.parse(response) : response;
      } catch (e) {
        // If not JSON, try to extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[0]);
        } else {
          console.warn(`[UniversalNodeAIContext] Failed to parse AI response: ${response}`);
          return {};
        }
      }
      
      // Create generated field objects
      for (const fieldName of fieldsToGenerate) {
        if (parsedResponse[fieldName]) {
          generatedFields[fieldName] = {
            fieldName,
            generatedValue: parsedResponse[fieldName],
            confidence: 0.8, // Default confidence
            reasoning: `AI-generated based on node context and user intent`,
          };
        }
      }
      
      return generatedFields;
    } catch (error) {
      console.error(`[UniversalNodeAIContext] Error generating fields for ${nodeType}:`, error);
      return {};
    }
  }
  
  /**
   * Extract available data from workflow context
   */
  private extractAvailableData(
    workflow: Workflow,
    currentNode: WorkflowNode,
    previousOutputs: Record<string, any>
  ): Record<string, any> {
    const data: Record<string, any> = {};
    
    // Add previous node outputs
    Object.assign(data, previousOutputs);
    
    // Add workflow metadata
    data.workflowId = workflow.metadata?.workflowId || workflow.metadata?.id || 'unknown';
    data.workflowName = workflow.metadata?.name || 'Workflow';
    
    // Add current node config (for context)
    data.currentNodeConfig = currentNode.data?.config || {};
    
    return data;
  }
  
  /**
   * Auto-fill node with AI-generated fields
   * This is the main entry point for auto-filling a node
   */
  async autoFillNode(
    node: WorkflowNode,
    workflow: Workflow,
    userPrompt: string,
    previousOutputs: Record<string, any> = {}
  ): Promise<WorkflowNode> {
    // Get AI context
    const context = await this.getNodeContext(node, workflow, userPrompt, previousOutputs);
    
    // Detect which fields should be AI-generated
    const aiFields = aiFieldDetector.detectAIFields(node);
    const fieldsToGenerate = aiFields
      .filter(f => f.shouldAutoGenerate)
      .map(f => f.fieldName)
      .filter(fieldName => {
        // Only generate if field is empty
        const currentValue = node.data?.config?.[fieldName];
        return !currentValue || (typeof currentValue === 'string' && currentValue.trim() === '');
      });
    
    if (fieldsToGenerate.length === 0) {
      return node; // No fields to generate
    }
    
    // Generate fields using AI
    const generatedFields = await this.autoGenerateTextFields(node, context, fieldsToGenerate);
    
    // Apply generated fields to node config
    const updatedNode: WorkflowNode = {
      ...node,
      data: {
        ...(node.data || {}),
        config: {
          ...(node.data?.config || {}),
        },
      },
    };
    
    for (const [fieldName, generated] of Object.entries(generatedFields)) {
      if (updatedNode.data && updatedNode.data.config) {
        updatedNode.data.config[fieldName] = generated.generatedValue;
        console.log(`[UniversalNodeAIContext] ✅ Auto-generated ${fieldName} for ${context.nodeType}: "${generated.generatedValue.substring(0, 50)}..."`);
      }
    }
    
    return updatedNode;
  }
}

// Export singleton instance
export const universalNodeAIContext = new UniversalNodeAIContext();
