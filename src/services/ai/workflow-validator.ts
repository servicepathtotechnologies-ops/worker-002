// Workflow Validator Service
// Step 6: Validate and Auto-Fix Workflows
// Implements all validation rules from the comprehensive guide

import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { normalizeWorkflowGraph } from '../../core/utils/workflow-graph-normalizer';
import { isTransformationNode } from './transformation-templates';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { randomUUID } from 'crypto';
import { nodeDefinitionRegistry } from '../../core/types/node-definition';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  fixedWorkflow?: Workflow;
  fixesApplied: Fix[];
}

export interface ValidationError {
  type: ErrorType;
  severity: 'critical' | 'high' | 'medium';
  message: string;
  nodeId?: string;
  edgeId?: string;
  fixable: boolean;
  suggestedFix?: string;
}

export interface ValidationWarning {
  type: WarningType;
  message: string;
  nodeId?: string;
  suggestion?: string;
}

export interface Fix {
  type: FixType;
  description: string;
  nodeId?: string;
  edgeId?: string;
  changes: any;
}

export type ErrorType =
  | 'missing_trigger'
  | 'multiple_triggers'
  | 'orphaned_node'
  | 'circular_dependency'
  | 'type_mismatch'
  | 'missing_required_field'
  | 'missing_credentials'
  | 'invalid_url'
  | 'invalid_expression'
  | 'invalid_configuration';

export type WarningType =
  | 'missing_error_handling'
  | 'missing_rate_limiting'
  | 'missing_data_validation'
  | 'missing_logging'
  | 'inefficient_structure'
  | 'potential_performance_issue';

export type FixType =
  | 'add_connection'
  | 'fix_type_mismatch'
  | 'add_error_handler'
  | 'fix_configuration'
  | 'add_missing_field'
  | 'remove_duplicate'
  | 'reorder_nodes';

/**
 * WorkflowValidator - Step 6: Validation & Auto-Fix
 * 
 * Validates workflows against all rules:
 * 1. Exactly one trigger node
 * 2. No orphaned nodes
 * 3. No circular dependencies
 * 4. Type compatibility on edges
 * 5. Required fields configured
 * 6. Credentials exist for authenticated nodes
 * 7. Valid URLs and expressions
 * 
 * Auto-fixes common issues automatically.
 */
export class WorkflowValidator {
  private maxFixIterations = 3;

  /**
   * Validate workflow and attempt auto-fix
   * 
   * @param workflow - Workflow to validate
   * @param depth - Recursion depth for auto-fix
   * @param originalPrompt - Optional: Original user prompt for transformation/AI validation
   * @param userPrompt - Optional: User prompt for required services validation
   */
  async validateAndFix(
    workflow: Workflow, 
    depth: number = 0,
    originalPrompt?: string,
    userPrompt?: string
  ): Promise<ValidationResult> {
    // ✅ PHASE 2: Validate input contract at stage boundary
    const { validateWorkflow } = require('../../core/contracts/pipeline-stage-contracts');
    const workflowValidation = validateWorkflow(workflow);
    if (!workflowValidation.valid) {
      return {
        valid: false,
        errors: workflowValidation.errors.map((err: string) => ({
          type: 'invalid_configuration' as ErrorType,
          severity: 'critical' as const,
          message: err,
          fixable: false,
        })),
        warnings: workflowValidation.warnings.map((warn: string) => ({
          type: 'missing_logging' as WarningType,
          message: warn,
        })),
        fixesApplied: [],
      };
    }
    // Prevent infinite recursion
    if (depth >= this.maxFixIterations) {
      console.warn(`⚠️  Max fix iterations (${this.maxFixIterations}) reached. Stopping validation to prevent infinite loop.`);
      const result: ValidationResult = {
        valid: false,
        errors: [{
          type: 'invalid_configuration',
          message: `Validation stopped after ${this.maxFixIterations} fix iterations to prevent infinite loop`,
          severity: 'high',
          fixable: false,
        }],
        warnings: [],
        fixesApplied: [],
      };
      return result;
    }

    // Normalize workflow graph once per validation run to remove duplicate triggers,
    // invalid edges, and enforce a canonical structure.
    const normalized = normalizeWorkflowGraph({
      nodes: workflow.nodes,
      edges: workflow.edges,
    });
    const normalizedWorkflow: Workflow = {
      nodes: normalized.nodes as WorkflowNode[],
      edges: normalized.edges as WorkflowEdge[],
      metadata: normalized.metadata,
    };

    // Only log first iteration to reduce console spam
    if (depth === 0) {
      console.log(`🔍 Validating workflow with ${normalizedWorkflow.nodes.length} nodes...`);
    }

    const result: ValidationResult = {
      valid: false,
      errors: [],
      warnings: [],
      fixesApplied: [],
    };

    // Run all validations against the normalized workflow graph
    this.validateStructure(normalizedWorkflow, result);
    this.validateConfiguration(normalizedWorkflow, result);
    this.validateBusinessLogic(normalizedWorkflow, result);
    
    // ✅ ENHANCED: Additional validations from consolidated validators
    this.validateExecutionOrder(normalizedWorkflow, result);
    this.validateDataFlow(normalizedWorkflow, result);
    this.validateTypeCompatibilityEnhanced(normalizedWorkflow, result);
    
    // ✅ 100% COMPLETE: Transformation and AI validation (if prompt provided)
    if (originalPrompt) {
      this.validateTransformations(normalizedWorkflow, originalPrompt, result);
    }
    
    // ✅ 100% COMPLETE: AI usage and required services validation (if prompt provided)
    if (userPrompt) {
      this.validateAIUsage(normalizedWorkflow, userPrompt, result);
      this.validateRequiredServices(normalizedWorkflow, userPrompt, result);
    }
    
    // ✅ REQUIRED: AI Intent Matching Validation (Core for prompt-to-workflow systems)
    // This is REQUIRED because our project is primarily AI-driven prompt-to-workflow conversion
    if (userPrompt || originalPrompt) {
      await this.validateAIIntentMatching(normalizedWorkflow, userPrompt || originalPrompt || '', result);
    }

    // ✅ PHASE 4: PROACTIVE PREVENTION - Fail-fast instead of reactive fixing
    // All errors should have been prevented at DSL compilation stage via proactive-error-prevention.ts
    // If errors reach here, they are structural issues that cannot be auto-fixed
    // Return validation result immediately without attempting fixes
    
    // ✅ PHASE 4: PROACTIVE PREVENTION - Fail-fast instead of reactive fixing
    // All errors should have been prevented at DSL compilation stage
    // If errors reach here, return immediately without attempting fixes
    
    // Determine if workflow is valid (fail-fast on any errors)
    result.valid = result.errors.length === 0;

    return result;
  }

  /**
   * Validate workflow structure
   */
  private validateStructure(workflow: Workflow, result: ValidationResult): void {
    // Rule 1: Exactly one trigger node
    const triggerNodes = workflow.nodes.filter(n => 
      this.isTriggerNode(this.getCanonicalNodeType(n))
    );

    if (triggerNodes.length === 0) {
      result.errors.push({
        type: 'missing_trigger',
        severity: 'critical',
        message: 'Workflow must have exactly one trigger node',
        fixable: true,
        suggestedFix: 'Add a schedule, webhook, or manual trigger node',
      });
    } else if (triggerNodes.length > 1) {
      result.errors.push({
        type: 'multiple_triggers',
        severity: 'critical',
        message: `Workflow has ${triggerNodes.length} trigger nodes, but should have exactly one`,
        fixable: true,
        suggestedFix: 'Remove extra trigger nodes, keeping only one',
      });
    }

    // Rule 2: No orphaned nodes (all nodes must be connected)
    // ✅ FIX 1: DSL-AWARE VALIDATION - Check reachability following DSL execution order, not direct connections
    const connectedNodeIds = new Set<string>();
    
    // Start from trigger nodes
    triggerNodes.forEach(trigger => {
      connectedNodeIds.add(trigger.id);
      this.traverseConnections(trigger.id, workflow.edges, connectedNodeIds);
    });

    // ✅ FIX 1: DSL-AWARE VALIDATION - Validate against DSL intent, not blind connection rules
    // Check if nodes are reachable following DSL execution order (allowing intermediate nodes)
    workflow.nodes.forEach(node => {
      if (!connectedNodeIds.has(node.id) && !this.isTriggerNode(this.getCanonicalNodeType(node))) {
        // ✅ Check if node has DSL metadata - if so, validate against DSL execution order
        const { NodeMetadataHelper } = require('../../core/types/node-metadata');
        const metadata = NodeMetadataHelper.getMetadata(node);
        
        if (metadata?.dsl?.dslId) {
          // Node came from DSL - check if it's reachable following DSL execution order
          // This allows intermediate nodes (limit, if_else) between data source and transformation
          const isReachableViaDSL = this.isNodeReachableViaDSLOrder(node, workflow, connectedNodeIds);
          
          if (!isReachableViaDSL) {
            result.errors.push({
              type: 'orphaned_node',
              severity: 'high',
              message: `Node "${node.data?.label || node.id}" (from DSL) is not reachable following DSL execution order`,
              nodeId: node.id,
              fixable: true,
              suggestedFix: 'Connect this node following DSL execution order (allowing intermediate safety nodes)',
            });
          }
          // If reachable via DSL order, don't report as orphaned (even if not directly connected)
        } else {
          // Node not from DSL - use standard validation
          result.errors.push({
            type: 'orphaned_node',
            severity: 'high',
            message: `Node "${node.data?.label || node.id}" is not connected to the workflow`,
            nodeId: node.id,
            fixable: true,
            suggestedFix: 'Connect this node to the workflow graph',
          });
        }
      }
    });

    // Rule 3: No circular dependencies
    const cycles = this.detectCycles(workflow);
    if (cycles.length > 0) {
      cycles.forEach(cycle => {
        result.errors.push({
          type: 'circular_dependency',
          severity: 'critical',
          message: `Circular dependency detected: ${cycle.join(' → ')}`,
          fixable: false,
        });
      });
    }

    // Rule 4: Type compatibility on edges
    this.validateTypeCompatibility(workflow, result);
  }

  /**
   * Validate node configurations
   */
  private validateConfiguration(workflow: Workflow, result: ValidationResult): void {
    workflow.nodes.forEach((node, index) => {
      // Check required fields
      const canonicalType = this.getCanonicalNodeType(node);
      const requiredFields = this.getRequiredFields(canonicalType);
      requiredFields.forEach(field => {
        if (!this.hasField(node, field)) {
          result.errors.push({
            type: 'missing_required_field',
            severity: 'high',
            message: `Node "${node.data?.label || node.id}" is missing required field: ${field}`,
            nodeId: node.id,
            fixable: true,
            suggestedFix: `Add ${field} configuration`,
          });
        }
      });

      // Special validation for transformation nodes
      if (this.isTransformationNode(canonicalType)) {
        const nodeIssues = this.validateNodeProperties(node, workflow, index);
        result.errors.push(...nodeIssues);
      }

      // Validate URLs
      const urls = this.extractUrls(node);
      urls.forEach(url => {
        if (!this.isValidUrl(url)) {
          result.errors.push({
            type: 'invalid_url',
            severity: 'high',
            message: `Node "${node.data?.label || node.id}" has invalid URL: ${url}`,
            nodeId: node.id,
            fixable: false,
          });
        }
      });

      // Validate expressions
      const expressions = this.extractExpressions(node);
      expressions.forEach(expr => {
        if (!this.isValidExpression(expr)) {
          result.errors.push({
            type: 'invalid_expression',
            severity: 'medium',
            message: `Node "${node.data?.label || node.id}" has invalid expression: ${expr}`,
            nodeId: node.id,
            fixable: false,
          });
        }
      });

      // Check credentials for authenticated nodes
      if (this.requiresCredentials(node.type)) {
        if (!this.hasCredentials(node)) {
          result.errors.push({
            type: 'missing_credentials',
            severity: 'high',
            message: `Node "${node.data?.label || node.id}" requires credentials but none are configured`,
            nodeId: node.id,
            fixable: false, // Can't auto-fix credentials
            suggestedFix: 'Configure credentials for this node',
          });
        }
      }
    });
  }

  /**
   * Validate transformation node properties
   */
  private validateNodeProperties(
    node: WorkflowNode,
    workflow: Workflow,
    index: number
  ): ValidationError[] {
    const issues: ValidationError[] = [];

    // Check transformation nodes specifically
    if (this.isTransformationNode(node.type)) {
      const config = node.data?.config || {};

      // Check for input fields
      if (!config.inputFields || (Array.isArray(config.inputFields) && config.inputFields.length === 0)) {
        issues.push({
          type: 'missing_required_field',
          nodeId: node.id,
          severity: 'high',
          message: 'Transformation node missing input fields configuration',
          fixable: true,
          suggestedFix: 'Add inputFields configuration based on previous node output',
        });
      }

      // Check for output fields
      if (!config.outputFields || (Array.isArray(config.outputFields) && config.outputFields.length === 0)) {
        issues.push({
          type: 'missing_required_field',
          nodeId: node.id,
          severity: 'high',
          message: 'Transformation node missing output fields configuration',
          fixable: true,
          suggestedFix: 'Add outputFields configuration',
        });
      }

      // Check for mapping rules if transformation type requires it
      if (config.transformationType === 'map' && (!config.mappingRules || (Array.isArray(config.mappingRules) && config.mappingRules.length === 0))) {
        issues.push({
          type: 'missing_required_field',
          nodeId: node.id,
          severity: 'medium',
          message: 'Transformation node missing mapping rules',
          fixable: true,
          suggestedFix: 'Add mappingRules configuration',
        });
      }

      // Check for error handling
      if (!config.errorHandling) {
        issues.push({
          type: 'missing_required_field',
          nodeId: node.id,
          severity: 'medium',
          message: 'Transformation node missing error handling configuration',
          fixable: true,
          suggestedFix: 'Add errorHandling configuration with defaults',
        });
      }
    }

    return issues;
  }

  /**
   * Check if node is a transformation node
   */
  private isTransformationNode(nodeType: string): boolean {
    return isTransformationNode(nodeType);
  }

  /**
   * ❌ PHASE 4: DEPRECATED - Reactive fixing removed
   * This method is no longer used - errors should be prevented at source
   * Kept for backward compatibility only
   * @deprecated Use proactive-error-prevention.ts instead
   */
  private fixTransformationNodes(
    workflow: Workflow,
    issues: ValidationError[]
  ): Workflow {
    const fixed = JSON.parse(JSON.stringify(workflow));
    const transformationIssues = issues.filter(
      issue => issue.nodeId && this.isTransformationNode(
        fixed.nodes.find((n: WorkflowNode) => n.id === issue.nodeId)?.type || ''
      )
    );

    fixed.nodes = fixed.nodes.map((node: WorkflowNode, index: number) => {
      if (this.isTransformationNode(node.type)) {
        return this.fixTransformationNode(node, fixed.nodes, index);
      }
      return node;
    });

    return fixed;
  }

  /**
   * Fix a single transformation node
   */
  private fixTransformationNode(
    node: WorkflowNode,
    allNodes: WorkflowNode[],
    index: number
  ): WorkflowNode {
    const fixed = JSON.parse(JSON.stringify(node));
    const config = fixed.data?.config || {};
    const previousNode = index > 0 ? allNodes[index - 1] : null;

    // Fix input fields
    if (!config.inputFields || (Array.isArray(config.inputFields) && config.inputFields.length === 0)) {
      if (previousNode?.data?.config?.outputFields) {
        const outputFields = previousNode.data.config.outputFields;
        config.inputFields = Array.isArray(outputFields) ? outputFields : [outputFields];
      } else {
        config.inputFields = ['data', 'output', 'result'];
      }
    }

    // Fix output fields
    if (!config.outputFields || (Array.isArray(config.outputFields) && config.outputFields.length === 0)) {
      if (config.inputFields && Array.isArray(config.inputFields)) {
        config.outputFields = config.inputFields.map((field: string) => `transformed_${field}`);
      } else {
        config.outputFields = ['transformed_data', 'output'];
      }
    }

    // Fix mapping rules
    if (!config.mappingRules || (Array.isArray(config.mappingRules) && config.mappingRules.length === 0)) {
      const inputFields = config.inputFields || ['data'];
      const outputFields = config.outputFields || ['transformed_data'];
      config.mappingRules = inputFields.map((inputField: string, i: number) => ({
        source: `{{input.${inputField}}}`,
        target: outputFields[i] || `transformed_${inputField}`,
        transformation: 'direct',
      }));
    }

    // Fix error handling
    if (!config.errorHandling) {
      config.errorHandling = {
        onError: 'continue',
        fallbackValue: null,
        logErrors: true,
      };
    }

    // Fix transformation type
    if (!config.transformationType) {
      config.transformationType = 'map';
    }

    // Fix preserve structure
    if (config.preserveStructure === undefined) {
      config.preserveStructure = true;
    }

    fixed.data = {
      ...fixed.data,
      config,
    };

    return fixed;
  }

  /**
   * Validate business logic rules
   */
  private validateBusinessLogic(workflow: Workflow, result: ValidationResult): void {
    // Check for error handling on external API calls
    const apiNodes = workflow.nodes.filter(n => 
      n.type === 'http_request' || n.type === 'http_post'
    );

    if (apiNodes.length > 0) {
      const hasErrorHandling = workflow.nodes.some(n => 
        n.type === 'error_handler' || n.type === 'error_trigger'
      );

      if (!hasErrorHandling) {
        result.warnings.push({
          type: 'missing_error_handling',
          message: 'Workflow has external API calls but no error handling',
          suggestion: 'Consider adding an error handler node',
        });
      }
    }

    // Check for rate limiting on frequent API calls
    const scheduleNodes = workflow.nodes.filter(n => n.type === 'schedule' || n.type === 'interval');
    if (scheduleNodes.length > 0 && apiNodes.length > 0) {
      const hasWaitNode = workflow.nodes.some(n => n.type === 'wait');
      if (!hasWaitNode) {
        result.warnings.push({
          type: 'missing_rate_limiting',
          message: 'Workflow has scheduled API calls but no rate limiting',
          suggestion: 'Consider adding a wait node between API calls',
        });
      }
    }

    // Check for data validation on user input
    const hasUserInput = workflow.nodes.some(n => 
      n.type === 'form' || n.type === 'webhook' || n.type === 'manual_trigger'
    );
    if (hasUserInput) {
      const hasValidation = workflow.nodes.some(n => 
        n.type === 'if_else' || n.type === 'javascript' || n.type === 'filter'
      );
      if (!hasValidation) {
        result.warnings.push({
          type: 'missing_data_validation',
          message: 'Workflow processes user input but has no validation',
          suggestion: 'Consider adding validation logic',
        });
      }
    }

    // Check for logging
    const hasLogging = workflow.nodes.some(n => 
      n.type === 'log_output' || n.type === 'database_write'
    );
    if (!hasLogging && workflow.nodes.length > 3) {
      result.warnings.push({
        type: 'missing_logging',
        message: 'Workflow has no logging for audit purposes',
        suggestion: 'Consider adding logging for production workflows',
      });
    }
  }

  /**
   * ❌ PHASE 4: DEPRECATED - Reactive fixing removed
   * This method is no longer used - errors should be prevented at source
   * Kept for backward compatibility only
   * @deprecated Use proactive-error-prevention.ts instead
   */
  private async attemptAutoFix(
    workflow: Workflow,
    result: ValidationResult
  ): Promise<Workflow | null> {
    let fixedWorkflow = JSON.parse(JSON.stringify(workflow)); // Deep clone
    let iteration = 0;

    while (iteration < this.maxFixIterations) {
      const fixableErrors = result.errors.filter(e => e.fixable);
      if (fixableErrors.length === 0) break;

      let fixesApplied = false;

      for (const error of fixableErrors) {
        const fix = this.generateFix(error, fixedWorkflow);
        if (fix) {
          fixedWorkflow = this.applyFix(fixedWorkflow, fix);
          result.fixesApplied.push(fix);
          fixesApplied = true;
        }
      }

      if (!fixesApplied) break;
      iteration++;
    }

    return fixedWorkflow;
  }

  /**
   * Generate fix for an error
   */
  private generateFix(error: ValidationError, workflow: Workflow): Fix | null {
    switch (error.type) {
      case 'missing_trigger':
        return {
          type: 'add_missing_field',
          description: 'Add manual trigger node',
          changes: {
            node: {
              id: `trigger_${randomUUID()}`,
              type: 'custom',
              data: {
                label: 'Manual Trigger',
                type: 'manual_trigger',
                category: 'triggers',
                config: {},
              },
            },
          },
        };

      case 'orphaned_node':
        if (error.nodeId) {
          // Connect orphaned node to trigger or last node
          const triggerNodes = workflow.nodes.filter(n => this.isTriggerNode(this.getCanonicalNodeType(n)));
          if (triggerNodes.length > 0) {
            return {
              type: 'add_connection',
              description: `Connect orphaned node ${error.nodeId} to workflow`,
              nodeId: error.nodeId,
              changes: {
                edge: {
                  id: `edge_${randomUUID()}`,
                  source: triggerNodes[0].id,
                  target: error.nodeId,
                },
              },
            };
          }
        }
        break;

      case 'missing_required_field':
        if (error.nodeId && error.suggestedFix) {
          const node = workflow.nodes.find(n => n.id === error.nodeId);
          if (node) {
            const fieldName = error.suggestedFix.match(/Add (\w+)/)?.[1];
            if (fieldName) {
              return {
                type: 'fix_configuration',
                description: `Add missing field ${fieldName} to node`,
                nodeId: error.nodeId,
                changes: {
                  field: fieldName,
                  defaultValue: this.getDefaultValueForField(node.type, fieldName),
                },
              };
            }
          }
        }
        break;

      case 'multiple_triggers':
        // Keep first trigger, remove others
        const triggerNodes = workflow.nodes.filter(n => this.isTriggerNode(this.getCanonicalNodeType(n)));
        if (triggerNodes.length > 1) {
          return {
            type: 'remove_duplicate',
            description: 'Remove extra trigger nodes',
            changes: {
              nodesToRemove: triggerNodes.slice(1).map(n => n.id),
            },
          };
        }
        break;
    }

    return null;
  }

  /**
   * Canonical node type for validation in this repo.
   * IMPORTANT: ReactFlow nodes use `node.type` for renderer (often "custom"),
   * while the actual node kind is stored in `node.data.type`.
   */
  private getCanonicalNodeType(node: WorkflowNode): string {
    try {
      return unifiedNormalizeNodeType(node as any);
    } catch {
      const t = (node as any)?.data?.type || (node as any)?.type || 'unknown';
      return String(t).toLowerCase();
    }
  }

  /**
   * ❌ PHASE 4: DEPRECATED - Reactive fixing removed
   * This method is no longer used - errors should be prevented at source
   * Kept for backward compatibility only
   * @deprecated Use proactive-error-prevention.ts instead
   */
  private applyFix(workflow: Workflow, fix: Fix): Workflow {
    const fixed = JSON.parse(JSON.stringify(workflow));

    switch (fix.type) {
      case 'add_missing_field':
        if (fix.changes.node) {
          fixed.nodes.push(fix.changes.node);
        }
        break;

      case 'add_connection':
        if (fix.changes.edge) {
          fixed.edges.push(fix.changes.edge);
        }
        break;

      case 'fix_configuration':
        if (fix.nodeId && fix.changes.field) {
          const node = fixed.nodes.find((n: WorkflowNode) => n.id === fix.nodeId);
          if (node) {
            if (!node.data.config) {
              node.data.config = {};
            }
            node.data.config[fix.changes.field] = fix.changes.defaultValue;
          }
        }
        break;

      case 'remove_duplicate':
        if (fix.changes.nodesToRemove) {
          fixed.nodes = fixed.nodes.filter((n: WorkflowNode) => !fix.changes.nodesToRemove.includes(n.id));
          fixed.edges = fixed.edges.filter((e: WorkflowEdge) => 
            !fix.changes.nodesToRemove.includes(e.source) &&
            !fix.changes.nodesToRemove.includes(e.target)
          );
        }
        break;
    }

    return fixed;
  }

  // Helper methods

  private isTriggerNode(type: string): boolean {
    return [
      'schedule',
      'webhook',
      'manual_trigger',
      'interval',
      'form',
      'chat_trigger',
      'workflow_trigger',
    ].includes(type);
  }

  private traverseConnections(
    nodeId: string,
    edges: WorkflowEdge[],
    visited: Set<string>
  ): void {
    edges
      .filter(e => e.source === nodeId)
      .forEach(edge => {
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          this.traverseConnections(edge.target, edges, visited);
        }
      });
  }

  /**
   * ✅ FIX 1: DSL-AWARE VALIDATION - Check if node is reachable following DSL execution order
   * This allows intermediate nodes (limit, if_else) between data source and transformation
   * 
   * @param node - Node to check
   * @param workflow - Workflow graph
   * @param connectedNodeIds - Set of already connected node IDs
   * @returns true if node is reachable following DSL execution order
   */
  private isNodeReachableViaDSLOrder(
    node: WorkflowNode,
    workflow: Workflow,
    connectedNodeIds: Set<string>
  ): boolean {
    const { NodeMetadataHelper } = require('../../core/types/node-metadata');
    const metadata = NodeMetadataHelper.getMetadata(node);
    
    if (!metadata?.dsl?.dslId) {
      // Not a DSL node - use standard reachability check
      return connectedNodeIds.has(node.id);
    }

    // Check if there's a path from any connected node to this node
    // This allows intermediate nodes (limit, if_else) between data source and transformation
    const targetNodeId = node.id;
    const visited = new Set<string>();
    
    // Start from all connected nodes (trigger and its descendants)
    const queue = Array.from(connectedNodeIds);
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      
      if (currentId === targetNodeId) {
        return true; // Found path to target node
      }
      
      // Follow edges from current node
      workflow.edges
        .filter(e => e.source === currentId)
        .forEach(e => {
          if (!visited.has(e.target)) {
            queue.push(e.target);
          }
        });
    }
    
    return false; // No path found
  }

  private detectCycles(workflow: Workflow): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (nodeId: string, path: string[]): void => {
      if (recStack.has(nodeId)) {
        // Cycle detected
        const cycleStart = path.indexOf(nodeId);
        cycles.push([...path.slice(cycleStart), nodeId]);
        return;
      }

      if (visited.has(nodeId)) return;

      visited.add(nodeId);
      recStack.add(nodeId);

      workflow.edges
        .filter(e => e.source === nodeId)
        .forEach(edge => {
          dfs(edge.target, [...path, nodeId]);
        });

      recStack.delete(nodeId);
    };

    workflow.nodes.forEach(node => {
      if (!visited.has(node.id)) {
        dfs(node.id, []);
      }
    });

    return cycles;
  }

  /**
   * Legacy method - delegates to enhanced version
   */
  private validateTypeCompatibility(workflow: Workflow, result: ValidationResult): void {
    this.validateTypeCompatibilityEnhanced(workflow, result);
  }

  private getRequiredFields(nodeType: string): string[] {
    const def = nodeDefinitionRegistry.get(nodeType);
    return def?.requiredInputs || [];
  }

  /**
   * ✅ PERMANENT FIX: Improved field detection to prevent false positives
   * 
   * Checks for fields in multiple locations and formats:
   * 1. Direct config field: config.field
   * 2. Nested paths: config.nested.field
   * 3. Alternative field names (aliases)
   * 4. Schema defaults (if field has default, it's considered present)
   * 5. Different config locations (node.data.config vs node.config)
   */
  private hasField(node: WorkflowNode, field: string): boolean {
    // Check multiple config locations
    const configs = [
      node.data?.config || {},
      (node as any).config || {}, // Some nodes might have config at root level
      node.data || {},
      node as any
    ];

    // Check direct field access
    for (const config of configs) {
      if (field in config && config[field] !== null && config[field] !== undefined && config[field] !== '') {
        return true;
      }
    }

    // Check nested paths (e.g., "nested.field")
    if (field.includes('.')) {
      const parts = field.split('.');
      for (const config of configs) {
        let value = config;
        for (const part of parts) {
          if (value && typeof value === 'object' && part in value) {
            value = value[part];
          } else {
            value = undefined;
            break;
          }
        }
        if (value !== null && value !== undefined && value !== '') {
          return true;
        }
      }
    }

    // Check alternative field names (common aliases)
    const fieldAliases = this.getFieldAliases(field);
    for (const alias of fieldAliases) {
      for (const config of configs) {
        if (alias in config && config[alias] !== null && config[alias] !== undefined && config[alias] !== '') {
          return true;
        }
      }
    }

    // Check if field has default value in schema (if it has default, it's considered present)
    const canonicalType = this.getCanonicalNodeType(node);
    if (this.hasDefaultValue(canonicalType, field)) {
      return true; // Field has default, so it's effectively present
    }

    return false;
  }

  /**
   * Get alternative field names (aliases) for a field
   * Helps detect fields that might be named differently
   */
  private getFieldAliases(field: string): string[] {
    const aliasMap: Record<string, string[]> = {
      'prompt': ['message', 'input', 'text', 'query'],
      'subject': ['title', 'header'],
      'body': ['content', 'message', 'text'],
      'recipient': ['to', 'recipientEmails', 'recipients'],
      'url': ['endpoint', 'webhookUrl', 'apiUrl', 'link'],
      'spreadsheetId': ['sheetId', 'spreadsheet_id', 'sheet_id'],
      'sheetName': ['sheet_name', 'worksheet', 'tab'],
    };

    return aliasMap[field] || [];
  }

  /**
   * Check if a field has a default value in the node schema
   * If it has a default, the field is effectively present
   */
  private hasDefaultValue(nodeType: string, field: string): boolean {
    try {
      const def = nodeDefinitionRegistry.get(nodeType);
      if (!def) return false;

      // Check if field has default in schema
      // NodeDefinition uses inputSchema, which is a Record<string, NodeInputField>
      const inputSchema = def.inputSchema;
      if (inputSchema && field in inputSchema) {
        const fieldDef = inputSchema[field];
        if (fieldDef?.default !== undefined) {
          return true; // Field has default value, so it's effectively present
        }
      }

      // Check required inputs (if it's required but has no default, it's not present)
      // But if it's in optional with default, it's present
      return false;
    } catch (error) {
      // If we can't check schema, assume no default (conservative)
      return false;
    }
  }

  private extractUrls(node: WorkflowNode): string[] {
    const urls: string[] = [];
    const config = node.data?.config || {};

    // Check common URL fields
    ['url', 'endpoint', 'webhookUrl', 'apiUrl'].forEach(field => {
      if (config[field] && typeof config[field] === 'string') {
        urls.push(config[field]);
      }
    });

    return urls;
  }

  private extractExpressions(node: WorkflowNode): string[] {
    const expressions: string[] = [];
    const config = node.data?.config || {};

    // Look for expression patterns {{...}}
    const configStr = JSON.stringify(config);
    const matches = configStr.match(/\{\{[^}]+\}\}/g);
    if (matches) {
      expressions.push(...matches);
    }

    return expressions;
  }

  private isValidUrl(url: string): boolean {
    try {
      // Allow expressions
      if (url.includes('{{') && url.includes('}}')) {
        return true; // Expression-based URLs are valid
      }
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private isValidExpression(expr: string): boolean {
    // Basic validation - check for balanced braces
    const open = (expr.match(/\{\{/g) || []).length;
    const close = (expr.match(/\}\}/g) || []).length;
    return open === close && open > 0;
  }

  private requiresCredentials(nodeType: string): boolean {
    const def = nodeDefinitionRegistry.get(nodeType);
    const requiredCredFields = def?.credentialSchema?.required || [];
    const providers = def?.credentialSchema?.providers || [];
    return requiredCredFields.length > 0 || providers.length > 0;
  }

  private hasCredentials(node: WorkflowNode): boolean {
    const nodeType = this.getCanonicalNodeType(node);
    const def = nodeDefinitionRegistry.get(nodeType);
    const config = node.data?.config || {};

    // If schema provides credential fields, require at least one to be present.
    const requiredCredFields = def?.credentialSchema?.required || [];
    if (requiredCredFields.length > 0) {
      return requiredCredFields.some((f) => config[f] !== undefined && config[f] !== null && String(config[f]).trim() !== '');
    }

    // Otherwise, best-effort heuristic: common key names.
    return (
      'credentials' in config ||
      'apiKey' in config ||
      'token' in config ||
      'accessToken' in config ||
      'refreshToken' in config
    );
  }

  private getDefaultValueForField(nodeType: string, field: string): any {
    const defaults: Record<string, Record<string, any>> = {
      http_request: {
        method: 'GET',
        timeout: 10000,
      },
      schedule: {
        cron: '0 9 * * *',
        timezone: 'UTC',
      },
    };

    return defaults[nodeType]?.[field] || '';
  }

  /**
   * ✅ ENHANCED: Validate execution order
   * Merged from comprehensive-workflow-validator and strict-workflow-validator
   */
  private validateExecutionOrder(workflow: Workflow, result: ValidationResult): void {
    // Execution order priority (lower number = executes first)
    const EXECUTION_ORDER: Record<string, number> = {
      // Triggers (0-10)
      'manual_trigger': 0,
      'schedule': 1,
      'interval': 2,
      'webhook': 3,
      'form': 4,
      'chat_trigger': 5,
      'workflow_trigger': 6,
      'error_trigger': 7,
      
      // Data Sources (10-20)
      'google_sheets': 10,
      'google_drive': 11,
      'http_request': 12,
      'http_post': 13,
      'database_read': 14,
      'supabase': 15,
      
      // Data Processing (20-30)
      'set_variable': 20,
      'edit_fields': 21,
      'json_parser': 22,
      'csv_processor': 23,
      
      // Logic (30-40)
      'if_else': 30,
      'switch': 31,
      'filter': 32,
      'loop': 33,
      'merge': 34,
      'split_in_batches': 35,
      
      // AI/Transformation (40-50)
      'ai_agent': 40,
      'openai_gpt': 41,
      'anthropic_claude': 42,
      'google_gemini': 43,
      'javascript': 44,
      'text_formatter': 45,
      'text_summarizer': 46,
      
      // Output (50-60)
      'slack_message': 50,
      'email': 51,
      'google_gmail': 52,
      'log_output': 53,
      'respond_to_webhook': 54,
      'database_write': 55,
    };

    // Check execution order on edges
    for (const edge of workflow.edges) {
      const sourceNode = workflow.nodes.find(n => n.id === edge.source);
      const targetNode = workflow.nodes.find(n => n.id === edge.target);
      
      if (sourceNode && targetNode) {
        const sourceType = this.getCanonicalNodeType(sourceNode);
        const targetType = this.getCanonicalNodeType(targetNode);
        const sourceOrder = EXECUTION_ORDER[sourceType] ?? 100;
        const targetOrder = EXECUTION_ORDER[targetType] ?? 100;
        
        // Rule: email/send must come after summarization/transform
        const isEmailNode = targetType.includes('gmail') || targetType.includes('email') || targetType.includes('send');
        const isTransformNode = sourceType.includes('summarizer') || sourceType.includes('transform') || 
                                sourceType.includes('ai') || sourceType.includes('llm') || 
                                sourceType.includes('gemini') || sourceType.includes('gpt') || sourceType.includes('claude');
        
        if (isEmailNode && !isTransformNode && sourceOrder < 40) {
          result.warnings.push({
            type: 'inefficient_structure',
            message: `Email/send operation "${targetType}" should come after transformation/summarization`,
            nodeId: targetNode.id,
            suggestion: 'Consider adding transformation step before email/send',
          });
        }
        
        // Rule: fetch_data must come before transform/send
        const isFetchNode = sourceType.includes('sheets') || sourceType.includes('database') || 
                            sourceType.includes('http_request') || sourceType.includes('read');
        
        if (isTransformNode && !isFetchNode && sourceOrder >= 40) {
          result.warnings.push({
            type: 'inefficient_structure',
            message: `Transform operation "${targetType}" should come after data source`,
            nodeId: targetNode.id,
            suggestion: 'Ensure data source comes before transformation',
          });
        }
        
        // General order violation
        if (sourceOrder > targetOrder && Math.abs(sourceOrder - targetOrder) > 10) {
          result.warnings.push({
            type: 'inefficient_structure',
            message: `Execution order violation: ${sourceType} (order ${sourceOrder}) connects to ${targetType} (order ${targetOrder})`,
            nodeId: targetNode.id,
            suggestion: 'Consider reordering nodes for better execution flow',
          });
        }
      }
    }
  }
  
  /**
   * ✅ ENHANCED: Validate data flow
   * Merged from comprehensive-workflow-validator
   */
  private validateDataFlow(workflow: Workflow, result: ValidationResult): void {
    const triggerNodeTypes = ['manual_trigger', 'schedule', 'interval', 'webhook', 'form', 'chat_trigger', 'workflow_trigger', 'error_trigger'];
    const outputNodeTypes = ['slack_message', 'email', 'google_gmail', 'log_output', 'respond_to_webhook', 'database_write'];
    
    const triggerNodes = workflow.nodes.filter(n => {
      const type = this.getCanonicalNodeType(n);
      return triggerNodeTypes.includes(type);
    });
    const outputNodes = workflow.nodes.filter(n => {
      const type = this.getCanonicalNodeType(n);
      return outputNodeTypes.includes(type);
    });
    
    if (triggerNodes.length === 0) {
      result.errors.push({
        type: 'missing_trigger',
        severity: 'critical',
        message: 'Workflow has no trigger node',
        fixable: true,
        suggestedFix: 'Add a trigger node (manual_trigger, schedule, webhook, etc.)',
      });
    }
    
    if (outputNodes.length === 0) {
      result.warnings.push({
        type: 'inefficient_structure',
        message: 'Workflow has no output node - consider adding one',
      });
    }
    
    // Check if there's a path from at least one trigger to at least one output
    let hasValidPath = false;
    for (const trigger of triggerNodes) {
      for (const output of outputNodes) {
        if (this.canReach(trigger.id, output.id, workflow.edges, workflow.nodes)) {
          hasValidPath = true;
          break;
        }
      }
      if (hasValidPath) break;
    }
    
    if (!hasValidPath && triggerNodes.length > 0 && outputNodes.length > 0) {
      result.errors.push({
        type: 'orphaned_node',
        severity: 'critical',
        message: 'No valid path exists from trigger to output node',
        fixable: true,
        suggestedFix: 'Add connections to create a path from trigger to output',
      });
    }
  }
  
  /**
   * ✅ ENHANCED: Validate type compatibility with comprehensive checks
   * Merged from comprehensive-workflow-validator
   */
  private validateTypeCompatibilityEnhanced(workflow: Workflow, result: ValidationResult): void {
    workflow.edges.forEach(edge => {
      const sourceNode = workflow.nodes.find(n => n.id === edge.source);
      const targetNode = workflow.nodes.find(n => n.id === edge.target);

      if (sourceNode && targetNode && edge.sourceHandle && edge.targetHandle) {
        const sourceType = this.getCanonicalNodeType(sourceNode);
        const targetType = this.getCanonicalNodeType(targetNode);
        
        // Get output/input field types
        const sourceOutputType = this.getOutputFieldType(sourceType, edge.sourceHandle);
        const targetInputType = this.getInputFieldType(targetType, edge.targetHandle);
        
        if (sourceOutputType && targetInputType && !this.areTypesCompatible(sourceOutputType, targetInputType)) {
          result.warnings.push({
            type: 'potential_performance_issue',
            message: `Potential type mismatch: ${sourceType}.${edge.sourceHandle} (${sourceOutputType}) → ${targetType}.${edge.targetHandle} (${targetInputType})`,
            nodeId: targetNode.id,
            suggestion: 'Verify data types are compatible',
          });
        }
      }
    });
  }
  
  /**
   * ✅ ENHANCED: Get output field type for a node
   * Merged from comprehensive-workflow-validator
   */
  private getOutputFieldType(nodeType: string, fieldName: string): string | null {
    // Use connection validator's output schema if available
    try {
      const { connectionValidator } = require('./connection-validator');
      const outputSchema = (connectionValidator as any).getNodeOutputSchema?.(nodeType);
      if (outputSchema?.fields?.[fieldName]) {
        return outputSchema.fields[fieldName];
      }
    } catch {
      // Connection validator not available, use fallback
    }
    
    // Fallback: infer type from field name
    if (fieldName.includes('json') || fieldName.includes('data') || fieldName.includes('body')) return 'object';
    if (fieldName.includes('text') || fieldName.includes('message')) return 'string';
    if (fieldName.includes('status') || fieldName.includes('count')) return 'number';
    return 'string'; // Default
  }
  
  /**
   * ✅ ENHANCED: Get input field type for a node
   * Merged from comprehensive-workflow-validator
   */
  private getInputFieldType(nodeType: string, fieldName: string): string | null {
    // Use connection validator's input schema if available
    try {
      const { connectionValidator } = require('./connection-validator');
      const inputSchema = (connectionValidator as any).getNodeInputSchema?.(nodeType);
      if (inputSchema?.fields?.[fieldName]) {
        return inputSchema.fields[fieldName].type;
      }
    } catch {
      // Connection validator not available, use fallback
    }
    
    // Fallback: infer type from field name
    if (fieldName.includes('json') || fieldName.includes('data') || fieldName.includes('body')) return 'object';
    if (fieldName.includes('text') || fieldName.includes('message') || fieldName.includes('input')) return 'string';
    if (fieldName.includes('count') || fieldName.includes('number')) return 'number';
    return 'string'; // Default
  }
  
  /**
   * ✅ ENHANCED: Check if types are compatible
   * Merged from comprehensive-workflow-validator
   */
  private areTypesCompatible(sourceType: string, targetType: string): boolean {
    // Exact match
    if (sourceType === targetType) return true;
    
    // Object is compatible with most types (flexible)
    if (sourceType === 'object') return true;
    if (targetType === 'object') return true;
    
    // String is compatible with most types
    if (sourceType === 'string') return true;
    
    // Number and string are somewhat compatible
    if ((sourceType === 'number' && targetType === 'string') || 
        (sourceType === 'string' && targetType === 'number')) {
      return true; // Can convert
    }
    
    return false;
  }
  
  /**
   * ✅ ENHANCED: Check if target node is reachable from source node
   * Merged from comprehensive-workflow-validator
   */
  private canReach(sourceId: string, targetId: string, edges: WorkflowEdge[], nodes: WorkflowNode[]): boolean {
    if (sourceId === targetId) return true;
    
    const visited = new Set<string>();
    const queue = [sourceId];
    visited.add(sourceId);
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const outgoingEdges = edges.filter(e => e.source === currentId);
      
      for (const edge of outgoingEdges) {
        if (edge.target === targetId) {
          return true;
        }
        
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    
    return false;
  }
  
  /**
   * ✅ 100% COMPLETE: Validate transformations
   * Merged from deterministic-workflow-validator
   * 
   * @param workflow - Workflow to validate
   * @param originalPrompt - Original user prompt
   * @param result - Validation result to populate
   */
  private validateTransformations(
    workflow: Workflow,
    originalPrompt: string,
    result: ValidationResult
  ): void {
    try {
      // Dynamically import to avoid circular dependencies
      const { transformationDetector, detectTransformations } = require('./transformation-detector');
      
      // Detect transformation verbs in prompt
      const detection = detectTransformations(originalPrompt);
      
      if (!detection.detected) {
        return; // No transformations required
      }
      
      // Get node types in workflow
      const workflowNodeTypes = workflow.nodes.map(node => this.getCanonicalNodeType(node));
      
      // Validate transformations exist
      const validation = transformationDetector.validateTransformations(detection, workflowNodeTypes);
      
      if (!validation.valid) {
        validation.errors.forEach((error: string) => {
          result.errors.push({
            type: 'missing_required_field',
            severity: 'high',
            message: error,
            fixable: true,
            suggestedFix: `Add transformation node(s): ${validation.missing.join(', ')}`,
          });
        });
      }
    } catch (error) {
      // Transformation validation is optional - don't fail if detector unavailable
      console.warn(`[WorkflowValidator] Could not validate transformations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * ✅ 100% COMPLETE: Validate AI usage
   * Merged from strict-workflow-validator
   * 
   * @param workflow - Workflow to validate
   * @param userPrompt - User prompt
   * @param result - Validation result to populate
   */
  private validateAIUsage(
    workflow: Workflow,
    userPrompt: string,
    result: ValidationResult
  ): void {
    const aiNodes = workflow.nodes.filter(n => {
      const type = this.getCanonicalNodeType(n);
      return type.includes('ai_agent') || 
             type.includes('gpt') || 
             type.includes('claude') || 
             type.includes('gemini') ||
             type.includes('ollama');
    });
    
    if (aiNodes.length === 0) {
      return; // No AI nodes to validate
    }
    
    const promptLower = userPrompt.toLowerCase();
    
    // Check if this is a chatbot workflow (AI is always required for chatbots)
    const isChatbotWorkflow = 
      promptLower.includes('chatbot') ||
      promptLower.includes('chat bot') ||
      promptLower.includes('ai chat') ||
      promptLower.includes('conversational ai') ||
      promptLower.includes('assistant') ||
      workflow.nodes.some(n => {
        const type = this.getCanonicalNodeType(n);
        return type === 'chat_trigger';
      });
    
    const needsAI =
      isChatbotWorkflow ||
      promptLower.includes('personalized') ||
      promptLower.includes('personalize') ||
      promptLower.includes('ai-generated') ||
      promptLower.includes('generate content') ||
      promptLower.includes('summarize') ||
      promptLower.includes('classify') ||
      promptLower.includes('transform');
    
    if (!needsAI && aiNodes.length > 0) {
      aiNodes.forEach(aiNode => {
        result.warnings.push({
          type: 'inefficient_structure',
          message: `AI node "${aiNode.data?.label || aiNode.id}" may be unnecessary - prompt doesn't require AI`,
          nodeId: aiNode.id,
          suggestion: 'AI should only be used for personalization, summarization, classification, or transformation',
        });
      });
    }
    
    // Check AI node position (should be after trigger, before final communication)
    const executionOrder = this.calculateExecutionOrder(workflow);
    aiNodes.forEach(aiNode => {
      const aiIndex = executionOrder.indexOf(aiNode.id);
      if (aiIndex === -1) return;
      
      // AI should be early in the flow (after trigger, before storage/communication)
      if (aiIndex > executionOrder.length / 2) {
        result.warnings.push({
          type: 'inefficient_structure',
          message: `AI node "${aiNode.data?.label || aiNode.id}" is placed too late in execution order`,
          nodeId: aiNode.id,
          suggestion: 'AI should be placed earlier in the workflow (after trigger, before storage/communication)',
        });
      }
    });
  }
  
  /**
   * ✅ 100% COMPLETE: Validate required services
   * Merged from strict-workflow-validator
   * 
   * @param workflow - Workflow to validate
   * @param userPrompt - User prompt
   * @param result - Validation result to populate
   */
  private validateRequiredServices(
    workflow: Workflow,
    userPrompt: string,
    result: ValidationResult
  ): void {
    const promptLower = userPrompt.toLowerCase();
    const workflowNodeTypes = new Set(workflow.nodes.map(n => this.getCanonicalNodeType(n)));
    const missingServices: string[] = [];
    
    // Check for Google Sheets
    if ((promptLower.includes('google sheets') || 
         promptLower.includes('sheets') || 
         promptLower.includes('save to') || 
         promptLower.includes('store')) &&
        !workflowNodeTypes.has('google_sheets')) {
      missingServices.push('Google Sheets');
    }
    
    // Check for Slack
    if ((promptLower.includes('slack') || 
         promptLower.includes('notify') || 
         promptLower.includes('sales team')) &&
        !workflowNodeTypes.has('slack_message') &&
        !workflowNodeTypes.has('slack_webhook')) {
      missingServices.push('Slack');
    }
    
    // Check for Gmail/Email
    if ((promptLower.includes('gmail') || 
         promptLower.includes('email') || 
         promptLower.includes('send email') || 
         promptLower.includes('follow-up')) &&
        !workflowNodeTypes.has('google_gmail') &&
        !workflowNodeTypes.has('email')) {
      missingServices.push('Gmail/Email');
    }
    
    if (missingServices.length > 0) {
      result.errors.push({
        type: 'missing_required_field',
        severity: 'high',
        message: `Missing required services: ${missingServices.join(', ')}`,
        fixable: true,
        suggestedFix: `Add missing service nodes: ${missingServices.join(', ')}`,
      });
    }
  }
  
  /**
   * ✅ REQUIRED: AI Intent Matching Validation
   * Core validation for prompt-to-workflow systems
   * 
   * @param workflow - Workflow to validate
   * @param userPrompt - User prompt to match against
   * @param result - Validation result to populate
   */
  private async validateAIIntentMatching(
    workflow: Workflow,
    userPrompt: string,
    result: ValidationResult
  ): Promise<void> {
    try {
      // Dynamically import to avoid circular dependencies
      const { aiWorkflowValidator } = await import('./ai-workflow-validator');
      
      // Create workflow structure for AI validation
      const structure: any = {
        trigger: workflow.nodes.find(n => {
          const type = this.getCanonicalNodeType(n);
          return this.isTriggerNode(type);
        })?.id || null,
        nodes: workflow.nodes.map(n => ({
          id: n.id,
          type: this.getCanonicalNodeType(n),
          label: n.data?.label || n.id,
        })),
        edges: workflow.edges.map(e => ({
          source: e.source,
          target: e.target,
        })),
      };
      
      // Perform AI validation
      const aiValidation = await aiWorkflowValidator.validateWorkflowStructure(
        userPrompt,
        structure,
        workflow.nodes,
        workflow.edges
      );
      
      // Add AI validation results to result
      if (!aiValidation.valid) {
        aiValidation.issues.forEach(issue => {
          result.errors.push({
            type: 'invalid_configuration',
            severity: 'high',
            message: `AI Intent Mismatch: ${issue}`,
            fixable: false,
            suggestedFix: 'Review workflow structure against user prompt',
          });
        });
      }
      
      // Add confidence-based warnings
      if (aiValidation.confidence < 70) {
        result.warnings.push({
          type: 'inefficient_structure',
          message: `AI validation confidence is low (${aiValidation.confidence}%). Workflow may not fully match user intent.`,
          suggestion: aiValidation.suggestions.join('; ') || 'Review workflow against user prompt',
        });
      }
      
      // Add specific validation flags
      if (!aiValidation.nodeOrderValid) {
        result.warnings.push({
          type: 'inefficient_structure',
          message: 'AI validation: Node order may not match user intent',
          suggestion: 'Review node execution order',
        });
      }
      
      if (!aiValidation.connectionsValid) {
        result.warnings.push({
          type: 'inefficient_structure',
          message: 'AI validation: Connections may not form logical flow',
          suggestion: 'Review workflow connections',
        });
      }
      
      if (!aiValidation.completenessValid) {
        result.warnings.push({
          type: 'inefficient_structure',
          message: 'AI validation: Workflow may be missing required nodes',
          suggestion: aiValidation.suggestions.join('; ') || 'Review workflow completeness',
        });
      }
      
      // Add AI suggestions as warnings
      if (aiValidation.suggestions.length > 0) {
        aiValidation.suggestions.forEach(suggestion => {
          result.warnings.push({
            type: 'inefficient_structure',
            message: `AI Suggestion: ${suggestion}`,
            suggestion: suggestion,
          });
        });
      }
      
      console.log(`[WorkflowValidator] ✅ AI Intent Matching: valid=${aiValidation.valid}, confidence=${aiValidation.confidence}%`);
    } catch (error) {
      // AI validation is important but shouldn't block workflow if it fails
      console.warn(`[WorkflowValidator] ⚠️  AI Intent Matching validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.warnings.push({
        type: 'inefficient_structure',
        message: 'AI intent matching validation unavailable - workflow may not match user intent',
        suggestion: 'Review workflow manually against user prompt',
      });
    }
  }
  
  /**
   * ✅ 100% COMPLETE: Calculate execution order from edges
   * Merged from strict-workflow-validator
   * 
   * @param workflow - Workflow to analyze
   * @returns Array of node IDs in execution order
   */
  private calculateExecutionOrder(workflow: Workflow): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const inDegree = new Map<string, number>();
    
    // Initialize in-degree
    workflow.nodes.forEach(node => {
      inDegree.set(node.id, 0);
    });
    
    // Calculate in-degree
    workflow.edges.forEach(edge => {
      const current = inDegree.get(edge.target) || 0;
      inDegree.set(edge.target, current + 1);
    });
    
    // Find trigger nodes (in-degree 0)
    const queue: string[] = [];
    workflow.nodes.forEach(node => {
      if (inDegree.get(node.id) === 0) {
        queue.push(node.id);
      }
    });
    
    // Topological sort
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      order.push(nodeId);
      visited.add(nodeId);
      
      workflow.edges
        .filter(e => e.source === nodeId)
        .forEach(edge => {
          const targetDegree = (inDegree.get(edge.target) || 0) - 1;
          inDegree.set(edge.target, targetDegree);
          if (targetDegree === 0 && !visited.has(edge.target)) {
            queue.push(edge.target);
          }
        });
    }
    
    return order;
  }
}

// Export singleton instance
export const workflowValidator = new WorkflowValidator();
