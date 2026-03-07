/**
 * Intent-Aware Planner
 * 
 * ✅ PHASE 3: Builds StructuredIntent from SimpleIntent
 * 
 * This planner:
 * - Understands intent meaning (not just rules)
 * - Maps entities to node types using registry
 * - Determines execution order using dependency graph
 * - Adds missing implicit nodes
 * - Prevents Error #2 (incorrect execution order)
 * 
 * Architecture Rule:
 * - Takes SimpleIntent (entities) as input
 * - Outputs StructuredIntent (infrastructure)
 * - Uses registry as single source of truth
 * - Uses dependency graph for execution order
 */

import { SimpleIntent } from './simple-intent';
import { StructuredIntent } from './intent-structurer';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';
import { nodeDependencyResolver } from './node-dependency-resolver';
import { executionOrderBuilder } from '../../core/execution/execution-order-builder';

export interface NodeRequirement {
  id: string;
  type: string;
  operation: string;
  config?: Record<string, unknown>;
  category: 'dataSource' | 'transformation' | 'output';
  dependsOn?: string[]; // Node IDs this node depends on
}

export interface IntentType {
  type: 'automation' | 'sync' | 'notification' | 'transformation' | 'data_pipeline' | 'workflow';
  description: string;
}

export interface PlanningResult {
  structuredIntent: StructuredIntent;
  nodeRequirements: NodeRequirement[];
  executionOrder: string[]; // Node IDs in execution order
  dependencyGraph: Map<string, string[]>; // Node ID → [dependent node IDs]
  errors: string[];
  warnings: string[];
}

export class IntentAwarePlanner {
  private static instance: IntentAwarePlanner;
  
  private constructor() {}
  
  static getInstance(): IntentAwarePlanner {
    if (!IntentAwarePlanner.instance) {
      IntentAwarePlanner.instance = new IntentAwarePlanner();
    }
    return IntentAwarePlanner.instance;
  }
  
  /**
   * Plan workflow from SimpleIntent
   * 
   * This is the core method that builds StructuredIntent from SimpleIntent
   * 
   * @param intent - SimpleIntent (entities only)
   * @param originalPrompt - Original user prompt (for context)
   * @returns Planning result with StructuredIntent
   */
  async planWorkflow(
    intent: SimpleIntent,
    originalPrompt?: string
  ): Promise<PlanningResult> {
    console.log('[IntentAwarePlanner] Planning workflow from SimpleIntent...');
    
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      // Step 1: Understand intent type
      const intentType = this.understandIntentType(intent);
      console.log(`[IntentAwarePlanner] Intent type: ${intentType.type} - ${intentType.description}`);
      
      // Step 2: Map entities to node types using registry
      const nodeRequirements = await this.determineRequiredNodes(intent, originalPrompt);
      console.log(`[IntentAwarePlanner] Determined ${nodeRequirements.length} required nodes`);
      
      // Step 3: Build dependency graph (CRITICAL - Prevents Error #2)
      const dependencyGraph = this.buildDependencyGraph(nodeRequirements, intent);
      console.log(`[IntentAwarePlanner] Built dependency graph with ${dependencyGraph.size} nodes`);
      
      // Step 4: Determine execution order using topological sort (Prevents Error #2)
      const executionOrder = this.determineExecutionOrder(nodeRequirements, dependencyGraph);
      console.log(`[IntentAwarePlanner] Execution order: ${executionOrder.length} nodes`);
      
      // Step 5: Add missing implicit nodes (with duplicate check)
      const completeNodes = this.addImplicitNodes(nodeRequirements, intent, originalPrompt);
      console.log(`[IntentAwarePlanner] Complete nodes: ${completeNodes.length} (added ${completeNodes.length - nodeRequirements.length} implicit)`);
      
      // Step 6: Build StructuredIntent with correct order
      const structuredIntent = this.buildStructuredIntent(completeNodes, executionOrder, intent);
      
      return {
        structuredIntent,
        nodeRequirements: completeNodes,
        executionOrder,
        dependencyGraph,
        errors,
        warnings,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Planning failed: ${errorMessage}`);
      console.error(`[IntentAwarePlanner] ❌ Planning failed:`, error);
      
      // Return minimal StructuredIntent as fallback
      return {
        structuredIntent: {
          trigger: intent.trigger?.type || 'manual_trigger',
          trigger_config: intent.trigger?.type === 'schedule' ? {} : undefined,
          actions: [],
          requires_credentials: [],
        },
        nodeRequirements: [],
        executionOrder: [],
        dependencyGraph: new Map(),
        errors,
        warnings,
      };
    }
  }
  
  /**
   * Understand intent type based on entities
   */
  private understandIntentType(intent: SimpleIntent): IntentType {
    // Analyze verbs to determine intent type
    const verbs = intent.verbs || [];
    const hasSources = intent.sources && intent.sources.length > 0;
    const hasDestinations = intent.destinations && intent.destinations.length > 0;
    const hasTransformations = intent.transformations && intent.transformations.length > 0;
    
    // Determine intent type based on patterns
    if (hasSources && hasDestinations && verbs.some(v => ['sync', 'copy', 'transfer'].includes(v))) {
      return {
        type: 'sync',
        description: 'Data synchronization between sources and destinations',
      };
    }
    
    if (hasDestinations && verbs.some(v => ['send', 'notify', 'alert'].includes(v))) {
      return {
        type: 'notification',
        description: 'Notification or alert workflow',
      };
    }
    
    if (hasTransformations && verbs.some(v => ['transform', 'process', 'analyze'].includes(v))) {
      return {
        type: 'transformation',
        description: 'Data transformation workflow',
      };
    }
    
    if (hasSources && hasDestinations) {
      return {
        type: 'data_pipeline',
        description: 'Data pipeline from source to destination',
      };
    }
    
    // Default to automation
    return {
      type: 'automation',
      description: 'General automation workflow',
    };
  }
  
  /**
   * Determine required nodes from SimpleIntent entities
   * Uses registry to map entities to node types
   */
  private async determineRequiredNodes(
    intent: SimpleIntent,
    originalPrompt?: string
  ): Promise<NodeRequirement[]> {
    const nodes: NodeRequirement[] = [];
    const nodeIds = new Set<string>(); // Track to prevent duplicates
    
    // Map sources to data source nodes
    if (intent.sources && intent.sources.length > 0) {
      for (const source of intent.sources) {
        const nodeType = await this.mapEntityToNodeType(source, 'dataSource', originalPrompt);
        if (nodeType && !nodeIds.has(nodeType)) {
          nodes.push({
            id: `ds_${nodes.length}`,
            type: nodeType,
            operation: 'read',
            category: 'dataSource',
          });
          nodeIds.add(nodeType);
        }
      }
    }
    
    // Map transformations to transformation nodes
    if (intent.transformations && intent.transformations.length > 0) {
      for (const transformation of intent.transformations) {
        const nodeType = await this.mapEntityToNodeType(transformation, 'transformation', originalPrompt);
        if (nodeType && !nodeIds.has(nodeType)) {
          nodes.push({
            id: `tf_${nodes.length}`,
            type: nodeType,
            operation: 'transform',
            category: 'transformation',
          });
          nodeIds.add(nodeType);
        }
      }
    }
    
    // Map destinations to output nodes
    if (intent.destinations && intent.destinations.length > 0) {
      for (const destination of intent.destinations) {
        const nodeType = await this.mapEntityToNodeType(destination, 'output', originalPrompt);
        if (nodeType && !nodeIds.has(nodeType)) {
          // ✅ ROOT FIX: Match verb to schema operations (not hardcoded inference)
          const operationMatch = this.matchVerbToSchemaOperation(intent.verbs, nodeType);
          nodes.push({
            id: `out_${nodes.length}`,
            type: nodeType,
            operation: operationMatch.operation, // Operation from schema (valid)
            category: 'output',
          });
          nodeIds.add(nodeType);
        }
      }
    }
    
    // Map conditions to logic nodes
    if (intent.conditions && intent.conditions.length > 0) {
      for (const condition of intent.conditions) {
        const nodeType = condition.type === 'switch' ? 'switch' : 'if_else';
        if (!nodeIds.has(nodeType)) {
          nodes.push({
            id: `cond_${nodes.length}`,
            type: nodeType,
            operation: 'evaluate',
            category: 'transformation',
          });
          nodeIds.add(nodeType);
        }
      }
    }
    
    return nodes;
  }
  
  /**
   * Map entity name to node type using registry (UNIVERSAL)
   */
  private async mapEntityToNodeType(
    entity: string,
    category: 'dataSource' | 'transformation' | 'output',
    originalPrompt?: string
  ): Promise<string | null> {
    const entityLower = entity.toLowerCase();
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    
    // ✅ UNIVERSAL: Search registry for matching node
    for (const nodeType of allNodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      // Check if node matches category
      const isCorrectCategory = 
        (category === 'dataSource' && nodeCapabilityRegistryDSL.isDataSource(nodeType)) ||
        (category === 'transformation' && nodeCapabilityRegistryDSL.isTransformation(nodeType)) ||
        (category === 'output' && nodeCapabilityRegistryDSL.isOutput(nodeType));
      
      if (!isCorrectCategory) continue;
      
      // Check if entity matches node label, type, or keywords
      const label = nodeDef.label || nodeType;
      const labelLower = label.toLowerCase();
      const typeLower = nodeType.toLowerCase();
      const keywords = nodeDef.tags || [];
      
      // Exact match on label
      if (labelLower === entityLower || labelLower.includes(entityLower) || entityLower.includes(labelLower)) {
        return nodeType;
      }
      
      // Match on type
      if (typeLower === entityLower || typeLower.includes(entityLower) || entityLower.includes(typeLower)) {
        return nodeType;
      }
      
      // Match on keywords
      for (const keyword of keywords) {
        if (keyword.toLowerCase() === entityLower || keyword.toLowerCase().includes(entityLower)) {
          return nodeType;
        }
      }
    }
    
    // No match found
    return null;
  }
  
  /**
   * ✅ ROOT FIX: Match verb to schema operations with confidence
   * 
   * This replaces the old inferOperationFromVerb() which used hardcoded mappings.
   * Now operations are selected from schema, ensuring they're always valid.
   * 
   * Benefits:
   * - Operations come from schema (valid)
   * - Confidence-based selection (accurate)
   * - Handles synonyms ("notify" → "send")
   * - Prevents categorization errors (operations match schema)
   * 
   * @param verbs - Verbs extracted from user prompt
   * @param nodeType - Node type to match operations for
   * @returns Operation from schema with confidence score
   */
  private matchVerbToSchemaOperation(
    verbs: string[],
    nodeType: string
  ): { operation: string; confidence: number } {
    // Get schema for node type
    const { nodeLibrary } = require('../nodes/node-library');
    const schema = nodeLibrary.getSchema(nodeType);
    
    if (!schema) {
      // Fallback: use category-based default
      return this.getDefaultOperationByCategory(nodeType);
    }
    
    // Extract operations from schema
    const operations = this.extractOperationsFromSchema(schema);
    
    if (operations.length === 0) {
      // No operations in schema, use category-based default
      return this.getDefaultOperationByCategory(nodeType);
    }
    
    // Match each verb to operations and find best match
    let bestMatch = { operation: operations[0], confidence: 0 };
    
    for (const verb of verbs) {
      for (const op of operations) {
        const confidence = this.calculateVerbOperationConfidence(verb, op);
        if (confidence > bestMatch.confidence) {
          bestMatch = { operation: op, confidence };
        }
      }
    }
    
    // Only use if confidence > 0.5 (threshold)
    if (bestMatch.confidence < 0.5) {
      // Low confidence, use category-based default
      return this.getDefaultOperationByCategory(nodeType);
    }
    
    return bestMatch;
  }
  
  /**
   * ✅ UNIVERSAL: Extract ALL operations from node schema
   * 
   * Extracts from ALL possible sources:
   * 1. Examples (array of operation strings)
   * 2. Options (array of {label, value} objects or string array)
   * 3. Default (single default operation)
   * 
   * This ensures we get ALL available operations, not just examples.
   * Works for ALL nodes universally.
   * 
   * @param schema - Node schema from nodeLibrary
   * @returns Array of available operations (lowercase, deduplicated)
   */
  private extractOperationsFromSchema(schema: any): string[] {
    if (!schema?.configSchema) return [];
    
    // Check both optional and required fields
    const operationField = schema.configSchema.optional?.operation || 
                          (schema.configSchema.required?.includes('operation') ? 
                            { type: 'string' } : null);
    
    if (!operationField) return [];
    
    const operations: string[] = [];
    
    // ✅ SOURCE 1: Extract from examples (array of strings)
    if (operationField.examples && Array.isArray(operationField.examples)) {
      operations.push(...operationField.examples.map((op: any) => String(op).toLowerCase().trim()));
    }
    
    // ✅ SOURCE 2: Extract from options (array of {label, value} objects or strings)
    if (operationField.options && Array.isArray(operationField.options)) {
      for (const option of operationField.options) {
        if (typeof option === 'string') {
          operations.push(option.toLowerCase().trim());
        } else if (option && typeof option === 'object') {
          // Handle {label, value} format
          if (option.value) {
            operations.push(String(option.value).toLowerCase().trim());
          } else if (option.label) {
            // Fallback to label if value not present
            operations.push(String(option.label).toLowerCase().trim());
          }
        }
      }
    }
    
    // ✅ SOURCE 3: Extract from default (single default operation)
    if (operationField.default) {
      const defaultOp = String(operationField.default).toLowerCase().trim();
      if (!operations.includes(defaultOp)) {
        operations.push(defaultOp);
      }
    }
    
    // ✅ Deduplicate and filter empty strings
    return Array.from(new Set(operations.filter(Boolean)));
  }
  
  /**
   * Calculate confidence score for verb-to-operation matching
   * 
   * @param verb - Verb from user prompt
   * @param operation - Operation from schema
   * @returns Confidence score (0.0 - 1.0)
   */
  private calculateVerbOperationConfidence(verb: string, operation: string): number {
    const verbLower = verb.toLowerCase().trim();
    const opLower = operation.toLowerCase().trim();
    
    // Exact match (highest confidence)
    if (verbLower === opLower) return 1.0;
    
    // Synonym matching (high confidence)
    const synonymMap: Record<string, string[]> = {
      'send': ['notify', 'deliver', 'dispatch', 'post', 'publish', 'share'],
      'read': ['get', 'fetch', 'retrieve', 'pull', 'load', 'list'],
      'create': ['add', 'insert', 'new', 'make'],
      'update': ['modify', 'edit', 'change', 'alter'],
      'delete': ['remove', 'erase', 'drop', 'clear'],
      'write': ['save', 'store', 'persist'],
      'query': ['search', 'find', 'lookup'],
    };
    
    // Check if verb is synonym of operation
    for (const [op, synonyms] of Object.entries(synonymMap)) {
      if (op === opLower && synonyms.includes(verbLower)) return 0.9;
      if (verbLower === op && synonyms.includes(opLower)) return 0.9;
    }
    
    // Partial match (medium confidence)
    if (verbLower.includes(opLower) || opLower.includes(verbLower)) return 0.7;
    
    // No match
    return 0.0;
  }
  
  /**
   * Get default operation based on node category (fallback)
   * 
   * @param nodeType - Node type
   * @returns Default operation with confidence 0.5
   */
  private getDefaultOperationByCategory(nodeType: string): { operation: string; confidence: number } {
    const { unifiedNodeRegistry } = require('../../core/registry/unified-node-registry');
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    
    if (!nodeDef) {
      return { operation: 'execute', confidence: 0.3 }; // Last resort
    }
    
    // Category-based defaults
    const categoryDefaults: Record<string, string> = {
      'data': 'read',
      'communication': 'send',
      'ai': 'process',
      'transformation': 'transform',
      'logic': 'evaluate',
      'utility': 'execute',
    };
    
    const defaultOp = categoryDefaults[nodeDef.category] || 'execute';
    return { operation: defaultOp, confidence: 0.5 };
  }
  
  /**
   * Build dependency graph based on data flow and intent logic
   * Prevents Error #2: Incorrect execution order
   */
  private buildDependencyGraph(
    nodes: NodeRequirement[],
    intent: SimpleIntent
  ): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    
    for (const node of nodes) {
      const dependencies: string[] = [];
      const nodeDef = unifiedNodeRegistry.get(node.type);
      
      if (!nodeDef) {
        graph.set(node.id, []);
        continue;
      }
      
      // ✅ DEPENDENCY 1: Data flow (node A output → node B input)
      // Check if this node needs input from another node
      if (node.category === 'transformation' || node.category === 'output') {
        // Transformations and outputs need data sources first
        const dataSources = nodes.filter(n => n.category === 'dataSource');
        if (dataSources.length > 0) {
          // Depend on all data sources (they can run in parallel)
          dependencies.push(...dataSources.map(n => n.id));
        }
      }
      
      // ✅ DEPENDENCY 2: Intent logic (read → transform → write)
      // Based on intent understanding, not just category
      if (node.category === 'output') {
        // Outputs need transformations or data sources
        const transformations = nodes.filter(n => n.category === 'transformation');
        if (transformations.length > 0) {
          // Depend on last transformation
          dependencies.push(transformations[transformations.length - 1].id);
        } else {
          // Or depend on data sources if no transformations
          const dataSources = nodes.filter(n => n.category === 'dataSource');
          if (dataSources.length > 0) {
            dependencies.push(...dataSources.map(n => n.id));
          }
        }
      }
      
      // ✅ DEPENDENCY 3: Condition logic (branching nodes need data sources first)
      // ✅ ROOT-LEVEL FIX: Use registry to detect branching nodes instead of hardcoded check
      // Note: nodeDef already declared above, reuse it
      if (nodeDef?.isBranching) {
        // Conditions need data sources first
        const dataSources = nodes.filter(n => n.category === 'dataSource');
        if (dataSources.length > 0) {
          dependencies.push(...dataSources.map(n => n.id));
        }
      }
      
      // ✅ DEPENDENCY 4: Use node dependency resolver (registry-based)
      const nodeDependencies = nodeDependencyResolver.resolveDependencies(node.type, nodes.map(n => n.type));
      for (const depType of nodeDependencies) {
        const depNode = nodes.find(n => n.type === depType);
        if (depNode && !dependencies.includes(depNode.id)) {
          dependencies.push(depNode.id);
        }
      }
      
      graph.set(node.id, dependencies);
    }
    
    return graph;
  }
  
  /**
   * Determine execution order using topological sort
   * Prevents Error #2: Incorrect execution order
   */
  private determineExecutionOrder(
    nodes: NodeRequirement[],
    dependencyGraph: Map<string, string[]>
  ): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];
    
    const visit = (nodeId: string) => {
      if (visiting.has(nodeId)) {
        // Circular dependency detected - skip
        return;
      }
      if (visited.has(nodeId)) {
        return;
      }
      
      visiting.add(nodeId);
      
      // Visit dependencies first
      const dependencies = dependencyGraph.get(nodeId) || [];
      for (const depId of dependencies) {
        visit(depId);
      }
      
      visiting.delete(nodeId);
      visited.add(nodeId);
      order.push(nodeId);
    };
    
    // Visit all nodes
    for (const node of nodes) {
      if (!visited.has(node.id)) {
        visit(node.id);
      }
    }
    
    return order;
  }
  
  /**
   * Add missing implicit nodes
   * 
   * Examples:
   * - If intent has "summarize" but no AI node → add ai_chat_model
   * - If intent has conditions but no if_else → add if_else
   */
  private addImplicitNodes(
    nodes: NodeRequirement[],
    intent: SimpleIntent,
    originalPrompt?: string
  ): NodeRequirement[] {
    const completeNodes = [...nodes];
    const existingTypes = new Set(nodes.map(n => n.type));
    
    // Check for missing transformations
    if (intent.transformations && intent.transformations.length > 0) {
      for (const transformation of intent.transformations) {
        const transformationLower = transformation.toLowerCase();
        
        // Check if transformation node already exists
        const hasTransformation = nodes.some(n => {
          const nodeDef = unifiedNodeRegistry.get(n.type);
          const label = nodeDef?.label || n.type;
          return label.toLowerCase().includes(transformationLower);
        });
        
        if (!hasTransformation) {
          // Try to find matching transformation node
          const nodeType = this.findTransformationNode(transformation);
          if (nodeType && !existingTypes.has(nodeType)) {
            completeNodes.push({
              id: `tf_${completeNodes.length}`,
              type: nodeType,
              operation: 'transform',
              category: 'transformation',
            });
            existingTypes.add(nodeType);
          }
        }
      }
    }
    
    // Check for missing conditions
    if (intent.conditions && intent.conditions.length > 0) {
      for (const condition of intent.conditions) {
        const conditionType = condition.type === 'switch' ? 'switch' : 'if_else';
        if (!existingTypes.has(conditionType)) {
          completeNodes.push({
            id: `cond_${completeNodes.length}`,
            type: conditionType,
            operation: 'evaluate',
            category: 'transformation',
          });
          existingTypes.add(conditionType);
        }
      }
    }
    
    return completeNodes;
  }
  
  /**
   * Find transformation node for a transformation verb
   */
  private findTransformationNode(transformation: string): string | null {
    const transformationLower = transformation.toLowerCase();
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    
    for (const nodeType of allNodeTypes) {
      if (!nodeCapabilityRegistryDSL.isTransformation(nodeType)) continue;
      
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      const label = nodeDef.label || nodeType;
      const labelLower = label.toLowerCase();
      const keywords = nodeDef.tags || [];
      
      // Check if transformation matches
      if (labelLower.includes(transformationLower) || transformationLower.includes(labelLower)) {
        return nodeType;
      }
      
      // Check keywords
      for (const keyword of keywords) {
        if (keyword.toLowerCase() === transformationLower) {
          return nodeType;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Build StructuredIntent from node requirements and execution order
   */
  private buildStructuredIntent(
    nodes: NodeRequirement[],
    executionOrder: string[],
    intent: SimpleIntent
  ): StructuredIntent {
    // Build trigger
    const trigger = this.mapTriggerType(intent.trigger?.type || 'manual');
    const triggerConfig = intent.trigger?.type === 'schedule' ? {
      interval: 'daily', // Default, can be inferred from prompt
    } : undefined;
    
    // Separate nodes by category
    const dataSourceNodes = nodes.filter(n => n.category === 'dataSource');
    const transformationNodes = nodes.filter(n => n.category === 'transformation');
    const outputNodes = nodes.filter(n => n.category === 'output');
    
    // Build actions (outputs)
    const actions = outputNodes.map(node => ({
      type: node.type,
      operation: node.operation,
      config: node.config,
    }));
    
    // Build dataSources
    const dataSources = dataSourceNodes.map(node => ({
      type: node.type,
      operation: node.operation,
      config: node.config,
    }));
    
    // Build transformations
    const transformations = transformationNodes.map(node => ({
      type: node.type,
      operation: node.operation,
      config: node.config,
    }));
    
    // Build conditions
    const conditions = intent.conditions?.map(condition => ({
      type: (condition.type || 'if_else') as 'if_else' | 'switch',
      condition: condition.description,
      true_path: condition.type === 'if' ? ['continue'] : undefined,
      false_path: condition.type === 'if' ? ['skip'] : undefined,
    }));
    
    // Extract required credentials
    const requires_credentials = this.extractRequiredCredentials(nodes);
    
    return {
      trigger,
      trigger_config: triggerConfig,
      actions,
      dataSources: dataSources.length > 0 ? dataSources : undefined,
      transformations: transformations.length > 0 ? transformations : undefined,
      conditions: conditions && conditions.length > 0 ? conditions : undefined,
      requires_credentials,
    };
  }
  
  /**
   * Map SimpleIntent trigger to StructuredIntent trigger
   */
  private mapTriggerType(triggerType: string): string {
    const triggerMap: Record<string, string> = {
      'schedule': 'schedule',
      'manual': 'manual_trigger',
      'webhook': 'webhook',
      'event': 'webhook', // Events use webhook
      'form': 'form',
      'chat': 'chat_trigger',
    };
    
    return triggerMap[triggerType] || 'manual_trigger';
  }
  
  /**
   * Extract required credentials from nodes
   */
  private extractRequiredCredentials(nodes: NodeRequirement[]): string[] {
    const credentials = new Set<string>();
    
    for (const node of nodes) {
      const nodeDef = unifiedNodeRegistry.get(node.type);
      if (!nodeDef || !nodeDef.credentialSchema) continue;
      
      const requirements = nodeDef.credentialSchema.requirements || [];
      for (const req of requirements) {
        if (req.category) {
          credentials.add(req.category);
        }
      }
    }
    
    return Array.from(credentials);
  }
}

// Export singleton instance
export const intentAwarePlanner = IntentAwarePlanner.getInstance();
