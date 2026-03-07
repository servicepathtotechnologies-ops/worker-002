/**
 * Intent Capability Mapper
 * 
 * Extracts required capabilities from normalized prompt and maps them to node types.
 * 
 * Responsibilities:
 * 1. Extract required capabilities from normalized prompt:
 *    - data source
 *    - transformation
 *    - output
 * 
 * 2. Map capabilities to node types
 * 
 * Example:
 * "Get data from Google Sheets, summarize, send email"
 * 
 * Capabilities:
 * - data_source → google_sheets
 * - transform → text_summarizer
 * - output → gmail
 * 
 * 3. Return allowed node list
 * 
 * Workflow builder must only use these nodes.
 */

import { StructuredIntent } from './intent-structurer';
import { nodeLibrary } from '../nodes/node-library';
import { capabilityResolver } from './capability-resolver';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';

export enum CapabilityType {
  DATA_SOURCE = 'data_source',
  TRANSFORMATION = 'transformation',
  OUTPUT = 'output',
  TRIGGER = 'trigger',
  CONDITION = 'condition',
}

export interface CapabilityMapping {
  capability: CapabilityType;
  nodeTypes: string[];
  source: string; // Which action/intent element this came from
}

export interface CapabilityMappingResult {
  allowedNodes: string[];
  capabilityMappings: CapabilityMapping[];
  statistics: {
    dataSourceCount: number;
    transformationCount: number;
    outputCount: number;
    triggerCount: number;
    conditionCount: number;
  };
}

/**
 * Intent Capability Mapper
 * Maps user intent to required capabilities and node types
 */
export class IntentCapabilityMapper {
  /**
   * Map structured intent to capabilities and allowed node types
   * 
   * @param intent - Structured intent from user prompt
   * @returns Capability mapping result with allowed node list
   */
  mapIntentToCapabilities(intent: StructuredIntent): CapabilityMappingResult {
    console.log('[IntentCapabilityMapper] Mapping intent to capabilities...');
    
    const capabilityMappings: CapabilityMapping[] = [];
    const allowedNodeTypes = new Set<string>();
    
    // STEP 1: Extract trigger capability
    if (intent.trigger) {
      const triggerNodeType = this.mapTriggerToNodeType(intent.trigger);
      if (triggerNodeType) {
        allowedNodeTypes.add(triggerNodeType);
        capabilityMappings.push({
          capability: CapabilityType.TRIGGER,
          nodeTypes: [triggerNodeType],
          source: `trigger: ${intent.trigger}`,
        });
        console.log(`[IntentCapabilityMapper] ✅ Added trigger capability: ${triggerNodeType}`);
      }
    }
    
    // STEP 2: Extract capabilities from actions
    if (intent.actions && intent.actions.length > 0) {
      for (const action of intent.actions) {
        const actionCapabilities = this.mapActionToCapabilities(action);
        
        for (const capabilityMapping of actionCapabilities) {
          // Add to capability mappings
          capabilityMappings.push(capabilityMapping);
          
          // Add node types to allowed list
          capabilityMapping.nodeTypes.forEach(nodeType => {
            // Validate node exists in library
            const schema = nodeLibrary.getSchema(nodeType);
            if (schema) {
              allowedNodeTypes.add(nodeType);
              console.log(`[IntentCapabilityMapper] ✅ Added ${capabilityMapping.capability} node: ${nodeType} (from ${action.type})`);
            } else {
              console.warn(`[IntentCapabilityMapper] ⚠️  Node type "${nodeType}" not found in library, skipping`);
            }
          });
        }
      }
    }
    
    // STEP 3: Extract conditional capabilities
    if (intent.conditions && intent.conditions.length > 0) {
      for (const condition of intent.conditions) {
        const conditionNodeType = this.mapConditionToNodeType(condition.type);
        if (conditionNodeType) {
          allowedNodeTypes.add(conditionNodeType);
          capabilityMappings.push({
            capability: CapabilityType.CONDITION,
            nodeTypes: [conditionNodeType],
            source: `condition: ${condition.type}`,
          });
          console.log(`[IntentCapabilityMapper] ✅ Added condition capability: ${conditionNodeType}`);
        }
      }
    }
    
    // STEP 4: Calculate statistics
    const statistics = {
      dataSourceCount: capabilityMappings.filter(m => m.capability === CapabilityType.DATA_SOURCE).length,
      transformationCount: capabilityMappings.filter(m => m.capability === CapabilityType.TRANSFORMATION).length,
      outputCount: capabilityMappings.filter(m => m.capability === CapabilityType.OUTPUT).length,
      triggerCount: capabilityMappings.filter(m => m.capability === CapabilityType.TRIGGER).length,
      conditionCount: capabilityMappings.filter(m => m.capability === CapabilityType.CONDITION).length,
    };
    
    console.log(`[IntentCapabilityMapper] ✅ Capability mapping complete:`);
    console.log(`[IntentCapabilityMapper]   Allowed nodes: ${Array.from(allowedNodeTypes).join(', ')}`);
    console.log(`[IntentCapabilityMapper]   Statistics:`, statistics);
    
    return {
      allowedNodes: Array.from(allowedNodeTypes),
      capabilityMappings,
      statistics,
    };
  }
  
  /**
   * Map action to capabilities
   */
  private mapActionToCapabilities(action: StructuredIntent['actions'][0]): CapabilityMapping[] {
    const mappings: CapabilityMapping[] = [];
    const actionType = action.type.toLowerCase();
    const operation = action.operation.toLowerCase();
    
    // STEP 1: Check if it's a data source capability
    const dataSourceNode = this.mapToDataSourceNode(actionType, operation);
    if (dataSourceNode) {
      mappings.push({
        capability: CapabilityType.DATA_SOURCE,
        nodeTypes: [dataSourceNode],
        source: `action: ${action.type} (${action.operation})`,
      });
      return mappings; // Data sources are exclusive
    }
    
    // STEP 2: Check if it's a transformation capability
    const transformationNodes = this.mapToTransformationNodes(actionType, operation);
    if (transformationNodes.length > 0) {
      mappings.push({
        capability: CapabilityType.TRANSFORMATION,
        nodeTypes: transformationNodes,
        source: `action: ${action.type} (${action.operation})`,
      });
      return mappings; // Transformations are exclusive
    }
    
    // STEP 3: Check if it's an output capability
    const outputNode = this.mapToOutputNode(actionType, operation);
    if (outputNode) {
      mappings.push({
        capability: CapabilityType.OUTPUT,
        nodeTypes: [outputNode],
        source: `action: ${action.type} (${action.operation})`,
      });
      return mappings; // Outputs are exclusive
    }
    
    // STEP 4: Fallback - try direct node type lookup
    const normalized = unifiedNormalizeNodeTypeString(actionType);
    const schema = nodeLibrary.getSchema(normalized);
    if (schema) {
      // Determine capability based on node category
      const category = schema.category?.toLowerCase() || '';
      let capability: CapabilityType;
      
      if (category.includes('data') || category.includes('source') || category.includes('database') || category.includes('storage')) {
        capability = CapabilityType.DATA_SOURCE;
      } else if (category.includes('transform') || category.includes('process') || category.includes('ai') || category.includes('ml')) {
        capability = CapabilityType.TRANSFORMATION;
      } else if (category.includes('output') || category.includes('communication') || category.includes('notification')) {
        capability = CapabilityType.OUTPUT;
      } else {
        // Default to transformation for unknown categories
        capability = CapabilityType.TRANSFORMATION;
      }
      
      mappings.push({
        capability,
        nodeTypes: [normalized],
        source: `action: ${action.type} (${action.operation}) - inferred from category`,
      });
    } else {
      console.warn(`[IntentCapabilityMapper] ⚠️  Could not map action "${action.type}" to any capability`);
    }
    
    return mappings;
  }
  
  /**
   * Map to data source node
   */
  private mapToDataSourceNode(actionType: string, operation: string): string | null {
    // Google Services
    if (actionType.includes('google_sheets') || actionType.includes('sheets') || actionType === 'sheets') {
      return 'google_sheets';
    }
    if (actionType.includes('google_drive') || actionType.includes('drive')) {
      return 'google_drive';
    }
    
    // Databases
    if (actionType.includes('postgres') || actionType.includes('postgresql')) {
      return 'postgresql';
    }
    if (actionType.includes('mysql')) {
      return 'mysql';
    }
    if (actionType.includes('mongodb') || actionType.includes('mongo')) {
      return 'mongodb';
    }
    if (actionType.includes('database')) {
      return 'database_read'; // Generic database
    }
    
    // Storage
    if (actionType.includes('s3') || actionType.includes('aws s3')) {
      return 'aws_s3';
    }
    if (actionType.includes('dropbox')) {
      return 'dropbox';
    }
    if (actionType.includes('storage')) {
      return 'storage_read'; // Generic storage
    }
    
    // Other data sources
    if (actionType.includes('airtable')) {
      return 'airtable';
    }
    if (actionType.includes('notion')) {
      return 'notion';
    }
    if (actionType.includes('csv')) {
      return 'csv';
    }
    if (actionType.includes('excel')) {
      return 'excel';
    }
    
    // Check for read operations on known data source types
    if (operation === 'read' || operation === 'get' || operation === 'fetch') {
      const normalized = unifiedNormalizeNodeTypeString(actionType);
      const schema = nodeLibrary.getSchema(normalized);
      if (schema) {
        const category = schema.category?.toLowerCase() || '';
        if (category.includes('data') || category.includes('source') || category.includes('database') || category.includes('storage')) {
          return normalized;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Map to transformation nodes
   */
  private mapToTransformationNodes(actionType: string, operation: string): string[] {
    const nodes: string[] = [];
    
    // AI/ML transformations
    if (actionType.includes('summarize') || actionType.includes('summary') || actionType === 'summarize') {
      // Check capability resolver first
      const capabilityResolution = capabilityResolver.resolveCapability('summarization');
      if (capabilityResolution) {
        nodes.push(capabilityResolution.nodeType);
      } else {
        nodes.push('text_summarizer');
      }
      return nodes;
    }
    
    if (actionType.includes('classify') || actionType === 'classify') {
      const capabilityResolution = capabilityResolver.resolveCapability('classification');
      if (capabilityResolution) {
        nodes.push(capabilityResolution.nodeType);
      }
      return nodes;
    }
    
    if (actionType.includes('ai') || actionType.includes('llm') || actionType.includes('process') || actionType === 'ai_processing') {
      const capabilityResolution = capabilityResolver.resolveCapability('ai_processing');
      if (capabilityResolution) {
        nodes.push(capabilityResolution.nodeType);
      }
      return nodes;
    }
    
    // Data transformations
    if (actionType.includes('transform') || actionType === 'transform') {
      nodes.push('transform');
    }
    if (actionType.includes('format') || actionType === 'format') {
      nodes.push('format');
    }
    if (actionType.includes('parse') || actionType === 'parse') {
      nodes.push('parse');
    }
    if (actionType.includes('filter') || actionType === 'filter') {
      nodes.push('filter');
    }
    if (actionType.includes('map') || actionType === 'map') {
      nodes.push('map');
    }
    if (actionType.includes('reduce') || actionType === 'reduce') {
      nodes.push('reduce');
    }
    
    // Check for transformation operations on known types
    if (operation === 'process' || operation === 'transform' || operation === 'analyze') {
      const normalized = unifiedNormalizeNodeTypeString(actionType);
      const schema = nodeLibrary.getSchema(normalized);
      if (schema) {
        const category = schema.category?.toLowerCase() || '';
        if (category.includes('transform') || category.includes('process') || category.includes('ai') || category.includes('ml')) {
          nodes.push(normalized);
        }
      }
    }
    
    return nodes;
  }
  
  /**
   * Map to output node
   */
  private mapToOutputNode(actionType: string, operation: string): string | null {
    // Email
    if (actionType.includes('gmail') || actionType === 'email' || actionType === 'send_email') {
      return 'google_gmail';
    }
    if (actionType.includes('email') && operation === 'send') {
      return 'google_gmail';
    }
    
    // Communication
    if (actionType.includes('slack')) {
      return 'slack_message';
    }
    if (actionType.includes('discord')) {
      return 'discord';
    }
    if (actionType.includes('telegram')) {
      return 'telegram';
    }
    
    // Notifications
    if (actionType.includes('notification') || actionType === 'notify') {
      return 'notification';
    }
    
    // Webhooks
    if (actionType.includes('webhook') || actionType === 'webhook') {
      return 'webhook_response';
    }
    
    // HTTP/API
    if (actionType.includes('http') || actionType.includes('api') || actionType === 'request') {
      if (operation === 'send' || operation === 'post' || operation === 'put') {
        return 'http_request';
      }
    }
    
    // Check for send/write operations on known output types
    if (operation === 'send' || operation === 'write' || operation === 'post') {
      const normalized = unifiedNormalizeNodeTypeString(actionType);
      const schema = nodeLibrary.getSchema(normalized);
      if (schema) {
        const category = schema.category?.toLowerCase() || '';
        if (category.includes('output') || category.includes('communication') || category.includes('notification')) {
          return normalized;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Map trigger to node type
   */
  private mapTriggerToNodeType(trigger: string): string | null {
    const triggerLower = trigger.toLowerCase();
    
    if (triggerLower.includes('manual')) {
      return 'manual_trigger';
    }
    if (triggerLower.includes('schedule') || triggerLower.includes('cron')) {
      return 'schedule';
    }
    if (triggerLower.includes('webhook')) {
      return 'webhook';
    }
    if (triggerLower.includes('form')) {
      return 'form';
    }
    if (triggerLower.includes('chat')) {
      return 'chat_trigger';
    }
    if (triggerLower.includes('interval')) {
      return 'interval';
    }
    
    // Default to manual trigger
    return 'manual_trigger';
  }
  
  /**
   * Map condition to node type
   */
  private mapConditionToNodeType(conditionType: string): string | null {
    const conditionLower = conditionType.toLowerCase();
    
    if (conditionLower.includes('if_else') || conditionLower.includes('if')) {
      return 'if_else';
    }
    if (conditionLower.includes('switch')) {
      return 'switch';
    }
    
    return null;
  }
}

// Export singleton instance
export const intentCapabilityMapper = new IntentCapabilityMapper();

// Export convenience function
export function mapIntentToCapabilities(intent: StructuredIntent): CapabilityMappingResult {
  return intentCapabilityMapper.mapIntentToCapabilities(intent);
}
