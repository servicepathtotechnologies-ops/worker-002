/**
 * ✅ FIX 3: Missing Node Injector
 * 
 * Detects and injects missing required nodes during compilation.
 * This ensures nodes are added BEFORE edges are created, preventing structural issues.
 */

import { WorkflowNode, WorkflowEdge, Workflow } from '../../core/types/ai-types';
import { WorkflowDSL, DSLOutput } from './workflow-dsl';
import { nodeLibrary } from '../nodes/node-library';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { unifiedNodeCategorizer } from './unified-node-categorizer';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { randomUUID } from 'crypto';
import { NodeMetadataHelper } from '../../core/types/node-metadata';

export interface MissingNodeDetection {
  missingNodes: Array<{
    type: string;
    category: 'data_source' | 'transformation' | 'output';
    reason: string;
    required: boolean;
  }>;
  warnings: string[];
}

export interface NodeInjectionResult {
  dsl: WorkflowDSL;
  injectedNodes: string[];
  warnings: string[];
}

/**
 * Missing Node Injector
 */
export class MissingNodeInjector {
  /**
   * ✅ FIX 3: Detect missing required nodes in DSL
   */
  detectMissingNodes(dsl: WorkflowDSL): MissingNodeDetection {
    const missingNodes: MissingNodeDetection['missingNodes'] = [];
    const warnings: string[] = [];

    // Check for missing trigger (should never happen, but check anyway)
    if (!dsl.trigger || !dsl.trigger.type) {
      missingNodes.push({
        type: 'manual_trigger',
        category: 'data_source',
        reason: 'DSL missing trigger - required for workflow execution',
        required: true
      });
    }

    // Check for missing terminal output node
    // Workflows should have at least one output node for visibility
    const hasOutput = dsl.outputs.length > 0;
    const hasWriteOperation = dsl.dataSources.some(ds => {
      const operation = (ds.operation || '').toLowerCase();
      return ['write', 'create', 'update', 'append'].includes(operation);
    }) || dsl.transformations.some(tf => {
      const operation = (tf.operation || '').toLowerCase();
      return ['write', 'create', 'update'].includes(operation);
    });

    if (!hasOutput && hasWriteOperation) {
      // Check if log_output is registered
      if (nodeLibrary.isNodeTypeRegistered('log_output')) {
        missingNodes.push({
          type: 'log_output',
          category: 'output',
          reason: 'Workflow has write operations but no output node - log_output required for visibility',
          required: true
        });
      } else {
        warnings.push('log_output node type not registered - cannot auto-inject terminal output');
      }
    }

    // Check for missing transformation when operations suggest transformation
    const hasTransformOperation = dsl.dataSources.some(ds => {
      const operation = (ds.operation || '').toLowerCase();
      return ['transform', 'summarize', 'analyze', 'process'].includes(operation);
    });

    if (hasTransformOperation && dsl.transformations.length === 0) {
      // Try to find appropriate transformation node
      const transformNodeTypes = ['ai_chat_model', 'text_summarizer', 'ollama'];
      for (const nodeType of transformNodeTypes) {
        if (nodeLibrary.isNodeTypeRegistered(nodeType)) {
          missingNodes.push({
            type: nodeType,
            category: 'transformation',
            reason: 'Workflow has transformation operations but no transformation node',
            required: false // Not strictly required, but recommended
          });
          break;
        }
      }
    }

    return {
      missingNodes,
      warnings
    };
  }

  /**
   * ✅ FIX 3: Inject missing nodes into DSL (before compilation)
   */
  injectMissingNodes(dsl: WorkflowDSL, detection: MissingNodeDetection): NodeInjectionResult {
    const injectedNodes: string[] = [];
    const warnings: string[] = [...detection.warnings];
    let updatedDSL: WorkflowDSL = {
      ...dsl,
      dataSources: [...dsl.dataSources],
      transformations: [...dsl.transformations],
      outputs: [...dsl.outputs]
    };

    // Inject missing nodes
    for (const missing of detection.missingNodes) {
      if (!missing.required) {
        // Skip non-required nodes (just warnings)
        warnings.push(`Recommended node "${missing.type}" not found but not required`);
        continue;
      }

      // Verify node type is registered
      if (!nodeLibrary.isNodeTypeRegistered(missing.type)) {
        warnings.push(`Cannot inject missing node "${missing.type}": Node type not registered`);
        continue;
      }

      // Create DSL item based on category
      const stepCounter = 
        updatedDSL.dataSources.length + 
        updatedDSL.transformations.length + 
        updatedDSL.outputs.length;

      if (missing.category === 'output') {
        const outputId = `out_${stepCounter + 1}`;
        const outputItem: DSLOutput = {
          id: outputId,
          type: missing.type,
          operation: missing.type === 'log_output' ? 'write' : 'notify',
          config: this.getDefaultConfig(missing.type),
          description: `Auto-injected ${missing.type} node: ${missing.reason}`,
          origin: {
            source: 'system',
            stage: 'dsl_compilation'
          },
          protected: false
        };
        updatedDSL.outputs.push(outputItem);
        injectedNodes.push(missing.type);
        console.log(`[MissingNodeInjector] ✅ Injected ${missing.type} into outputs (reason: ${missing.reason})`);
      } else if (missing.category === 'transformation') {
        const tfId = `tf_${stepCounter + 1}`;
        updatedDSL.transformations.push({
          id: tfId,
          type: missing.type,
          operation: 'transform',
          config: this.getDefaultConfig(missing.type),
          description: `Auto-injected ${missing.type} node: ${missing.reason}`,
          origin: {
            source: 'system',
            stage: 'dsl_compilation'
          },
          protected: false
        });
        injectedNodes.push(missing.type);
        console.log(`[MissingNodeInjector] ✅ Injected ${missing.type} into transformations (reason: ${missing.reason})`);
      } else if (missing.category === 'data_source') {
        const dsId = `ds_${stepCounter + 1}`;
        updatedDSL.dataSources.push({
          id: dsId,
          type: missing.type,
          operation: 'read',
          config: this.getDefaultConfig(missing.type),
          description: `Auto-injected ${missing.type} node: ${missing.reason}`,
          origin: {
            source: 'system',
            stage: 'dsl_compilation'
          },
          protected: false
        });
        injectedNodes.push(missing.type);
        console.log(`[MissingNodeInjector] ✅ Injected ${missing.type} into dataSources (reason: ${missing.reason})`);
      }
    }

    return {
      dsl: updatedDSL,
      injectedNodes,
      warnings
    };
  }

  /**
   * ✅ FIX 3: Get default config for injected node
   */
  private getDefaultConfig(nodeType: string): Record<string, any> {
    const schema = nodeLibrary.getSchema(nodeType);
    const config: Record<string, any> = {
      _autoInjected: true,
      _injectedAt: 'dsl_compilation'
    };

    // ✅ PHASE 1 FIX: Use registry to get default config instead of hardcoded checks
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    if (nodeDef) {
      // Use registry default config
      const registryDefaults = nodeDef.defaultConfig();
      Object.assign(config, registryDefaults);
    } else {
      // Fallback for nodes not in registry (shouldn't happen, but safe)
      if (nodeType === 'log_output') {
        config.message = '{{$json}}';
        config.level = 'info';
      } else if (nodeType === 'manual_trigger') {
        // No config needed for manual trigger
      } else if (nodeType === 'ai_chat_model' || nodeType === 'ollama') {
        config.model = 'default';
        config.prompt = '{{$json}}';
      }
    }

    // Merge with schema defaults if available
    if (schema?.configSchema?.optional) {
      for (const [fieldName, fieldDef] of Object.entries(schema.configSchema.optional)) {
        if (fieldDef.default !== undefined) {
          config[fieldName] = fieldDef.default;
        }
      }
    }

    return config;
  }

  /**
   * ✅ FIX 3: Inject missing nodes into compiled workflow (if needed)
   * This is a fallback if nodes weren't injected during DSL generation
   */
  injectIntoWorkflow(
    workflow: Workflow,
    missingNodeTypes: string[]
  ): { workflow: Workflow; injected: number; warnings: string[] } {
    const warnings: string[] = [];
    const newNodes: WorkflowNode[] = [...workflow.nodes];
    const newEdges: WorkflowEdge[] = [...workflow.edges];
    let injected = 0;

    for (const nodeType of missingNodeTypes) {
      // Check if node already exists
      const exists = workflow.nodes.some(n => {
        const nType = unifiedNormalizeNodeType(n);
        return nType === nodeType;
      });

      if (exists) {
        continue; // Already exists
      }

      // Verify node type is registered
      if (!nodeLibrary.isNodeTypeRegistered(nodeType)) {
        warnings.push(`Cannot inject "${nodeType}": Node type not registered`);
        continue;
      }

      // Get category
      const categorization = unifiedNodeCategorizer.categorize(nodeType);
      const category = categorization.category;

      // Create node
      const schema = nodeLibrary.getSchema(nodeType);
      const nodeId = randomUUID();
      const newNode: WorkflowNode = {
        id: nodeId,
        type: nodeType,
        position: {
          x: 700 + (injected * 200),
          y: 100
        },
        data: {
          type: nodeType,
          label: schema?.label || nodeType.replace(/_/g, ' '),
          category: category === 'dataSource' ? 'data_source' : category,
          config: {
            ...this.getDefaultConfig(nodeType),
            _autoInjected: true,
            _injectedAt: 'workflow_compilation'
          }
        }
      };

      // Set metadata
      NodeMetadataHelper.setMetadata(newNode, {
        origin: {
          source: 'system',
          approach: 'auto_injected',
          stage: 'dsl_compilation'
        },
        dsl: {
          dslId: `injected_${nodeId}`,
          category: category === 'dataSource' ? 'data_source' : category,
          operation: nodeType === 'log_output' ? 'write' : 'read'
        },
        injection: {
          autoInjected: true,
          reason: `Auto-injected ${nodeType} node during compilation`,
          priority: 1
        },
        protected: false
      });

      newNodes.push(newNode);
      injected++;

      // Try to connect to last node in workflow
      if (newNodes.length > 1) {
        const lastNode = newNodes[newNodes.length - 2]; // Node before the one we just added
        if (lastNode.id !== nodeId) {
          // Use enhanced edge creation service
          const { enhancedEdgeCreationService } = require('./enhanced-edge-creation-service');
          const edgeResult = enhancedEdgeCreationService.createEdgeWithFallback(
            lastNode,
            newNode,
            undefined,
            undefined,
            newEdges,
            newNodes
          );

          if (edgeResult.success && edgeResult.edge) {
            newEdges.push(edgeResult.edge);
            console.log(`[MissingNodeInjector] ✅ Connected injected node "${nodeType}" to workflow`);
          } else {
            warnings.push(`Could not connect injected node "${nodeType}": ${edgeResult.error}`);
          }
        }
      }
    }

    return {
      workflow: {
        nodes: newNodes,
        edges: newEdges
      },
      injected,
      warnings
    };
  }
}

// Export singleton instance
export const missingNodeInjector = new MissingNodeInjector();
