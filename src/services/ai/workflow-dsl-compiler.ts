/**
 * Workflow DSL Compiler
 * 
 * Compiles WorkflowDSL into executable Workflow Graph.
 * 
 * This is the ONLY way to generate a workflow graph.
 * LLM cannot generate graph directly - it must go through DSL.
 * 
 * Pipeline: DSL -> Workflow Graph
 */

import { WorkflowDSL, DSLTrigger, DSLDataSource, DSLTransformation, DSLOutput, DSLExecutionStep } from './workflow-dsl';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { nodeLibrary } from '../nodes/node-library';
import { resolveCompatibleHandles } from './schema-driven-connection-resolver';
import { enhancedEdgeCreationService } from './enhanced-edge-creation-service';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { nodeTypeResolver } from '../nodes/node-type-resolver';
import { nodeTypeNormalizationService } from './node-type-normalization-service';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { UnifiedNodeDefinition } from '../../core/types/unified-node-contract';
import { NodeMetadataHelper, NodeMetadata, METADATA_PREFIXES } from '../../core/types/node-metadata';
import { randomUUID } from 'crypto';
// ✅ ERROR PREVENTION: Import universal validators
import { edgeCreationValidator, universalHandleResolver, universalBranchingValidator } from '../../core/error-prevention';

export interface DSLCompilationResult {
  success: boolean;
  workflow?: Workflow;
  errors: string[];
  warnings: string[];
  metadata?: {
    dsl: WorkflowDSL;
    nodeCount: number;
    edgeCount: number;
  };
}

/**
 * Workflow DSL Compiler
 * Compiles DSL to Workflow Graph
 */
export class WorkflowDSLCompiler {
  /**
   * Compile DSL to Workflow Graph
   * 
   * This is the ONLY method that generates workflow graphs.
   * LLM cannot call this directly - it must go through DSL.
   * 
   * @param dsl - Workflow DSL
   * @param originalPrompt - Original user prompt (for extracting switch cases, etc.)
   */
  compile(dsl: WorkflowDSL, originalPrompt?: string): DSLCompilationResult {
    console.log('[WorkflowDSLCompiler] Compiling DSL to Workflow Graph...');
    console.log(`[WorkflowDSLCompiler] DSL: ${dsl.dataSources.length} data sources, ${dsl.transformations.length} transformations, ${dsl.outputs.length} outputs`);
    
    // ✅ PHASE 2: Validate input contract at stage boundary
    const { validateWorkflowDSL } = require('../../core/contracts/pipeline-stage-contracts');
    const dslValidation = validateWorkflowDSL(dsl);
    if (!dslValidation.valid) {
      return {
        success: false,
        errors: [`Invalid WorkflowDSL: ${dslValidation.errors.join(', ')}`],
        warnings: dslValidation.warnings,
      };
    }

    // ✅ PHASE 3: PROACTIVE ERROR PREVENTION - Prevent errors at source
    const { preventAllErrors } = require('../../core/prevention/proactive-error-prevention');
    const prevention = preventAllErrors(dsl);
    if (prevention.prevented) {
      return {
        success: false,
        errors: prevention.errors,
        warnings: prevention.warnings,
      };
    }

    // ✅ PHASE 3: Build arrays immutably (use let for reassignment)
    let errors: string[] = [];
    let warnings: string[] = [];

    try {
      // STEP 0: Validate and normalize all node types BEFORE compilation
      // Never allow unknown node types to reach the compiler
      console.log('[WorkflowDSLCompiler] STEP 0: Validating all node types exist in NodeLibrary...');
      const nodeTypeValidation = this.validateAndNormalizeNodeTypes(dsl);
      if (nodeTypeValidation.errors.length > 0) {
        errors = [...errors, ...nodeTypeValidation.errors]; // ✅ PHASE 3: Immutable add
        return {
          success: false,
          errors,
          warnings: [...warnings, ...nodeTypeValidation.warnings],
        };
      }
      warnings = [...warnings, ...nodeTypeValidation.warnings]; // ✅ PHASE 3: Immutable add
      
      // Use validated DSL (node types may have been normalized)
      let validatedDSL = nodeTypeValidation.dsl;

      // ✅ FIX 3: Detect and inject missing nodes BEFORE compilation
      console.log('[WorkflowDSLCompiler] STEP 0.5: Detecting and injecting missing nodes...');
      const { missingNodeInjector } = require('./missing-node-injector');
      const missingNodeDetection = missingNodeInjector.detectMissingNodes(validatedDSL);
      
      if (missingNodeDetection.missingNodes.length > 0) {
        console.log(`[WorkflowDSLCompiler] 🔍 Found ${missingNodeDetection.missingNodes.length} missing node(s): ${missingNodeDetection.missingNodes.map((n: { type: string }) => n.type).join(', ')}`);
        const injectionResult = missingNodeInjector.injectMissingNodes(validatedDSL, missingNodeDetection);
        validatedDSL = injectionResult.dsl;
        warnings = [...warnings, ...injectionResult.warnings]; // ✅ PHASE 3: Immutable add
        
        if (injectionResult.injectedNodes.length > 0) {
          console.log(`[WorkflowDSLCompiler] ✅ Injected ${injectionResult.injectedNodes.length} missing node(s): ${injectionResult.injectedNodes.join(', ')}`);
        }
      }

      // Validate DSL structure
      const { dslGenerator } = require('./workflow-dsl');
      const validation = dslGenerator.validateDSL(validatedDSL);
      if (!validation.valid) {
        errors = [...errors, ...validation.errors]; // ✅ PHASE 3: Immutable add
        return {
          success: false,
          errors,
          warnings: [...warnings, ...validation.warnings],
        };
      }
      warnings = [...warnings, ...validation.warnings]; // ✅ PHASE 3: Immutable add

      // ✅ PHASE 3: Use immutable patterns instead of mutations
      // Build nodes from DSL
      let nodes: WorkflowNode[] = [];
      let edges: WorkflowEdge[] = [];

      // Step 1: Create trigger node
      const triggerNode = this.createTriggerNode(validatedDSL.trigger);
      nodes = [...nodes, triggerNode]; // ✅ PHASE 3: Immutable add

      // Step 2: Filter out nodes with empty configs that weren't requested
      // ✅ PHASE 1 FIX: Use registry to check node types instead of hardcoded checks
      const filteredDataSources = validatedDSL.dataSources.filter(ds => {
        const nodeType = unifiedNormalizeNodeTypeString(ds.type || '');
        const config = ds.config || {};
        const hasEmptyConfig = Object.keys(config).length === 0;
        
        // ✅ PHASE 1 FIX: Use registry to check if node is filter/merge
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        const isFilterOrMerge = nodeDef && (
          nodeType === 'filter' || 
          nodeType === 'merge' ||
          (nodeDef.tags || []).some(tag => ['filter', 'merge'].includes(tag.toLowerCase()))
        );
        
        // Keep node if it has config OR if it's not filter/merge
        if (hasEmptyConfig && isFilterOrMerge) {
          console.log(`[WorkflowDSLCompiler] ⚠️  Filtering out ${nodeType} node with empty config (not requested by user)`);
          return false;
        }
        return true;
      });
      
      // ✅ PHASE 1 FIX: Use registry to check node types instead of hardcoded checks
      const filteredTransformations = validatedDSL.transformations.filter(tf => {
        const nodeType = unifiedNormalizeNodeTypeString(tf.type || '');
        const config = tf.config || {};
        const hasEmptyConfig = Object.keys(config).length === 0;
        
        // ✅ PHASE 1 FIX: Use registry to check if node is filter/merge
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        const isFilterOrMerge = nodeDef && (
          nodeType === 'filter' || 
          nodeType === 'merge' ||
          (nodeDef.tags || []).some(tag => ['filter', 'merge'].includes(tag.toLowerCase()))
        );
        
        // Keep node if it has config OR if it's not filter/merge
        if (hasEmptyConfig && isFilterOrMerge) {
          console.log(`[WorkflowDSLCompiler] ⚠️  Filtering out ${nodeType} node with empty config (not requested by user)`);
          return false;
        }
        return true;
      });

      // Step 3: Create data source nodes
      const dataSourceNodes = filteredDataSources.map(ds => this.createDataSourceNode(ds));
      nodes = [...nodes, ...dataSourceNodes]; // ✅ PHASE 3: Immutable add

      // Step 4: Create transformation nodes
      const transformationNodes = filteredTransformations.map(tf => this.createTransformationNode(tf));
      nodes = [...nodes, ...transformationNodes]; // ✅ PHASE 3: Immutable add

      // Step 5: Create output nodes
      const outputNodes = validatedDSL.outputs.map(out => this.createOutputNode(out));
      nodes = [...nodes, ...outputNodes]; // ✅ PHASE 3: Immutable add

      // Step 6: Create edges using deterministic linear pipeline
      const pipelineResult = this.buildLinearPipeline(
        validatedDSL,
        triggerNode,
        dataSourceNodes,
        transformationNodes,
        outputNodes,
        originalPrompt
      );
      edges = [...edges, ...pipelineResult.edges]; // ✅ PHASE 3: Immutable add
      if (pipelineResult.errors.length > 0) {
        errors = [...errors, ...pipelineResult.errors]; // ✅ PHASE 3: Immutable add
      }
      if (pipelineResult.warnings.length > 0) {
        warnings = [...warnings, ...pipelineResult.warnings]; // ✅ PHASE 3: Immutable add
      }

      // ✅ ERROR PREVENTION #3: Final validation - ensure no invalid branching
      const branchingValidation = universalBranchingValidator.validateNoInvalidBranching(
        { nodes, edges },
        [] // No additional edges being created
      );
      
      if (!branchingValidation.valid) {
        errors = [...errors, ...branchingValidation.errors];
      }
      if (branchingValidation.warnings.length > 0) {
        warnings = [...warnings, ...branchingValidation.warnings];
      }

      // Build workflow
      const workflow: Workflow = {
        nodes,
        edges,
        metadata: {
          ...dsl.metadata,
          compiledFrom: 'dsl',
          compiledAt: Date.now(),
        },
      };

      console.log(`[WorkflowDSLCompiler] ✅ Compiled DSL to workflow: ${nodes.length} nodes, ${edges.length} edges`);

      return {
        success: errors.length === 0,
        workflow,
        errors,
        warnings,
        metadata: {
          dsl: validatedDSL,
          nodeCount: nodes.length,
          edgeCount: edges.length,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[WorkflowDSLCompiler] ❌ Compilation failed: ${errorMessage}`);
      return {
        success: false,
        errors: [errorMessage],
        warnings,
      };
    }
  }

  /**
   * Validate and normalize all node types in DSL before compilation
   * 
   * Ensures all node types exist in NodeLibrary:
   * - If node type not found -> attempt normalization
   * - If normalization fails -> use NodeTypeResolver
   * - Replace with compatible type
   * - Log warnings
   * - Never allow unknown node types to reach compiler
   * 
   * @param dsl - Original DSL
   * @returns Validated DSL with normalized node types and warnings
   */
  /**
   * Expand categories to multiple nodes when context suggests multiple are needed
   * 
   * Handles cases like:
   * - "sync between crm systems" -> needs multiple CRM nodes
   * - Multiple mentions of same category -> use different nodes
   * - Operations that suggest multiple nodes (compare, merge, sync)
   * 
   * @param dsl - The DSL to expand
   * @param warnings - Array to collect warnings
   * @returns Expanded DSL with categories resolved to specific nodes
   */
  private expandCategoriesToMultipleNodes(dsl: WorkflowDSL, warnings: string[]): WorkflowDSL {
    const expandedDSL: WorkflowDSL = {
      ...dsl,
      dataSources: [...dsl.dataSources],
      transformations: [...dsl.transformations],
      outputs: [...dsl.outputs],
    };

    // Track category usage to detect when multiple nodes are needed
    const categoryUsage = new Map<string, Array<{
      category: 'dataSource' | 'transformation' | 'output';
      index: number;
      item: DSLDataSource | DSLTransformation | DSLOutput;
      operation?: string;
    }>>();

    // Collect all category names (nodes that don't exist in library are likely categories)
    // ✅ PHASE 3: Build array immutably (use let for reassignment)
    let allItems: Array<{
      category: 'dataSource' | 'transformation' | 'output';
      index: number;
      item: DSLDataSource | DSLTransformation | DSLOutput;
      type: string;
      operation?: string;
    }> = [];

    dsl.dataSources.forEach((ds, idx) => {
      if (!nodeLibrary.isNodeTypeRegistered(ds.type)) {
        allItems = [...allItems, { category: 'dataSource', index: idx, item: ds, type: ds.type, operation: ds.operation }]; // ✅ PHASE 3: Immutable add
      }
    });

    dsl.transformations.forEach((tf, idx) => {
      if (!nodeLibrary.isNodeTypeRegistered(tf.type)) {
        allItems = [...allItems, { category: 'transformation', index: idx, item: tf, type: tf.type, operation: tf.operation }]; // ✅ PHASE 3: Immutable add
      }
    });

    dsl.outputs.forEach((out, idx) => {
      if (!nodeLibrary.isNodeTypeRegistered(out.type)) {
        allItems = [...allItems, { category: 'output', index: idx, item: out, type: out.type, operation: out.operation }]; // ✅ PHASE 3: Immutable add
      }
    });

    // Group by category name
    for (const item of allItems) {
      const category = item.type.toLowerCase();
      if (!categoryUsage.has(category)) {
        categoryUsage.set(category, []);
      }
      const existing = categoryUsage.get(category) || [];
      categoryUsage.set(category, [...existing, { // ✅ PHASE 3: Immutable add
        category: item.category,
        index: item.index,
        item: item.item,
        operation: item.operation,
      }]);
    }

    // For each category, check if multiple nodes are needed
    for (const [categoryName, usages] of categoryUsage.entries()) {
      const availableNodes = nodeTypeNormalizationService.resolveCategoryToNodeTypes(categoryName);
      
      if (availableNodes.length === 0) {
        // Not a category or no nodes available, skip
        continue;
      }

      // Strategy 1: If category appears multiple times, use different nodes
      if (usages.length > 1 && availableNodes.length >= usages.length) {
        warnings = [...warnings, `Category "${categoryName}" appears ${usages.length} times - using different nodes: ${availableNodes.slice(0, usages.length).join(', ')}`]; // ✅ PHASE 3: Immutable add
        
        // Assign different nodes to each usage
        for (let i = 0; i < usages.length && i < availableNodes.length; i++) {
          const usage = usages[i];
          const nodeType = availableNodes[i];
          
          if (usage.category === 'dataSource') {
            const ds = usage.item as DSLDataSource;
            const index = expandedDSL.dataSources.findIndex(d => d.id === ds.id);
            if (index >= 0) {
              expandedDSL.dataSources[index] = { ...ds, type: nodeType };
            }
          } else if (usage.category === 'transformation') {
            const tf = usage.item as DSLTransformation;
            const index = expandedDSL.transformations.findIndex(t => t.id === tf.id);
            if (index >= 0) {
              expandedDSL.transformations[index] = { ...tf, type: nodeType };
            }
          } else if (usage.category === 'output') {
            const out = usage.item as DSLOutput;
            const index = expandedDSL.outputs.findIndex(o => o.id === out.id);
            if (index >= 0) {
              expandedDSL.outputs[index] = { ...out, type: nodeType };
            }
          }
        }
      }
      // Strategy 2: Check if operation suggests multiple nodes (sync, compare, merge)
      else if (usages.length === 1) {
        const usage = usages[0];
        const operation = (usage.operation || '').toLowerCase();
        
        const multiNodeOperations = ['sync', 'compare', 'merge', 'combine', 'aggregate', 'transfer', 'move'];
        const needsMultiple = multiNodeOperations.some(op => operation.includes(op));
        
        if (needsMultiple && availableNodes.length > 1) {
          // Operation suggests multiple nodes - use first 2 available
          warnings = [...warnings, `Operation "${operation}" suggests multiple nodes from category "${categoryName}" - using: ${availableNodes.slice(0, 2).join(' and ')}`]; // ✅ PHASE 3: Immutable add
          
          // For now, use the first node (the second would need to be added as a new DSL item)
          // This is a limitation - we'd need to modify the DSL structure to add nodes
          // For now, just use the first available node and log a warning
          const nodeType = availableNodes[0];
          
          if (usage.category === 'dataSource') {
            const ds = usage.item as DSLDataSource;
            const index = expandedDSL.dataSources.findIndex(d => d.id === ds.id);
            if (index >= 0) {
              expandedDSL.dataSources[index] = { ...ds, type: nodeType };
            }
          } else if (usage.category === 'transformation') {
            const tf = usage.item as DSLTransformation;
            const index = expandedDSL.transformations.findIndex(t => t.id === tf.id);
            if (index >= 0) {
              expandedDSL.transformations[index] = { ...tf, type: nodeType };
            }
          } else if (usage.category === 'output') {
            const out = usage.item as DSLOutput;
            const index = expandedDSL.outputs.findIndex(o => o.id === out.id);
            if (index >= 0) {
              expandedDSL.outputs[index] = { ...out, type: nodeType };
            }
          }
        }
      }
    }

    return expandedDSL;
  }

  private validateAndNormalizeNodeTypes(dsl: WorkflowDSL): {
    dsl: WorkflowDSL;
    errors: string[];
    warnings: string[];
  } {
    // ✅ PHASE 3: Build arrays immutably (use let for reassignment)
    let errors: string[] = [];
    let warnings: string[] = [];
    let validatedDSL: WorkflowDSL = {
      ...dsl,
      dataSources: [...dsl.dataSources],
      transformations: [...dsl.transformations],
      outputs: [...dsl.outputs],
    };

    // ✅ STEP 0: Expand categories to multiple nodes if needed
    // This handles cases where user needs multiple nodes from same category
    // (e.g., "sync between crm systems" needs multiple CRM nodes)
    validatedDSL = this.expandCategoriesToMultipleNodes(validatedDSL, warnings);

    // Collect all node types to validate
    // ✅ PHASE 3: Build array immutably (use let for reassignment)
    let nodeTypesToValidate: Array<{
      category: 'trigger' | 'dataSource' | 'transformation' | 'output';
      originalType: string;
      operation?: string;
      dslItem: DSLTrigger | DSLDataSource | DSLTransformation | DSLOutput;
    }> = [];

    // ✅ PHASE 3: Build array immutably
    // Add trigger type
    nodeTypesToValidate = [...nodeTypesToValidate, {
      category: 'trigger',
      originalType: dsl.trigger.type,
      dslItem: dsl.trigger,
    }]; // ✅ PHASE 3: Immutable add

    // Add data source types
    dsl.dataSources.forEach(ds => {
      nodeTypesToValidate = [...nodeTypesToValidate, {
        category: 'dataSource',
        originalType: ds.type,
        operation: ds.operation,
        dslItem: ds,
      }]; // ✅ PHASE 3: Immutable add
    });

    // Add transformation types
    dsl.transformations.forEach(tf => {
      nodeTypesToValidate = [...nodeTypesToValidate, {
        category: 'transformation',
        originalType: tf.type,
        operation: tf.operation,
        dslItem: tf,
      }]; // ✅ PHASE 3: Immutable add
    });

    // Add output types
    dsl.outputs.forEach(out => {
      nodeTypesToValidate = [...nodeTypesToValidate, {
        category: 'output',
        originalType: out.type,
        operation: out.operation,
        dslItem: out,
      }]; // ✅ PHASE 3: Immutable add
    });

    // Validate and normalize each node type
    for (const item of nodeTypesToValidate) {
      const originalType = item.originalType;
      
      // ✅ CRITICAL FIX: Skip "custom" type - it's invalid in DSL
      // "custom" is only used in final workflow nodes for frontend compatibility
      // It should never appear in the DSL itself
      if (originalType === 'custom' || !originalType) {
        const errorMsg = `Invalid node type "${originalType}" in ${item.category}. "custom" type is not allowed in DSL - it's only used for frontend compatibility in final workflow nodes.`;
        errors = [...errors, errorMsg]; // ✅ PHASE 3: Immutable add
        console.error(`[WorkflowDSLCompiler] ❌ ${errorMsg}`);
        continue;
      }
      
      // Check if node type exists in NodeLibrary
      if (nodeLibrary.isNodeTypeRegistered(originalType)) {
        // Node type is valid, no action needed
        continue;
      }

      // Node type not found - attempt normalization
      console.log(`[WorkflowDSLCompiler] ⚠️  Node type "${originalType}" not found in NodeLibrary, attempting normalization...`);
      
      let normalizedType: string | null = null;
      let resolutionMethod = 'unknown';

      // ✅ STEP 1: Try nodeTypeNormalizationService (handles categories like "crm", "website")
      const normalizationResult = nodeTypeNormalizationService.normalizeNodeType(originalType);
      if (normalizationResult.valid && normalizationResult.normalized !== originalType) {
        normalizedType = normalizationResult.normalized;
        resolutionMethod = normalizationResult.method;
        console.log(`[WorkflowDSLCompiler] ✅ Normalized "${originalType}" -> "${normalizedType}" (method: ${normalizationResult.method})`);
      } else {
        // Step 2: Try basic normalization utility
        normalizedType = unifiedNormalizeNodeTypeString(originalType);
        if (normalizedType !== originalType && nodeLibrary.isNodeTypeRegistered(normalizedType)) {
          resolutionMethod = 'normalized';
          console.log(`[WorkflowDSLCompiler] ✅ Normalized "${originalType}" -> "${normalizedType}"`);
        } else {
          // Step 3: Try NodeTypeResolver
          try {
            const resolution = nodeTypeResolver.resolve(originalType, false);
            if (resolution && resolution.method !== 'not_found' && nodeLibrary.isNodeTypeRegistered(resolution.resolved)) {
              normalizedType = resolution.resolved;
              resolutionMethod = resolution.method;
              console.log(`[WorkflowDSLCompiler] ✅ Resolved "${originalType}" -> "${normalizedType}" (method: ${resolution.method})`);
              
              if (resolution.warning) {
                warnings = [...warnings, `Node type resolution warning for "${originalType}": ${resolution.warning.message}`]; // ✅ PHASE 3: Immutable add
              }
            }
          } catch (error) {
            // NodeTypeResolver failed, continue to error
            console.warn(`[WorkflowDSLCompiler] ⚠️  NodeTypeResolver failed for "${originalType}": ${error}`);
          }
        }
      }

      // If still not found, this is an error
      if (!normalizedType || !nodeLibrary.isNodeTypeRegistered(normalizedType)) {
        const errorMsg = `Unknown node type "${originalType}" in ${item.category}. Cannot normalize or resolve to a compatible type.`;
        errors = [...errors, errorMsg]; // ✅ PHASE 3: Immutable add
        console.error(`[WorkflowDSLCompiler] ❌ ${errorMsg}`);
        continue;
      }

      // Replace node type in DSL
      const warningMsg = `Node type "${originalType}" in ${item.category} was normalized to "${normalizedType}" (method: ${resolutionMethod})`;
      warnings = [...warnings, warningMsg]; // ✅ PHASE 3: Immutable add
      console.warn(`[WorkflowDSLCompiler] ⚠️  ${warningMsg}`);

      // Update the DSL item with normalized type
      if (item.category === 'trigger') {
        (validatedDSL.trigger as DSLTrigger).type = normalizedType as any;
      } else if (item.category === 'dataSource') {
        const ds = item.dslItem as DSLDataSource;
        const index = validatedDSL.dataSources.findIndex(d => d.id === ds.id);
        if (index >= 0) {
          validatedDSL.dataSources[index] = {
            ...ds,
            type: normalizedType,
          };
        }
      } else if (item.category === 'transformation') {
        const tf = item.dslItem as DSLTransformation;
        const index = validatedDSL.transformations.findIndex(t => t.id === tf.id);
        if (index >= 0) {
          validatedDSL.transformations[index] = {
            ...tf,
            type: normalizedType,
          };
        }
      } else if (item.category === 'output') {
        const out = item.dslItem as DSLOutput;
        const index = validatedDSL.outputs.findIndex(o => o.id === out.id);
        if (index >= 0) {
          validatedDSL.outputs[index] = {
            ...out,
            type: normalizedType,
          };
        }
      }
    }

    // Final validation: ensure no unknown types remain
    const allTypes = [
      validatedDSL.trigger.type,
      ...validatedDSL.dataSources.map(ds => ds.type),
      ...validatedDSL.transformations.map(tf => tf.type),
      ...validatedDSL.outputs.map(out => out.type),
    ];

    for (const type of allTypes) {
      if (!nodeLibrary.isNodeTypeRegistered(type)) {
        errors = [...errors, `CRITICAL: Node type "${type}" still not registered after normalization. This should never happen.`]; // ✅ PHASE 3: Immutable add
        console.error(`[WorkflowDSLCompiler] ❌ CRITICAL: Node type "${type}" still not registered after normalization.`);
      }
    }

    if (errors.length > 0) {
      console.error(`[WorkflowDSLCompiler] ❌ Node type validation failed: ${errors.length} error(s)`);
    } else {
      console.log(`[WorkflowDSLCompiler] ✅ All node types validated and normalized (${warnings.length} warning(s))`);
    }

    return {
      dsl: validatedDSL,
      errors,
      warnings,
    };
  }

  /**
   * Create trigger node from DSL trigger
   */
  private createTriggerNode(trigger: DSLTrigger): WorkflowNode {
    const nodeId = randomUUID();
    
    return {
      id: nodeId,
      type: trigger.type,
      position: { x: 100, y: 100 },
      data: {
        type: trigger.type,
        label: trigger.type.replace('_', ' '),
        category: 'trigger',
        config: trigger.config || {},
      },
    };
  }

  /**
   * Create data source node from DSL data source
   */
  private createDataSourceNode(ds: DSLDataSource): WorkflowNode {
    const nodeId = randomUUID();
    
    // Validate node type exists in library
    const schema = nodeLibrary.getSchema(ds.type);
    if (!schema) {
      throw new Error(`Unknown data source node type: ${ds.type}`);
    }

    // ✅ ROOT-LEVEL UNIVERSAL FIX: Use standardized metadata system
    const node: WorkflowNode = {
      id: nodeId,
      type: ds.type,
      position: { x: 300, y: 100 },
      data: {
        type: ds.type,
        label: schema.label || ds.type,
        category: schema.category || 'data_source',
        config: {
          ...ds.config,
          operation: ds.operation,
        },
      },
    };
    
    // Set universal metadata
    NodeMetadataHelper.setMetadata(node, {
      origin: {
        source: ds.origin?.source || 'auto',
        approach: ds.origin?.source === 'user' ? 'user_explicit' : 'dsl_generation',
        stage: 'dsl_compilation',
        originalPrompt: undefined, // Will be set from context if available
      },
      dsl: {
        dslId: ds.id,
        category: 'data_source',
        operation: ds.operation,
      },
      protected: ds.protected || false,
    });
    
    return node;
  }

  /**
   * Create transformation node from DSL transformation
   */
  private createTransformationNode(tf: DSLTransformation): WorkflowNode {
    const nodeId = randomUUID();
    
    // Validate node type exists in library
    const schema = nodeLibrary.getSchema(tf.type);
    if (!schema) {
      throw new Error(`Unknown transformation node type: ${tf.type}`);
    }

    // ✅ ROOT-LEVEL UNIVERSAL FIX: Use standardized metadata system
    const node: WorkflowNode = {
      id: nodeId,
      type: tf.type,
      position: { x: 500, y: 100 },
      data: {
        type: tf.type,
        label: schema.label || tf.type,
        category: schema.category || 'transformation',
        config: {
          ...tf.config,
          operation: tf.operation,
        },
      },
    };
    
    // Set universal metadata
    NodeMetadataHelper.setMetadata(node, {
      origin: {
        source: tf.origin?.source || 'auto',
        approach: tf.origin?.source === 'user' ? 'user_explicit' : 'dsl_generation',
        stage: 'dsl_compilation',
        originalPrompt: undefined, // Will be set from context if available
      },
      dsl: {
        dslId: tf.id,
        category: 'transformation',
        operation: tf.operation,
      },
      protected: tf.protected || false,
    });
    
    return node;
  }

  /**
   * Create output node from DSL output
   */
  private createOutputNode(out: DSLOutput): WorkflowNode {
    const nodeId = randomUUID();
    
    // Validate node type exists in library
    const schema = nodeLibrary.getSchema(out.type);
    if (!schema) {
      throw new Error(`Unknown output node type: ${out.type}`);
    }

    // ✅ ROOT-LEVEL UNIVERSAL FIX: Use standardized metadata system
    const node: WorkflowNode = {
      id: nodeId,
      type: out.type,
      position: { x: 700, y: 100 },
      data: {
        type: out.type,
        label: schema.label || out.type,
        category: schema.category || 'output',
        config: {
          ...out.config,
          operation: out.operation,
        },
      },
    };
    
    // Set universal metadata
    NodeMetadataHelper.setMetadata(node, {
      origin: {
        source: out.origin?.source || 'auto',
        approach: out.origin?.source === 'user' ? 'user_explicit' : 'dsl_generation',
        stage: 'dsl_compilation',
        originalPrompt: undefined, // Will be set from context if available
      },
      dsl: {
        dslId: out.id,
        category: 'output',
        operation: out.operation,
      },
      protected: out.protected || false,
    });
    
    return node;
  }

  /**
   * Build deterministic linear pipeline
   * 
   * Pipeline rules:
   * 1. Exactly one trigger (VALIDATE)
   * 2. Data sources connect linearly: trigger -> first data source -> second data source -> ...
   *    - ✅ CRITICAL: Only first data source connects to trigger (prevents branching)
   *    - Remaining data sources chain sequentially (linear flow)
   * 3. All transformations connect from last data source:
   *    - If transformations exist: last data source -> first transformation
   *    - Chain transformations sequentially: T1 -> T2 -> T3
   * 4. All outputs connect from transformations:
   *    - If transformations exist: last transformation -> first output (linear)
   *    - Chain outputs sequentially if multiple outputs
   *    - If no transformations: last data source -> first output (linear)
   * 5. Prevent cycles (strict ordering)
   * 6. Prevent multiple triggers (validation)
   * 
   * Execution order: trigger -> dataSource1 -> dataSource2 -> ... -> transformation1 -> transformation2 -> ... -> output1 -> output2 -> ...
   */
  private buildLinearPipeline(
    dsl: WorkflowDSL,
    triggerNode: WorkflowNode,
    dataSourceNodes: WorkflowNode[],
    transformationNodes: WorkflowNode[],
    outputNodes: WorkflowNode[],
    originalPrompt?: string
  ): { edges: WorkflowEdge[]; errors: string[]; warnings: string[] } {
    // ✅ PHASE 3: Use immutable patterns - build arrays immutably
    let edges: WorkflowEdge[] = [];
    let errors: string[] = [];
    let warnings: string[] = [];

    // ✅ UNIVERSAL: Create allNodes array once for all edge creation
    const allNodesForEdges = [triggerNode, ...dataSourceNodes, ...transformationNodes, ...outputNodes];

    // ✅ PERMANENT FIX: Declare trigger properties once at the top of the function
    // These are used throughout the function to check branching capability
    const triggerType = unifiedNormalizeNodeTypeString(triggerNode.type || triggerNode.data?.type || '');
    const triggerDef = unifiedNodeRegistry.get(triggerType);
    const triggerAllowsBranching = triggerDef?.isBranching || false;

    console.log('[WorkflowDSLCompiler] Building deterministic linear pipeline...');
    console.log(`[WorkflowDSLCompiler] Pipeline: 1 trigger, ${dataSourceNodes.length} data source(s), ${transformationNodes.length} transformation(s), ${outputNodes.length} output(s)`);

    // VALIDATION: Exactly one trigger (already validated by having single triggerNode)
    // This is implicit - we only have one triggerNode

    // ✅ ROOT-LEVEL FIX: Sort nodes by semantic order using REGISTRY (not UUID)
    // This ensures correct ordering for ALL workflows and ALL node types
    const sortedDataSources = this.sortNodesBySemanticOrder(dataSourceNodes, 'data_source');
    const sortedOutputs = this.sortNodesBySemanticOrder(outputNodes, 'output');
    
    // ✅ PHASE 5: Separate conditional nodes and limit nodes from transformations
    // ✅ FIX 1: CORRECT ORDER - Conditionals FIRST (empty check), THEN limit, THEN transformations
    // Order: dataSources -> if_else -> limit -> transformations -> outputs
    const { limitNodes, actualTransformations, conditionalNodes } = this.separateTransformationNodes(transformationNodes);
    
    // Sort each category separately
    const sortedLimitNodes = this.sortNodesBySemanticOrder(limitNodes, 'transformation');
    const sortedActualTransformations = this.sortNodesBySemanticOrder(actualTransformations, 'transformation');
    const sortedConditionalNodes = this.sortNodesBySemanticOrder(conditionalNodes, 'transformation');
    
    // ✅ FIX 1: CORRECT ORDER - Conditionals FIRST (check if data exists), THEN limit (limit array size), THEN transformations (AI, etc.)
    // This ensures: data_source -> if_else -> limit -> ai_chat_model (correct flow)
    const sortedTransformations = [...sortedConditionalNodes, ...sortedLimitNodes, ...sortedActualTransformations];

    // STEP 1: Trigger -> First Data Source (linear flow enforcement)
    // ✅ CRITICAL FIX: For linear workflows, only connect FIRST data source to trigger
    // Chain remaining data sources sequentially to prevent branching
    console.log('[WorkflowDSLCompiler] Step 1: Connecting trigger to data sources (linear flow)...');
    
    // ✅ CRITICAL FIX: Helper function to check if trigger already has outgoing edge
    // This MUST be checked dynamically at each point, not just once at the start
    const triggerHasOutgoingEdge = () => edges.some(e => e.source === triggerNode.id);
    
    // Only create edge if trigger doesn't allow branching and doesn't already have an edge
    if (sortedDataSources.length > 0 && (!triggerAllowsBranching && !triggerHasOutgoingEdge())) {
      // ✅ UNIVERSAL: Connect trigger -> first data source using universal service
      const firstDataSource = sortedDataSources[0];
      const edge = this.createCompatibleEdge(triggerNode, firstDataSource, edges, allNodesForEdges);
      if (edge) {
        edges = [...edges, edge]; // ✅ PHASE 3: Immutable add
        console.log(`[WorkflowDSLCompiler] ✅ Connected trigger -> ${firstDataSource.type} (${firstDataSource.id}) - first data source`);
      } else {
        errors = [...errors, `Cannot create edge from trigger to data source ${firstDataSource.type} (${firstDataSource.id}): No compatible handles`]; // ✅ PHASE 3: Immutable add
      }
      
      // ✅ UNIVERSAL: Chain remaining data sources sequentially (linear flow) using universal service
      for (let i = 1; i < sortedDataSources.length; i++) {
        const prevDataSource = sortedDataSources[i - 1];
        const currentDataSource = sortedDataSources[i];
        const chainEdge = this.createCompatibleEdge(prevDataSource, currentDataSource, edges, allNodesForEdges);
        if (chainEdge) {
          edges = [...edges, chainEdge]; // ✅ PHASE 3: Immutable add
          console.log(`[WorkflowDSLCompiler] ✅ Connected ${prevDataSource.type} -> ${currentDataSource.type} (sequential chain, linear flow)`);
        } else {
          warnings = [...warnings, `Cannot create sequential edge from ${prevDataSource.type} to ${currentDataSource.type}: No compatible handles. Data source may be unreachable.`]; // ✅ PHASE 3: Immutable add
        }
      }
    }

    // STEP 2: Data Sources / Trigger -> Transformations
    if (sortedTransformations.length > 0) {
      console.log('[WorkflowDSLCompiler] Step 2: Connecting data sources (or trigger) to transformations...');
      
      // ✅ PHASE 3: Connect LAST data source to first transformation (explicit ordering)
      // If there are NO data sources, connect the TRIGGER directly to the first transformation.
      const firstTransformation = sortedTransformations[0];
      if (sortedDataSources.length > 0) {
        // ✅ PHASE 3: Connect only the LAST data source to first transformation (linear flow)
        // ✅ ROOT-LEVEL FIX: Use registry to detect branching nodes and determine handle
        const lastDataSource = sortedDataSources[sortedDataSources.length - 1];
        const firstTfType = unifiedNormalizeNodeTypeString(firstTransformation.type || firstTransformation.data?.type || '');
        const firstTfNodeDef = unifiedNodeRegistry.get(firstTfType);
        // If first transformation is branching (e.g., if_else), use 'true' handle explicitly
        const isBranching = firstTfNodeDef?.isBranching && firstTfNodeDef.outgoingPorts?.includes('true');
        const sourceHandle = isBranching ? 'true' : undefined;
        
        const edge = this.createCompatibleEdge(lastDataSource, firstTransformation, edges, allNodesForEdges, undefined, sourceHandle);
        if (edge) {
          edges = [...edges, edge]; // ✅ PHASE 3: Immutable add
          console.log(`[WorkflowDSLCompiler] ✅ Connected ${lastDataSource.type} -> ${firstTransformation.type} (last data source to first transformation${isBranching ? ', branching node true path' : ''})`);
        } else {
          warnings = [...warnings, `Cannot create edge from ${lastDataSource.type} to ${firstTransformation.type}: No compatible handles`]; // ✅ PHASE 3: Immutable add
        }
      } else {
        // No data sources – treat trigger as the upstream for the first transformation.
        // ✅ CRITICAL FIX: Check trigger outgoing edge DYNAMICALLY (not from cached variable)
        // ✅ PERMANENT FIX: Reuse trigger properties declared at top of function
        
        // ✅ CRITICAL FIX: Check if trigger already has outgoing edge (dynamic check)
        if (!triggerAllowsBranching && !triggerHasOutgoingEdge()) {
          const edge = this.createCompatibleEdge(triggerNode, firstTransformation, edges, allNodesForEdges);
          if (edge) {
            edges = [...edges, edge]; // ✅ PHASE 3: Immutable add
            console.log(`[WorkflowDSLCompiler] ✅ Connected trigger -> ${firstTransformation.type} (first transformation, no data sources)`);
          } else {
            warnings = [...warnings, `Cannot create edge from trigger to ${firstTransformation.type}: No compatible handles`]; // ✅ PHASE 3: Immutable add
          }
        } else {
          console.log(`[WorkflowDSLCompiler] ⚠️  Trigger ${triggerAllowsBranching ? 'allows branching' : 'already has outgoing edge'}, skipping transformation connection to prevent branching`);
        }
      }

      // ✅ UNIVERSAL: Chain transformations sequentially: T1 -> T2 -> T3 using universal service
      for (let i = 0; i < sortedTransformations.length - 1; i++) {
        const currentTf = sortedTransformations[i];
        const nextTf = sortedTransformations[i + 1];
        
        // ✅ ROOT-LEVEL FIX: Handle branching nodes - connect true path to next node
        const currentTfType = unifiedNormalizeNodeTypeString(currentTf.type || currentTf.data?.type || '');
        const currentTfNodeDef = unifiedNodeRegistry.get(currentTfType);
        const isBranchingWithTrue = currentTfNodeDef?.isBranching && currentTfNodeDef.outgoingPorts?.includes('true');
        
        if (isBranchingWithTrue) {
          // Branching node (e.g., if_else) -> next node via 'true' handle
          const edge = this.createCompatibleEdge(currentTf, nextTf, edges, allNodesForEdges, undefined, 'true');
          if (edge) {
            edges = [...edges, edge]; // ✅ PHASE 3: Immutable add
            console.log(`[WorkflowDSLCompiler] ✅ Connected ${currentTf.type} -> ${nextTf.type} (branching node true path)`);
          } else {
            warnings = [...warnings, `Cannot create edge from ${currentTf.type} to ${nextTf.type}: No compatible handles`]; // ✅ PHASE 3: Immutable add
          }
        } else {
          // Normal transformation chain
          const edge = this.createCompatibleEdge(currentTf, nextTf, edges, allNodesForEdges);
          if (edge) {
            edges = [...edges, edge]; // ✅ PHASE 3: Immutable add
            console.log(`[WorkflowDSLCompiler] ✅ Connected ${currentTf.type} -> ${nextTf.type} (transformation chain)`);
          } else {
            warnings = [...warnings, `Cannot create edge from ${currentTf.type} to ${nextTf.type}: No compatible handles`]; // ✅ PHASE 3: Immutable add
          }
        }
      }

      // ✅ FIX 3: VALIDATION - Ensure data source connects to if_else (if exists) before other nodes
      // This validates and fixes incorrect connections at compile time
      const ifElseNodes = sortedConditionalNodes.filter(n => {
        const t = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
        return t === 'if_else';
      });

      if (ifElseNodes.length > 0 && sortedDataSources.length > 0) {
        const lastDataSource = sortedDataSources[sortedDataSources.length - 1];
        const firstIfElse = ifElseNodes[0];
        
        // Check if data source connects to if_else
        const dataSourceToIfElse = edges.find(e => 
          e.source === lastDataSource.id && e.target === firstIfElse.id
        );
        
        if (!dataSourceToIfElse) {
          // Data source doesn't connect to if_else - check if it connects to wrong node
          const wrongEdges = edges.filter(e => 
            e.source === lastDataSource.id && 
            !sortedConditionalNodes.some(n => n.id === e.target) &&
            sortedTransformations.some(n => n.id === e.target)
          );
          
          if (wrongEdges.length > 0) {
            // Remove wrong edges (data_source -> limit/AI directly)
            edges = edges.filter(e => !wrongEdges.some(we => we.id === e.id));
            warnings = [...warnings, `Removed ${wrongEdges.length} incorrect edge(s) from ${lastDataSource.type} (should connect to if_else first)`]; // ✅ PHASE 3: Immutable add
            
            // Create correct edge: data_source -> if_else
            const correctEdge = this.createCompatibleEdge(
              lastDataSource,
              firstIfElse,
              edges,
              allNodesForEdges
            );
            
            if (correctEdge) {
              edges = [...edges, correctEdge]; // ✅ PHASE 3: Immutable add
              console.log(`[WorkflowDSLCompiler] ✅ Fixed: ${lastDataSource.type} -> if_else (ensured correct connection)`);
            } else {
              errors = [...errors, `Cannot create edge from ${lastDataSource.type} to if_else: No compatible handles`]; // ✅ PHASE 3: Immutable add
            }
          }
        }
      }

      // STEP 3: Last Transformation -> Outputs
      // ✅ ROOT-LEVEL FIX: Respect linear flow - only allow branching from conditional nodes (using registry)
      const lastTransformation = sortedTransformations[sortedTransformations.length - 1];
      const lastTransformationType = unifiedNormalizeNodeTypeString(lastTransformation.type || lastTransformation.data?.type || '');
      const lastTransformationDef = unifiedNodeRegistry.get(lastTransformationType);
      
      // ✅ Use registry to determine if node allows branching (category='logic' or tags include 'branch')
      const isAllowedBranchingNode = lastTransformationDef ? (
        lastTransformationDef.category === 'logic' ||
        (lastTransformationDef.tags || []).some(tag => ['branch', 'conditional', 'if', 'switch'].includes(tag.toLowerCase())) ||
        lastTransformationType.toLowerCase() === 'if_else' ||
        lastTransformationType.toLowerCase() === 'switch'
      ) : false;
      
      console.log('[WorkflowDSLCompiler] Step 3: Connecting last transformation to outputs...');
      
      // ✅ N8N APPROACH: Extract switch cases from prompt DURING compilation (not after)
      // This is how n8n does it - cases are known upfront, so output ports exist immediately
      const isSwitchNode = lastTransformationType.toLowerCase() === 'switch';
      
      if (isSwitchNode && originalPrompt) {
        // ✅ ROOT-LEVEL SOLUTION: Analyze BOTH user prompt AND input data from previous nodes
        // This ensures switch cases are generated intelligently based on actual data structure
        // ✅ PHASE 3: Build arrays immutably
        let switchCases: Array<{ value: string; label: string }> = [];
        const caseToNodeMapping: Map<string, WorkflowNode> = new Map();
        
        // ✅ STEP 1: Analyze input data structure from previous node
        // Get the node that feeds into the switch node to understand available fields
        let previousNode: WorkflowNode | null = null;
        let availableInputFields: string[] = [];
        let expressionField = 'status'; // Default, will be extracted intelligently
        
        // Find the previous node (data source or transformation before switch)
        if (sortedDataSources.length > 0) {
          previousNode = sortedDataSources[sortedDataSources.length - 1];
        } else if (sortedTransformations.length > 1) {
          // Switch is not the first transformation
          previousNode = sortedTransformations[sortedTransformations.length - 2];
        }
        
        if (previousNode) {
          const prevNodeType = unifiedNormalizeNodeTypeString(previousNode.type || previousNode.data?.type || '');
          const prevNodeDef = unifiedNodeRegistry.get(prevNodeType);
          
          // Infer available fields from previous node's output schema
          if (prevNodeDef?.outputSchema) {
            const outputSchema = prevNodeDef.outputSchema;
            if (typeof outputSchema === 'object' && outputSchema !== null) {
              availableInputFields = Object.keys(outputSchema);
            }
          }
          
          // Common field inference based on node type
          if (availableInputFields.length === 0) {
            if (prevNodeType.includes('sheets') || prevNodeType.includes('database')) {
              availableInputFields = ['rows', 'data', 'items', 'records', 'status', 'type', 'category'];
            } else if (prevNodeType.includes('http') || prevNodeType.includes('api')) {
              availableInputFields = ['response', 'data', 'body', 'status', 'statusCode', 'type'];
            } else {
              availableInputFields = ['data', 'output', 'result', 'status', 'type', 'category', 'value'];
            }
          }
          
          console.log(`[WorkflowDSLCompiler] 🔍 Switch node input analysis: Previous node "${prevNodeType}" provides fields: ${availableInputFields.join(', ')}`);
        }
        
        // ✅ STEP 2: Extract expression field from prompt intelligently
        // Pattern: "route based on status", "switch on type", "if field equals"
        const expressionPatterns = [
          /(?:route|switch|based on|if|when)\s+(?:the\s+)?(\w+)\s+(?:field|column|value|is|equals)/gi,
          /(?:switch|route)\s+(?:on|by|using)\s+["']?(\w+)["']?/gi,
          /(?:field|column)\s+["']?(\w+)["']?/gi,
        ];
        
        for (const pattern of expressionPatterns) {
          const match = pattern.exec(originalPrompt);
          if (match && match[1]) {
            const field = match[1].toLowerCase();
            // Check if this field exists in available input fields
            if (availableInputFields.some(f => f.toLowerCase().includes(field) || field.includes(f.toLowerCase()))) {
              expressionField = field;
              console.log(`[WorkflowDSLCompiler] ✅ Extracted expression field from prompt: "${expressionField}"`);
              break;
            }
          }
        }
        
        // ✅ STEP 3: Extract case values from prompt (enhanced patterns)
        const caseValuePatterns = [
          // "active leads route to", "pending statuses are routed", "completed items go to"
          /(\w+)\s+(?:leads?|statuses?|items?|records?|entries?|rows?|cases?|values?)\s+(?:are\s+)?(?:routed|route|send|go|trigger|use|receive|logged)/gi,
          // "if status is 'active' route", "when value equals 'pending' send"
          /(?:if|when)\s+(?:\w+\s+)?(?:is|equals|==)\s+["']?(\w+)["']?\s+(?:route|send|go|use|trigger)/gi,
          // "case 'active'", "value 'pending'", "status 'completed'"
          /(?:case|value|status|type)\s+["']?(\w+)["']?/gi,
          // "active -> slack", "pending -> gmail"
          /(\w+)\s*->\s*\w+/gi,
        ];
        
        const extractedCaseValues = new Set<string>();
        for (const pattern of caseValuePatterns) {
          let match;
          while ((match = pattern.exec(originalPrompt)) !== null) {
            const caseValue = match[1].toLowerCase();
            // Filter out common non-case words
            if (!['the', 'a', 'an', 'is', 'are', 'to', 'for', 'with', 'from', 'and', 'or', 'if', 'when', 'route', 'send'].includes(caseValue)) {
              extractedCaseValues.add(caseValue);
            }
          }
        }
        
        console.log(`[WorkflowDSLCompiler] 🔍 Extracted ${extractedCaseValues.size} case value(s) from prompt: ${Array.from(extractedCaseValues).join(', ')}`);
        
        // Step 2: Extract ALL node type mentions from prompt (universal matching)
        // Match any node type mentioned in the prompt (slack_message, google_gmail, hubspot, etc.)
        // ✅ PHASE 3: Build array immutably (use let for reassignment)
    let nodeTypeMentions: Array<{ nodeType: string; position: number; node: WorkflowNode }> = [];
        for (const outputNode of sortedOutputs) {
          const nodeType = (outputNode.type || outputNode.data?.type || '').toLowerCase();
          
          // Create multiple search patterns for each node type
          const nodeTypeVariations = [
            nodeType, // "slack_message"
            nodeType.replace(/_/g, ' '), // "slack message"
            nodeType.replace(/_/g, ''), // "slackmessage"
            // Extract key words: "slack_message" -> "slack", "google_gmail" -> "gmail"
            ...nodeType.split('_').filter(word => word.length > 2), // ["slack", "message"]
          ];
          
          // ✅ PHASE 3: Build aliases immutably
          let aliases: string[] = [];
          if (nodeType.includes('slack')) aliases = [...aliases, 'slack']; // ✅ PHASE 3: Immutable add
          if (nodeType.includes('gmail') || nodeType.includes('email')) aliases = [...aliases, 'gmail', 'email']; // ✅ PHASE 3: Immutable add
          if (nodeType.includes('log')) aliases = [...aliases, 'log']; // ✅ PHASE 3: Immutable add
          if (nodeType.includes('hubspot')) aliases = [...aliases, 'hubspot', 'crm']; // ✅ PHASE 3: Immutable add
          if (nodeType.includes('sheets')) aliases = [...aliases, 'sheets', 'spreadsheet']; // ✅ PHASE 3: Immutable add
          
          const allVariations = [...new Set([...nodeTypeVariations, ...aliases])];
          
          for (const variation of allVariations) {
            // Escape special regex characters
            const escaped = variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
            let match;
            while ((match = regex.exec(originalPrompt)) !== null) {
              nodeTypeMentions = [...nodeTypeMentions, { nodeType, position: match.index, node: outputNode }]; // ✅ PHASE 3: Immutable add
            }
          }
        }
        
        // Step 3: Match cases to nodes using semantic proximity (universal matching)
        // For each case value, find the closest node mention in the prompt
        const promptLower = originalPrompt.toLowerCase();
        for (const caseValue of extractedCaseValues) {
          // Find the position of this case value in the prompt
          const casePosition = promptLower.indexOf(caseValue);
          if (casePosition === -1) continue;
          
          // Find the closest node mention after this case value
          let closestMention: { nodeType: string; position: number; node: WorkflowNode } | null = null;
          let minDistance = Infinity;
          
          for (const mention of nodeTypeMentions) {
            // Only consider nodes that appear after the case value
            if (mention.position > casePosition) {
              const distance = mention.position - casePosition;
              if (distance < minDistance) {
                minDistance = distance;
                closestMention = mention;
              }
            }
          }
          
          // If found a close node, map the case to it
          if (closestMention && minDistance < 200) { // Within 200 chars is considered related
            if (!switchCases.some(c => c.value === caseValue)) {
              switchCases = [...switchCases, { // ✅ PHASE 3: Immutable add
                value: caseValue, 
                label: caseValue.charAt(0).toUpperCase() + caseValue.slice(1) 
              }];
              caseToNodeMapping.set(caseValue, closestMention.node);
              console.log(`[WorkflowDSLCompiler] ✅ Matched case "${caseValue}" -> ${closestMention.nodeType} (distance: ${minDistance} chars)`);
            }
          }
        }
        
        // ✅ STEP 4: Enhanced fallback - analyze input data to generate cases if prompt extraction fails
        // This uses AI intelligence to generate cases from available input fields
        if (switchCases.length === 0 && sortedOutputs.length > 0) {
          console.log(`[WorkflowDSLCompiler] ⚠️  No cases extracted from prompt, analyzing input data structure...`);
          
          // Try to infer cases from available input fields
          // If we have a field like "status" with common values, generate cases
          if (availableInputFields.length > 0) {
            // Common status/type values that might exist in data
            const commonCaseValues = ['active', 'pending', 'completed', 'inactive', 'success', 'error', 'failed', 'new', 'old'];
            
            // Match output nodes to case values based on node type semantics
            sortedOutputs.forEach((outputNode, index) => {
              const nodeType = (outputNode.type || outputNode.data?.type || '').toLowerCase();
              
              // Try to infer case value from node type or use common values
              let caseValue: string;
              if (nodeType.includes('slack') || nodeType.includes('notification')) {
                caseValue = 'active'; // Active items -> notifications
              } else if (nodeType.includes('gmail') || nodeType.includes('email')) {
                caseValue = 'pending'; // Pending items -> emails
              } else if (nodeType.includes('log')) {
                caseValue = 'completed'; // Completed items -> logs
              } else if (index < commonCaseValues.length) {
                caseValue = commonCaseValues[index];
              } else {
                caseValue = `case_${index + 1}`;
              }
              
              switchCases = [...switchCases, { // ✅ PHASE 3: Immutable add
                value: caseValue, 
                label: caseValue.charAt(0).toUpperCase() + caseValue.slice(1) 
              }];
              caseToNodeMapping.set(caseValue, outputNode);
              console.log(`[WorkflowDSLCompiler] ✅ Generated case "${caseValue}" from input analysis -> ${nodeType}`);
            });
          } else {
            // Ultimate fallback: create generic cases from output nodes
            sortedOutputs.forEach((outputNode, index) => {
              const caseValue = `case_${index + 1}`;
              switchCases = [...switchCases, { // ✅ PHASE 3: Immutable add
                value: caseValue, 
                label: `Case ${index + 1}` 
              }];
              caseToNodeMapping.set(caseValue, outputNode);
            });
          }
        }
        
        // ✅ N8N APPROACH: Set switch node's outgoingPorts immediately (cases are known)
        if (switchCases.length > 0) {
          const caseValues = switchCases.map(c => c.value);
          
          // ✅ ROOT-LEVEL: Update switch node's config with cases and intelligently extracted expression
          if (lastTransformation.data) {
            lastTransformation.data.config = lastTransformation.data.config || {};
            lastTransformation.data.config.cases = switchCases;
            // ✅ Use intelligently extracted expression field (not hardcoded)
            lastTransformation.data.config.expression = `{{$json.${expressionField}}}`;
            console.log(`[WorkflowDSLCompiler] ✅ Switch expression: {{$json.${expressionField}}} (extracted from prompt + input analysis)`);
          }
          
          // ✅ CRITICAL: Update switch node's outgoingPorts in registry (like n8n - ports exist immediately)
          // This MUST be set so React Flow knows what handles exist on the switch node
          if (lastTransformationDef) {
            lastTransformationDef.outgoingPorts = caseValues;
            console.log(`[WorkflowDSLCompiler] ✅ Set switch node outgoingPorts: ${caseValues.join(', ')}`);
          }
          
          // ✅ CRITICAL: Also set outgoingPorts in config (for frontend to read)
          if (lastTransformation.data) {
            lastTransformation.data.config = lastTransformation.data.config || {};
            lastTransformation.data.config.outgoingPorts = caseValues;
          }
          
          // ✅ ROOT-LEVEL: Create edges with case-specific handles (one plug per case)
          // Each case gets its own output port and connects to its target node
          // Only the matching case will pass data to its connected node (like if_else true/false)
          for (const [caseValue, targetNode] of caseToNodeMapping.entries()) {
            // Check for cycles before creating edge
            const cycleCheck = this.detectCycleBeforeInsert(lastTransformation.id, targetNode.id, edges);
            if (cycleCheck.wouldCreateCycle) {
              console.warn(`[WorkflowDSLCompiler] ⚠️  Skipping edge ${lastTransformation.id} (${caseValue}) -> ${targetNode.id}: would create cycle`);
              continue;
            }
            
            const edge: WorkflowEdge = {
              id: `edge-${lastTransformation.id}-${caseValue}-${targetNode.id}`,
              source: lastTransformation.id,
              target: targetNode.id,
              sourceHandle: caseValue, // ✅ Case-specific output port (plug) - like if_else has 'true' and 'false'
              targetHandle: 'input',
              type: caseValue, // Edge type matches case value for routing
            };
            edges = [...edges, edge]; // ✅ PHASE 3: Immutable add
            console.log(`[WorkflowDSLCompiler] ✅ Connected switch case "${caseValue}" -> ${targetNode.type} (each case has its own output port/plug)`);
          }
          
          // ✅ CRITICAL: Verify all cases have connections
          if (switchCases.length !== caseToNodeMapping.size) {
            warnings = [...warnings, `Switch node has ${switchCases.length} cases but only ${caseToNodeMapping.size} connections - some cases may be unreachable`]; // ✅ PHASE 3: Immutable add
          }
        } else {
          warnings = [...warnings, `Switch node detected but no cases extracted from prompt - connections will be created in post-processing phase`]; // ✅ PHASE 3: Immutable add
        }
      } else if (sortedOutputs.length === 0) {
        // No outputs - this is OK (workflow might just process data)
        console.log('[WorkflowDSLCompiler] ⚠️  No output nodes to connect');
      } else if (sortedOutputs.length === 1) {
        // ✅ UNIVERSAL: Single output - connect directly (linear flow) using universal service
        const outNode = sortedOutputs[0];
        const edge = this.createCompatibleEdge(lastTransformation, outNode, edges, allNodesForEdges);
        if (edge) {
          edges = [...edges, edge]; // ✅ PHASE 3: Immutable add
          console.log(`[WorkflowDSLCompiler] ✅ Connected ${lastTransformation.type} -> ${outNode.type} (single output)`);
        } else {
          errors = [...errors, `Cannot create edge from ${lastTransformation.type} to output ${outNode.type}: No compatible handles`]; // ✅ PHASE 3: Immutable add
        }
      } else {
        // Multiple outputs - check if branching is allowed
        if (isAllowedBranchingNode) {
          // ✅ ROOT-LEVEL FIX: For branching nodes with true/false ports, assign outputs intelligently
          const lastTfNodeDef = unifiedNodeRegistry.get(lastTransformationType);
          const hasTrueFalsePorts = lastTfNodeDef?.isBranching && 
                                   lastTfNodeDef.outgoingPorts?.includes('true') && 
                                   lastTfNodeDef.outgoingPorts?.includes('false');
          
          if (hasTrueFalsePorts && sortedOutputs.length === 2) {
            // ✅ CRITICAL: Assign first output to 'true' branch, second to 'false' branch
            // This matches the semantic: "if condition then output1 else output2"
            const trueOutput = sortedOutputs[0];
            const falseOutput = sortedOutputs[1];
            
            // ✅ UNIVERSAL: Create edge for true branch using universal service
            const trueEdge = this.createCompatibleEdge(
              lastTransformation,
              trueOutput,
              edges,
              allNodesForEdges,
              'true',
              'true'
            );
            if (trueEdge) {
              edges = [...edges, trueEdge]; // ✅ PHASE 3: Immutable add
            } else {
              errors = [...errors, `Cannot create edge from ${lastTransformation.type} (true) to output ${trueOutput.type}: No compatible handles`]; // ✅ PHASE 3: Immutable add
            }
            
            // ✅ UNIVERSAL: Create edge for false branch using universal service
            const falseEdge = this.createCompatibleEdge(
              lastTransformation,
              falseOutput,
              edges,
              allNodesForEdges,
              'false',
              'false'
            );
            if (falseEdge) {
              edges = [...edges, falseEdge]; // ✅ PHASE 3: Immutable add
            } else {
              errors = [...errors, `Cannot create edge from ${lastTransformation.type} (false) to output ${falseOutput.type}: No compatible handles`]; // ✅ PHASE 3: Immutable add
            }
          } else if (hasTrueFalsePorts && sortedOutputs.length > 2) {
            // More than 2 outputs - connect first to true, rest sequentially after false
            const trueOutput = sortedOutputs[0];
            const falseOutput = sortedOutputs[1];
            
            // ✅ UNIVERSAL: True branch: first output using universal service
            const trueEdge = this.createCompatibleEdge(
              lastTransformation,
              trueOutput,
              edges,
              allNodesForEdges,
              'true',
              'true'
            );
            if (trueEdge) {
              edges = [...edges, trueEdge]; // ✅ PHASE 3: Immutable add
            }
            
            // ✅ UNIVERSAL: False branch: second output using universal service
            const falseEdge = this.createCompatibleEdge(
              lastTransformation,
              falseOutput,
              edges,
              allNodesForEdges,
              'false',
              'false'
            );
            if (falseEdge) {
              edges = [...edges, falseEdge]; // ✅ PHASE 3: Immutable add
            }
            
            // ✅ UNIVERSAL: Chain remaining outputs after false branch using universal service
            for (let i = 2; i < sortedOutputs.length; i++) {
              const prevOutput = sortedOutputs[i - 1];
              const currentOutput = sortedOutputs[i];
              const chainEdge = this.createCompatibleEdge(prevOutput, currentOutput, edges, allNodesForEdges);
              if (chainEdge) {
                edges = [...edges, chainEdge]; // ✅ PHASE 3: Immutable add
                console.log(`[WorkflowDSLCompiler] ✅ Connected ${prevOutput.type} -> ${currentOutput.type} (chained after false branch)`);
              }
            }
          } else {
            // ✅ UNIVERSAL: Not if_else or unexpected output count - use default branching with universal service
            for (const outNode of sortedOutputs) {
              const edge = this.createCompatibleEdge(lastTransformation, outNode, edges, allNodesForEdges);
              if (edge) {
                edges = [...edges, edge]; // ✅ PHASE 3: Immutable add
                console.log(`[WorkflowDSLCompiler] ✅ Connected ${lastTransformation.type} -> ${outNode.type} (branching allowed)`);
              } else {
                errors = [...errors, `Cannot create edge from ${lastTransformation.type} to output ${outNode.type}: No compatible handles`]; // ✅ PHASE 3: Immutable add
              }
            }
          }
        } else {
          // ✅ UNIVERSAL: Linear flow - connect outputs sequentially to avoid branching using universal service
          // Connect first output to last transformation, then chain remaining outputs
          const firstOutput = sortedOutputs[0];
          const edge = this.createCompatibleEdge(lastTransformation, firstOutput, edges, allNodesForEdges);
          if (edge) {
            edges = [...edges, edge]; // ✅ PHASE 3: Immutable add
            console.log(`[WorkflowDSLCompiler] ✅ Connected ${lastTransformation.type} -> ${firstOutput.type} (first output, linear flow)`);
          } else {
            errors = [...errors, `Cannot create edge from ${lastTransformation.type} to output ${firstOutput.type}: No compatible handles`]; // ✅ PHASE 3: Immutable add
          }
          
          // ✅ UNIVERSAL: Chain remaining outputs sequentially using universal service
          for (let i = 1; i < sortedOutputs.length; i++) {
            const prevOutput = sortedOutputs[i - 1];
            const currentOutput = sortedOutputs[i];
            const chainEdge = this.createCompatibleEdge(prevOutput, currentOutput, edges, allNodesForEdges);
            if (chainEdge) {
              edges = [...edges, chainEdge]; // ✅ PHASE 3: Immutable add
              console.log(`[WorkflowDSLCompiler] ✅ Connected ${prevOutput.type} -> ${currentOutput.type} (sequential chain, linear flow)`);
            } else {
              warnings = [...warnings, `Cannot create sequential edge from ${prevOutput.type} to ${currentOutput.type}: No compatible handles. Output may be unreachable.`]; // ✅ PHASE 3: Immutable add
            }
          }
        }
      }
    } else {
      // STEP 3 (Alternative): No transformations - Last Data Source -> First Output (linear flow)
      console.log('[WorkflowDSLCompiler] Step 3: No transformations - connecting last data source to first output (linear flow)...');
      if (sortedDataSources.length > 0 && sortedOutputs.length > 0) {
        // ✅ UNIVERSAL: Connect last data source to first output using universal service
        const lastDataSource = sortedDataSources[sortedDataSources.length - 1];
        const firstOutput = sortedOutputs[0];
        const edge = this.createCompatibleEdge(lastDataSource, firstOutput, edges, allNodesForEdges);
        if (edge) {
          edges = [...edges, edge]; // ✅ PHASE 3: Immutable add
          console.log(`[WorkflowDSLCompiler] ✅ Connected ${lastDataSource.type} -> ${firstOutput.type} (last data source to first output, linear flow)`);
        } else {
          errors = [...errors, `Cannot create edge from ${lastDataSource.type} to output ${firstOutput.type}: No compatible handles`]; // ✅ PHASE 3: Immutable add
        }
        
        // ✅ UNIVERSAL: Chain remaining outputs sequentially using universal service
        for (let i = 1; i < sortedOutputs.length; i++) {
          const prevOutput = sortedOutputs[i - 1];
          const currentOutput = sortedOutputs[i];
          const chainEdge = this.createCompatibleEdge(prevOutput, currentOutput, edges, allNodesForEdges);
          if (chainEdge) {
            edges = [...edges, chainEdge]; // ✅ PHASE 3: Immutable add
            console.log(`[WorkflowDSLCompiler] ✅ Connected ${prevOutput.type} -> ${currentOutput.type} (sequential chain, linear flow)`);
          } else {
            warnings = [...warnings, `Cannot create sequential edge from ${prevOutput.type} to ${currentOutput.type}: No compatible handles. Output may be unreachable.`]; // ✅ PHASE 3: Immutable add
          }
        }
      } else if (sortedDataSources.length === 0 && sortedOutputs.length > 0) {
        // No data sources - connect trigger to first output
        // ✅ CRITICAL FIX: Check trigger outgoing edge DYNAMICALLY (not from cached variable)
        // ✅ PERMANENT FIX: Reuse trigger properties declared at top of function
        
        // ✅ CRITICAL FIX: Check if trigger already has outgoing edge (dynamic check)
        // ✅ UNIVERSAL: Only create edge if trigger doesn't allow branching and doesn't already have an edge
        if (!triggerAllowsBranching && !triggerHasOutgoingEdge()) {
          const firstOutput = sortedOutputs[0];
          const edge = this.createCompatibleEdge(triggerNode, firstOutput, edges, allNodesForEdges);
          if (edge) {
            edges = [...edges, edge]; // ✅ PHASE 3: Immutable add
            console.log(`[WorkflowDSLCompiler] ✅ Connected trigger -> ${firstOutput.type} (no data sources, linear flow)`);
          } else {
            errors = [...errors, `Cannot create edge from trigger to output ${firstOutput.type}: No compatible handles`]; // ✅ PHASE 3: Immutable add
          }
        } else {
          console.log(`[WorkflowDSLCompiler] ⚠️  Trigger ${triggerAllowsBranching ? 'allows branching' : 'already has outgoing edge'}, skipping output connection to prevent branching`);
        }
        
        // ✅ UNIVERSAL: Chain remaining outputs sequentially using universal service
        for (let i = 1; i < sortedOutputs.length; i++) {
          const prevOutput = sortedOutputs[i - 1];
          const currentOutput = sortedOutputs[i];
          const chainEdge = this.createCompatibleEdge(prevOutput, currentOutput, edges, allNodesForEdges);
          if (chainEdge) {
            edges = [...edges, chainEdge]; // ✅ PHASE 3: Immutable add
            console.log(`[WorkflowDSLCompiler] ✅ Connected ${prevOutput.type} -> ${currentOutput.type} (sequential chain, linear flow)`);
          } else {
            warnings = [...warnings, `Cannot create sequential edge from ${prevOutput.type} to ${currentOutput.type}: No compatible handles. Output may be unreachable.`]; // ✅ PHASE 3: Immutable add
          }
        }
      }
    }

    // STEP 4: Validate pipeline (no cycles, exactly one trigger)
    const validationResult = this.validatePipeline(edges, triggerNode, dataSourceNodes, transformationNodes, outputNodes);
    if (validationResult.errors.length > 0) {
      errors = [...errors, ...validationResult.errors]; // ✅ PHASE 3: Immutable add
    }
    if (validationResult.warnings.length > 0) {
      warnings = [...warnings, ...validationResult.warnings]; // ✅ PHASE 3: Immutable add
    }

    // ✅ PERMANENT FIX: Enforce exactly ONE outgoing edge from trigger (linear workflow requirement)
    // This MUST run FIRST to prevent multiple branches from trigger
    // ✅ CRITICAL: Reuse trigger properties declared at top of function
    const triggerOutgoingEdges = edges.filter(e => e.source === triggerNode.id);
    if (triggerOutgoingEdges.length > 1 && !triggerAllowsBranching) {
      console.warn(`[WorkflowDSLCompiler] ⚠️  Trigger "${triggerType}" has ${triggerOutgoingEdges.length} outgoing edges (expected 1). Removing ${triggerOutgoingEdges.length - 1} extra edge(s) to enforce linear flow.`);
      
      // ✅ PERMANENT FIX: Keep only the FIRST edge from trigger (primary path)
      // Sort edges by target node type to ensure deterministic selection:
      // Priority: data_source > transformation > output
      const sortedEdges = [...triggerOutgoingEdges].sort((a, b) => {
        const aTarget = allNodesForEdges.find(n => n.id === a.target);
        const bTarget = allNodesForEdges.find(n => n.id === b.target);
        const aType = unifiedNormalizeNodeTypeString(aTarget?.type || aTarget?.data?.type || '');
        const bType = unifiedNormalizeNodeTypeString(bTarget?.type || bTarget?.data?.type || '');
        const aDef = unifiedNodeRegistry.get(aType);
        const bDef = unifiedNodeRegistry.get(bType);
        const aCategory = aDef?.category || 'unknown';
        const bCategory = bDef?.category || 'unknown';
        
        // Priority order: data_source > transformation > output
        const categoryOrder: Record<string, number> = {
          'data_source': 1,
          'transformation': 2,
          'output': 3,
          'unknown': 4
        };
        return (categoryOrder[aCategory] || 99) - (categoryOrder[bCategory] || 99);
      });
      
      const firstEdge = sortedEdges[0];
      const edgesToRemove = sortedEdges.slice(1);
      const edgesToRemoveIds = new Set(edgesToRemove.map(e => e.id));

      // ✅ PHASE 3: Immutably remove extra edges
      edges = edges.filter(edge => {
        if (edgesToRemoveIds.has(edge.id)) {
          console.log(`[WorkflowDSLCompiler] ❌ Removed extra edge from trigger: ${edge.source} -> ${edge.target}`);
          return false; // Remove this edge
        }
        return true; // Keep this edge
      });
      
      warnings = [...warnings, `Removed ${edgesToRemove.length} extra outgoing edge(s) from trigger "${triggerType}" to enforce linear workflow (kept: ${firstEdge.source} -> ${firstEdge.target})`]; // ✅ PHASE 3: Immutable add
    } else if (triggerOutgoingEdges.length > 1 && triggerAllowsBranching) {
      console.log(`[WorkflowDSLCompiler] ℹ️  Trigger "${triggerType}" allows branching - keeping ${triggerOutgoingEdges.length} outgoing edges`);
    }

    // ✅ ROOT-LEVEL UNIVERSAL FIX: Enforce single edge from non-branching nodes (prevent multiple branches)
    // Uses registry to determine which nodes allow branching (if_else, switch, merge)
    // This applies to ALL nodes, not just trigger
    // ✅ CRITICAL: This MUST run AFTER trigger fix to prevent burst flows
    const allNodes = [triggerNode, ...dataSourceNodes, ...transformationNodes, ...outputNodes];
    const nodeMap = new Map(allNodes.map(n => [n.id, n]));
    
    // ✅ STEP 1: Remove duplicate edges (same source-target pairs)
    const edgeMap = new Map<string, WorkflowEdge>();
    // ✅ PHASE 3: Build array immutably
    let duplicateEdges: string[] = [];
    edges.forEach(edge => {
      const key = `${edge.source}::${edge.target}`;
      if (edgeMap.has(key)) {
        duplicateEdges = [...duplicateEdges, edge.id]; // ✅ PHASE 3: Immutable add
        console.log(`[WorkflowDSLCompiler] ⚠️  Removing duplicate edge: ${edge.source} -> ${edge.target}`);
      } else {
        edgeMap.set(key, edge);
      }
    });
    const deduplicatedEdges = Array.from(edgeMap.values());
    edges = deduplicatedEdges; // ✅ PHASE 3: Immutable replace
    if (duplicateEdges.length > 0) {
      warnings = [...warnings, `Removed ${duplicateEdges.length} duplicate edge(s)`]; // ✅ PHASE 3: Immutable add
    }
    
    for (const node of allNodes) {
      const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      
      // Check if node allows branching (from registry)
      const allowsBranching = nodeDef?.isBranching || false;
      
      // Only enforce single edge for non-branching nodes
      if (!allowsBranching) {
        const nodeOutgoingEdges = edges.filter(e => e.source === node.id);
        if (nodeOutgoingEdges.length > 1) {
          console.warn(`[WorkflowDSLCompiler] ⚠️  Node "${nodeType}" (${node.id}) has ${nodeOutgoingEdges.length} outgoing edge(s) - removing duplicates to enforce linear flow`);
          warnings = [...warnings, `Node "${nodeType}" has ${nodeOutgoingEdges.length} outgoing edges. Keeping only the first one to enforce linear flow.`]; // ✅ PHASE 3: Immutable add
          
          // Keep only the first edge, remove all others
          const firstEdge = nodeOutgoingEdges[0];
          const edgesToRemove = nodeOutgoingEdges.slice(1);
          
          // ✅ PHASE 3: Immutably remove duplicate edges
          edges = edges.filter(e => !edgesToRemove.some(er => er.id === e.id)); // ✅ PHASE 3: Immutable filter
          for (const edgeToRemove of edgesToRemove) {
            console.log(`[WorkflowDSLCompiler] ❌ Removed duplicate edge from "${nodeType}": ${edgeToRemove.source} -> ${edgeToRemove.target}`);
          }
          
          console.log(`[WorkflowDSLCompiler] ✅ Enforced single edge from "${nodeType}": ${firstEdge.source} -> ${firstEdge.target}`);
        }
      }
    }

    console.log(`[WorkflowDSLCompiler] ✅ Deterministic pipeline built: ${edges.length} edge(s), ${errors.length} error(s), ${warnings.length} warning(s)`);

    return { edges, errors, warnings };
  }

  /**
   * ✅ UNIVERSAL: Create a compatible edge using Universal Edge Creation Service
   * 
   * ALL edge creation MUST go through the universal service to ensure consistent rules.
   */
  /**
   * ✅ ERROR PREVENTION: Create compatible edge using universal validators
   * Prevents Errors #1, #3, #5: Invalid handles, branching violations, parallel branches
   */
  private createCompatibleEdge(
    sourceNode: WorkflowNode,
    targetNode: WorkflowNode,
    existingEdges: WorkflowEdge[],
    allNodes?: WorkflowNode[],
    edgeType?: string,
    explicitSourceHandle?: string,
    explicitTargetHandle?: string
  ): WorkflowEdge | null {
    const allNodesForValidation = allNodes || [sourceNode, targetNode];
    
    // ✅ ERROR PREVENTION #5: Validate edge creation BEFORE attempting
    const validation = edgeCreationValidator.canCreateEdge(
      sourceNode,
      targetNode,
      existingEdges,
      [], // No edges being created in this pass (single edge creation)
      explicitSourceHandle,
      explicitTargetHandle,
      edgeType
    );
    
    if (!validation.allowed) {
      console.warn(`[WorkflowDSLCompiler] ⚠️  Cannot create edge ${sourceNode.type} -> ${targetNode.type}: ${validation.reason}`);
      return null;
    }
    
    // ✅ ERROR PREVENTION #1: Resolve handles using universal resolver
    const sourceHandleResult = universalHandleResolver.resolveSourceHandle(
      sourceNode.data.type,
      explicitSourceHandle || validation.suggestedSourceHandle,
      edgeType
    );
    
    const targetHandleResult = universalHandleResolver.resolveTargetHandle(
      targetNode.data.type,
      explicitTargetHandle || validation.suggestedTargetHandle
    );
    
    if (!sourceHandleResult.valid || !targetHandleResult.valid) {
      console.warn(
        `[WorkflowDSLCompiler] ⚠️  Handle resolution failed: ${sourceHandleResult.reason || targetHandleResult.reason}`
      );
      return null;
    }
    
    // Create edge with resolved handles
    const edge: WorkflowEdge = {
      id: `${sourceNode.id}->${targetNode.id}`,
      source: sourceNode.id,
      target: targetNode.id,
      sourceHandle: sourceHandleResult.handle,
      targetHandle: targetHandleResult.handle,
      type: edgeType as any || 'main',
    };
    
    console.log(
      `[WorkflowDSLCompiler] ✅ Edge created: ${sourceNode.type}(${sourceHandleResult.handle}) -> ${targetNode.type}(${targetHandleResult.handle})`
    );
    
    return edge;
  }

  /**
   * Validate pipeline structure
   * - Exactly one trigger
   * - No cycles
   * - All nodes reachable from trigger
   */
  private validatePipeline(
    edges: WorkflowEdge[],
    triggerNode: WorkflowNode,
    dataSourceNodes: WorkflowNode[],
    transformationNodes: WorkflowNode[],
    outputNodes: WorkflowNode[]
  ): { errors: string[]; warnings: string[] } {
    // ✅ PHASE 3: Build arrays immutably (use let for reassignment)
    let errors: string[] = [];
    let warnings: string[] = [];

    // Validation 1: Exactly one trigger (implicit - we only have one triggerNode)
    // This is already guaranteed by the compiler structure

    // Validation 2: No cycles (using DFS)
    const cycleResult = this.detectCycles(edges);
    if (cycleResult.hasCycle) {
      errors = [...errors, `Pipeline contains cycle: ${cycleResult.cyclePath?.join(' -> ')}`]; // ✅ PHASE 3: Immutable add
    }

    // Validation 3: All nodes reachable from trigger
    const allNodes = [triggerNode, ...dataSourceNodes, ...transformationNodes, ...outputNodes];
    const reachableNodes = this.getReachableNodes(triggerNode.id, edges, allNodes);
    const unreachableNodes = allNodes.filter(n => n.id !== triggerNode.id && !reachableNodes.has(n.id));
    if (unreachableNodes.length > 0) {
      warnings = [...warnings, `Some nodes are not reachable from trigger: ${unreachableNodes.map(n => `${n.type} (${n.id})`).join(', ')}`]; // ✅ PHASE 3: Immutable add
    }

    return { errors, warnings };
  }

  /**
   * Detect cycles in the pipeline using DFS
   */
  private detectCycles(edges: WorkflowEdge[]): { hasCycle: boolean; cyclePath?: string[] } {
    // Build adjacency list
    const adjacency = new Map<string, string[]>();
    const nodeIds = new Set<string>();

    edges.forEach(edge => {
      nodeIds.add(edge.source);
      nodeIds.add(edge.target);
      if (!adjacency.has(edge.source)) {
        adjacency.set(edge.source, []);
      }
      const existing = adjacency.get(edge.source) || [];
      adjacency.set(edge.source, [...existing, edge.target]); // ✅ PHASE 3: Immutable add
    });

    // ✅ PHASE 3: DFS to detect cycles (immutable)
    const visited = new Set<string>();
    const recStack = new Set<string>();
    let cyclePath: string[] = [];

    const dfs = (nodeId: string, path: string[]): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);
      const newPath = [...path, nodeId]; // ✅ PHASE 3: Immutable add

      const neighbors = adjacency.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, newPath)) {
            return true;
          }
        } else if (recStack.has(neighbor)) {
          // Cycle detected
          const cycleStart = newPath.indexOf(neighbor);
          cyclePath = [...newPath.slice(cycleStart), neighbor]; // ✅ PHASE 3: Immutable set
          return true;
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const nodeId of nodeIds) {
      if (!visited.has(nodeId)) {
        if (dfs(nodeId, [] as string[])) {
          return { hasCycle: true, cyclePath };
        }
      }
    }

    return { hasCycle: false };
  }

  /**
   * Detect whether inserting an edge source -> target would create a cycle.
   *
   * Rules:
   * - Graph must remain a DAG
   * - We check reachability from target back to source using DFS
   * - If source is reachable from target, then adding source -> target would close a cycle
   */
  private detectCycleBeforeInsert(
    sourceId: string,
    targetId: string,
    edges: WorkflowEdge[]
  ): { wouldCreateCycle: boolean; cyclePath?: string[] } {
    // Quick no-op: self-loop is always a cycle
    if (sourceId === targetId) {
      return { wouldCreateCycle: true, cyclePath: [sourceId, targetId] };
    }

    // Build adjacency list from existing edges
    const adjacency = new Map<string, string[]>();
    for (const edge of edges) {
      if (!adjacency.has(edge.source)) {
        adjacency.set(edge.source, []);
      }
      const existing = adjacency.get(edge.source) || [];
      adjacency.set(edge.source, [...existing, edge.target]); // ✅ PHASE 3: Immutable add
    }

    // ✅ PHASE 3: DFS from target to see if we can reach source (immutable)
    const visited = new Set<string>();
    let foundPath: string[] | undefined;

    const dfs = (current: string, path: string[] = []): boolean => {
      visited.add(current);
      const newPath = [...path, current]; // ✅ PHASE 3: Immutable add

      const neighbors = adjacency.get(current) || [];
      for (const neighbor of neighbors) {
        if (neighbor === sourceId) {
          // Found a path target -> … -> source
          foundPath = [...newPath, neighbor]; // ✅ PHASE 3: Immutable set
          return true;
        }
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, newPath)) {
            return true;
          }
        }
      }

      return false;
    };

    const wouldCreateCycle = dfs(targetId, []);
    return wouldCreateCycle
      ? { wouldCreateCycle: true, cyclePath: foundPath }
      : { wouldCreateCycle: false };
  }

  /**
   * Get all nodes reachable from a starting node using BFS
   */
  private getReachableNodes(startNodeId: string, edges: WorkflowEdge[], allNodes: WorkflowNode[]): Set<string> {
    const reachable = new Set<string>([startNodeId]);
    // ✅ PHASE 3: Build queue immutably
    let queue = [startNodeId];
    const adjacency = new Map<string, string[]>();

    edges.forEach(edge => {
      if (!adjacency.has(edge.source)) {
        adjacency.set(edge.source, []);
      }
      const existing = adjacency.get(edge.source) || [];
      adjacency.set(edge.source, [...existing, edge.target]); // ✅ PHASE 3: Immutable add
    });

    // ✅ PHASE 3: BFS with immutable queue
    while (queue.length > 0) {
      const [current, ...rest] = queue; // ✅ PHASE 3: Immutable shift
      queue = rest;
      const neighbors = adjacency.get(current) || [];
      for (const neighbor of neighbors) {
        if (!reachable.has(neighbor)) {
          reachable.add(neighbor);
          queue = [...queue, neighbor]; // ✅ PHASE 3: Immutable add
        }
      }
    }

    return reachable;
  }

  /**
   * Create edges from execution order (DEPRECATED - kept for backward compatibility)
   * @deprecated Use buildLinearPipeline() instead for deterministic edge creation
   */
  private createEdgesFromExecutionOrder(
    executionOrder: DSLExecutionStep[],
    triggerNode: WorkflowNode,
    dataSourceNodes: WorkflowNode[],
    transformationNodes: WorkflowNode[],
    outputNodes: WorkflowNode[]
  ): { edges: WorkflowEdge[]; errors: string[]; warnings: string[] } {
    // ✅ PHASE 3: Build arrays immutably (use let for reassignment)
    let edges: WorkflowEdge[] = [];
    let errors: string[] = [];
    let warnings: string[] = [];

    // Map step refs to nodes
    const stepRefToNode = new Map<string, WorkflowNode>();
    // ✅ ROOT-LEVEL UNIVERSAL FIX: Use standardized metadata system
    stepRefToNode.set('trigger', triggerNode);
    dataSourceNodes.forEach(node => {
      const metadata = NodeMetadataHelper.getMetadata(node);
      const dslId = metadata?.dsl?.dslId;
      if (dslId) stepRefToNode.set(dslId, node);
    });
    transformationNodes.forEach(node => {
      const metadata = NodeMetadataHelper.getMetadata(node);
      const dslId = metadata?.dsl?.dslId;
      if (dslId) stepRefToNode.set(dslId, node);
    });
    outputNodes.forEach(node => {
      const metadata = NodeMetadataHelper.getMetadata(node);
      const dslId = metadata?.dsl?.dslId;
      if (dslId) stepRefToNode.set(dslId, node);
    });

    // Create edges based on execution order dependencies
    for (const step of executionOrder) {
      const sourceNode = stepRefToNode.get(step.stepRef);
      if (!sourceNode) {
        errors = [...errors, `Cannot find node for step ref: ${step.stepRef}`]; // ✅ PHASE 3: Immutable add
        continue;
      }

      // Find dependent steps
      const dependentSteps = executionOrder.filter(s => 
        s.dependsOn && s.dependsOn.includes(step.stepId)
      );

      for (const depStep of dependentSteps) {
        const targetNode = stepRefToNode.get(depStep.stepRef);
        if (!targetNode) {
          errors = [...errors, `Cannot find node for dependent step ref: ${depStep.stepRef}`]; // ✅ PHASE 3: Immutable add
          continue;
        }

        // ✅ ERROR PREVENTION #1: Use Universal Handle Resolver (prevents invalid handles)
        const sourceType = unifiedNormalizeNodeTypeString(sourceNode.type || sourceNode.data?.type || '');
        const targetType = unifiedNormalizeNodeTypeString(targetNode.type || targetNode.data?.type || '');
        
        const sourceHandleResult = universalHandleResolver.resolveSourceHandle(sourceType);
        const targetHandleResult = universalHandleResolver.resolveTargetHandle(targetType);
        
        if (!sourceHandleResult.valid || !targetHandleResult.valid) {
          errors = [...errors, `Cannot resolve handles between ${step.stepRef} and ${depStep.stepRef}: ${sourceHandleResult.reason || targetHandleResult.reason}`]; // ✅ PHASE 3: Immutable add
          continue;
        }

        // ✅ PHASE 3: Create edge immutably
        edges = [...edges, {
          id: randomUUID(),
          source: sourceNode.id,
          target: targetNode.id,
          sourceHandle: sourceHandleResult.handle,
          targetHandle: targetHandleResult.handle,
        }]; // ✅ PHASE 3: Immutable add
      }
    }

    return { edges, errors, warnings };
  }

  /**
   * Connect transformation inputs
   */
  private connectTransformationInputs(
    transformations: DSLTransformation[],
    transformationNodes: WorkflowNode[],
    dataSourceNodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): WorkflowEdge[] {
    // ✅ PHASE 3: Build edges immutably
    let updatedEdges = edges;
    for (const tf of transformations) {
      if (!tf.input) continue;

      // ✅ ROOT-LEVEL UNIVERSAL FIX: Use standardized metadata system
      const tfNode = transformationNodes.find(n => {
        const metadata = NodeMetadataHelper.getMetadata(n);
        return metadata?.dsl?.dslId === tf.id;
      });
      if (!tfNode) continue;

      // Find source node
      const sourceNode = dataSourceNodes.find(n => {
        const metadata = NodeMetadataHelper.getMetadata(n);
        return metadata?.dsl?.dslId === tf.input!.sourceId;
      });
      if (!sourceNode) continue;

      // Check if edge already exists
      const existingEdge = edges.find(e => 
        e.source === sourceNode.id && e.target === tfNode.id
      );
      if (existingEdge) continue;

      // ✅ ERROR PREVENTION #1: Use Universal Handle Resolver (prevents invalid handles)
      const sourceType = unifiedNormalizeNodeTypeString(sourceNode.type || sourceNode.data?.type || '');
      const targetType = unifiedNormalizeNodeTypeString(tfNode.type || tfNode.data?.type || '');
      
      const sourceHandleResult = universalHandleResolver.resolveSourceHandle(sourceType);
      const targetHandleResult = universalHandleResolver.resolveTargetHandle(targetType);
      
      if (!sourceHandleResult.valid || !targetHandleResult.valid) {
        console.warn(`[WorkflowDSLCompiler] ⚠️  Cannot create edge ${sourceType} → ${targetType}: Handle resolution failed - ${sourceHandleResult.reason || targetHandleResult.reason}`);
        continue;
      }
      
      updatedEdges = [...updatedEdges, { // ✅ PHASE 3: Immutable add
        id: randomUUID(),
        source: sourceNode.id,
        target: tfNode.id,
        sourceHandle: sourceHandleResult.handle,
        targetHandle: targetHandleResult.handle,
      }];
    }
    return updatedEdges; // ✅ PHASE 3: Return new array
  }

  /**
   * Connect output inputs
   */
  private connectOutputInputs(
    outputs: DSLOutput[],
    outputNodes: WorkflowNode[],
    transformationNodes: WorkflowNode[],
    dataSourceNodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): WorkflowEdge[] {
    // ✅ PHASE 3: Build edges immutably
    let updatedEdges = edges;
    for (const out of outputs) {
      if (!out.input) continue;

      // ✅ ROOT-LEVEL UNIVERSAL FIX: Use standardized metadata system
      const outNode = outputNodes.find(n => {
        const metadata = NodeMetadataHelper.getMetadata(n);
        return metadata?.dsl?.dslId === out.id;
      });
      if (!outNode) continue;

      // Try to find source in transformations first, then data sources
      let sourceNode = transformationNodes.find(n => {
        const metadata = NodeMetadataHelper.getMetadata(n);
        return metadata?.dsl?.dslId === out.input!.sourceId;
      });
      if (!sourceNode) {
        sourceNode = dataSourceNodes.find(n => {
          const metadata = NodeMetadataHelper.getMetadata(n);
          return metadata?.dsl?.dslId === out.input!.sourceId;
        });
      }
      if (!sourceNode) continue;

      // Check if edge already exists
      const existingEdge = edges.find(e => 
        e.source === sourceNode!.id && e.target === outNode.id
      );
      if (existingEdge) continue;

      // ✅ ERROR PREVENTION #1: Use Universal Handle Resolver (prevents invalid handles)
      const sourceType = unifiedNormalizeNodeTypeString(sourceNode.type || sourceNode.data?.type || '');
      const targetType = unifiedNormalizeNodeTypeString(outNode.type || outNode.data?.type || '');
      
      const sourceHandleResult = universalHandleResolver.resolveSourceHandle(sourceType);
      const targetHandleResult = universalHandleResolver.resolveTargetHandle(targetType);
      
      if (!sourceHandleResult.valid || !targetHandleResult.valid) {
        console.warn(`[WorkflowDSLCompiler] ⚠️  Cannot create edge ${sourceType} → ${targetType}: Handle resolution failed - ${sourceHandleResult.reason || targetHandleResult.reason}`);
        continue;
      }
      
      updatedEdges = [...updatedEdges, { // ✅ PHASE 3: Immutable add
        id: randomUUID(),
        source: sourceNode.id,
        target: outNode.id,
        sourceHandle: sourceHandleResult.handle,
        targetHandle: targetHandleResult.handle,
      }];
    }
    return updatedEdges; // ✅ PHASE 3: Return new array
  }

  /**
   * ✅ ROOT-LEVEL FIX: Sort nodes by semantic order using REGISTRY (not UUID)
   * 
   * This is a UNIVERSAL fix that works for ANY node type, not just known ones.
   * Uses UnifiedNodeRegistry as single source of truth.
   * 
   * Ordering Rules (registry-driven):
   * 1. Data Sources: Read operations first, then write operations
   * 2. Transformations: Simple (ai_chat_model) before complex (ai_agent)
   * 3. Outputs: Route operations (CRM) before notifications (email)
   */
  private sortNodesBySemanticOrder<T extends WorkflowNode>(
    nodes: T[],
    dslCategory: 'data_source' | 'transformation' | 'output'
  ): T[] {
    return [...nodes].sort((a, b) => {
      // Extract node type from node object
      const rawTypeA = a.type || a.data?.type || '';
      const rawTypeB = b.type || b.data?.type || '';
      const nodeTypeA = unifiedNormalizeNodeTypeString(rawTypeA);
      const nodeTypeB = unifiedNormalizeNodeTypeString(rawTypeB);
      
      // ✅ Get node definitions from registry (single source of truth)
      const defA = unifiedNodeRegistry.get(nodeTypeA);
      const defB = unifiedNodeRegistry.get(nodeTypeB);
      
      // Fallback if registry doesn't have definition
      if (!defA || !defB) {
        console.warn(
          `[WorkflowDSLCompiler] ⚠️  Node definition not found in registry: ` +
          `${!defA ? nodeTypeA : nodeTypeB}. Falling back to alphabetical sort.`
        );
        return (nodeTypeA || '').localeCompare(nodeTypeB || '');
      }
      
      // Get operation from config (if available)
      const opA = typeof (a.data?.config?.operation) === 'string' 
        ? (a.data.config.operation as string).toLowerCase() 
        : '';
      const opB = typeof (b.data?.config?.operation) === 'string' 
        ? (b.data.config.operation as string).toLowerCase() 
        : '';
      
      switch (dslCategory) {
        case 'data_source':
          return this.sortByOperationDirection(a, b, opA, opB, defA, defB);
        
        case 'transformation':
          return this.sortByComplexity(a, b, defA, defB);
        
        case 'output':
          return this.sortByOutputType(a, b, defA, defB);
        
        default:
          return nodeTypeA.localeCompare(nodeTypeB);
      }
    });
  }

  /**
   * ✅ UNIVERSAL: Sort by operation direction (read -> write)
   * Works for ANY data source node type
   */
  private sortByOperationDirection(
    a: WorkflowNode,
    b: WorkflowNode,
    opA: string,
    opB: string,
    defA: UnifiedNodeDefinition,
    defB: UnifiedNodeDefinition
  ): number {
    // ✅ Determine operation direction from config or registry tags
    const readOps = ['read', 'get', 'fetch', 'list', 'search', 'retrieve', 'query'];
    const writeOps = ['write', 'create', 'update', 'delete', 'append', 'insert'];
    
    // Check config operation first
    const aIsRead = opA && readOps.includes(opA);
    const bIsRead = opB && readOps.includes(opB);
    const aIsWrite = opA && writeOps.includes(opA);
    const bIsWrite = opB && writeOps.includes(opB);
    
    // ✅ Fallback: Check registry tags for operation hints
    const aTags = defA.tags || [];
    const bTags = defB.tags || [];
    const aIsReadFromTags = aTags.some(tag => readOps.includes(tag.toLowerCase()));
    const bIsReadFromTags = bTags.some(tag => readOps.includes(tag.toLowerCase()));
    const aIsWriteFromTags = aTags.some(tag => writeOps.includes(tag.toLowerCase()));
    const bIsWriteFromTags = bTags.some(tag => writeOps.includes(tag.toLowerCase()));
    
    // Combine config and tag information
    const aIsReadOp = aIsRead || (!aIsWrite && aIsReadFromTags);
    const bIsReadOp = bIsRead || (!bIsWrite && bIsReadFromTags);
    const aIsWriteOp = aIsWrite || aIsWriteFromTags;
    const bIsWriteOp = bIsWrite || bIsWriteFromTags;
    
    // Read operations first
    if (aIsReadOp && !bIsReadOp) return -1;
    if (!aIsReadOp && bIsReadOp) return 1;
    
    // Write operations last
    if (aIsWriteOp && !bIsWriteOp) return 1;
    if (!aIsWriteOp && bIsWriteOp) return -1;
    
    // Same direction: sort by type name for consistency
    return (a.type || a.data?.type || '').localeCompare(b.type || b.data?.type || '');
  }

  /**
   * ✅ UNIVERSAL: Sort by complexity (simple -> complex)
   * Works for ANY transformation node type
   * 
   * Complexity determined by:
   * 1. Registry tags (e.g., 'simple', 'complex', 'agent', 'tool')
   * 2. Node type patterns (ai_chat_model = simple, ai_agent = complex)
   * 3. Category hints (transformation = simple, ai with tools = complex)
   */
  private sortByComplexity(
    a: WorkflowNode,
    b: WorkflowNode,
    defA: UnifiedNodeDefinition,
    defB: UnifiedNodeDefinition
  ): number {
    // ✅ Get complexity from registry tags
    const tagsA = defA.tags || [];
    const tagsB = defB.tags || [];
    
    // Check for complexity indicators in tags
    const aIsSimple = tagsA.some(tag => ['simple', 'basic', 'direct'].includes(tag.toLowerCase()));
    const bIsSimple = tagsB.some(tag => ['simple', 'basic', 'direct'].includes(tag.toLowerCase()));
    const aIsComplex = tagsA.some(tag => ['complex', 'agent', 'tool', 'memory'].includes(tag.toLowerCase()));
    const bIsComplex = tagsB.some(tag => ['complex', 'agent', 'tool', 'memory'].includes(tag.toLowerCase()));
    
    // ✅ Fallback: Infer from node type patterns
    const typeA = (a.type || a.data?.type || '').toLowerCase();
    const typeB = (b.type || b.data?.type || '').toLowerCase();
    
    // Pattern-based complexity detection (universal rules)
    const simplePatterns = ['chat_model', 'summarizer', 'text_'];
    const complexPatterns = ['agent', 'tool', 'memory', 'orchestrator'];
    
    const aIsSimplePattern = simplePatterns.some(pattern => typeA.includes(pattern));
    const bIsSimplePattern = simplePatterns.some(pattern => typeB.includes(pattern));
    const aIsComplexPattern = complexPatterns.some(pattern => typeA.includes(pattern));
    const bIsComplexPattern = complexPatterns.some(pattern => typeB.includes(pattern));
    
    // Combine tag and pattern information
    const aIsSimpleNode = aIsSimple || (!aIsComplex && aIsSimplePattern);
    const bIsSimpleNode = bIsSimple || (!bIsComplex && bIsSimplePattern);
    const aIsComplexNode = aIsComplex || aIsComplexPattern;
    const bIsComplexNode = bIsComplex || bIsComplexPattern;
    
    // Simple nodes first
    if (aIsSimpleNode && !bIsSimpleNode) return -1;
    if (!aIsSimpleNode && bIsSimpleNode) return 1;
    
    // Complex nodes last
    if (aIsComplexNode && !bIsComplexNode) return 1;
    if (!aIsComplexNode && bIsComplexNode) return -1;
    
    // Same complexity: sort alphabetically
    return typeA.localeCompare(typeB);
  }

  /**
   * ✅ UNIVERSAL: Sort outputs by operation type (route -> notify)
   * Works for ANY output node type
   * 
   * Operation type determined by:
   * 1. Registry category (communication = notify, data = route/storage)
   * 2. Registry tags (e.g., 'crm', 'route', 'notify', 'email')
   * 3. Node type patterns (crm = route, email/slack = notify)
   */
  private sortByOutputType(
    a: WorkflowNode,
    b: WorkflowNode,
    defA: UnifiedNodeDefinition,
    defB: UnifiedNodeDefinition
  ): number {
    // ✅ Get operation type from registry category and tags
    const categoryA = defA.category;
    const categoryB = defB.category;
    const tagsA = defA.tags || [];
    const tagsB = defB.tags || [];
    
    // Determine operation type from category and tags
    const aIsRoute = categoryA === 'data' || 
                     tagsA.some(tag => ['crm', 'route', 'database', 'storage', 'write'].includes(tag.toLowerCase()));
    const bIsRoute = categoryB === 'data' || 
                     tagsB.some(tag => ['crm', 'route', 'database', 'storage', 'write'].includes(tag.toLowerCase()));
    const aIsNotify = categoryA === 'communication' || 
                      tagsA.some(tag => ['notify', 'email', 'message', 'alert'].includes(tag.toLowerCase()));
    const bIsNotify = categoryB === 'communication' || 
                      tagsB.some(tag => ['notify', 'email', 'message', 'alert'].includes(tag.toLowerCase()));
    
    // ✅ Fallback: Pattern-based detection (universal rules)
    const typeA = (a.type || a.data?.type || '').toLowerCase();
    const typeB = (b.type || b.data?.type || '').toLowerCase();
    
    const routePatterns = ['crm', 'database', 'storage', 'sheets', 'airtable'];
    const notifyPatterns = ['gmail', 'email', 'slack', 'discord', 'message', 'notification'];
    
    const aIsRoutePattern = routePatterns.some(pattern => typeA.includes(pattern));
    const bIsRoutePattern = routePatterns.some(pattern => typeB.includes(pattern));
    const aIsNotifyPattern = notifyPatterns.some(pattern => typeA.includes(pattern));
    const bIsNotifyPattern = notifyPatterns.some(pattern => typeB.includes(pattern));
    
    // Combine category/tag and pattern information
    const aIsRouteOp = aIsRoute || aIsRoutePattern;
    const bIsRouteOp = bIsRoute || bIsRoutePattern;
    const aIsNotifyOp = aIsNotify || aIsNotifyPattern;
    const bIsNotifyOp = bIsNotify || bIsNotifyPattern;
    
    // Route operations first
    if (aIsRouteOp && !bIsRouteOp) return -1;
    if (!aIsRouteOp && bIsRouteOp) return 1;
    
    // Notify operations last
    if (aIsNotifyOp && !bIsNotifyOp) return 1;
    if (!aIsNotifyOp && bIsNotifyOp) return -1;
    
    // Same type: sort alphabetically
    return typeA.localeCompare(typeB);
  }

  /**
   * ✅ PHASE 5: Separate conditional nodes and limit nodes from transformations
   * 
   * Ensures correct ordering:
   * - limit -> comes BEFORE transformations (filters data before processing)
   * - if_else/switch -> comes AFTER transformations (conditions on processed data)
   * 
   * Pipeline order: dataSources -> limit -> transformations -> conditionals -> outputs
   * 
   * Uses registry to determine node types (not hardcoded checks).
   */
  /**
   * ✅ FIX 1: Separate transformation nodes using unified categorizer
   * This ensures consistent categorization with DSL generator
   */
  private separateTransformationNodes(
    transformationNodes: WorkflowNode[]
  ): {
    limitNodes: WorkflowNode[];
    actualTransformations: WorkflowNode[];
    conditionalNodes: WorkflowNode[];
  } {
    // ✅ PHASE 3: Build arrays immutably
    let limitNodes: WorkflowNode[] = [];
    let actualTransformations: WorkflowNode[] = [];
    let conditionalNodes: WorkflowNode[] = [];
    
    // Import unified categorizer
    const { unifiedNodeCategorizer } = require('./unified-node-categorizer');
    
    for (const node of transformationNodes) {
      const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
      const operation = node.data?.config?.operation || '';
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      
      // ✅ FIX 1: Use unified categorizer for consistent categorization
      // This ensures compiler uses same logic as DSL generator
      const categorizationResult = unifiedNodeCategorizer.categorizeWithOperation(nodeType, operation);
      
      // Check if it's a limit node
      const nodeTypeLower = nodeType.toLowerCase();
      if (nodeTypeLower === 'limit') {
        limitNodes = [...limitNodes, node]; // ✅ PHASE 3: Immutable add
        continue;
      }
      
      // ✅ PHASE 1 FIX: Use registry to check if node is conditional/branching
      // Registry is single source of truth - no hardcoded checks
      if (nodeDef) {
        const isConditional = nodeDef.isBranching || 
                            nodeDef.category === 'logic' || 
                            (nodeDef.tags || []).some(tag => 
                              ['conditional', 'branch', 'if', 'switch', 'merge'].includes(tag.toLowerCase())
                            );
        
        if (isConditional) {
          conditionalNodes = [...conditionalNodes, node]; // ✅ PHASE 3: Immutable add
          continue;
        }
      }
      
      // ✅ All other nodes are actual transformations
      // Use categorization result to verify it's still a transformation
      if (categorizationResult.category === 'transformation') {
        actualTransformations = [...actualTransformations, node]; // ✅ PHASE 3: Immutable add
      } else {
        // Log warning if categorization doesn't match (shouldn't happen if DSL was generated correctly)
        console.warn(`[WorkflowDSLCompiler] ⚠️  Node "${nodeType}" in transformations array categorized as "${categorizationResult.category}" - treating as transformation`);
        actualTransformations = [...actualTransformations, node]; // ✅ PHASE 3: Immutable add
      }
    }
    
    console.log(
      `[WorkflowDSLCompiler] Separated transformation nodes: ` +
      `${limitNodes.length} limit(s), ${actualTransformations.length} transformation(s), ${conditionalNodes.length} conditional(s)`
    );
    
    return {
      limitNodes,
      actualTransformations,
      conditionalNodes,
    };
  }
}

// Export singleton instance
export const workflowDSLCompiler = new WorkflowDSLCompiler();
