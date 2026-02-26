/**
 * Workflow DSL Compiler
 * 
 * Compiles WorkflowDSL into executable Workflow Graph.
 * 
 * This is the ONLY way to generate a workflow graph.
 * LLM cannot generate graph directly - it must go through DSL.
 * 
 * Pipeline: DSL → Workflow Graph
 */

import { WorkflowDSL, DSLTrigger, DSLDataSource, DSLTransformation, DSLOutput, DSLExecutionStep } from './workflow-dsl';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { nodeLibrary } from '../nodes/node-library';
import { resolveCompatibleHandles } from './schema-driven-connection-resolver';
import { normalizeNodeType } from './node-type-normalizer';
import { nodeTypeResolver } from '../nodes/node-type-resolver';
import { randomUUID } from 'crypto';

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
   */
  compile(dsl: WorkflowDSL): DSLCompilationResult {
    console.log('[WorkflowDSLCompiler] Compiling DSL to Workflow Graph...');
    console.log(`[WorkflowDSLCompiler] DSL: ${dsl.dataSources.length} data sources, ${dsl.transformations.length} transformations, ${dsl.outputs.length} outputs`);

    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // STEP 0: Validate and normalize all node types BEFORE compilation
      // Never allow unknown node types to reach the compiler
      console.log('[WorkflowDSLCompiler] STEP 0: Validating all node types exist in NodeLibrary...');
      const nodeTypeValidation = this.validateAndNormalizeNodeTypes(dsl);
      if (nodeTypeValidation.errors.length > 0) {
        errors.push(...nodeTypeValidation.errors);
        return {
          success: false,
          errors,
          warnings: [...warnings, ...nodeTypeValidation.warnings],
        };
      }
      warnings.push(...nodeTypeValidation.warnings);
      
      // Use validated DSL (node types may have been normalized)
      const validatedDSL = nodeTypeValidation.dsl;

      // Validate DSL structure
      const { dslGenerator } = require('./workflow-dsl');
      const validation = dslGenerator.validateDSL(validatedDSL);
      if (!validation.valid) {
        errors.push(...validation.errors);
        return {
          success: false,
          errors,
          warnings: [...warnings, ...validation.warnings],
        };
      }
      warnings.push(...validation.warnings);

      // Build nodes from DSL
      const nodes: WorkflowNode[] = [];
      const edges: WorkflowEdge[] = [];

      // Step 1: Create trigger node
      const triggerNode = this.createTriggerNode(validatedDSL.trigger);
      nodes.push(triggerNode);

      // Step 2: Create data source nodes
      const dataSourceNodes = validatedDSL.dataSources.map(ds => this.createDataSourceNode(ds));
      nodes.push(...dataSourceNodes);

      // Step 3: Create transformation nodes
      const transformationNodes = validatedDSL.transformations.map(tf => this.createTransformationNode(tf));
      nodes.push(...transformationNodes);

      // Step 4: Create output nodes
      const outputNodes = validatedDSL.outputs.map(out => this.createOutputNode(out));
      nodes.push(...outputNodes);

      // Step 5: Create edges using deterministic linear pipeline
      const pipelineResult = this.buildLinearPipeline(
        validatedDSL,
        triggerNode,
        dataSourceNodes,
        transformationNodes,
        outputNodes
      );
      edges.push(...pipelineResult.edges);
      if (pipelineResult.errors.length > 0) {
        errors.push(...pipelineResult.errors);
      }
      if (pipelineResult.warnings.length > 0) {
        warnings.push(...pipelineResult.warnings);
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
   * - If node type not found → attempt normalization
   * - If normalization fails → use NodeTypeResolver
   * - Replace with compatible type
   * - Log warnings
   * - Never allow unknown node types to reach compiler
   * 
   * @param dsl - Original DSL
   * @returns Validated DSL with normalized node types and warnings
   */
  private validateAndNormalizeNodeTypes(dsl: WorkflowDSL): {
    dsl: WorkflowDSL;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const validatedDSL: WorkflowDSL = {
      ...dsl,
      dataSources: [...dsl.dataSources],
      transformations: [...dsl.transformations],
      outputs: [...dsl.outputs],
    };

    // Collect all node types to validate
    const nodeTypesToValidate: Array<{
      category: 'trigger' | 'dataSource' | 'transformation' | 'output';
      originalType: string;
      operation?: string;
      dslItem: DSLTrigger | DSLDataSource | DSLTransformation | DSLOutput;
    }> = [];

    // Add trigger type
    nodeTypesToValidate.push({
      category: 'trigger',
      originalType: dsl.trigger.type,
      dslItem: dsl.trigger,
    });

    // Add data source types
    dsl.dataSources.forEach(ds => {
      nodeTypesToValidate.push({
        category: 'dataSource',
        originalType: ds.type,
        operation: ds.operation,
        dslItem: ds,
      });
    });

    // Add transformation types
    dsl.transformations.forEach(tf => {
      nodeTypesToValidate.push({
        category: 'transformation',
        originalType: tf.type,
        operation: tf.operation,
        dslItem: tf,
      });
    });

    // Add output types
    dsl.outputs.forEach(out => {
      nodeTypesToValidate.push({
        category: 'output',
        originalType: out.type,
        operation: out.operation,
        dslItem: out,
      });
    });

    // Validate and normalize each node type
    for (const item of nodeTypesToValidate) {
      const originalType = item.originalType;
      
      // ✅ CRITICAL FIX: Skip "custom" type - it's invalid in DSL
      // "custom" is only used in final workflow nodes for frontend compatibility
      // It should never appear in the DSL itself
      if (originalType === 'custom' || !originalType) {
        const errorMsg = `Invalid node type "${originalType}" in ${item.category}. "custom" type is not allowed in DSL - it's only used for frontend compatibility in final workflow nodes.`;
        errors.push(errorMsg);
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

      // Step 1: Try normalization
      normalizedType = normalizeNodeType(originalType);
      if (normalizedType !== originalType && nodeLibrary.isNodeTypeRegistered(normalizedType)) {
        resolutionMethod = 'normalized';
        console.log(`[WorkflowDSLCompiler] ✅ Normalized "${originalType}" → "${normalizedType}"`);
      } else {
        // Step 2: Try NodeTypeResolver
        try {
          const resolution = nodeTypeResolver.resolve(originalType, false);
          if (resolution && resolution.method !== 'not_found' && nodeLibrary.isNodeTypeRegistered(resolution.resolved)) {
            normalizedType = resolution.resolved;
            resolutionMethod = resolution.method;
            console.log(`[WorkflowDSLCompiler] ✅ Resolved "${originalType}" → "${normalizedType}" (method: ${resolution.method})`);
            
            if (resolution.warning) {
              warnings.push(`Node type resolution warning for "${originalType}": ${resolution.warning.message}`);
            }
          }
        } catch (error) {
          // NodeTypeResolver failed, continue to error
          console.warn(`[WorkflowDSLCompiler] ⚠️  NodeTypeResolver failed for "${originalType}": ${error}`);
        }
      }

      // If still not found, this is an error
      if (!normalizedType || !nodeLibrary.isNodeTypeRegistered(normalizedType)) {
        const errorMsg = `Unknown node type "${originalType}" in ${item.category}. Cannot normalize or resolve to a compatible type.`;
        errors.push(errorMsg);
        console.error(`[WorkflowDSLCompiler] ❌ ${errorMsg}`);
        continue;
      }

      // Replace node type in DSL
      const warningMsg = `Node type "${originalType}" in ${item.category} was normalized to "${normalizedType}" (method: ${resolutionMethod})`;
      warnings.push(warningMsg);
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
        errors.push(`CRITICAL: Node type "${type}" still not registered after normalization. This should never happen.`);
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

    return {
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
          _dslId: ds.id, // Store DSL ID in config for reference
        },
      },
    };
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

    return {
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
          _dslId: tf.id, // Store DSL ID in config for reference
        },
      },
    };
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

    return {
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
          _dslId: out.id, // Store DSL ID in config for reference
        },
      },
    };
  }

  /**
   * Build deterministic linear pipeline
   * 
   * Pipeline rules:
   * 1. Exactly one trigger (VALIDATE)
   * 2. All data sources connect from trigger (parallel)
   * 3. All transformations connect from data sources:
   *    - If transformations exist: all data sources → first transformation
   *    - Chain transformations sequentially: T1 → T2 → T3
   * 4. All outputs connect from transformations:
   *    - If transformations exist: last transformation → all outputs (parallel)
   *    - If no transformations: all data sources → all outputs (parallel)
   * 5. Prevent cycles (strict ordering)
   * 6. Prevent multiple triggers (validation)
   * 
   * Execution order: trigger → [dataSources (parallel)] → [transformations (sequential)] → [outputs (parallel)]
   */
  private buildLinearPipeline(
    dsl: WorkflowDSL,
    triggerNode: WorkflowNode,
    dataSourceNodes: WorkflowNode[],
    transformationNodes: WorkflowNode[],
    outputNodes: WorkflowNode[]
  ): { edges: WorkflowEdge[]; errors: string[]; warnings: string[] } {
    const edges: WorkflowEdge[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    console.log('[WorkflowDSLCompiler] Building deterministic linear pipeline...');
    console.log(`[WorkflowDSLCompiler] Pipeline: 1 trigger, ${dataSourceNodes.length} data source(s), ${transformationNodes.length} transformation(s), ${outputNodes.length} output(s)`);

    // VALIDATION: Exactly one trigger (already validated by having single triggerNode)
    // This is implicit - we only have one triggerNode

    // Sort nodes deterministically (by ID) for consistent ordering
    const sortedDataSources = [...dataSourceNodes].sort((a, b) => a.id.localeCompare(b.id));
    const sortedTransformations = [...transformationNodes].sort((a, b) => a.id.localeCompare(b.id));
    const sortedOutputs = [...outputNodes].sort((a, b) => a.id.localeCompare(b.id));

    // STEP 1: Trigger → All Data Sources (parallel)
    console.log('[WorkflowDSLCompiler] Step 1: Connecting trigger to all data sources...');
    for (const dsNode of sortedDataSources) {
      const edge = this.createCompatibleEdge(triggerNode, dsNode, edges);
      if (edge) {
        edges.push(edge);
        console.log(`[WorkflowDSLCompiler] ✅ Connected trigger → ${dsNode.type} (${dsNode.id})`);
      } else {
        errors.push(`Cannot create edge from trigger to data source ${dsNode.type} (${dsNode.id}): No compatible handles`);
      }
    }

    // STEP 2: Data Sources → Transformations
    if (sortedTransformations.length > 0) {
      console.log('[WorkflowDSLCompiler] Step 2: Connecting data sources to transformations...');
      
      // Connect all data sources to first transformation
      const firstTransformation = sortedTransformations[0];
      for (const dsNode of sortedDataSources) {
        const edge = this.createCompatibleEdge(dsNode, firstTransformation, edges);
        if (edge) {
          edges.push(edge);
          console.log(`[WorkflowDSLCompiler] ✅ Connected ${dsNode.type} → ${firstTransformation.type} (first transformation)`);
        } else {
          warnings.push(`Cannot create edge from ${dsNode.type} to ${firstTransformation.type}: No compatible handles`);
        }
      }

      // Chain transformations sequentially: T1 → T2 → T3
      for (let i = 0; i < sortedTransformations.length - 1; i++) {
        const currentTf = sortedTransformations[i];
        const nextTf = sortedTransformations[i + 1];
        const edge = this.createCompatibleEdge(currentTf, nextTf, edges);
        if (edge) {
          edges.push(edge);
          console.log(`[WorkflowDSLCompiler] ✅ Connected ${currentTf.type} → ${nextTf.type} (transformation chain)`);
        } else {
          warnings.push(`Cannot create edge from ${currentTf.type} to ${nextTf.type}: No compatible handles`);
        }
      }

      // STEP 3: Last Transformation → All Outputs (parallel)
      const lastTransformation = sortedTransformations[sortedTransformations.length - 1];
      console.log('[WorkflowDSLCompiler] Step 3: Connecting last transformation to all outputs...');
      for (const outNode of sortedOutputs) {
        const edge = this.createCompatibleEdge(lastTransformation, outNode, edges);
        if (edge) {
          edges.push(edge);
          console.log(`[WorkflowDSLCompiler] ✅ Connected ${lastTransformation.type} → ${outNode.type} (${outNode.id})`);
        } else {
          errors.push(`Cannot create edge from ${lastTransformation.type} to output ${outNode.type} (${outNode.id}): No compatible handles`);
        }
      }
    } else {
      // STEP 3 (Alternative): No transformations - Data Sources → Outputs directly
      console.log('[WorkflowDSLCompiler] Step 3: No transformations - connecting data sources directly to outputs...');
      for (const dsNode of sortedDataSources) {
        for (const outNode of sortedOutputs) {
          const edge = this.createCompatibleEdge(dsNode, outNode, edges);
          if (edge) {
            edges.push(edge);
            console.log(`[WorkflowDSLCompiler] ✅ Connected ${dsNode.type} → ${outNode.type} (direct)`);
          } else {
            warnings.push(`Cannot create edge from ${dsNode.type} to ${outNode.type}: No compatible handles`);
          }
        }
      }
    }

    // STEP 4: Validate pipeline (no cycles, exactly one trigger)
    const validationResult = this.validatePipeline(edges, triggerNode, dataSourceNodes, transformationNodes, outputNodes);
    if (validationResult.errors.length > 0) {
      errors.push(...validationResult.errors);
    }
    if (validationResult.warnings.length > 0) {
      warnings.push(...validationResult.warnings);
    }

    console.log(`[WorkflowDSLCompiler] ✅ Deterministic pipeline built: ${edges.length} edge(s), ${errors.length} error(s), ${warnings.length} warning(s)`);

    return { edges, errors, warnings };
  }

  /**
   * Create a compatible edge between two nodes using schema-driven connection resolver.
   * 
   * Enforces DAG constraint by checking for cycles BEFORE inserting the edge.
   */
  private createCompatibleEdge(
    sourceNode: WorkflowNode,
    targetNode: WorkflowNode,
    existingEdges: WorkflowEdge[]
  ): WorkflowEdge | null {
    // Check if adding source → target would introduce a cycle
    const cycleCheck = this.detectCycleBeforeInsert(sourceNode.id, targetNode.id, existingEdges);
    if (cycleCheck.wouldCreateCycle) {
      console.error(
        `[WorkflowDSLCompiler] ❌ Skipping edge ${sourceNode.id} → ${targetNode.id}: ` +
        `would create cycle${cycleCheck.cyclePath ? ` (${cycleCheck.cyclePath.join(' → ')})` : ''}`
      );
      return null;
    }

    const resolution = resolveCompatibleHandles(sourceNode, targetNode);
    if (!resolution.success || !resolution.sourceHandle || !resolution.targetHandle) {
      return null;
    }

    return {
      id: randomUUID(),
      source: sourceNode.id,
      target: targetNode.id,
      sourceHandle: resolution.sourceHandle,
      targetHandle: resolution.targetHandle,
    };
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
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validation 1: Exactly one trigger (implicit - we only have one triggerNode)
    // This is already guaranteed by the compiler structure

    // Validation 2: No cycles (using DFS)
    const cycleResult = this.detectCycles(edges);
    if (cycleResult.hasCycle) {
      errors.push(`Pipeline contains cycle: ${cycleResult.cyclePath?.join(' → ')}`);
    }

    // Validation 3: All nodes reachable from trigger
    const allNodes = [triggerNode, ...dataSourceNodes, ...transformationNodes, ...outputNodes];
    const reachableNodes = this.getReachableNodes(triggerNode.id, edges, allNodes);
    const unreachableNodes = allNodes.filter(n => n.id !== triggerNode.id && !reachableNodes.has(n.id));
    if (unreachableNodes.length > 0) {
      warnings.push(`Some nodes are not reachable from trigger: ${unreachableNodes.map(n => `${n.type} (${n.id})`).join(', ')}`);
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
      adjacency.get(edge.source)!.push(edge.target);
    });

    // DFS to detect cycles
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const cyclePath: string[] = [];

    const dfs = (nodeId: string, path: string[]): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);
      path.push(nodeId);

      const neighbors = adjacency.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, path)) {
            return true;
          }
        } else if (recStack.has(neighbor)) {
          // Cycle detected
          const cycleStart = path.indexOf(neighbor);
          cyclePath.push(...path.slice(cycleStart), neighbor);
          return true;
        }
      }

      recStack.delete(nodeId);
      path.pop();
      return false;
    };

    for (const nodeId of nodeIds) {
      if (!visited.has(nodeId)) {
        if (dfs(nodeId, [])) {
          return { hasCycle: true, cyclePath };
        }
      }
    }

    return { hasCycle: false };
  }

  /**
   * Detect whether inserting an edge source → target would create a cycle.
   *
   * Rules:
   * - Graph must remain a DAG
   * - We check reachability from target back to source using DFS
   * - If source is reachable from target, then adding source → target would close a cycle
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
      adjacency.get(edge.source)!.push(edge.target);
    }

    // DFS from target to see if we can reach source
    const visited = new Set<string>();
    const stack: string[] = [];
    let foundPath: string[] | undefined;

    const dfs = (current: string): boolean => {
      visited.add(current);
      stack.push(current);

      const neighbors = adjacency.get(current) || [];
      for (const neighbor of neighbors) {
        if (neighbor === sourceId) {
          // Found a path target → … → source
          stack.push(neighbor);
          foundPath = [...stack];
          stack.pop();
          return true;
        }
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            return true;
          }
        }
      }

      stack.pop();
      return false;
    };

    const wouldCreateCycle = dfs(targetId);
    return wouldCreateCycle
      ? { wouldCreateCycle: true, cyclePath: foundPath }
      : { wouldCreateCycle: false };
  }

  /**
   * Get all nodes reachable from a starting node using BFS
   */
  private getReachableNodes(startNodeId: string, edges: WorkflowEdge[], allNodes: WorkflowNode[]): Set<string> {
    const reachable = new Set<string>([startNodeId]);
    const queue = [startNodeId];
    const adjacency = new Map<string, string[]>();

    edges.forEach(edge => {
      if (!adjacency.has(edge.source)) {
        adjacency.set(edge.source, []);
      }
      adjacency.get(edge.source)!.push(edge.target);
    });

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adjacency.get(current) || [];
      for (const neighbor of neighbors) {
        if (!reachable.has(neighbor)) {
          reachable.add(neighbor);
          queue.push(neighbor);
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
    const edges: WorkflowEdge[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // Map step refs to nodes
    const stepRefToNode = new Map<string, WorkflowNode>();
    stepRefToNode.set('trigger', triggerNode);
    dataSourceNodes.forEach(node => {
      const dslId = node.data?.config?._dslId as string | undefined;
      if (dslId) stepRefToNode.set(dslId, node);
    });
    transformationNodes.forEach(node => {
      const dslId = node.data?.config?._dslId as string | undefined;
      if (dslId) stepRefToNode.set(dslId, node);
    });
    outputNodes.forEach(node => {
      const dslId = node.data?.config?._dslId as string | undefined;
      if (dslId) stepRefToNode.set(dslId, node);
    });

    // Create edges based on execution order dependencies
    for (const step of executionOrder) {
      const sourceNode = stepRefToNode.get(step.stepRef);
      if (!sourceNode) {
        errors.push(`Cannot find node for step ref: ${step.stepRef}`);
        continue;
      }

      // Find dependent steps
      const dependentSteps = executionOrder.filter(s => 
        s.dependsOn && s.dependsOn.includes(step.stepId)
      );

      for (const depStep of dependentSteps) {
        const targetNode = stepRefToNode.get(depStep.stepRef);
        if (!targetNode) {
          errors.push(`Cannot find node for dependent step ref: ${depStep.stepRef}`);
          continue;
        }

        // Resolve compatible handles
        const handleResult = resolveCompatibleHandles(sourceNode, targetNode);
        if (!handleResult.success) {
          errors.push(`Cannot resolve handles between ${step.stepRef} and ${depStep.stepRef}: ${handleResult.error}`);
          continue;
        }

        // Create edge
        edges.push({
          id: randomUUID(),
          source: sourceNode.id,
          target: targetNode.id,
          sourceHandle: handleResult.sourceHandle || undefined,
          targetHandle: handleResult.targetHandle || undefined,
        });
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
  ): void {
    for (const tf of transformations) {
      if (!tf.input) continue;

      const tfNode = transformationNodes.find(n => (n.data?.config?._dslId as string) === tf.id);
      if (!tfNode) continue;

      // Find source node
      const sourceNode = dataSourceNodes.find(n => (n.data?.config?._dslId as string) === tf.input!.sourceId);
      if (!sourceNode) continue;

      // Check if edge already exists
      const existingEdge = edges.find(e => 
        e.source === sourceNode.id && e.target === tfNode.id
      );
      if (existingEdge) continue;

      // Resolve handles and create edge
      const handleResult = resolveCompatibleHandles(sourceNode, tfNode);
      if (handleResult.success) {
        edges.push({
          id: randomUUID(),
          source: sourceNode.id,
          target: tfNode.id,
          sourceHandle: handleResult.sourceHandle || undefined,
          targetHandle: handleResult.targetHandle || undefined,
        });
      }
    }
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
  ): void {
    for (const out of outputs) {
      if (!out.input) continue;

      const outNode = outputNodes.find(n => (n.data?.config?._dslId as string) === out.id);
      if (!outNode) continue;

      // Try to find source in transformations first, then data sources
      let sourceNode = transformationNodes.find(n => (n.data?.config?._dslId as string) === out.input!.sourceId);
      if (!sourceNode) {
        sourceNode = dataSourceNodes.find(n => (n.data?.config?._dslId as string) === out.input!.sourceId);
      }
      if (!sourceNode) continue;

      // Check if edge already exists
      const existingEdge = edges.find(e => 
        e.source === sourceNode!.id && e.target === outNode.id
      );
      if (existingEdge) continue;

      // Resolve handles and create edge
      const handleResult = resolveCompatibleHandles(sourceNode, outNode);
      if (handleResult.success) {
        edges.push({
          id: randomUUID(),
          source: sourceNode.id,
          target: outNode.id,
          sourceHandle: handleResult.sourceHandle || undefined,
          targetHandle: handleResult.targetHandle || undefined,
        });
      }
    }
  }
}

// Export singleton instance
export const workflowDSLCompiler = new WorkflowDSLCompiler();
