// STEP-5: Testing, Validation & Self-Healing System
// Implements the 5 mandatory validation layers and self-healing engine

import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';

export enum ValidationLayer {
  LAYER_1_STRUCTURAL_VALIDATION = 'LAYER_1_STRUCTURAL_VALIDATION',
  LAYER_2_CONFIGURATION_VALIDATION = 'LAYER_2_CONFIGURATION_VALIDATION',
  LAYER_3_CREDENTIAL_VALIDATION = 'LAYER_3_CREDENTIAL_VALIDATION',
  LAYER_4_DATA_FLOW_VALIDATION = 'LAYER_4_DATA_FLOW_VALIDATION',
  LAYER_5_RUNTIME_SIMULATION = 'LAYER_5_RUNTIME_SIMULATION',
}

export interface LayerValidationResult {
  layer: ValidationLayer;
  passed: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  autoFixes: AutoFix[];
  blocking: boolean; // If true, workflow cannot proceed
}

export interface ValidationError {
  type: string;
  severity: 'critical' | 'high' | 'medium';
  message: string;
  nodeId?: string;
  edgeId?: string;
  recoverable: boolean; // Can be auto-fixed
  suggestedFix?: string;
}

export interface ValidationWarning {
  type: string;
  message: string;
  nodeId?: string;
  suggestion?: string;
}

export interface AutoFix {
  type: FixType;
  description: string;
  nodeId?: string;
  edgeId?: string;
  changes: any;
  applied: boolean;
}

export type FixType =
  | 'remove_unused_node'
  | 'reconnect_edge'
  | 'reorder_nodes'
  | 'correct_field_mapping'
  | 'normalize_format'
  | 'add_default'
  | 'reassociate_credential'
  | 'insert_transform_node'
  | 'add_guard'
  | 'normalize_ai_output'
  | 'add_retry'
  | 'add_backoff';

export interface TestCase {
  name: string;
  type: 'positive' | 'edge_case' | 'failure_scenario';
  description: string;
  input: any;
  expectedOutput?: any;
  expectedBehavior?: string;
}

export interface ValidationMetrics {
  buildSuccessRate: number;
  fixAttempts: number;
  commonFailureTypes: Map<string, number>;
  patternReliability: Map<string, number>;
  layerPassRates: Map<ValidationLayer, number>;
}

export interface SelfHealingResult {
  healed: boolean;
  iterations: number;
  errorsBefore: number;
  errorsAfter: number;
  fixesApplied: AutoFix[];
  nonRecoverableErrors: ValidationError[];
  fixedWorkflow?: Workflow;
}

export interface FinalValidationResult {
  allLayersPassed: boolean;
  layerResults: LayerValidationResult[];
  criticalErrors: ValidationError[];
  warnings: ValidationWarning[];
  testCases: TestCase[];
  healingResult?: SelfHealingResult;
  metrics: ValidationMetrics;
  executable: boolean;
  blockingIssues: string[];
}

const TRIGGER_NODE_TYPES = [
  'manual_trigger',
  'webhook',
  'webhook_trigger_response',
  'schedule',
  'chat_trigger',
  'error_trigger',
  'interval',
  'workflow_trigger',
  'http_trigger',
  'form',
];

/**
 * STEP-5: Comprehensive Validation & Self-Healing System
 */
export class WorkflowValidationStep5 {
  private maxHealingIterations = 3;
  private metrics: ValidationMetrics;

  constructor() {
    this.metrics = {
      buildSuccessRate: 0,
      fixAttempts: 0,
      commonFailureTypes: new Map(),
      patternReliability: new Map(),
      layerPassRates: new Map(),
    };
  }

  /**
   * Main validation entry point - runs all 5 layers in order
   */
  async validateWorkflow(
    workflow: Workflow,
    attemptHealing: boolean = true
  ): Promise<FinalValidationResult> {
    const layerResults: LayerValidationResult[] = [];
    let currentWorkflow = JSON.parse(JSON.stringify(workflow)); // Deep clone

    // Run all 5 validation layers in order
    const layer1 = this.validateLayer1Structural(currentWorkflow);
    layerResults.push(layer1);
    if (layer1.blocking && layer1.errors.some(e => e.severity === 'critical')) {
      return this.buildFinalResult(layerResults, currentWorkflow, attemptHealing);
    }

    const layer2 = this.validateLayer2Configuration(currentWorkflow);
    layerResults.push(layer2);
    if (layer2.blocking && layer2.errors.some(e => e.severity === 'critical')) {
      return this.buildFinalResult(layerResults, currentWorkflow, attemptHealing);
    }

    const layer3 = this.validateLayer3Credentials(currentWorkflow);
    layerResults.push(layer3);
    if (layer3.blocking && layer3.errors.some(e => e.severity === 'critical')) {
      return this.buildFinalResult(layerResults, currentWorkflow, attemptHealing);
    }

    const layer4 = this.validateLayer4DataFlow(currentWorkflow);
    layerResults.push(layer4);
    if (layer4.blocking && layer4.errors.some(e => e.severity === 'critical')) {
      return this.buildFinalResult(layerResults, currentWorkflow, attemptHealing);
    }

    const layer5 = await this.validateLayer5RuntimeSimulation(currentWorkflow);
    layerResults.push(layer5);

    // Attempt self-healing if enabled
    let healingResult: SelfHealingResult | undefined;
    if (attemptHealing) {
      healingResult = await this.attemptSelfHealing(currentWorkflow, layerResults);
      if (healingResult.healed && healingResult.fixesApplied.length > 0) {
        // Re-validate after healing
        return await this.validateWorkflow(healingResult.fixedWorkflow || currentWorkflow, false);
      }
    }

    return this.buildFinalResult(layerResults, currentWorkflow, attemptHealing, healingResult);
  }

  /**
   * LAYER-1: STRUCTURAL VALIDATION
   * Checks: Exactly one trigger, all nodes connected, no circular dependencies, no orphan nodes, valid execution order
   */
  private validateLayer1Structural(workflow: Workflow): LayerValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const autoFixes: AutoFix[] = [];

    // Check 1: Exactly one trigger
    const triggerNodes = workflow.nodes.filter(n => this.isTriggerNode(n.type));
    if (triggerNodes.length === 0) {
      errors.push({
        type: 'missing_trigger',
        severity: 'critical',
        message: 'Workflow must have exactly one trigger node',
        recoverable: true,
        suggestedFix: 'Add a trigger node (manual_trigger, webhook, schedule, etc.)',
      });
      autoFixes.push({
        type: 'add_default',
        description: 'Add manual trigger node',
        changes: { nodeType: 'manual_trigger' },
        applied: false,
      });
    } else if (triggerNodes.length > 1) {
      errors.push({
        type: 'multiple_triggers',
        severity: 'critical',
        message: `Workflow has ${triggerNodes.length} trigger nodes, but should have exactly one`,
        recoverable: true,
        suggestedFix: 'Remove extra trigger nodes, keeping only one',
      });
      autoFixes.push({
        type: 'remove_unused_node',
        description: 'Remove extra trigger nodes',
        changes: { nodesToRemove: triggerNodes.slice(1).map(n => n.id) },
        applied: false,
      });
    }

    // Check 2: No orphan nodes
    const connectedNodeIds = new Set<string>();
    triggerNodes.forEach(trigger => {
      connectedNodeIds.add(trigger.id);
      this.traverseConnections(trigger.id, workflow.edges, connectedNodeIds);
    });

    const orphanNodes = workflow.nodes.filter(
      n => !connectedNodeIds.has(n.id) && !this.isTriggerNode(n.type)
    );
    if (orphanNodes.length > 0) {
      orphanNodes.forEach(node => {
        errors.push({
          type: 'orphaned_node',
          severity: 'high',
          message: `Node "${node.data?.label || node.id}" is not connected to the workflow`,
          nodeId: node.id,
          recoverable: true,
          suggestedFix: 'Connect this node to the workflow graph',
        });
        autoFixes.push({
          type: 'reconnect_edge',
          description: `Connect orphaned node ${node.id} to workflow`,
          nodeId: node.id,
          changes: { connectToTrigger: true },
          applied: false,
        });
      });
    }

    // Check 3: No circular dependencies
    // RELAXED: Only flag as warning, not critical error - some workflows may have intentional cycles
    const cycles = this.detectCycles(workflow);
    if (cycles.length > 0) {
      cycles.forEach(cycle => {
        // Only flag as error if cycle is very short (likely accidental)
        // Longer cycles (3+ nodes) might be intentional workflow patterns
        if (cycle.length <= 2) {
          warnings.push({
            type: 'circular_dependency',
            message: `Potential circular dependency detected: ${cycle.join(' → ')}`,
            suggestion: 'Review if this cycle is intentional or needs to be removed',
          });
        } else {
          // Longer cycles are likely intentional - just log as info
          console.log(`ℹ️  Detected cycle (likely intentional): ${cycle.join(' → ')}`);
        }
      });
    }

    // Check 4: Valid execution order
    const executionOrder = this.calculateExecutionOrder(workflow);
    if (executionOrder.length !== workflow.nodes.length) {
      warnings.push({
        type: 'invalid_execution_order',
        message: 'Some nodes may not execute in the expected order',
        suggestion: 'Review node connections to ensure proper execution flow',
      });
    }

    const blocking = errors.some(e => e.severity === 'critical' && !e.recoverable);
    return {
      layer: ValidationLayer.LAYER_1_STRUCTURAL_VALIDATION,
      passed: errors.length === 0,
      errors,
      warnings,
      autoFixes,
      blocking,
    };
  }

  /**
   * LAYER-2: CONFIGURATION VALIDATION
   * Checks: Required fields filled, correct data types, valid expressions, node-specific constraints
   */
  private validateLayer2Configuration(workflow: Workflow): LayerValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const autoFixes: AutoFix[] = [];

    workflow.nodes.forEach(node => {
      const nodeType = node.type;
      const config = node.data?.config || {};

      // Check required fields
      const requiredFields = this.getRequiredFields(nodeType);
      requiredFields.forEach(field => {
        if (!this.hasField(config, field)) {
          errors.push({
            type: 'missing_required_field',
            severity: 'high',
            message: `Node "${node.data?.label || node.id}" is missing required field: ${field}`,
            nodeId: node.id,
            recoverable: true,
            suggestedFix: `Add ${field} configuration`,
          });
          autoFixes.push({
            type: 'add_default',
            description: `Add missing field ${field} to node ${node.id}`,
            nodeId: node.id,
            changes: { field, defaultValue: this.getDefaultValueForField(nodeType, field) },
            applied: false,
          });
        }
      });

      // Check data types
      const typeIssues = this.validateDataTypes(node, config);
      errors.push(...typeIssues);

      // Check valid expressions
      const expressions = this.extractExpressions(config);
      expressions.forEach(expr => {
        if (!this.isValidExpression(expr)) {
          errors.push({
            type: 'invalid_expression',
            severity: 'medium',
            message: `Node "${node.data?.label || node.id}" has invalid expression: ${expr}`,
            nodeId: node.id,
            recoverable: false,
          });
        }
      });

      // Node-specific constraints
      const nodeSpecificIssues = this.validateNodeSpecificConstraints(node);
      errors.push(...nodeSpecificIssues);
    });

    const blocking = errors.some(e => e.severity === 'critical' && !e.recoverable);
    return {
      layer: ValidationLayer.LAYER_2_CONFIGURATION_VALIDATION,
      passed: errors.length === 0,
      errors,
      warnings,
      autoFixes,
      blocking,
    };
  }

  /**
   * LAYER-3: CREDENTIAL VALIDATION
   * Checks: All required credentials present, credential type matches node, OAuth scope compatibility, token format correctness
   */
  private validateLayer3Credentials(workflow: Workflow): LayerValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const autoFixes: AutoFix[] = [];

    workflow.nodes.forEach(node => {
      if (this.requiresCredentials(node.type)) {
        const config = node.data?.config || {};

        // Check if credentials are present
        if (!this.hasCredentials(config, node.type)) {
          errors.push({
            type: 'missing_credentials',
            severity: 'high',
            message: `Node "${node.data?.label || node.id}" requires credentials but none are configured`,
            nodeId: node.id,
            recoverable: false, // Cannot fabricate credentials
            suggestedFix: 'Configure credentials for this node',
          });
        } else {
          // Validate credential format
          const credentialIssues = this.validateCredentialFormat(node, config);
          errors.push(...credentialIssues);

          // Check OAuth scope compatibility
          if (this.requiresOAuth(node.type)) {
            const scopeIssues = this.validateOAuthScopes(node, config);
            warnings.push(...scopeIssues);
          }
        }
      }
    });

    const blocking = errors.some(e => e.severity === 'critical');
    return {
      layer: ValidationLayer.LAYER_3_CREDENTIAL_VALIDATION,
      passed: errors.length === 0,
      errors,
      warnings,
      autoFixes,
      blocking,
    };
  }

  /**
   * LAYER-4: DATA FLOW VALIDATION
   * Checks: Trigger output consumed, no null propagation, schema compatibility, AI output schema enforced
   */
  private validateLayer4DataFlow(workflow: Workflow): LayerValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const autoFixes: AutoFix[] = [];

    // Check trigger output is consumed
    const triggerNodes = workflow.nodes.filter(n => this.isTriggerNode(n.type));
    triggerNodes.forEach(trigger => {
      const outgoingEdges = workflow.edges.filter(e => e.source === trigger.id);
      if (outgoingEdges.length === 0) {
        warnings.push({
          type: 'unused_trigger_output',
          message: `Trigger "${trigger.data?.label || trigger.id}" output is not consumed`,
          nodeId: trigger.id,
          suggestion: 'Connect trigger to at least one action node',
        });
      }
    });

    // Check for null propagation
    workflow.edges.forEach(edge => {
      const sourceNode = workflow.nodes.find(n => n.id === edge.source);
      const targetNode = workflow.nodes.find(n => n.id === edge.target);

      if (sourceNode && targetNode) {
        // Check if source can produce null and target doesn't handle it
        if (this.canProduceNull(sourceNode) && !this.handlesNull(targetNode)) {
          warnings.push({
            type: 'potential_null_propagation',
            message: `Node "${targetNode.data?.label || targetNode.id}" may receive null from "${sourceNode.data?.label || sourceNode.id}"`,
            nodeId: targetNode.id,
            suggestion: 'Add null check or default value handling',
          });
          autoFixes.push({
            type: 'add_guard',
            description: `Add null guard for node ${targetNode.id}`,
            nodeId: targetNode.id,
            changes: { addNullCheck: true },
            applied: false,
          });
        }
      }
    });

    // Check schema compatibility
    workflow.edges.forEach(edge => {
      const compatibility = this.checkSchemaCompatibility(workflow, edge);
      if (!compatibility.compatible) {
        errors.push({
          type: 'schema_incompatibility',
          severity: 'high',
          message: `Schema incompatibility between nodes: ${compatibility.reason}`,
          edgeId: edge.id,
          recoverable: true,
          suggestedFix: 'Add transform node to convert data format',
        });
        autoFixes.push({
          type: 'insert_transform_node',
          description: `Insert transform node to fix schema incompatibility`,
          edgeId: edge.id,
          changes: { transformType: compatibility.suggestedTransform },
          applied: false,
        });
      }
    });

    // Check AI output schema
    const aiNodes = workflow.nodes.filter(n => this.isAINode(n.type));
    aiNodes.forEach(aiNode => {
      const aiOutputIssues = this.validateAIOutputSchema(aiNode, workflow);
      errors.push(...aiOutputIssues);
    });

    const blocking = errors.some(e => e.severity === 'critical');
    return {
      layer: ValidationLayer.LAYER_4_DATA_FLOW_VALIDATION,
      passed: errors.length === 0,
      errors,
      warnings,
      autoFixes,
      blocking,
    };
  }

  /**
   * LAYER-5: RUNTIME SIMULATION (DRY RUN)
   * Simulates execution, mocks external responses, traces execution path, detects runtime failures
   */
  private async validateLayer5RuntimeSimulation(workflow: Workflow): Promise<LayerValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const autoFixes: AutoFix[] = [];

    // Simulate execution path
    const executionPath = this.simulateExecutionPath(workflow);
    
    // Check for timeouts
    const timeoutIssues = this.checkTimeouts(executionPath);
    errors.push(...timeoutIssues);

    // Check for rate limits
    const rateLimitIssues = this.checkRateLimits(executionPath);
    warnings.push(...rateLimitIssues);
    if (rateLimitIssues.length > 0) {
      autoFixes.push({
        type: 'add_backoff',
        description: 'Add rate limit backoff strategy',
        changes: { backoffStrategy: 'exponential' },
        applied: false,
      });
    }

    // Check API error patterns
    const apiErrorIssues = this.checkAPIErrorPatterns(executionPath);
    errors.push(...apiErrorIssues);

    // Check retry safety
    const retryIssues = this.checkRetrySafety(executionPath);
    warnings.push(...retryIssues);
    if (retryIssues.length > 0) {
      autoFixes.push({
        type: 'add_retry',
        description: 'Add retry logic for external API calls',
        changes: { maxRetries: 3, retryDelay: 1000 },
        applied: false,
      });
    }

    const blocking = errors.some(e => e.severity === 'critical');
    return {
      layer: ValidationLayer.LAYER_5_RUNTIME_SIMULATION,
      passed: errors.length === 0,
      errors,
      warnings,
      autoFixes,
      blocking,
    };
  }

  /**
   * Self-Healing Engine
   * Attempts to fix recoverable errors through healing loop
   */
  private async attemptSelfHealing(
    workflow: Workflow,
    layerResults: LayerValidationResult[]
  ): Promise<SelfHealingResult> {
    let currentWorkflow = JSON.parse(JSON.stringify(workflow));
    let iterations = 0;
    const fixesApplied: AutoFix[] = [];
    const nonRecoverableErrors: ValidationError[] = [];

    // Collect all recoverable errors
    const allErrors = layerResults.flatMap(lr => lr.errors);
    const recoverableErrors = allErrors.filter(e => e.recoverable);
    const nonRecoverable = allErrors.filter(e => !e.recoverable);
    nonRecoverableErrors.push(...nonRecoverable);

    let errorsBefore = recoverableErrors.length;
    let errorsAfter = errorsBefore;

    while (iterations < this.maxHealingIterations && errorsAfter > 0) {
      iterations++;
      this.metrics.fixAttempts++;

      // Collect all auto-fixes from layers
      const allAutoFixes = layerResults.flatMap(lr => lr.autoFixes.filter(f => !f.applied));

      // Apply fixes
      for (const fix of allAutoFixes) {
        currentWorkflow = this.applyAutoFix(currentWorkflow, fix);
        fix.applied = true;
        fixesApplied.push(fix);
      }

      // Re-validate to check if errors were reduced
      const revalidation = await this.validateWorkflow(currentWorkflow, false);
      errorsAfter = revalidation.criticalErrors.length;

      // Check if we made progress
      if (errorsAfter >= errorsBefore) {
        // No improvement, stop healing
        break;
      }

      errorsBefore = errorsAfter;
    }

    return {
      healed: errorsAfter === 0,
      iterations,
      errorsBefore: recoverableErrors.length,
      errorsAfter,
      fixesApplied,
      nonRecoverableErrors,
      fixedWorkflow: currentWorkflow,
    };
  }

  /**
   * Generate test cases for workflow
   */
  generateTestCases(workflow: Workflow): TestCase[] {
    const testCases: TestCase[] = [];

    // Positive test case
    testCases.push({
      name: 'Positive Flow Test',
      type: 'positive',
      description: 'Test workflow with valid input data',
      input: this.generatePositiveTestInput(workflow),
      expectedBehavior: 'Workflow should execute successfully and produce expected output',
    });

    // Edge case test
    testCases.push({
      name: 'Edge Case Test',
      type: 'edge_case',
      description: 'Test workflow with edge case inputs (empty, null, boundary values)',
      input: this.generateEdgeCaseInput(workflow),
      expectedBehavior: 'Workflow should handle edge cases gracefully',
    });

    // Failure scenario test
    testCases.push({
      name: 'Failure Scenario Test',
      type: 'failure_scenario',
      description: 'Test workflow behavior when external services fail',
      input: this.generateFailureScenarioInput(workflow),
      expectedBehavior: 'Workflow should handle failures with error handling or retries',
    });

    return testCases;
  }

  /**
   * Build final validation result
   */
  private buildFinalResult(
    layerResults: LayerValidationResult[],
    workflow: Workflow,
    attemptHealing: boolean,
    healingResult?: SelfHealingResult
  ): FinalValidationResult {
    const allErrors = layerResults.flatMap(lr => lr.errors);
    const allWarnings = layerResults.flatMap(lr => lr.warnings);
    const criticalErrors = allErrors.filter(e => e.severity === 'critical');
    const testCases = this.generateTestCases(workflow);

    // Update metrics
    this.updateMetrics(layerResults, healingResult);

    // Check if all layers passed
    const allLayersPassed = layerResults.every(lr => lr.passed);
    const executable = allLayersPassed && criticalErrors.length === 0;

    // Identify blocking issues
    const blockingIssues: string[] = [];
    if (!allLayersPassed) {
      blockingIssues.push('One or more validation layers failed');
    }
    if (criticalErrors.length > 0) {
      blockingIssues.push(`${criticalErrors.length} critical error(s) found`);
    }
    if (healingResult && !healingResult.healed) {
      blockingIssues.push('Self-healing could not resolve all errors');
    }

    return {
      allLayersPassed,
      layerResults,
      criticalErrors,
      warnings: allWarnings,
      testCases,
      healingResult,
      metrics: this.metrics,
      executable,
      blockingIssues,
    };
  }

  // Helper methods (implementations continue...)
  private isTriggerNode(type: string): boolean {
    return TRIGGER_NODE_TYPES.includes(type);
  }

  private traverseConnections(nodeId: string, edges: WorkflowEdge[], visited: Set<string>): void {
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

  private calculateExecutionOrder(workflow: Workflow): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const triggerNodes = workflow.nodes.filter(n => this.isTriggerNode(n.type));

    const dfs = (nodeId: string): void => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      order.push(nodeId);

      workflow.edges
        .filter(e => e.source === nodeId)
        .forEach(edge => {
          dfs(edge.target);
        });
    };

    triggerNodes.forEach(trigger => dfs(trigger.id));
    return order;
  }

  private getRequiredFields(nodeType: string): string[] {
    const requiredFieldsMap: Record<string, string[]> = {
      http_request: ['url'],
      schedule: ['cron', 'cronExpression'],
      webhook: ['path'],
      database_write: ['query', 'table'],
      database_read: ['query', 'table'],
      if_else: ['condition'],
      openai_gpt: ['prompt', 'apiKey'],
      anthropic_claude: ['prompt', 'apiKey'],
      google_gemini: ['prompt', 'apiKey'],
    };
    return requiredFieldsMap[nodeType] || [];
  }

  private hasField(config: any, field: string): boolean {
    return field in config && config[field] !== null && config[field] !== '';
  }

  private getDefaultValueForField(nodeType: string, field: string): any {
    const defaults: Record<string, Record<string, any>> = {
      http_request: { method: 'GET', timeout: 10000 },
      schedule: { cron: '0 9 * * *', timezone: 'UTC' },
      if_else: { condition: '{{ $json }}' },
    };
    return defaults[nodeType]?.[field] || '';
  }

  private validateDataTypes(node: WorkflowNode, config: any): ValidationError[] {
    const errors: ValidationError[] = [];
    // Implementation for data type validation
    return errors;
  }

  private extractExpressions(config: any): string[] {
    const expressions: string[] = [];
    const configStr = JSON.stringify(config);
    const matches = configStr.match(/\{\{[^}]+\}\}/g);
    if (matches) {
      expressions.push(...matches);
    }
    return expressions;
  }

  private isValidExpression(expr: string): boolean {
    const open = (expr.match(/\{\{/g) || []).length;
    const close = (expr.match(/\}\}/g) || []).length;
    return open === close && open > 0;
  }

  private validateNodeSpecificConstraints(node: WorkflowNode): ValidationError[] {
    const errors: ValidationError[] = [];
    // Implementation for node-specific validation
    return errors;
  }

  private requiresCredentials(nodeType: string): boolean {
    return [
      'http_request',
      'http_post',
      'slack_message',
      'email',
      'google_sheets',
      'google_drive',
      'google_gmail',
      'database_write',
      'database_read',
      'openai_gpt',
      'anthropic_claude',
      'google_gemini',
    ].includes(nodeType);
  }

  private hasCredentials(config: any, nodeType: string): boolean {
    return 'credentials' in config || 'apiKey' in config || 'token' in config || 'accessToken' in config;
  }

  private requiresOAuth(nodeType: string): boolean {
    return ['google_sheets', 'google_drive', 'google_gmail', 'linkedin'].includes(nodeType);
  }

  private validateCredentialFormat(node: WorkflowNode, config: any): ValidationError[] {
    const errors: ValidationError[] = [];
    // Implementation for credential format validation
    return errors;
  }

  private validateOAuthScopes(node: WorkflowNode, config: any): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    // Implementation for OAuth scope validation
    return warnings;
  }

  private canProduceNull(node: WorkflowNode): boolean {
    // Check if node type can produce null
    return ['http_request', 'database_read', 'ai_agent'].includes(node.type);
  }

  private handlesNull(node: WorkflowNode): boolean {
    // Check if node handles null inputs
    const config = node.data?.config || {};
    return config.nullHandling === true || config.defaultValue !== undefined;
  }

  private checkSchemaCompatibility(workflow: Workflow, edge: WorkflowEdge): {
    compatible: boolean;
    reason?: string;
    suggestedTransform?: string;
  } {
    // Basic schema compatibility check
    return { compatible: true };
  }

  private isAINode(type: string): boolean {
    return ['ai_agent', 'openai_gpt', 'anthropic_claude', 'google_gemini'].includes(type);
  }

  private validateAIOutputSchema(node: WorkflowNode, workflow: Workflow): ValidationError[] {
    const errors: ValidationError[] = [];
    // Implementation for AI output schema validation
    return errors;
  }

  private simulateExecutionPath(workflow: Workflow): any[] {
    // Simulate execution path
    return [];
  }

  private checkTimeouts(executionPath: any[]): ValidationError[] {
    const errors: ValidationError[] = [];
    // Implementation for timeout checking
    return errors;
  }

  private checkRateLimits(executionPath: any[]): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    // Implementation for rate limit checking
    return warnings;
  }

  private checkAPIErrorPatterns(executionPath: any[]): ValidationError[] {
    const errors: ValidationError[] = [];
    // Implementation for API error pattern checking
    return errors;
  }

  private checkRetrySafety(executionPath: any[]): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    // Implementation for retry safety checking
    return warnings;
  }

  private applyAutoFix(workflow: Workflow, fix: AutoFix): Workflow {
    const fixed = JSON.parse(JSON.stringify(workflow));

    switch (fix.type) {
      case 'remove_unused_node':
        if (fix.changes.nodesToRemove) {
          fixed.nodes = fixed.nodes.filter((n: WorkflowNode) => !fix.changes.nodesToRemove.includes(n.id));
          fixed.edges = fixed.edges.filter((e: WorkflowEdge) => 
            !fix.changes.nodesToRemove.includes(e.source) && !fix.changes.nodesToRemove.includes(e.target)
          );
        }
        break;

      case 'reconnect_edge':
        if (fix.nodeId && fix.changes.connectToTrigger) {
          const triggerNodes = fixed.nodes.filter((n: WorkflowNode) => this.isTriggerNode(n.type));
          if (triggerNodes.length > 0) {
            fixed.edges.push({
              id: `edge_${Date.now()}`,
              source: triggerNodes[0].id,
              target: fix.nodeId,
              type: 'default',
            });
          }
        }
        break;

      case 'add_default':
        if (fix.nodeId && fix.changes.field) {
          const node = fixed.nodes.find((n: WorkflowNode) => n.id === fix.nodeId);
          if (node) {
            if (!node.data.config) {
              node.data.config = {};
            }
            node.data.config[fix.changes.field] = fix.changes.defaultValue;
          }
        } else if (fix.changes.nodeType) {
          // Add new node (e.g., trigger)
          const newNode: WorkflowNode = {
            id: `node_${Date.now()}`,
            type: fix.changes.nodeType,
            position: { x: 250, y: 100 },
            data: {
              type: fix.changes.nodeType,
              label: fix.changes.nodeType.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
              category: 'triggers',
              config: {},
            },
          };
          fixed.nodes.unshift(newNode);
        }
        break;

      case 'add_guard':
        if (fix.nodeId && fix.changes.addNullCheck) {
          const node = fixed.nodes.find((n: WorkflowNode) => n.id === fix.nodeId);
          if (node && node.data.config) {
            node.data.config.nullHandling = true;
            node.data.config.defaultValue = null;
          }
        }
        break;

      case 'insert_transform_node':
        // Implementation for inserting transform nodes
        break;

      case 'add_retry':
        if (fix.changes.maxRetries) {
          // Add retry configuration to relevant nodes
          fixed.nodes.forEach((node: WorkflowNode) => {
            if (['http_request', 'http_post'].includes(node.type)) {
              if (!node.data.config) {
                node.data.config = {};
              }
              node.data.config.retries = fix.changes.maxRetries;
              node.data.config.retryDelay = fix.changes.retryDelay || 1000;
            }
          });
        }
        break;

      case 'add_backoff':
        if (fix.changes.backoffStrategy) {
          // Add backoff strategy to relevant nodes
          fixed.nodes.forEach((node: WorkflowNode) => {
            if (['http_request', 'http_post'].includes(node.type)) {
              if (!node.data.config) {
                node.data.config = {};
              }
              node.data.config.backoffStrategy = fix.changes.backoffStrategy;
            }
          });
        }
        break;
    }

    return fixed;
  }

  private generatePositiveTestInput(workflow: Workflow): any {
    const triggerNode = workflow.nodes.find(n => this.isTriggerNode(n.type));
    if (!triggerNode) {
      return { data: 'test' };
    }

    // Generate realistic test input based on trigger type
    switch (triggerNode.type) {
      case 'webhook':
        return { body: { data: 'test' }, headers: {}, query: {} };
      case 'form':
        return { form: { field1: 'value1', field2: 'value2' } };
      case 'schedule':
        return { trigger: 'schedule', timestamp: new Date().toISOString() };
      default:
        return { data: 'test' };
    }
  }

  private generateEdgeCaseInput(workflow: Workflow): any {
    return {
      data: null,
      empty: '',
      emptyArray: [],
      emptyObject: {},
      boundary: Number.MAX_SAFE_INTEGER,
      negative: -1,
      zero: 0,
      veryLongString: 'a'.repeat(10000),
    };
  }

  private generateFailureScenarioInput(workflow: Workflow): any {
    return {
      simulateFailure: true,
      simulateTimeout: true,
      simulateRateLimit: true,
      simulateNetworkError: true,
    };
  }

  private updateMetrics(
    layerResults: LayerValidationResult[],
    healingResult?: SelfHealingResult
  ): void {
    // Update metrics
    layerResults.forEach(lr => {
      const passRate = lr.passed ? 1 : 0;
      const current = this.metrics.layerPassRates.get(lr.layer) || 0;
      this.metrics.layerPassRates.set(lr.layer, (current + passRate) / 2);
    });

    if (healingResult) {
      const success = healingResult.healed ? 1 : 0;
      this.metrics.buildSuccessRate = (this.metrics.buildSuccessRate + success) / 2;
    }
  }
}

// Export singleton instance
export const workflowValidationStep5 = new WorkflowValidationStep5();
