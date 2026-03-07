/**
 * Workflow Explanation Service
 * 
 * Generates structured, human-readable explanations of workflows.
 * Highlights AI assumptions, tool choices, and data flow.
 * 
 * Rules:
 * - Explain workflow in human readable format
 * - Show tool choices and reasoning
 * - Highlight AI assumptions
 * - No hallucinated steps (only use actual nodes from workflow)
 */

import { StructuredIntent } from './intent-structurer';
import { ExpandedIntent } from './intent-auto-expander';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { nodeLibrary } from '../nodes/node-library';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';

export interface WorkflowStepExplanation {
  /**
   * Step number (1-based)
   */
  step_number: number;
  
  /**
   * Node ID
   */
  node_id: string;
  
  /**
   * Node type
   */
  node_type: string;
  
  /**
   * Human-readable description of what this step does
   */
  description: string;
  
  /**
   * Tool/service used (e.g., "Google Sheets", "Gmail", "Slack")
   */
  tool_used?: string;
  
  /**
   * Reasoning for why this tool was chosen
   */
  tool_reasoning?: string;
  
  /**
   * Whether this step was an AI assumption (not explicitly in user prompt)
   */
  is_ai_assumption: boolean;
  
  /**
   * Input data sources (which nodes feed into this step)
   */
  input_sources: string[];
  
  /**
   * Output data produced by this step
   */
  output_data: string[];
}

export interface WorkflowExplanation {
  /**
   * Workflow goal (what it accomplishes)
   */
  goal: string;
  
  /**
   * Trigger type and description
   */
  trigger: {
    type: string;
    description: string;
  };
  
  /**
   * Services/integrations used in the workflow
   */
  services_used: string[];
  
  /**
   * Step-by-step explanation
   */
  steps: WorkflowStepExplanation[];
  
  /**
   * Data flow description
   */
  data_flow: {
    /**
     * High-level data flow description
     */
    description: string;
    
    /**
     * Data flow path (node IDs in order)
     */
    path: string[];
  };
  
  /**
   * AI assumptions made during workflow generation
   */
  assumptions: Array<{
    /**
     * Assumption description
     */
    assumption: string;
    
    /**
     * Why this assumption was made
     */
    reasoning: string;
    
    /**
     * Whether this assumption requires user confirmation
     */
    requires_confirmation: boolean;
  }>;
}

export class WorkflowExplanationService {
  /**
   * Generate structured workflow explanation
   */
  generateExplanation(
    structuredIntent: StructuredIntent,
    expandedIntent: ExpandedIntent | null | undefined,
    workflow: Workflow
  ): WorkflowExplanation {
    console.log(`[WorkflowExplanationService] Generating explanation for workflow with ${workflow.nodes?.length || 0} nodes`);

    // Extract goal from expanded intent or structured intent
    const goal = this.extractGoal(structuredIntent, expandedIntent);

    // Extract trigger information
    const trigger = this.extractTrigger(structuredIntent, workflow);

    // Extract services used
    const servicesUsed = this.extractServicesUsed(workflow);

    // Generate step-by-step explanation
    const steps = this.generateStepsExplanation(workflow, structuredIntent);

    // Generate data flow description
    const dataFlow = this.generateDataFlow(workflow);

    // Extract AI assumptions
    const assumptions = this.extractAssumptions(structuredIntent, expandedIntent, workflow);

    return {
      goal,
      trigger,
      services_used: servicesUsed,
      steps,
      data_flow: dataFlow,
      assumptions,
    };
  }

  /**
   * Extract workflow goal
   */
  private extractGoal(
    structuredIntent: StructuredIntent,
    expandedIntent: ExpandedIntent | null | undefined
  ): string {
    // Prefer expanded intent goal if available
    if (expandedIntent?.workflow_goal) {
      return expandedIntent.workflow_goal;
    }

    // Fallback to generating goal from structured intent
    const actions = structuredIntent.actions || [];
    if (actions.length === 0) {
      return 'Automate workflow based on user requirements';
    }

    const actionDescriptions = actions.map(action => {
      const schema = nodeLibrary.getSchema(action.type);
      const toolName = schema?.label || action.type;
      return `${action.operation} using ${toolName}`;
    });

    return `Automate workflow to ${actionDescriptions.join(', ')}`;
  }

  /**
   * Extract trigger information
   */
  private extractTrigger(
    structuredIntent: StructuredIntent,
    workflow: Workflow
  ): { type: string; description: string } {
    const triggerType = structuredIntent.trigger || 'manual_trigger';
    const triggerSchema = nodeLibrary.getSchema(triggerType);
    const triggerLabel = triggerSchema?.label || triggerType;

    // Find trigger node in workflow
    const triggerNode = workflow.nodes?.find(n => {
      const nodeType = unifiedNormalizeNodeType(n);
      return ['manual_trigger', 'schedule', 'webhook', 'form', 'chat_trigger'].includes(nodeType);
    });

    let description = `Workflow starts with ${triggerLabel}`;

    // Add specific trigger configuration details
    if (triggerType === 'schedule' && structuredIntent.trigger_config?.schedule) {
      description += ` (${structuredIntent.trigger_config.schedule})`;
    } else if (triggerType === 'schedule' && structuredIntent.trigger_config?.interval) {
      description += ` (every ${structuredIntent.trigger_config.interval})`;
    } else if (triggerType === 'form') {
      description += ' when a form is submitted';
    } else if (triggerType === 'webhook') {
      description += ' when webhook is called';
    } else if (triggerType === 'chat_trigger') {
      description += ' when user sends a chat message';
    } else {
      description += ' (manual execution)';
    }

    return {
      type: triggerType,
      description,
    };
  }

  /**
   * Extract services used in workflow
   */
  private extractServicesUsed(workflow: Workflow): string[] {
    const services = new Set<string>();

    if (!workflow.nodes) {
      return [];
    }

    workflow.nodes.forEach(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      const schema = nodeLibrary.getSchema(nodeType);

      if (schema) {
        // Extract service name from node type or schema
        const serviceName = this.getServiceName(nodeType, schema);
        if (serviceName) {
          services.add(serviceName);
        }
      }
    });

    return Array.from(services).sort();
  }

  /**
   * Get service name from node type
   */
  private getServiceName(nodeType: string, schema: any): string | null {
    // Map node types to service names
    const serviceMap: Record<string, string> = {
      'google_sheets': 'Google Sheets',
      'google_gmail': 'Gmail',
      'google_doc': 'Google Docs',
      'slack_message': 'Slack',
      'discord': 'Discord',
      'hubspot': 'HubSpot CRM',
      'airtable': 'Airtable',
      'database_read': 'Database',
      'database_write': 'Database',
      'http_request': 'HTTP API',
      'ai_agent': 'AI Agent',
      'ai_processing': 'AI Processing',
      'summarization': 'Summarization',
      'classification': 'Classification',
      'chat_model': 'Chat Model',
      'linkedin': 'LinkedIn',
      'twitter': 'Twitter',
      'instagram': 'Instagram',
      'notion': 'Notion',
      'clickup': 'ClickUp',
      'trello': 'Trello',
      'asana': 'Asana',
    };

    // Check direct mapping
    if (serviceMap[nodeType]) {
      return serviceMap[nodeType];
    }

    // Check schema label
    if (schema.label && !schema.label.toLowerCase().includes('node')) {
      return schema.label;
    }

    // Fallback to formatted node type
    const formatted = this.formatNodeTypeName(nodeType);
    return formatted || null;
  }

  /**
   * Format node type name for display
   */
  private formatNodeTypeName(nodeType: string): string {
    return nodeType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Generate step-by-step explanation
   */
  private generateStepsExplanation(
    workflow: Workflow,
    structuredIntent: StructuredIntent
  ): WorkflowStepExplanation[] {
    const steps: WorkflowStepExplanation[] = [];

    if (!workflow.nodes || !workflow.edges) {
      return steps;
    }

    // Build node dependency graph to determine execution order
    const nodeOrder = this.getNodeExecutionOrder(workflow);

    // Track which nodes were explicitly mentioned in user intent
    const intentNodeTypes = new Set<string>();
    if (structuredIntent.trigger) {
      intentNodeTypes.add(structuredIntent.trigger);
    }
    structuredIntent.actions?.forEach(action => {
      if (action.type) {
        intentNodeTypes.add(action.type);
      }
    });

    nodeOrder.forEach((nodeId, index) => {
      const node = workflow.nodes?.find(n => n.id === nodeId);
      if (!node) {
        return;
      }

      const nodeType = unifiedNormalizeNodeType(node);
      const schema = nodeLibrary.getSchema(nodeType);

      // Determine if this is an AI assumption
      const isAIAssumption = !intentNodeTypes.has(nodeType) && 
                            !['manual_trigger', 'schedule', 'webhook', 'form', 'chat_trigger'].includes(nodeType);

      // Get input sources (nodes that connect to this node)
      const inputSources = workflow.edges
        ?.filter(e => e.target === nodeId)
        .map(e => {
          const sourceNode = workflow.nodes?.find(n => n.id === e.source);
          return sourceNode ? unifiedNormalizeNodeType(sourceNode) : e.source;
        }) || [];

      // Get output data description
      const outputData = this.getOutputDataDescription(nodeType, schema);

      // Get tool used
      const toolUsed = this.getServiceName(nodeType, schema);

      // Generate description
      const description = this.generateStepDescription(node, nodeType, schema, structuredIntent);

      // Generate tool reasoning
      const toolReasoning = this.generateToolReasoning(node, nodeType, schema, structuredIntent);

      steps.push({
        step_number: index + 1,
        node_id: nodeId,
        node_type: nodeType,
        description,
        tool_used: toolUsed || undefined,
        tool_reasoning: toolReasoning || undefined,
        is_ai_assumption: isAIAssumption,
        input_sources: inputSources,
        output_data: outputData,
      });
    });

    return steps;
  }

  /**
   * Get node execution order (topological sort)
   */
  private getNodeExecutionOrder(workflow: Workflow): string[] {
    if (!workflow.nodes || !workflow.edges) {
      return workflow.nodes?.map(n => n.id) || [];
    }

    // Find trigger node (node with no incoming edges)
    const triggerNode = workflow.nodes.find(node => {
      const hasIncoming = workflow.edges?.some(e => e.target === node.id);
      return !hasIncoming;
    });

    if (!triggerNode) {
      // Fallback: return nodes in order
      return workflow.nodes.map(n => n.id);
    }

    // Perform BFS from trigger to get execution order
    const order: string[] = [];
    const visited = new Set<string>();
    const queue: string[] = [triggerNode.id];

    while (queue.length > 0) {
      const currentNodeId = queue.shift()!;
      if (visited.has(currentNodeId)) {
        continue;
      }

      visited.add(currentNodeId);
      order.push(currentNodeId);

      // Add outgoing nodes
      const outgoingEdges = workflow.edges?.filter(e => e.source === currentNodeId) || [];
      outgoingEdges.forEach(edge => {
        if (!visited.has(edge.target)) {
          queue.push(edge.target);
        }
      });
    }

    // Add any remaining nodes (disconnected)
    workflow.nodes.forEach(node => {
      if (!visited.has(node.id)) {
        order.push(node.id);
      }
    });

    return order;
  }

  /**
   * Generate step description
   */
  private generateStepDescription(
    node: WorkflowNode,
    nodeType: string,
    schema: any,
    structuredIntent: StructuredIntent
  ): string {
    const nodeLabel = node.data?.label || schema?.label || nodeType;
    const operation = this.getNodeOperation(node, nodeType, structuredIntent);

    // Build description based on node type and operation
    if (operation) {
      return `${operation} using ${nodeLabel}`;
    }

    // Default description
    return `Execute ${nodeLabel}`;
  }

  /**
   * Get node operation from config or intent
   */
  private getNodeOperation(
    node: WorkflowNode,
    nodeType: string,
    structuredIntent: StructuredIntent
  ): string | null {
    // Check node config for operation
    const config = node.data?.config || {};
    if (config.operation && typeof config.operation === 'string') {
      return this.formatOperation(config.operation);
    }

    // Check structured intent for operation
    const intentAction = structuredIntent.actions?.find(a => a.type === nodeType);
    if (intentAction?.operation) {
      return this.formatOperation(intentAction.operation);
    }

    // Infer operation from node type
    return this.inferOperation(nodeType);
  }

  /**
   * Format operation name
   */
  private formatOperation(operation: string): string {
    const operationMap: Record<string, string> = {
      'read': 'Read data from',
      'write': 'Write data to',
      'create': 'Create record in',
      'update': 'Update record in',
      'delete': 'Delete record from',
      'send': 'Send message via',
      'post': 'Post to',
      'get': 'Get data from',
      'search': 'Search in',
    };

    return operationMap[operation.toLowerCase()] || `${operation} in`;
  }

  /**
   * Infer operation from node type
   */
  private inferOperation(nodeType: string): string | null {
    // Data source nodes
    if (['google_sheets', 'database_read', 'airtable'].includes(nodeType)) {
      return 'Read data from';
    }

    // Output nodes
    if (['google_gmail', 'slack_message', 'discord', 'email'].includes(nodeType)) {
      return 'Send message via';
    }

    // Social media nodes
    if (['linkedin', 'twitter', 'instagram'].includes(nodeType)) {
      return 'Post to';
    }

    // AI nodes
    if (['ai_agent', 'ollama', 'openai_gpt', 'anthropic_claude', 'google_gemini', 'chat_model'].includes(nodeType)) {
      return 'Process with';
    }

    return null;
  }

  /**
   * Generate tool reasoning
   */
  private generateToolReasoning(
    node: WorkflowNode,
    nodeType: string,
    schema: any,
    structuredIntent: StructuredIntent
  ): string | null {
    const intentAction = structuredIntent.actions?.find(a => a.type === nodeType);
    
    if (intentAction) {
      // Tool was explicitly mentioned in intent
      return `Selected because it was explicitly requested in the user's prompt`;
    }

    // Check if tool matches user's requirements
    const schemaDescription = schema?.description || '';
    const aiSelectionCriteria = schema?.aiSelectionCriteria || '';

    if (aiSelectionCriteria) {
      return `Selected based on: ${aiSelectionCriteria}`;
    }

    if (schemaDescription) {
      return `Selected because: ${schemaDescription}`;
    }

    return null;
  }

  /**
   * Get output data description
   */
  private getOutputDataDescription(nodeType: string, schema: any): string[] {
    const outputs: string[] = [];

    // Check schema for output fields
    if (schema?.outputs) {
      outputs.push(...schema.outputs);
    }

    // Add node-type-specific outputs
    if (nodeType === 'google_sheets') {
      outputs.push('rows', 'data');
    } else if (nodeType === 'ai_agent' || ['ollama', 'openai_gpt', 'anthropic_claude', 'google_gemini'].includes(nodeType)) {
      outputs.push('response_text', 'response_json');
    } else if (nodeType === 'database_read') {
      outputs.push('records', 'data');
    } else if (['google_gmail', 'slack_message', 'email'].includes(nodeType)) {
      outputs.push('message_sent', 'status');
    } else {
      outputs.push('output');
    }

    return outputs;
  }

  /**
   * Generate data flow description
   */
  private generateDataFlow(workflow: Workflow): {
    description: string;
    path: string[];
  } {
    if (!workflow.nodes || !workflow.edges) {
      return {
        description: 'No data flow (workflow has no nodes or edges)',
        path: [],
      };
    }

    // Get execution order
    const nodeOrder = this.getNodeExecutionOrder(workflow);
    const path = nodeOrder;

    // Generate description
    const nodeDescriptions = nodeOrder.map(nodeId => {
      const node = workflow.nodes?.find(n => n.id === nodeId);
      if (!node) {
        return nodeId;
      }
      const nodeType = unifiedNormalizeNodeType(node);
      const schema = nodeLibrary.getSchema(nodeType);
      return schema?.label || nodeType;
    });

    const description = `Data flows sequentially: ${nodeDescriptions.join(' → ')}`;

    return {
      description,
      path,
    };
  }

  /**
   * Extract AI assumptions
   */
  private extractAssumptions(
    structuredIntent: StructuredIntent,
    expandedIntent: ExpandedIntent | null | undefined,
    workflow: Workflow
  ): Array<{ assumption: string; reasoning: string; requires_confirmation: boolean }> {
    const assumptions: Array<{ assumption: string; reasoning: string; requires_confirmation: boolean }> = [];

    // ✅ CRITICAL: Use assumptions from expanded intent if available
    // These are deterministic assumptions from industry templates
    if (expandedIntent?.assumptions && expandedIntent.assumptions.length > 0) {
      console.log(`[WorkflowExplanation] Using ${expandedIntent.assumptions.length} assumptions from expanded intent`);
      assumptions.push(...expandedIntent.assumptions);
    }

    // Track which nodes were in user intent
    const intentNodeTypes = new Set<string>();
    if (structuredIntent.trigger) {
      intentNodeTypes.add(structuredIntent.trigger);
    }
    structuredIntent.actions?.forEach(action => {
      if (action.type) {
        intentNodeTypes.add(action.type);
      }
    });

    // Check for AI-assumed nodes (only if not already covered by expanded intent assumptions)
    workflow.nodes?.forEach(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      
      // Skip trigger nodes (they're usually explicit or have defaults)
      if (['manual_trigger', 'schedule', 'webhook', 'form', 'chat_trigger'].includes(nodeType)) {
        return;
      }

      if (!intentNodeTypes.has(nodeType)) {
        // Check if this assumption is already covered by expanded intent
        const alreadyCovered = assumptions.some(a => 
          a.assumption.toLowerCase().includes(nodeType.toLowerCase()) ||
          a.assumption.toLowerCase().includes(this.formatServiceName(nodeType).toLowerCase())
        );

        if (!alreadyCovered) {
          const schema = nodeLibrary.getSchema(nodeType);
          const nodeLabel = schema?.label || nodeType;
          
          assumptions.push({
            assumption: `Added ${nodeLabel} node (${nodeType})`,
            reasoning: `This node was added to complete the workflow, but was not explicitly mentioned in your prompt`,
            requires_confirmation: true,
          });
        }
      }
    });

    // Check for assumed trigger (only if not already in assumptions)
    if (structuredIntent.trigger === 'manual_trigger' && 
        !structuredIntent.actions?.some(a => a.type === 'manual_trigger')) {
      // Manual trigger was assumed (default)
      // Only add if user didn't specify a trigger
      const hasExplicitTrigger = structuredIntent.trigger_config && 
                                 Object.keys(structuredIntent.trigger_config).length > 0;
      
      if (!hasExplicitTrigger) {
        assumptions.push({
          assumption: 'Manual trigger assumed (default)',
          reasoning: 'No specific trigger was mentioned, so manual trigger was used as default',
          requires_confirmation: false, // Manual trigger is a safe default
        });
      }
    }

    return assumptions;
  }

  /**
   * Format service name from node type (helper method for assumptions)
   */
  private formatServiceName(nodeType: string): string {
    // Common mappings
    const mappings: Record<string, string> = {
      'google_sheets': 'Google Sheets',
      'google_gmail': 'Gmail',
      'google_doc': 'Google Docs',
      'slack_message': 'Slack',
      'hubspot': 'HubSpot CRM',
      'airtable': 'Airtable',
      'database_read': 'Database',
      'database_write': 'Database',
      'http_request': 'HTTP API',
      'ai_processing': 'AI Processing',
      'summarization': 'Summarization',
      'classification': 'Classification',
      'if_else': 'Conditional Logic',
      'loop': 'Loop',
      'set_variable': 'Data Extraction',
    };

    // Check exact match first
    if (mappings[nodeType]) {
      return mappings[nodeType];
    }

    // Format node type (e.g., "zoho_crm" → "Zoho CRM")
    return nodeType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

export const workflowExplanationService = new WorkflowExplanationService();
