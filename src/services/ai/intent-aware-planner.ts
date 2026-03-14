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
import { getOperationSemantic, getDSLCategoryFromSemantic } from '../../core/registry/node-operation-semantics';

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
   * @param mandatoryNodes - Optional mandatory node types from keyword extraction (Stage 1)
   * @param mandatoryNodesWithOperations - Optional nodes with operation hints from keyword extraction
   * @returns Planning result with StructuredIntent
   */
  async planWorkflow(
    intent: SimpleIntent,
    originalPrompt?: string,
    mandatoryNodes?: string[],
    mandatoryNodesWithOperations?: Array<{ nodeType: string; operationHint?: string; context?: string }>,
    selectedStructuredPrompt?: string // ✅ NEW: Selected prompt variation for context-aware mapping
  ): Promise<PlanningResult> {
    console.log('[IntentAwarePlanner] Planning workflow from SimpleIntent...');
    
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      // Step 1: Understand intent type
      const intentType = this.understandIntentType(intent);
      console.log(`[IntentAwarePlanner] Intent type: ${intentType.type} - ${intentType.description}`);
      
      // Step 2: Map entities to node types using registry
      let nodeRequirements = await this.determineRequiredNodes(intent, originalPrompt);
      console.log(`[IntentAwarePlanner] Determined ${nodeRequirements.length} required nodes`);
      
      // ✅ NEW: Enforce mandatory nodes from keyword extraction (Stage 1)
      if (mandatoryNodes && mandatoryNodes.length > 0) {
        console.log(`[IntentAwarePlanner] 🔒 Enforcing ${mandatoryNodes.length} mandatory node(s): ${mandatoryNodes.join(', ')}`);
        nodeRequirements = await this.enforceMandatoryNodes(
          nodeRequirements, 
          mandatoryNodes, 
          mandatoryNodesWithOperations
        );
        console.log(`[IntentAwarePlanner] After enforcement: ${nodeRequirements.length} required nodes`);
      }
      
      // Step 3: Build dependency graph (CRITICAL - Prevents Error #2)
      const dependencyGraph = this.buildDependencyGraph(nodeRequirements, intent);
      console.log(`[IntentAwarePlanner] Built dependency graph with ${dependencyGraph.size} nodes`);
      
      // Step 4: Determine execution order using topological sort (Prevents Error #2)
      const executionOrder = this.determineExecutionOrder(nodeRequirements, dependencyGraph);
      console.log(`[IntentAwarePlanner] Execution order: ${executionOrder.length} nodes`);
      
      // Step 5: Add missing implicit nodes (with duplicate check)
      const completeNodes = await this.addImplicitNodes(nodeRequirements, intent, originalPrompt, selectedStructuredPrompt);
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
    
    // ✅ PHASE D: PRIORITY 1 - Use nodeMentions (deterministic, highest confidence)
    // These are extracted directly from prompt using registry - most reliable
    if (intent.nodeMentions && intent.nodeMentions.length > 0) {
      console.log(`[IntentAwarePlanner] ✅ Processing ${intent.nodeMentions.length} node mention(s) from prompt`);
      
      const { nodeOperationIndex } = await import('../../core/registry/node-operation-index');
      nodeOperationIndex.initialize();
      
      for (const mention of intent.nodeMentions) {
        if (nodeIds.has(mention.nodeType)) {
          console.log(`[IntentAwarePlanner] ⚠️  Node ${mention.nodeType} already added, skipping duplicate`);
          continue;
        }
        
        // Verify node exists in registry
        const nodeDef = unifiedNodeRegistry.get(mention.nodeType);
        if (!nodeDef) {
          console.warn(`[IntentAwarePlanner] ⚠️  Node mention "${mention.nodeType}" not found in registry, skipping`);
          continue;
        }
        
        // ✅ OPERATIONS-FIRST: Skip trigger nodes - they're handled separately
        if (nodeDef.category === 'trigger') {
          console.log(`[IntentAwarePlanner] ⚠️  Skipping trigger node ${mention.nodeType} - triggers handled separately`);
          continue; // Don't add to nodes array
        }
        
        // ✅ OPERATIONS-FIRST: Use operations from enriched nodeMentions if available
        // This ensures we use exact operations from node schema, not derived ones
        let operation: string;
        if (mention.operations && mention.operations.length > 0) {
          // Operations already enriched from schema (from IntentExtractor)
          if (mention.verbs && mention.verbs.length > 0) {
            // Find best matching operation from node's available operations
            const operationMatch = nodeOperationIndex.findBestOperation(mention.nodeType, mention.verbs);
            if (operationMatch && mention.operations.includes(operationMatch.operation)) {
              // Operation from verb matching exists in node's schema - use it
              operation = operationMatch.operation;
              console.log(`[IntentAwarePlanner] ✅ Mapped verbs [${mention.verbs.join(', ')}] → operation "${operation}" for ${mention.nodeType} (from schema, confidence: ${(operationMatch.confidence * 100).toFixed(1)}%)`);
            } else {
              // Verb doesn't match any schema operation - use default
              operation = mention.defaultOperation || mention.operations[0];
              console.log(`[IntentAwarePlanner] ✅ Using default operation "${operation}" for ${mention.nodeType} (verbs didn't match schema operations)`);
            }
          } else {
            // No verbs, use default operation from schema
            operation = mention.defaultOperation || mention.operations[0];
            console.log(`[IntentAwarePlanner] ✅ Using default operation "${operation}" for ${mention.nodeType} (from enriched nodeMentions)`);
          }
        } else {
          // Operations not enriched - fallback to NodeOperationIndex
          console.warn(`[IntentAwarePlanner] ⚠️  Operations not enriched for ${mention.nodeType}, using NodeOperationIndex fallback`);
          if (mention.verbs && mention.verbs.length > 0) {
            const operationMatch = nodeOperationIndex.findBestOperation(mention.nodeType, mention.verbs);
            if (operationMatch) {
              operation = operationMatch.operation;
            } else {
              const defaultOp = nodeOperationIndex.getDefaultOperation(mention.nodeType);
              // Use provisional category based on registry for operation hint mapping only
              const provisionalCategory = nodeDef.category === 'data'
                ? 'dataSource'
                : nodeDef.category === 'ai' || nodeDef.category === 'transformation'
                  ? 'transformation'
                  : 'output';
              operation = defaultOp || await this.mapOperationFromHint(mention.nodeType, mention.verbs[0], provisionalCategory, nodeDef);
            }
          } else {
            const defaultOp = nodeOperationIndex.getDefaultOperation(mention.nodeType);
            const provisionalCategory = nodeDef.category === 'data'
              ? 'dataSource'
              : nodeDef.category === 'ai' || nodeDef.category === 'transformation'
                ? 'transformation'
                : 'output';
            operation = defaultOp || await this.mapOperationFromHint(mention.nodeType, undefined, provisionalCategory, nodeDef);
          }
        }

        // ✅ OPERATION-FIRST ROLE ASSIGNMENT: Decide DSL category from operation semantics
        const semanticInfo = getOperationSemantic(mention.nodeType, operation);
        const category = getDSLCategoryFromSemantic(semanticInfo.semantic, mention.nodeType);
        console.log(
          `[IntentAwarePlanner] ✅ OPERATION-FIRST: Using operation "${operation}" (semantic="${semanticInfo.semantic}") → DSL category "${category}" for ${mention.nodeType}`
        );
        
        nodes.push({
          id: `mention_${nodes.length}`,
          type: mention.nodeType,
          operation,
          category,
        });
        nodeIds.add(mention.nodeType);
        
        console.log(`[IntentAwarePlanner] ✅ Added node from mention: ${mention.nodeType} (${category}, operation: ${operation}, confidence: ${(mention.confidence * 100).toFixed(1)}%)`);
      }
    }
    
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
          // ✅ Use registry-driven operation mapping based on verbs and schema
          const nodeDef = unifiedNodeRegistry.get(nodeType);
          const category: 'dataSource' | 'transformation' | 'output' = 'output';
          const verbHint = intent.verbs && intent.verbs.length > 0 ? intent.verbs[0] : undefined;
          const operation = await this.mapOperationFromHint(nodeType, verbHint, category, nodeDef);

          nodes.push({
            id: `out_${nodes.length}`,
            type: nodeType,
            operation,
            category,
          });
          nodeIds.add(nodeType);
        }
      }
    }

    // Map providers to nodes (universal support for service mentions like GitHub, Jenkins)
    // Providers can act as data sources or outputs depending on category
    if (intent.providers && intent.providers.length > 0) {
      for (const provider of intent.providers) {
        const nodeType = await this.mapEntityToNodeType(provider, 'dataSource', originalPrompt);
        if (nodeType && !nodeIds.has(nodeType)) {
          const nodeDef = unifiedNodeRegistry.get(nodeType);
          let category: 'dataSource' | 'transformation' | 'output' = 'dataSource';

          if (nodeDef) {
            if (nodeCapabilityRegistryDSL.isDataSource(nodeType)) {
              category = 'dataSource';
            } else if (nodeCapabilityRegistryDSL.isTransformation(nodeType)) {
              category = 'transformation';
            } else if (nodeCapabilityRegistryDSL.isOutput(nodeType)) {
              category = 'output';
            }
          }

          const verbHint = intent.verbs && intent.verbs.length > 0 ? intent.verbs[0] : undefined;
          const operation = await this.mapOperationFromHint(nodeType, verbHint, category, nodeDef);

          nodes.push({
            id: `prov_${nodes.length}`,
            type: nodeType,
            operation,
            category,
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
    
    // ✅ FIX #1: Detect transformation verbs in original prompt (e.g., "summarise", "analyze")
    // This ensures AI nodes are added when user explicitly mentions transformation verbs
    if (originalPrompt) {
      try {
        const { TransformationDetector } = await import('./transformation-detector');
        const transformationDetector = new TransformationDetector();
        const detection = transformationDetector.detectTransformations(originalPrompt);
        
        if (detection.detected && detection.requiredNodeTypes.length > 0) {
          console.log(`[IntentAwarePlanner] ✅ Detected transformation verbs: ${detection.verbs.join(', ')}`);
          console.log(`[IntentAwarePlanner] ✅ Required AI node types: ${detection.requiredNodeTypes.join(', ')}`);
          
          // Check if any AI transformation node already exists
          const existingAINodes = nodes.filter(n => {
            const nodeType = unifiedNormalizeNodeTypeString(n.type);
            return detection.requiredNodeTypes.some(requiredType => {
              const requiredNormalized = unifiedNormalizeNodeTypeString(requiredType);
              // Check if node type matches or is semantically equivalent
              return nodeType === requiredNormalized || 
                     nodeType.includes('ai') || 
                     nodeType.includes('chat') ||
                     nodeType.includes('llm');
            });
          });
          
          if (existingAINodes.length === 0) {
            // No AI node exists - add the first required AI node type
            const aiNodeType = detection.requiredNodeTypes[0];
            const normalizedAINodeType = unifiedNormalizeNodeTypeString(aiNodeType);
            
            // Determine operation from detected verb
            // ✅ UNIVERSAL: Map TransformationVerb enum to operation string
            let operation = 'transform';
            const { TransformationVerb } = await import('./transformation-detector');
            if (detection.verbs.includes(TransformationVerb.SUMMARIZE)) {
              operation = 'summarize';
            } else if (detection.verbs.includes(TransformationVerb.ANALYZE)) {
              operation = 'analyze';
            } else if (detection.verbs.includes(TransformationVerb.CLASSIFY)) {
              operation = 'classify';
            } else if (detection.verbs.includes(TransformationVerb.GENERATE)) {
              operation = 'generate';
            } else if (detection.verbs.includes(TransformationVerb.TRANSLATE)) {
              operation = 'translate';
            } else if (detection.verbs.includes(TransformationVerb.EXTRACT)) {
              operation = 'extract';
            }
            
            nodes.push({
              id: `tf_ai_${nodes.length}`,
              type: normalizedAINodeType,
              operation,
              category: 'transformation',
            });
            nodeIds.add(normalizedAINodeType);
            console.log(`[IntentAwarePlanner] ✅ Added AI transformation node: ${normalizedAINodeType} (operation: ${operation}) from detected verb: ${detection.verbs[0]}`);
          } else {
            console.log(`[IntentAwarePlanner] ✅ AI transformation node already exists: ${existingAINodes.map(n => n.type).join(', ')}`);
          }
        }
      } catch (error) {
        console.warn(`[IntentAwarePlanner] ⚠️  Failed to detect transformations: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    return nodes;
  }
  
  /**
   * ✅ NEW: Enforce mandatory nodes in node requirements
   * Ensures all mandatory nodes (from keyword extraction) are included
   * ✅ PHASE A: Uses NodeOperationIndex (registry-driven, not hardcoded)
   */
  private async enforceMandatoryNodes(
    nodeRequirements: NodeRequirement[],
    mandatoryNodes: string[],
    mandatoryNodesWithOperations?: Array<{ nodeType: string; operationHint?: string; context?: string }>
  ): Promise<NodeRequirement[]> {
    const existingNodeTypes = new Set<string>();
    nodeRequirements.forEach(req => {
      existingNodeTypes.add(req.type.toLowerCase());
    });
    
    // Create a map of node type to operation hint for quick lookup
    const operationHintsMap = new Map<string, string | undefined>();
    if (mandatoryNodesWithOperations) {
      for (const nodeInfo of mandatoryNodesWithOperations) {
        operationHintsMap.set(nodeInfo.nodeType.toLowerCase(), nodeInfo.operationHint);
      }
    }
    
    const missingNodes: NodeRequirement[] = [];
    for (const mandatoryNode of mandatoryNodes) {
      const mandatoryLower = mandatoryNode.toLowerCase();
      const isIncluded = Array.from(existingNodeTypes).some(existing => 
        existing === mandatoryLower || existing.includes(mandatoryLower) || mandatoryLower.includes(existing)
      );
      
      if (!isIncluded) {
        // Determine category based on node type
        const nodeDef = unifiedNodeRegistry.get(mandatoryNode);
        let category: 'dataSource' | 'transformation' | 'output' = 'output';
        if (nodeDef) {
          if (nodeCapabilityRegistryDSL.isDataSource(mandatoryNode)) {
            category = 'dataSource';
          } else if (nodeCapabilityRegistryDSL.isTransformation(mandatoryNode)) {
            category = 'transformation';
          } else if (nodeCapabilityRegistryDSL.isOutput(mandatoryNode)) {
            category = 'output';
          }
        }
        
        // ✅ PHASE A: Use NodeOperationIndex for operation mapping
        const operationHint = operationHintsMap.get(mandatoryLower);
        const operation = await this.mapOperationFromHint(mandatoryNode, operationHint, category, nodeDef);
        
        missingNodes.push({
          id: `mandatory_${missingNodes.length}`,
          type: mandatoryNode,
          operation,
          category,
        });
        console.log(`[IntentAwarePlanner] ✅ Adding mandatory node: ${mandatoryNode} (category: ${category}, operation: ${operation}${operationHint ? `, hint: ${operationHint}` : ''})`);
      } else {
        console.log(`[IntentAwarePlanner] ✅ Mandatory node already included: ${mandatoryNode}`);
      }
    }
    
    if (missingNodes.length > 0) {
      console.log(`[IntentAwarePlanner] ✅ Added ${missingNodes.length} mandatory node(s) to requirements`);
      return [...nodeRequirements, ...missingNodes];
    }
    
    return nodeRequirements;
  }
  
  /**
   * ✅ PHASE A: Map operation from hint using NodeOperationIndex (registry-driven)
   * Uses universal, schema-based operation index - no hardcoding
   */
  private async mapOperationFromHint(
    nodeType: string,
    operationHint: string | undefined,
    category: 'dataSource' | 'transformation' | 'output',
    nodeDef?: any
  ): Promise<string> {
    // ✅ Use NodeOperationIndex (registry-driven)
    const { nodeOperationIndex } = await import('../../core/registry/node-operation-index');
    nodeOperationIndex.initialize();
    
    // If no node definition, fallback to category-based default
    if (!nodeDef) {
      const defaultOp = nodeOperationIndex.getDefaultOperation(nodeType);
      if (defaultOp) return defaultOp;
      
      return category === 'dataSource' ? 'read' : 
             category === 'transformation' ? 'transform' : 
             'send';
    }
    
    // ✅ Use NodeOperationIndex to find best operation from hint
    if (operationHint) {
      const verbTokens = [operationHint];
      const operationMatch = nodeOperationIndex.findBestOperation(nodeType, verbTokens);
      
      if (operationMatch && operationMatch.confidence > 0.3) {
        console.log(`[IntentAwarePlanner] ✅ NodeOperationIndex mapped "${operationHint}" → "${operationMatch.operation}" for ${nodeType} (confidence: ${(operationMatch.confidence * 100).toFixed(1)}%)`);
        return operationMatch.operation;
      }
    }
    
    // ✅ Fallback: Use default operation from index or schema
    const defaultOp = nodeOperationIndex.getDefaultOperation(nodeType);
    if (defaultOp) return defaultOp;
    
    const defaultOperation = this.getDefaultOperation(nodeDef, category, this.getOperationsFromSchema(nodeDef), nodeType);
    return defaultOperation;
  }
  
  /**
   * ✅ SYNC VERSION: For backward compatibility
   */
  private mapOperationFromHintSync(
    nodeType: string,
    operationHint: string | undefined,
    category: 'dataSource' | 'transformation' | 'output',
    nodeDef?: any
  ): string {
    // If no node definition, fallback to category-based default
    if (!nodeDef) {
      return category === 'dataSource' ? 'read' : 
             category === 'transformation' ? 'transform' : 
             'send';
    }
    
    // ✅ Get available operations from schema
    const availableOperations = this.getOperationsFromSchema(nodeDef);
    
    // ✅ Map operation hint to schema operation (legacy method)
    if (operationHint) {
      const mappedOperation = this.mapVerbToOperation(operationHint, availableOperations, nodeType);
      if (mappedOperation) {
        console.log(`[IntentAwarePlanner] ✅ Mapped operation hint "${operationHint}" → "${mappedOperation}" for ${nodeType}`);
        return mappedOperation;
      }
    }
    
    // ✅ Fallback: Use default operation from schema or category
    const defaultOperation = this.getDefaultOperation(nodeDef, category, availableOperations, nodeType);
    return defaultOperation;
  }
  
  /**
   * ✅ NEW: Get operations from node schema
   */
  private getOperationsFromSchema(nodeDef: any): string[] {
    const operations: string[] = [];
    
    // Try to get operations from config schema
    if (nodeDef.inputSchema?.properties?.operation) {
      const operationField = nodeDef.inputSchema.properties.operation;
      if (operationField.enum) {
        operations.push(...operationField.enum);
      } else if (operationField.oneOf) {
        for (const option of operationField.oneOf) {
          if (option.const) {
            operations.push(option.const);
          }
        }
      }
    }
    
    // Also check defaultConfig for operation
    if (nodeDef.defaultConfig && typeof nodeDef.defaultConfig === 'function') {
      const defaultConfig = nodeDef.defaultConfig();
      if (defaultConfig.operation) {
        if (!operations.includes(defaultConfig.operation)) {
          operations.push(defaultConfig.operation);
        }
      }
    }
    
    return operations;
  }
  
  /**
   * ✅ NEW: Map verb to operation using schema operations (universal)
   */
  private mapVerbToOperation(
    verb: string,
    availableOperations: string[],
    nodeType: string
  ): string | null {
    const verbLower = verb.toLowerCase().trim();
    if (!verbLower || availableOperations.length === 0) {
      return null;
    }

    /**
     * ✅ WORLD-CLASS, REGISTRY-DRIVEN APPROACH:
     *
     * - We DO NOT hardcode verb→operation lists.
     * - We derive matches ONLY from the operations that exist in the node schema.
     * - Matching is done by string/token similarity between:
     *     - the verb from the prompt (e.g. "monitor", "export")
     *     - the operation names exposed by the node (e.g. "listRepos", "get_build_status")
     *
     * This keeps the registry as the single source of truth:
     * - If you add a new operation in the schema, it is automatically considered here.
     * - No additional hard-coded knowledge is needed in the planner.
     */

    // Helper: split operation name into semantic tokens
    const tokenizeOperationName = (op: string): string[] => {
      if (!op) return [];
      // Normalize camelCase → space separated
      const camelSpaced = op.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
      // Replace separators with space and split
      return camelSpaced
        .toLowerCase()
        .replace(/[_\-\s]+/g, ' ')
        .split(' ')
        .filter(Boolean);
    };

    let bestOp: string | null = null;
    let bestScore = 0;

    for (const op of availableOperations) {
      const opLower = op.toLowerCase();
      const tokens = tokenizeOperationName(op);

      let score = 0;

      // 1) Exact token match: verb == one of the tokens
      if (tokens.some(t => t === verbLower)) {
        score = 3;
      }
      // 2) Prefix/substring match between verb and any token
      else if (
        tokens.some(
          t =>
            t.startsWith(verbLower) ||
            verbLower.startsWith(t) ||
            t.includes(verbLower) ||
            verbLower.includes(t),
        )
      ) {
        score = 2;
      }
      // 3) Fallback: verb appears anywhere in the raw operation name
      else if (opLower.includes(verbLower)) {
        score = 1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestOp = op;
      }
    }

    // Require a minimum score to consider it a valid semantic match
    if (bestScore > 0) {
      return bestOp;
    }

    // No good match found – let caller fall back to schema defaults
    return null;
  }
  
  /**
   * ✅ NEW: Get default operation from schema or category
   */
  private getDefaultOperation(
    nodeDef: any,
    category: 'dataSource' | 'transformation' | 'output',
    availableOperations: string[],
    nodeType?: string
  ): string {
    // Try to get default from schema
    if (nodeDef.defaultConfig && typeof nodeDef.defaultConfig === 'function') {
      const defaultConfig = nodeDef.defaultConfig();
      if (defaultConfig.operation && availableOperations.includes(defaultConfig.operation)) {
        return defaultConfig.operation;
      }
    }
    
    // Fallback to category-based defaults
    if (category === 'dataSource') {
      // Prefer read operations
      const readOps = availableOperations.filter(op => 
        ['read', 'get', 'list', 'fetch'].some(r => op.toLowerCase().includes(r))
      );
      if (readOps.length > 0) return readOps[0];
    } else if (category === 'transformation') {
      // Prefer transform operations
      const transformOps = availableOperations.filter(op => 
        ['transform', 'process', 'convert'].some(t => op.toLowerCase().includes(t))
      );
      if (transformOps.length > 0) return transformOps[0];
    } else if (category === 'output') {
      // ✅ UNIVERSAL: Use NodeOperationSemantics to find write operations (not hardcoded list)
      const { isWriteOperationForNode } = require('../../core/registry/node-operation-semantics');
      const writeOps = availableOperations.filter(op => 
        isWriteOperationForNode(nodeType, op)
      );
      if (writeOps.length > 0) return writeOps[0];
      
      // Fallback: Check for common write patterns (universal algorithm, not hardcoded)
      const sendOps = availableOperations.filter(op => {
        const opLower = op.toLowerCase();
        return /^(send|post|push|create|write|export|publish|upload|submit)/.test(opLower);
      });
      if (sendOps.length > 0) return sendOps[0];
    }
    
    // Final fallback: use first available operation or category default
    if (availableOperations.length > 0) {
      return availableOperations[0];
    }
    
    return category === 'dataSource' ? 'read' : 
           category === 'transformation' ? 'transform' : 
           'send';
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
   * - ✅ PHASE 2-2: Ensure at least one output node exists for non-chatbot flows
   */
  private async addImplicitNodes(
    nodes: NodeRequirement[],
    intent: SimpleIntent,
    originalPrompt?: string,
    selectedStructuredPrompt?: string // ✅ NEW: Selected prompt variation for context-aware mapping
  ): Promise<NodeRequirement[]> {
    const completeNodes = [...nodes];
    const existingTypes = new Set(nodes.map(n => n.type));
    
    // ✅ PHASE 2-2: Check for missing transformations
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
    
    // ✅ PHASE 2-2: Check for missing conditions
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
    
    // ✅ PHASE 2-2: Ensure at least one output node exists (unless it's a chatbot flow)
    const hasOutput = completeNodes.some(n => {
      const nodeDef = unifiedNodeRegistry.get(n.type);
      return nodeDef && (
        nodeCapabilityRegistryDSL.isOutput(n.type) ||
        nodeCapabilityRegistryDSL.hasCapability(n.type, 'canServeAsOutput') ||
        nodeDef.category === 'communication'
      );
    });
    
    // Check if this is a chatbot flow (has chat_trigger or ai_agent)
    const isChatbotFlow = completeNodes.some(n => 
      n.type === 'chat_trigger' || n.type === 'ai_agent' || n.type === 'chatbot'
    ) || intent.trigger?.type === 'chat';
    
    if (!hasOutput && !isChatbotFlow) {
      // Try to infer output from destinations or intent
      let outputNodeType: string | null = null;
      
      if (intent.destinations && intent.destinations.length > 0) {
        // Try to map destination to output node
        const destination = intent.destinations[0];
        const nodeType = await this.mapEntityToNodeType(destination, 'output', originalPrompt);
        if (nodeType && !existingTypes.has(nodeType)) {
          outputNodeType = nodeType;
        }
      }
      
      // ✅ CRITICAL FIX: Use selectedStructuredPrompt for fallback (not originalPrompt)
      // This ensures we check the actual selected variation, not the original prompt
      if (!outputNodeType) {
        // ✅ PRIORITY 1: Check selectedStructuredPrompt (the actual variation being used)
        const selectedPromptLower = (selectedStructuredPrompt || '').toLowerCase();
        // ✅ PRIORITY 2: Fallback to originalPrompt for context (if selectedStructuredPrompt doesn't have enough info)
        const originalPromptLower = (originalPrompt || '').toLowerCase();
        const promptLower = selectedPromptLower || originalPromptLower;
        
        // ✅ CONTEXT-AWARE: If selected variation says "Email" but original says "Gmail", map to google_gmail
        const selectedMentionsEmail = selectedPromptLower.includes('email') || selectedPromptLower.includes('mail');
        const originalMentionsGmail = originalPromptLower.includes('gmail') || 
                                     originalPromptLower.includes('google mail') || 
                                     originalPromptLower.includes('google email');
        const originalMentionsGoogleServices = originalPromptLower.includes('google sheets') || 
                                               originalPromptLower.includes('google');
        
        if (selectedMentionsEmail && (originalMentionsGmail || originalMentionsGoogleServices)) {
          // ✅ Context-aware mapping: "Email" in selected variation + "Gmail" in original → google_gmail
          outputNodeType = 'google_gmail';
          console.log(`[IntentAwarePlanner] ✅ Context-aware mapping: "Email" in selected variation → google_gmail (original prompt mentions Gmail/Google)`);
        } else if (promptLower.includes('email') || promptLower.includes('gmail') || promptLower.includes('send')) {
          outputNodeType = 'google_gmail';
        } else if (promptLower.includes('slack') || promptLower.includes('message')) {
          outputNodeType = 'slack_message';
        } else {
          // Default to log node for terminal workflows
          outputNodeType = 'log';
        }
      }
      
      if (outputNodeType && !existingTypes.has(outputNodeType)) {
        const nodeDef = unifiedNodeRegistry.get(outputNodeType);
        const defaultOp = nodeDef?.defaultConfig?.()?.operation || 'write';
        
        console.log(`[IntentAwarePlanner] ✅ PHASE 2-2: Adding implicit output node: ${outputNodeType} (operation: ${defaultOp})`);
        completeNodes.push({
          id: `out_${completeNodes.length}`,
          type: outputNodeType,
          operation: defaultOp,
          category: 'output',
        });
        existingTypes.add(outputNodeType);
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
