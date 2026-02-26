/**
 * Node Mapping
 * 
 * STEP 4: Map semantic steps → nodes using registry.
 * 
 * Uses capability registry to map semantic operations to concrete node types.
 */

import { ExecutionStep } from './dependency-planner';
import { SemanticOperationType } from './intent-extraction-layer';
import { capabilityRegistry } from './capability-registry';
import { normalizeNodeType } from '../../core/utils/node-type-normalizer';
import { nodeLibrary } from '../nodes/node-library';
import { getTransformationNodeType } from './transformation-node-config';

export interface NodeMappingResult {
  steps: MappedExecutionStep[];
  unmappedOperations: string[];
  errors: string[];
}

export interface MappedExecutionStep extends ExecutionStep {
  nodeType: string;  // Mapped node type (guaranteed to be non-null)
  capability: {
    inputType: string | string[];
    outputType: string | string[];
    acceptsArray: boolean;
    requiresScalar: boolean;
  };
}

/**
 * Node Mapper
 * Maps semantic operations to concrete node types
 */
export class NodeMapper {
  /**
   * Map execution steps to node types
   * ✅ FIXED: Deduplicates nodes by capability category before mapping
   * 
   * @param steps - Execution steps from dependency planner
   * @returns Mapping result with mapped steps
   */
  mapSteps(steps: ExecutionStep[]): NodeMappingResult {
    console.log('[NodeMapper] Mapping execution steps to node types...');
    
    // ✅ FIXED: Merge operations that map to same node type
    const { mergeSemanticOperations } = require('./semantic-operation-merger');
    const mergeResult = mergeSemanticOperations(steps, (op: any) => this.mapOperationToNode(op));
    
    if (mergeResult.removedDuplicates > 0) {
      console.log(`[NodeMapper] ✅ Merged ${mergeResult.removedDuplicates} duplicate operations`);
    }
    
    // Use merged steps for mapping
    const stepsToMap = mergeResult.mergedSteps;
    
    const mappedSteps: MappedExecutionStep[] = [];
    const unmappedOperations: string[] = [];
    const errors: string[] = [];
    
    // Track seen node types by capability category to prevent duplicates
    const seenByCategory = new Map<string, Set<string>>();  // category -> Set<nodeType>
    
    for (const step of stepsToMap) {
      const nodeType = this.mapOperationToNode(step.operation);
      
      if (!nodeType) {
        unmappedOperations.push(`${step.operation.type}: ${step.operation.source || step.operation.destination || step.operation.operation || 'unknown'}`);
        errors.push(`Could not map operation: ${step.operation.type}`);
        continue;
      }
      
      // Validate node exists in library
      const schema = nodeLibrary.getSchema(nodeType);
      if (!schema) {
        errors.push(`Mapped node type "${nodeType}" does not exist in node library`);
        continue;
      }
      
      // Get capability
      const capability = capabilityRegistry.getCapability(nodeType);
      if (!capability) {
        errors.push(`No capability found for node type "${nodeType}"`);
        continue;
      }
      
      // ✅ FIXED: Deduplicate by capability category
      const category = this.getCapabilityCategory(nodeType);
      if (!seenByCategory.has(category)) {
        seenByCategory.set(category, new Set());
      }
      
      const seenNodeTypes = seenByCategory.get(category)!;
      
      // For transformers: only allow one per category
      if (category === 'transformer' && seenNodeTypes.has(nodeType)) {
        console.log(`[NodeMapper] ⚠️  Skipping duplicate transformation node: ${nodeType}`);
        continue;
      }
      
      // For other categories: allow duplicates only if different node types
      // (e.g., multiple producers are OK if they're different types)
      if (category !== 'transformer' && seenNodeTypes.has(nodeType)) {
        console.log(`[NodeMapper] ⚠️  Skipping duplicate node: ${nodeType}`);
        continue;
      }
      
      seenNodeTypes.add(nodeType);
      
      const mappedStep: MappedExecutionStep = {
        ...step,
        nodeType,
        capability: {
          inputType: Array.isArray(capability.inputType) 
            ? capability.inputType 
            : [capability.inputType],
          outputType: Array.isArray(capability.outputType)
            ? capability.outputType
            : [capability.outputType],
          acceptsArray: capability.acceptsArray,
          requiresScalar: capability.requiresScalar,
        },
      };
      
      mappedSteps.push(mappedStep);
      console.log(`[NodeMapper] ✅ Mapped ${step.operation.type} → ${nodeType}`);
    }
    
    console.log(`[NodeMapper] ✅ Mapped ${mappedSteps.length}/${steps.length} steps (${mergeResult.removedDuplicates} duplicates removed)`);
    if (unmappedOperations.length > 0) {
      console.warn(`[NodeMapper] ⚠️  Unmapped operations: ${unmappedOperations.join(', ')}`);
    }
    
    return {
      steps: mappedSteps,
      unmappedOperations,
      errors,
    };
  }
  
  /**
   * Get capability category for a node type
   */
  private getCapabilityCategory(nodeType: string): string {
    const nodeTypeLower = nodeType.toLowerCase();
    
    // Transformers
    if (nodeTypeLower.includes('summarizer') ||
        nodeTypeLower.includes('classifier') ||
        nodeTypeLower.includes('ollama') ||
        nodeTypeLower.includes('openai') ||
        nodeTypeLower.includes('anthropic') ||
        nodeTypeLower.includes('ai_agent') ||
        nodeTypeLower.includes('transform')) {
      return 'transformer';
    }
    
    // Producers
    if (nodeTypeLower.includes('sheets') ||
        nodeTypeLower.includes('database') ||
        nodeTypeLower.includes('api') ||
        nodeTypeLower.includes('csv') ||
        nodeTypeLower.includes('excel')) {
      return 'producer';
    }
    
    // Outputs
    if (nodeTypeLower.includes('gmail') ||
        nodeTypeLower.includes('slack') ||
        nodeTypeLower.includes('crm') ||
        nodeTypeLower.includes('storage')) {
      return 'output';
    }
    
    return 'other';
  }
  
  /**
   * Map semantic operation to node type
   */
  private mapOperationToNode(operation: any): string | null {
    switch (operation.type) {
      case SemanticOperationType.FETCH_DATA:
        return this.mapFetchData(operation);
      
      case SemanticOperationType.TRANSFORM:
        return this.mapTransform(operation);
      
      case SemanticOperationType.SEND:
        return this.mapSend(operation);
      
      case SemanticOperationType.STORE:
        return this.mapStore(operation);
      
      case SemanticOperationType.CONDITION:
        return this.mapCondition(operation);
      
      default:
        console.warn(`[NodeMapper] ⚠️  Unknown operation type: ${operation.type}`);
        return null;
    }
  }
  
  /**
   * Map fetch_data operation to node type
   */
  private mapFetchData(operation: any): string | null {
    const source = operation.source?.toLowerCase() || '';
    
    // Google Services
    if (source.includes('google_sheets') || source.includes('sheets') || source === 'sheets') {
      return 'google_sheets';
    }
    if (source.includes('google_drive') || source.includes('drive')) {
      return 'google_drive';
    }
    
    // Databases
    if (source.includes('postgres') || source.includes('postgresql')) {
      return 'postgresql';
    }
    if (source.includes('mysql')) {
      return 'mysql';
    }
    if (source.includes('mongodb') || source.includes('mongo')) {
      return 'mongodb';
    }
    if (source.includes('database')) {
      return 'database_read';
    }
    
    // Storage
    if (source.includes('s3') || source.includes('aws s3')) {
      return 'aws_s3';
    }
    if (source.includes('dropbox')) {
      return 'dropbox';
    }
    if (source.includes('storage')) {
      return 'storage_read';
    }
    
    // Other
    if (source.includes('airtable')) {
      return 'airtable';
    }
    if (source.includes('notion')) {
      return 'notion';
    }
    if (source.includes('csv')) {
      return 'csv';
    }
    if (source.includes('excel')) {
      return 'excel';
    }
    
    // Try direct lookup
    const normalized = normalizeNodeType({ type: 'custom', data: { type: source } });
    const schema = nodeLibrary.getSchema(normalized);
    if (schema) {
      return normalized;
    }
    
    return null;
  }
  
  /**
   * Map transform operation to node type
   * ✅ FIXED: Ensures transformations are always mapped correctly
   * Mapping rules:
   * - summarize → text_summarizer (or ai_service if not available)
   * - analyze → ai_agent
   * - process text → ai_service (or text_summarizer)
   */
  private mapTransform(operation: any): string | null {
    const op = operation.operation?.toLowerCase() || '';
    const source = operation.source?.toLowerCase() || '';
    const description = operation.description?.toLowerCase() || '';
    
    // Combine all text for keyword detection
    const combinedText = `${op} ${source} ${description}`.toLowerCase();
    
    // ✅ FIXED: Explicit transformation mapping with fallbacks
    // 1. Summarize → text_summarizer (or ai_service)
    if (combinedText.includes('summarize') || combinedText.includes('summarise') || combinedText.includes('summary')) {
      console.log(`[NodeMapper] ✅ Detected summarize transformation`);
      
      // Try text_summarizer first
      const summarizerCapability = capabilityRegistry.getCapability('text_summarizer');
      if (summarizerCapability) {
        console.log(`[NodeMapper] ✅ Mapped summarize → text_summarizer`);
        return 'text_summarizer';
      }
      
      // Fallback to AI service
      const { capabilityResolver } = require('./capability-resolver');
      const resolution = capabilityResolver.resolveCapability('summarization');
      if (resolution?.nodeType) {
        console.log(`[NodeMapper] ✅ Mapped summarize → ${resolution.nodeType} (via capability resolver)`);
        return resolution.nodeType;
      }
      
      // Final fallback: use ai_chat_model (canonical transformation node)
      const aiChatModelSchema = nodeLibrary.getSchema('ai_chat_model');
      if (aiChatModelSchema) {
        console.log(`[NodeMapper] ✅ Mapped summarize → ai_chat_model (fallback)`);
        return 'ai_chat_model';
      }
      
      // Alternative fallback: openai_gpt (if ai_chat_model not available)
      const openaiSchema = nodeLibrary.getSchema('openai_gpt');
      if (openaiSchema) {
        console.log(`[NodeMapper] ✅ Mapped summarize → openai_gpt (fallback)`);
        return 'openai_gpt';
      }
      
      // Last resort: ai_agent
      console.log(`[NodeMapper] ✅ Mapped summarize → ai_agent (last resort)`);
      return 'ai_agent';
    }
    
    // 2. Analyze → ai_agent
    if (combinedText.includes('analyze') || combinedText.includes('analyse') || combinedText.includes('analysis')) {
      console.log(`[NodeMapper] ✅ Detected analyze transformation`);
      
      const aiAgentSchema = nodeLibrary.getSchema('ai_agent');
      if (aiAgentSchema) {
        console.log(`[NodeMapper] ✅ Mapped analyze → ai_agent`);
        return 'ai_agent';
      }
      
      // Fallback to AI service
      const { capabilityResolver } = require('./capability-resolver');
      const resolution = capabilityResolver.resolveCapability('ai_processing');
      if (resolution?.nodeType) {
        console.log(`[NodeMapper] ✅ Mapped analyze → ${resolution.nodeType} (via capability resolver)`);
        return resolution.nodeType;
      }
      
      return 'ai_agent'; // Default to ai_agent
    }
    
    // 3. Process text → ai_service (or text_summarizer)
    if (combinedText.includes('process text') || combinedText.includes('process_text') || 
        (combinedText.includes('process') && combinedText.includes('text'))) {
      console.log(`[NodeMapper] ✅ Detected process text transformation`);
      
      // Try text_summarizer first
      const summarizerCapability = capabilityRegistry.getCapability('text_summarizer');
      if (summarizerCapability) {
        console.log(`[NodeMapper] ✅ Mapped process text → text_summarizer`);
        return 'text_summarizer';
      }
      
      // Fallback to AI service
      const { capabilityResolver } = require('./capability-resolver');
      const resolution = capabilityResolver.resolveCapability('ai_processing');
      if (resolution?.nodeType) {
        console.log(`[NodeMapper] ✅ Mapped process text → ${resolution.nodeType} (via capability resolver)`);
        return resolution.nodeType;
      }
      
      // Final fallback: use ai_chat_model (canonical transformation node)
      const aiChatModelSchema = nodeLibrary.getSchema('ai_chat_model');
      if (aiChatModelSchema) {
        console.log(`[NodeMapper] ✅ Mapped process text → ai_chat_model (fallback)`);
        return 'ai_chat_model';
      }
      
      return 'ai_agent';
    }
    
    // Use transformation detector for other transformations
    const { transformationDetector } = require('./transformation-detector');
    
    // Check if operation matches a transformation verb
    for (const [keyword, verb] of Object.entries({
      'classify': 'classify',
      'translate': 'translate',
      'extract': 'extract',
      'generate': 'generate',
      'process': 'process',
      'transform': 'transform',
    })) {
      if (combinedText.includes(keyword) || op === keyword) {
        const recommendedNode = transformationDetector.getRecommendedNodeType(verb as any);
        if (recommendedNode) {
          console.log(`[NodeMapper] ✅ Mapped transformation "${op}" → "${recommendedNode}"`);
          return recommendedNode;
        }
      }
    }
    
    // AI Processing / LLM (generic)
    if (combinedText.includes('ai') || combinedText.includes('llm') || combinedText.includes('ai_processing')) {
      const { capabilityResolver } = require('./capability-resolver');
      const resolution = capabilityResolver.resolveCapability('ai_processing');
      if (resolution?.nodeType) {
        console.log(`[NodeMapper] ✅ Mapped AI processing → ${resolution.nodeType}`);
        return resolution.nodeType;
      }
      
      // Fallback
      const aiAgentSchema = nodeLibrary.getSchema('ai_agent');
      if (aiAgentSchema) {
        return 'ai_agent';
      }
    }
    
    // Generate
    if (combinedText.includes('generate') || op === 'generate') {
      const { capabilityResolver } = require('./capability-resolver');
      const resolution = capabilityResolver.resolveCapability('ai_processing');
      if (resolution?.nodeType) {
        return resolution.nodeType;
      }
      return 'ai_agent';
    }
    
    // Data transformations
    if (combinedText.includes('transform') || op === 'transform') {
      return 'transform';
    }
    if (combinedText.includes('format') || op === 'format') {
      return 'format';
    }
    if (combinedText.includes('parse') || op === 'parse') {
      return 'parse';
    }
    if (combinedText.includes('filter') || op === 'filter') {
      return 'filter';
    }
    if (combinedText.includes('map') || op === 'map') {
      return 'map';
    }
    if (combinedText.includes('reduce') || op === 'reduce') {
      return 'reduce';
    }
    
    // Try direct lookup
    const normalized = normalizeNodeType({ type: 'custom', data: { type: op } });
    const schema = nodeLibrary.getSchema(normalized);
    if (schema) {
      return normalized;
    }
    
    // ✅ FIXED: If no mapping found but it's a transform operation, default to ai_agent
    // This ensures transformations are never dropped
    console.warn(`[NodeMapper] ⚠️  Could not map transform operation "${op}", defaulting to ai_agent`);
    const aiAgentSchema = nodeLibrary.getSchema('ai_agent');
    if (aiAgentSchema) {
      return 'ai_agent';
    }
    
    return null;
  }
  
  /**
   * Map send operation to node type
   */
  private mapSend(operation: any): string | null {
    const destination = operation.destination?.toLowerCase() || '';
    
    // Email
    if (destination.includes('gmail') || destination === 'email' || destination === 'send_email') {
      return 'google_gmail';
    }
    if (destination.includes('email') && !destination.includes('gmail')) {
      return 'google_gmail'; // Default to Gmail
    }
    
    // Communication
    if (destination.includes('slack')) {
      return 'slack_message';
    }
    if (destination.includes('discord')) {
      return 'discord';
    }
    if (destination.includes('telegram')) {
      return 'telegram';
    }
    
    // Notifications
    if (destination.includes('notification') || destination === 'notify') {
      return 'notification';
    }
    
    // Webhooks
    if (destination.includes('webhook') || destination === 'webhook') {
      return 'webhook_response';
    }
    
    // HTTP/API
    if (destination.includes('http') || destination.includes('api') || destination === 'request') {
      return 'http_request';
    }
    
    // Try direct lookup
    const normalized = normalizeNodeType({ type: 'custom', data: { type: destination } });
    const schema = nodeLibrary.getSchema(normalized);
    if (schema) {
      return normalized;
    }
    
    return null;
  }
  
  /**
   * Map store operation to node type
   */
  private mapStore(operation: any): string | null {
    // Store operations use same mapping as fetch_data
    return this.mapFetchData(operation);
  }
  
  /**
   * Map condition operation to node type
   */
  private mapCondition(operation: any): string | null {
    const conditionType = operation.condition?.toLowerCase() || '';
    
    if (conditionType.includes('if_else') || conditionType.includes('if')) {
      return 'if_else';
    }
    if (conditionType.includes('switch')) {
      return 'switch';
    }
    
    // Default to if_else
    return 'if_else';
  }
}

// Export singleton instance
export const nodeMapper = new NodeMapper();

// Export convenience function
export function mapStepsToNodes(steps: ExecutionStep[]): NodeMappingResult {
  return nodeMapper.mapSteps(steps);
}
