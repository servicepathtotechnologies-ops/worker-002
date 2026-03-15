/**
 * Step to Node Mapper
 * 
 * Deterministic mapping from workflow planner actions to node definitions.
 * No AI guessing - pure rule-based mapping with validation.
 * 
 * Purpose:
 * - Convert planner steps into executable node definitions
 * - Validate nodes exist in registry
 * - Generate connections between nodes
 * - Support 33+ existing integrations
 */

import { WorkflowStep, WorkflowPlan } from './workflow-planner';
import type { AllowedAction } from './workflow-planner';
import { WorkflowNode, WorkflowEdge, WorkflowGenerationStructure, WorkflowStepDefinition, OutputDefinition, InputOutputType } from '../core/types/ai-types';
import { nodeLibrary } from './nodes/node-library';
import { unifiedNodeRegistry } from '../core/registry/unified-node-registry';
import { nodeCapabilityRegistryDSL } from '../services/ai/node-capability-registry-dsl';
import { randomUUID } from 'crypto';

/**
 * ✅ UNIVERSAL: Map planner actions to node types using registry
 * Deterministic - no AI guessing, but uses registry as single source of truth
 */
function mapActionToNodeTypeFromRegistry(action: AllowedAction): string {
  const allNodeTypes = unifiedNodeRegistry.getAllTypes();
  
  // ✅ UNIVERSAL: Map actions to node types using registry capabilities
  switch (action) {
    case 'fetch_google_sheets_data':
      // Find Google Sheets node from registry
      return allNodeTypes.find(nt => nt === 'google_sheets' || nt.includes('sheets')) || 'google_sheets';
    
    case 'fetch_api_data':
      // Find HTTP request node from registry
      return allNodeTypes.find(nt => nt === 'http_request' || nt.includes('http')) || 'http_request';
    
    case 'transform_data':
      // Find JavaScript/transformation node from registry
      return allNodeTypes.find(nt => nt === 'javascript' || (unifiedNodeRegistry.get(nt)?.category === 'transformation')) || 'javascript';
    
    case 'summarize_data':
      // Find summarizer node from registry
      return allNodeTypes.find(nt => nt === 'text_summarizer' || nt.includes('summarizer')) || 'text_summarizer';
    
    case 'send_email':
      // Find email node from registry (prefer Gmail)
      return allNodeTypes.find(nt => nt === 'google_gmail' || nt.includes('gmail')) || 
             allNodeTypes.find(nt => nt === 'email' || (nodeCapabilityRegistryDSL.isOutput(nt) && (unifiedNodeRegistry.get(nt)?.tags || []).includes('email'))) || 
             'google_gmail';
    
    case 'send_slack':
      // Find Slack node from registry
      return allNodeTypes.find(nt => nt === 'slack_message' || nt.includes('slack')) || 'slack_message';
    
    case 'store_database':
      // Find database write node from registry
      return allNodeTypes.find(nt => nt === 'database_write' || (nodeCapabilityRegistryDSL.isOutput(nt) && (unifiedNodeRegistry.get(nt)?.category === 'data'))) || 'database_write';
    
    case 'condition_check':
      // Find conditional node from registry
      return allNodeTypes.find(nt => nt === 'if_else' || (unifiedNodeRegistry.get(nt)?.tags || []).includes('conditional')) || 'if_else';
    
    case 'schedule_trigger':
      // Find schedule trigger from registry
      return allNodeTypes.find(nt => nt === 'schedule' || (unifiedNodeRegistry.get(nt)?.category === 'trigger' && nt.includes('schedule'))) || 'schedule';
    
    case 'manual_trigger':
      // Find manual trigger from registry
      return allNodeTypes.find(nt => nt === 'manual_trigger' || (unifiedNodeRegistry.get(nt)?.category === 'trigger' && nt.includes('manual'))) || 'manual_trigger';
    
    case 'webhook_trigger':
      // Find webhook trigger from registry
      return allNodeTypes.find(nt => nt === 'webhook' || (unifiedNodeRegistry.get(nt)?.category === 'trigger' && nt.includes('webhook'))) || 'webhook';
    
    default:
      return 'noop';
  }
}

/**
 * Integration-specific mappings
 * Used when context suggests a specific integration
 */
const INTEGRATION_KEYWORDS: Record<string, string[]> = {
  // Email providers
  'google_gmail': ['gmail', 'google mail', 'google email'],
  'email': ['smtp', 'email', 'mail'],
  'outlook': ['outlook', 'microsoft mail'],
  
  // Databases
  'postgresql': ['postgres', 'postgresql'],
  'mysql': ['mysql'],
  'mongodb': ['mongo', 'mongodb'],
  'supabase': ['supabase'],
  'database_write': ['database', 'db', 'store'],
  'database_read': ['read database', 'query database'],
  
  // CRM
  'hubspot': ['hubspot', 'hub spot'],
  'salesforce': ['salesforce', 'sf'],
  'zoho_crm': ['zoho', 'zoho crm'],
  'pipedrive': ['pipedrive'],
  
  // Productivity
  'notion': ['notion'],
  'airtable': ['airtable'],
  'clickup': ['clickup', 'click up'],
  'google_sheets': ['sheets', 'spreadsheet', 'google sheets'],
  'google_doc': ['google doc', 'google document'],
  'google_calendar': ['calendar', 'google calendar'],
  
  // Communication
  'slack_message': ['slack'],
  'telegram': ['telegram'],
  'discord': ['discord'],
  'microsoft_teams': ['teams', 'microsoft teams'],
  
  // Social Media
  'linkedin': ['linkedin', 'linked in'],
  'twitter': ['twitter', 'x.com'],
  'instagram': ['instagram'],
  'facebook': ['facebook'],
  
  // AI/ML
  'ai_agent': ['ai agent', 'chatbot', 'assistant'],
  'text_summarizer': ['summarize', 'summary'],
  'openai_gpt': ['gpt', 'openai', 'chatgpt'],
  'anthropic_claude': ['claude', 'anthropic'],
  
  // Data Processing
  'javascript': ['transform', 'process', 'code', 'javascript'],
  'set_variable': ['set', 'variable', 'extract'],
  'json_parser': ['parse json', 'json'],
  'text_formatter': ['format', 'template'],
};

/**
 * ✅ UNIVERSAL: Map trigger type to node type using registry
 */
function mapTriggerTypeFromRegistry(triggerType: 'manual' | 'schedule' | 'event'): string {
  const allNodeTypes = unifiedNodeRegistry.getAllTypes();
  const triggerNodes = allNodeTypes.filter(nt => {
    const nodeDef = unifiedNodeRegistry.get(nt);
    return nodeDef && (nodeDef.category === 'trigger' || (nodeDef.tags || []).includes('trigger'));
  });
  
  switch (triggerType) {
    case 'manual':
      return triggerNodes.find(nt => nt.includes('manual')) || 'manual_trigger';
    case 'schedule':
      return triggerNodes.find(nt => nt === 'schedule' || nt.includes('schedule')) || 'schedule';
    case 'event':
      return triggerNodes.find(nt => nt === 'webhook' || nt.includes('webhook')) || 'webhook';
    default:
      return triggerNodes[0] || 'manual_trigger';
  }
}

/**
 * Node creation result
 */
export interface NodeMappingResult {
  nodes: WorkflowNode[];
  connections: WorkflowEdge[];
}

/**
 * Step to Node Mapper Class
 */
export class StepNodeMapper {
  /**
   * Map workflow plan to node definitions
   * 
   * @param plan - Workflow plan from planner
   * @param userPrompt - Original user prompt (for context-aware mapping)
   * @returns Node definitions with connections
   * @throws Error if any node type is invalid
   */
  mapPlanToNodes(plan: WorkflowPlan, userPrompt?: string): NodeMappingResult {
    console.log(`[StepNodeMapper] Mapping plan to nodes: ${plan.steps.length} steps`);
    
    const nodes: WorkflowNode[] = [];
    const connections: WorkflowEdge[] = [];
    const promptLower = (userPrompt || '').toLowerCase();
    
    // 1. Create trigger node - ✅ UNIVERSAL: Use registry-based mapping
    const triggerNodeType = mapTriggerTypeFromRegistry(plan.trigger_type);
    const triggerNode = this.createNode(triggerNodeType, 'trigger', 'Workflow Trigger');
    nodes.push(triggerNode);
    
    console.log(`[StepNodeMapper] Created trigger node: ${triggerNodeType}`);
    
    // 2. Map each step to a node
    let previousNodeId = triggerNode.id;
    
    plan.steps.forEach((step, index) => {
      // Get node type - support both old format (action) and new format (node_type)
      let nodeType: string;
      let stepIdentifier: string;
      
      if ('node_type' in step && step.node_type) {
        // New format: direct node type from registry
        nodeType = step.node_type;
        stepIdentifier = step.node_type;
      } else if ('action' in step && step.action) {
        // Old format: map action to node type (backward compatibility) - ✅ UNIVERSAL: Use registry
        console.warn(`[StepNodeMapper] Step ${index + 1} uses deprecated "action" format. Migrating to "node_type"...`);
        nodeType = mapActionToNodeTypeFromRegistry(step.action as any);
        stepIdentifier = step.action;
      } else {
        console.error(`[StepNodeMapper] Step ${index + 1} has neither "node_type" nor "action" field`);
        return;
      }
      
      // ✅ UNIVERSAL: Skip trigger nodes using registry (already handled)
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (nodeDef && (nodeDef.category === 'trigger' || (nodeDef.tags || []).includes('trigger'))) {
        console.log(`[StepNodeMapper] Skipping trigger node: ${nodeType}`);
        return;
      }
      
      // Validate node exists in registry
      this.validateNodeType(nodeType, stepIdentifier);
      
      // Create node
      const nodeId = `node_${index + 1}`;
      const nodeLabel = step.description || this.getDefaultLabelFromNodeType(nodeType);
      const node = this.createNode(nodeType, nodeId, nodeLabel);
      nodes.push(node);
      
      console.log(`[StepNodeMapper] Mapped step ${index + 1}: ${stepIdentifier} → ${nodeType} (${nodeId})`);
      
      // Create connection from previous node to current node
      const connection = this.createConnection(previousNodeId, nodeId);
      connections.push(connection);
      
      previousNodeId = nodeId;
    });
    
    console.log(`[StepNodeMapper] Mapping complete: ${nodes.length} nodes, ${connections.length} connections`);
    
    return { nodes, connections };
  }
  
  /**
   * ✅ UNIVERSAL: Map action to node type with context awareness using registry
   */
  private mapActionToNodeType(
    action: AllowedAction,
    promptContext: string,
    stepDescription?: string
  ): string {
    // ✅ UNIVERSAL: Get base mapping from registry
    let nodeType = mapActionToNodeTypeFromRegistry(action);
    
    // Context-aware overrides
    const context = (stepDescription || '').toLowerCase() + ' ' + promptContext;
    
    switch (action) {
      case 'send_email':
        // Check for specific email provider
        if (context.includes('gmail') || context.includes('google mail')) {
          nodeType = 'google_gmail';
        } else if (context.includes('outlook')) {
          nodeType = 'outlook';
        } else {
          // Default to Gmail
          nodeType = 'google_gmail';
        }
        break;
        
      case 'store_database':
        // Check for specific database
        if (context.includes('postgres') || context.includes('postgresql')) {
          nodeType = 'postgresql';
        } else if (context.includes('mysql')) {
          nodeType = 'mysql';
        } else if (context.includes('mongo')) {
          nodeType = 'mongodb';
        } else if (context.includes('supabase')) {
          nodeType = 'supabase';
        } else {
          // Default to database_write
          nodeType = 'database_write';
        }
        break;
        
      case 'fetch_api_data':
        // Always use http_request
        nodeType = 'http_request';
        break;
        
      case 'fetch_google_sheets_data':
        // Always use google_sheets
        nodeType = 'google_sheets';
        break;
        
      case 'summarize_data':
        // Check if AI agent is mentioned
        if (context.includes('ai agent') || context.includes('chatbot')) {
          nodeType = 'ai_agent';
        } else {
          nodeType = 'text_summarizer';
        }
        break;
        
      case 'transform_data':
        // Always use javascript
        nodeType = 'javascript';
        break;
        
      case 'send_slack':
        // Always use slack_message
        nodeType = 'slack_message';
        break;
        
      case 'condition_check':
        // Always use if_else
        nodeType = 'if_else';
        break;
    }
    
    return nodeType;
  }
  
  /**
   * Validate node type exists in registry
   * @throws Error if node type is invalid
   */
  private validateNodeType(nodeType: string, action: string): void {
    const schema = nodeLibrary.getSchema(nodeType);
    
    if (!schema) {
      // Get available nodes for better error message
      const allSchemas = nodeLibrary.getAllSchemas();
      const availableTypes = allSchemas.map(s => s.type).slice(0, 20).join(', ');
      
      throw new Error(
        `Invalid node type "${nodeType}" for action "${action}". ` +
        `Node type not found in registry. ` +
        `Available node types (sample): ${availableTypes}... ` +
        `Please check node-library.ts for valid node types.`
      );
    }
    
    console.log(`[StepNodeMapper] Validated node type: ${nodeType} (${schema.label})`);
  }
  
  /**
   * Create a workflow node
   * ✅ UNIVERSAL FIX: Nodes are created with default config from registry immediately
   */
  private createNode(
    nodeType: string,
    nodeId: string,
    label: string
  ): WorkflowNode {
    const schema = nodeLibrary.getSchema(nodeType);
    
    if (!schema) {
      throw new Error(`Cannot create node: schema not found for type "${nodeType}"`);
    }
    
    // ✅ UNIVERSAL FIX: Get default config from registry immediately
    // This ensures nodes are created with all their default values (level, message, etc.)
    let defaultConfig: Record<string, any> = {};
    try {
      const { unifiedNodeRegistry } = require('../../core/registry/unified-node-registry');
      defaultConfig = unifiedNodeRegistry.getDefaultConfig(nodeType) || {};
    } catch (error) {
      // If registry not available, use schema defaults
      if (schema.configSchema?.optional) {
        for (const [fieldName, fieldDef] of Object.entries(schema.configSchema.optional)) {
          const field = fieldDef as any;
          if (field.default !== undefined) {
            defaultConfig[fieldName] = field.default;
          }
        }
      }
    }
    
    return {
      id: nodeId,
      type: nodeType,
      position: { x: 0, y: 0 }, // Position will be set by frontend
      data: {
        label: label || schema.label,
        type: nodeType,
        category: schema.category,
        config: defaultConfig, // ✅ Created with default config from registry
      },
    };
  }
  
  /**
   * Create a workflow edge (connection)
   */
  private createConnection(
    sourceId: string,
    targetId: string,
    sourceHandle?: string,
    targetHandle?: string
  ): WorkflowEdge {
    return {
      id: `edge_${randomUUID()}`,
      source: sourceId,
      target: targetId,
      type: 'default',
      sourceHandle: sourceHandle,
      targetHandle: targetHandle,
    };
  }
  
  /**
   * Get default label for a node based on node type (new format)
   */
  private getDefaultLabelFromNodeType(nodeType: string): string {
    const schema = nodeLibrary.getSchema(nodeType);
    if (schema) {
      return schema.label;
    }
    // Fallback: format node type as label
    return nodeType.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  /**
   * Get default label for a node based on action (legacy format)
   */
  private getDefaultLabel(action: AllowedAction, nodeType: string): string {
    const schema = nodeLibrary.getSchema(nodeType);
    if (schema) {
      return schema.label;
    }
    
    // Fallback labels
    const labelMap: Record<string, string> = {
      'fetch_google_sheets_data': 'Fetch Google Sheets Data',
      'fetch_api_data': 'Fetch API Data',
      'transform_data': 'Transform Data',
      'summarize_data': 'Summarize Data',
      'send_email': 'Send Email',
      'send_slack': 'Send Slack Message',
      'store_database': 'Store in Database',
      'condition_check': 'Condition Check',
      'schedule_trigger': 'Schedule Trigger',
      'manual_trigger': 'Manual Trigger',
      'webhook_trigger': 'Webhook Trigger',
    };
    
    return labelMap[action] || nodeType;
  }
  
  /**
   * Get all supported node types
   * Useful for validation and debugging
   */
  getSupportedNodeTypes(): string[] {
    return nodeLibrary.getAllSchemas().map(schema => schema.type);
  }
  
  /**
   * Check if a node type is supported
   */
  isNodeTypeSupported(nodeType: string): boolean {
    return nodeLibrary.getSchema(nodeType) !== undefined;
  }
  
  /**
   * Get node schema for a type
   */
  getNodeSchema(nodeType: string) {
    const schema = nodeLibrary.getSchema(nodeType);
    if (!schema) {
      throw new Error(`Node schema not found for type: ${nodeType}`);
    }
    return schema;
  }
}

// Export singleton instance
export const stepNodeMapper = new StepNodeMapper();

/**
 * Convert workflow plan to WorkflowGenerationStructure
 * Helper function for compatibility with workflow-builder
 */
export function convertPlanToStructure(
  plan: WorkflowPlan,
  userPrompt?: string
): WorkflowGenerationStructure {
  const mapper = new StepNodeMapper();
  const mappingResult = mapper.mapPlanToNodes(plan, userPrompt);
  
  // Convert nodes to step definitions
  const steps: WorkflowStepDefinition[] = mappingResult.nodes
    .filter(node => node.id !== 'trigger') // Exclude trigger node
    .map(node => ({
      id: node.id,
      description: node.data.label,
      type: node.data.type,
    }));
  
  // Convert edges to connections
  const connections = mappingResult.connections.map(edge => ({
    source: edge.source,
    target: edge.target,
  }));
  
  // Generate outputs (from last step)
  const outputs: OutputDefinition[] = steps.length > 0
    ? [{
        name: 'output_1',
        description: `Output from ${steps[steps.length - 1].description}`,
        type: 'object' as InputOutputType,
        required: false,
      }]
    : [];
  
  // ✅ UNIVERSAL: Map trigger type using registry
  const trigger = mapTriggerTypeFromRegistry(plan.trigger_type);
  
  return {
    trigger,
    steps,
    outputs,
    connections,
  };
}

// Types are already exported above, no need to re-export
