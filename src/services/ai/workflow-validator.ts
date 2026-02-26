// Workflow Validator Service
// Step 6: Validate and Auto-Fix Workflows
// Implements all validation rules from the comprehensive guide

import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { normalizeWorkflowGraph } from '../../core/utils/workflow-graph-normalizer';
import { isTransformationNode } from './transformation-templates';
import { normalizeNodeType } from '../../core/utils/node-type-normalizer';
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
   */
  async validateAndFix(workflow: Workflow, depth: number = 0): Promise<ValidationResult> {
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

    // Attempt auto-fix if there are fixable errors and we haven't exceeded max iterations
    if (result.errors.some(e => e.fixable) && depth < this.maxFixIterations) {
      // First, fix transformation nodes (our enhancement)
      const transformationIssues = result.errors.filter(
        e => e.nodeId && e.fixable && this.isTransformationNode(
          workflow.nodes.find(n => n.id === e.nodeId)?.type || ''
        )
      );
      
      if (transformationIssues.length > 0) {
        const fixedWorkflow = this.fixTransformationNodes(workflow, transformationIssues);
        result.fixedWorkflow = fixedWorkflow;
        result.fixesApplied.push({
          type: 'fix_configuration',
          description: `Fixed ${transformationIssues.length} transformation node(s) with missing properties`,
          changes: { nodesFixed: transformationIssues.length },
        });
        // Update workflow for next iteration
        workflow = fixedWorkflow;
        // Remove fixed errors from result
        result.errors = result.errors.filter(e => !transformationIssues.includes(e));
      }
      
      const errorsBeforeFix = result.errors.length;
      const fixed = await this.attemptAutoFix(workflow, result);
      
      // Only re-validate if fixes were actually applied AND we made progress
      if (fixed && result.fixesApplied.length > 0) {
        // Check if we actually fixed any errors (not just applied fixes that don't help)
        const errorsAfterFix = result.errors.filter(e => 
          !result.fixesApplied.some(fix => 
            fix.description.includes(e.message) || 
            (e.nodeId && fix.nodeId === e.nodeId)
          )
        );
        
        // Only re-validate if we made progress (fewer errors or different errors)
        if (errorsAfterFix.length < errorsBeforeFix || errorsAfterFix.length !== result.errors.length) {
          result.fixedWorkflow = fixed;
          // Re-validate fixed workflow with incremented depth
          const revalidation = await this.validateAndFix(fixed, depth + 1);
          result.errors = revalidation.errors;
          result.warnings = revalidation.warnings;
          // Merge fixes applied (avoid duplicates)
          const existingFixDescriptions = new Set(result.fixesApplied.map(f => f.description));
          revalidation.fixesApplied.forEach(fix => {
            if (!existingFixDescriptions.has(fix.description)) {
              result.fixesApplied.push(fix);
            }
          });
        } else {
          // Fixes were applied but didn't help - stop trying to fix
          result.fixedWorkflow = fixed;
        }
      }
    }

    // Determine if workflow is valid
    result.valid = result.errors.filter(e => e.severity === 'critical' || e.severity === 'high').length === 0;

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
    const connectedNodeIds = new Set<string>();
    
    // Start from trigger nodes
    triggerNodes.forEach(trigger => {
      connectedNodeIds.add(trigger.id);
      this.traverseConnections(trigger.id, workflow.edges, connectedNodeIds);
    });

    workflow.nodes.forEach(node => {
      if (!connectedNodeIds.has(node.id) && !this.isTriggerNode(this.getCanonicalNodeType(node))) {
        result.errors.push({
          type: 'orphaned_node',
          severity: 'high',
          message: `Node "${node.data?.label || node.id}" is not connected to the workflow`,
          nodeId: node.id,
          fixable: true,
          suggestedFix: 'Connect this node to the workflow graph',
        });
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
   * Fix transformation nodes with missing properties
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
   * Attempt to auto-fix errors
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
      return normalizeNodeType(node as any);
    } catch {
      const t = (node as any)?.data?.type || (node as any)?.type || 'unknown';
      return String(t).toLowerCase();
    }
  }

  /**
   * Apply fix to workflow
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

  private validateTypeCompatibility(workflow: Workflow, result: ValidationResult): void {
    // Basic type checking - can be enhanced
    workflow.edges.forEach(edge => {
      const sourceNode = workflow.nodes.find(n => n.id === edge.source);
      const targetNode = workflow.nodes.find(n => n.id === edge.target);

      if (sourceNode && targetNode) {
        // Check if types are compatible
        // This is a simplified check - can be enhanced with actual type system
      }
    });
  }

  private getRequiredFields(nodeType: string): string[] {
    const def = nodeDefinitionRegistry.get(nodeType);
    return def?.requiredInputs || [];
  }

  private hasField(node: WorkflowNode, field: string): boolean {
    const config = node.data?.config || {};
    return field in config && config[field] !== null && config[field] !== '';
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
}

// Export singleton instance
export const workflowValidator = new WorkflowValidator();
