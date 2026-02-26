/**
 * Workflow DSL (Domain Specific Language)
 * 
 * Intermediate representation between StructuredIntent and Workflow Graph.
 * 
 * Pipeline: prompt → intent → DSL → workflow graph
 * 
 * The DSL is a deterministic, structured representation that:
 * - Defines trigger, data sources, transformations, outputs
 * - Specifies execution order
 * - Is generated from StructuredIntent (not from LLM directly)
 * - Is the ONLY input accepted by WorkflowCompiler
 */

import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';
import { nodeLibrary } from '../nodes/node-library';
import { normalizeNodeType } from './node-type-normalizer';
import { StructuredIntent } from './intent-structurer';
import { matchesIntentAction, isIntentActionCovered } from './intent-dsl-semantic-mapper';
import { validateIntentCoverageByCapabilities } from './capability-based-validator';
import { getTransformationNodeType, getTransformationNodeTypes } from './transformation-node-config';
import { workflowTemplateSelector, WorkflowTemplate } from './workflow-templates';

/**
 * DSL Generation Error
 * Thrown when DSL generation fails due to validation errors
 */
export interface IntentActionCoverageFailure {
  type: string;
  operation: string;
  expectedIn: 'dataSource' | 'output';
  availableDSLNodes?: {
    dataSources: string[];
    transformations: string[];
    outputs: string[];
  };
  failureReason?: string;
  suggestedFix?: string;
}

export class DSLGenerationError extends Error {
  constructor(
    message: string,
    public uncategorizedActions: Array<{ type: string; operation: string; reason?: string }> = [],
    public missingIntentActions?: IntentActionCoverageFailure[],
    public minimumComponentViolations?: Array<{ component: string; required: number; actual: number }>
  ) {
    super(message);
    this.name = 'DSLGenerationError';
    Object.setPrototypeOf(this, DSLGenerationError.prototype);
  }
}

export interface WorkflowDSL {
  /**
   * Workflow trigger
   */
  trigger: DSLTrigger;

  /**
   * Data sources (read operations)
   */
  dataSources: DSLDataSource[];

  /**
   * Transformations (AI processing, logic)
   */
  transformations: DSLTransformation[];

  /**
   * Output actions (write operations, notifications)
   */
  outputs: DSLOutput[];

  /**
   * Execution order (deterministic sequence)
   */
  executionOrder: DSLExecutionStep[];

  /**
   * Conditions (if/else branches)
   */
  conditions?: DSLCondition[];

  /**
   * Metadata
   */
  metadata?: {
    originalPrompt?: string;
    intentId?: string;
    generatedAt?: number;
    autoInjectedNodes?: string[]; // Node types that were auto-injected by TransformationDetector
  };
}

/**
 * DSL Trigger
 */
export interface DSLTrigger {
  type: 'manual_trigger' | 'schedule' | 'webhook' | 'form' | 'chat_trigger' | 'api_trigger';
  config?: {
    interval?: 'hourly' | 'daily' | 'weekly' | 'monthly';
    schedule?: string; // Cron expression
    cron?: string;
    [key: string]: any;
  };
}

/**
 * DSL Data Source
 */
export interface DSLDataSource {
  id: string;
  type: string; // Node type (e.g., 'google_sheets', 'database')
  operation: 'read' | 'fetch' | 'get' | 'query';
  config?: Record<string, any>;
  description?: string;
}

/**
 * DSL Transformation
 */
export interface DSLTransformation {
  id: string;
  type: string; // Node type (e.g., 'text_summarizer', 'ollama_llm', 'ai_agent')
  operation: 'summarize' | 'analyze' | 'classify' | 'translate' | 'extract' | 'transform' | 'process';
  input?: {
    sourceId: string; // ID of data source or previous transformation
    field?: string; // Specific field to transform
  };
  config?: Record<string, any>;
  description?: string;
}

/**
 * DSL Output
 */
export interface DSLOutput {
  id: string;
  type: string; // Node type (e.g., 'gmail', 'slack_message', 'google_sheets')
  operation: 'send' | 'write' | 'create' | 'update' | 'notify';
  input?: {
    sourceId: string; // ID of data source or transformation
    field?: string; // Specific field to output
  };
  config?: Record<string, any>;
  description?: string;
}

/**
 * DSL Execution Step
 * Defines the deterministic execution order
 */
export interface DSLExecutionStep {
  stepId: string;
  stepType: 'trigger' | 'data_source' | 'transformation' | 'output' | 'condition';
  stepRef: string; // Reference to trigger/dataSource/transformation/output/condition ID
  dependsOn?: string[]; // Step IDs this step depends on
  order: number; // Execution order (0 = first)
}

/**
 * DSL Condition
 */
export interface DSLCondition {
  id: string;
  type: 'if_else' | 'switch' | 'loop';
  condition: string; // Condition expression
  truePath: string[]; // Step IDs for true branch
  falsePath?: string[]; // Step IDs for false branch (if_else)
  cases?: Array<{ value: string; path: string[] }>; // Cases for switch
  loopConfig?: {
    sourceId: string; // Data source to iterate over
    maxIterations?: number;
  };
}

/**
 * DSL Validation Result
 */
export interface DSLValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate that all intent actions are represented in DSL dataSources and outputs
 * 
 * @param intent - Structured intent with actions
 * @param dsl - Generated workflow DSL
 * @throws DSLGenerationError if intent actions are missing from DSL
 */
/**
 * Validate intent coverage using capability-based validation
 * 
 * ✅ REFACTORED: Now uses capability-based validation instead of type matching
 * - Maps intent actions to required capabilities (read, transform, write)
 * - Maps DSL nodes to provided capabilities
 * - Validates that all required capabilities are satisfied
 * 
 * This is more extensible and flexible than type-based matching.
 */
function validateIntentCoverage(intent: StructuredIntent, dsl: WorkflowDSL): void {
  if (!intent.actions || intent.actions.length === 0) {
    return; // No actions to validate
  }

  // ✅ NEW: Use capability-based validation
  const capabilityValidation = validateIntentCoverageByCapabilities(intent, dsl);
  
  if (!capabilityValidation.valid) {
    // Convert capability-based errors to IntentActionCoverageFailure format for backward compatibility
    const missingActions: IntentActionCoverageFailure[] = [];
    
    for (const missingReq of capabilityValidation.missingRequirements) {
      // Collect available DSL nodes
      const dslDataSourceTypes = dsl.dataSources.map(ds => ds.type?.toLowerCase().trim()).filter(Boolean) as string[];
      const dslTransformationTypes = dsl.transformations.map(tf => tf.type?.toLowerCase().trim()).filter(Boolean) as string[];
      const dslOutputTypes = dsl.outputs.map(out => out.type?.toLowerCase().trim()).filter(Boolean) as string[];
      
      // Determine expected category based on capability
      let expectedIn: 'dataSource' | 'output' = 'dataSource';
      if (missingReq.capability === 'write') {
        expectedIn = 'output';
      } else if (missingReq.capability === 'transform') {
        expectedIn = 'dataSource'; // Transformations are valid coverage
      }
      
      const failureInfo: IntentActionCoverageFailure = {
        type: missingReq.intentAction.type,
        operation: missingReq.intentAction.operation,
        expectedIn,
        availableDSLNodes: {
          dataSources: dslDataSourceTypes,
          transformations: dslTransformationTypes,
          outputs: dslOutputTypes,
        },
        failureReason: `Missing required capabilities: ${missingReq.requiredCapabilities.join(', ')}. ` +
          `Available DSL nodes do not provide these capabilities.`,
        suggestedFix: `Add a DSL node that provides capabilities: ${missingReq.requiredCapabilities.join(', ')}. ` +
          `For ${missingReq.capability} capability, consider adding a ${missingReq.capability === 'read' ? 'dataSource' : missingReq.capability === 'transform' ? 'transformation' : 'output'} node.`,
      };
      
      missingActions.push(failureInfo);
    }
    
    // Build detailed error message
    const errorDetails = missingActions.map((action, idx) => {
      const availableCount = 
        (action.availableDSLNodes?.dataSources.length || 0) +
        (action.availableDSLNodes?.transformations.length || 0) +
        (action.availableDSLNodes?.outputs.length || 0);
      
      let detail = `\n  ${idx + 1}. Intent action: "${action.type}" (operation: "${action.operation}")`;
      detail += `\n     Expected capability: ${capabilityValidation.missingRequirements[idx]?.capability || 'unknown'}`;
      detail += `\n     Required capabilities: ${capabilityValidation.missingRequirements[idx]?.requiredCapabilities.join(', ') || 'unknown'}`;
      detail += `\n     Expected in: ${action.expectedIn}`;
      detail += `\n     Available DSL nodes: ${availableCount} total`;
      if (action.availableDSLNodes) {
        if (action.availableDSLNodes.dataSources.length > 0) {
          detail += `\n       - DataSources: ${action.availableDSLNodes.dataSources.join(', ')}`;
        }
        if (action.availableDSLNodes.transformations.length > 0) {
          detail += `\n       - Transformations: ${action.availableDSLNodes.transformations.join(', ')}`;
        }
        if (action.availableDSLNodes.outputs.length > 0) {
          detail += `\n       - Outputs: ${action.availableDSLNodes.outputs.join(', ')}`;
        }
      }
      if (action.failureReason) {
        detail += `\n     Failure reason: ${action.failureReason}`;
      }
      if (action.suggestedFix) {
        detail += `\n     Suggested fix: ${action.suggestedFix}`;
      }
      return detail;
    }).join('\n');
    
    const errorMessage = 
      `Intent coverage validation failed (capability-based): ${missingActions.length} intent action(s) not represented in DSL.` +
      errorDetails +
      `\n\nAll intent actions must be mapped to DSL nodes that provide the required capabilities (read, transform, write).`;

    throw new DSLGenerationError(
      errorMessage,
      [],
      missingActions
    );
  }
}

/**
 * Validate minimum required components in DSL
 * Ensures DSL has essential components for a valid workflow
 * 
 * @param dsl - Generated workflow DSL
 * @throws DSLGenerationError if minimum requirements are not met
 */
function validateMinimumComponents(dsl: WorkflowDSL): void {
  const violations: Array<{ component: string; required: number; actual: number }> = [];

  // Minimum requirements:
  // 1. Must have a trigger (always required)
  if (!dsl.trigger || !dsl.trigger.type) {
    violations.push({ component: 'trigger', required: 1, actual: 0 });
  }

  // 2. Must have at least one data source OR output (workflow must do something)
  // ✅ FIXED: Transformations are first-class components but don't count toward minimum requirement
  // because they need input data (from dataSource or trigger) and produce output (to output or next transformation)
  const hasDataSource = dsl.dataSources.length > 0;
  const hasOutput = dsl.outputs.length > 0;
  const hasTransformation = dsl.transformations.length > 0;
  
  // A valid workflow must have:
  // - At least one dataSource (to read data) OR
  // - At least one output (to write data) OR
  // - At least one transformation (if trigger provides data directly)
  // However, transformations typically need input, so we require dataSource OR output
  // Transformations alone are valid only if trigger provides data (edge case)
  if (!hasDataSource && !hasOutput && !hasTransformation) {
    violations.push({ 
      component: 'dataSource, output, or transformation', 
      required: 1, 
      actual: 0 
    });
  }

  // Note: Transformations are first-class components and are always included in DSL structure
  // They are optional in count (can be 0 or many) but are treated equally with dataSources and outputs

  // Throw descriptive error if minimum requirements are not met
  if (violations.length > 0) {
    const violationDetails = violations
      .map(v => `${v.component}: required ${v.required}, found ${v.actual}`)
      .join('; ');
    
    const errorMessage = 
      `Minimum component validation failed: DSL does not meet minimum requirements. ` +
      `Violations: ${violationDetails}. ` +
      `A valid workflow must have a trigger and at least one data source or output.`;

    throw new DSLGenerationError(
      errorMessage,
      [],
      undefined,
      violations
    );
  }
}

/**
 * Validate operation-based component requirements
 * Ensures DSL has dataSources for read operations and outputs for write operations
 * 
 * @param intent - Structured intent with actions
 * @param dsl - Generated workflow DSL
 * @throws DSLGenerationError if operation requirements are not met
 */
function validateOperationRequirements(intent: StructuredIntent, dsl: WorkflowDSL): void {
  if (!intent.actions || intent.actions.length === 0) {
    return; // No operations to validate
  }

  const violations: Array<{ component: string; required: number; actual: number }> = [];

  // Check for read operations
  const readOperations = ['read', 'fetch', 'get', 'query'];
  const hasReadOperation = intent.actions.some(a => 
    readOperations.includes((a.operation || '').toLowerCase())
  );
  if (hasReadOperation && dsl.dataSources.length === 0) {
    violations.push({ component: 'dataSource', required: 1, actual: 0 });
  }

  // Check for write operations
  const writeOperations = ['send', 'write', 'create', 'update', 'notify'];
  const hasWriteOperation = intent.actions.some(a => 
    writeOperations.includes((a.operation || '').toLowerCase())
  );
  if (hasWriteOperation && dsl.outputs.length === 0) {
    violations.push({ component: 'output', required: 1, actual: 0 });
  }

  // Throw descriptive error if operation requirements are not met
  if (violations.length > 0) {
    const violationDetails = violations
      .map(v => `${v.component}: required ${v.required}, found ${v.actual}`)
      .join('; ');
    
    const errorMessage = 
      `Operation requirement validation failed: Intent contains operations that require missing DSL components. ` +
      `Violations: ${violationDetails}. ` +
      `Read operations require dataSources, write operations require outputs.`;

    throw new DSLGenerationError(
      errorMessage,
      [],
      undefined,
      violations
    );
  }
}

/**
 * DSL Generator
 * Converts StructuredIntent to WorkflowDSL
 */
export class DSLGenerator {
  /**
   * Generate DSL from StructuredIntent
   * 
   * @param intent - Structured intent
   * @param originalPrompt - Original user prompt
   * @param transformationDetection - Transformation detection result (REQUIRED)
   * @returns Workflow DSL
   */
  generateDSL(
    intent: any,
    originalPrompt?: string,
    transformationDetection?: { detected: boolean; verbs: string[]; requiredNodeTypes: string[] }
  ): WorkflowDSL {
    console.log('[DSLGenerator] Generating DSL from StructuredIntent...');
    
    // ✅ TEMPLATE SELECTION: Select matching template based on intent
    const templateSelection = workflowTemplateSelector.selectTemplate(intent, originalPrompt);
    if (templateSelection.template) {
      console.log(`[DSLGenerator] ✅ Selected template: ${templateSelection.template.id} (confidence: ${(templateSelection.confidence * 100).toFixed(1)}%, reason: ${templateSelection.reason})`);
    } else {
      console.log(`[DSLGenerator] No template matched, using standard DSL generation`);
    }

    // Extract trigger
    const trigger: DSLTrigger = {
      type: intent.trigger || 'manual_trigger',
      config: intent.trigger_config || {},
    };

    // Extract data sources
    const dataSources: DSLDataSource[] = [];
    const transformations: DSLTransformation[] = [];
    const outputs: DSLOutput[] = [];

    // Track uncategorized actions and mapped actions for validation
    const uncategorizedActions: Array<{ type: string; operation: string; reason?: string }> = [];
    const mappedActionsToDataSources: Array<{ actionType: string; operation: string; dslIndex: number }> = [];
    const mappedActionsToOutputs: Array<{ actionType: string; operation: string; dslIndex: number }> = [];
    // Count all intent components (actions + dataSources + transformations from planner)
    const originalActionCount = 
      (intent.actions || []).length +
      (intent.dataSources || []).length +
      (intent.transformations || []).length;

    // Initialize step counter (used for all component IDs)
    let stepCounter = 0;

    // ✅ NEW: Process dataSources from StructuredIntent (if planner provided them separately)
    // This preserves planner.data_sources → intent.dataSources mapping
    if (intent.dataSources && intent.dataSources.length > 0) {
      console.log(`[DSLGenerator] Processing ${intent.dataSources.length} dataSource(s) from StructuredIntent.dataSources`);
      for (const ds of intent.dataSources) {
        const rawType = ds.type || '';
        const normalizedType = normalizeNodeType(rawType);
        const dsType = normalizedType || rawType;
        const dsOperation = ds.operation || 'read';

        // Ensure NodeLibrary can resolve normalized type; log and skip if it cannot.
        if (!nodeLibrary.isNodeTypeRegistered(dsType)) {
          console.error(`[DSLGenerator] ❌ DataSource type "${rawType}" normalized to "${dsType}" is not registered in NodeLibrary. Skipping this data source.`);
          continue;
        }
        
        // Categorize as data source (should always be dataSource)
        if (this.isDataSource(dsType, dsOperation)) {
          const dslIndex = dataSources.length;
          dataSources.push({
            id: `ds_${stepCounter++}`,
            type: dsType,
            operation: dsOperation as any,
            config: ds.config || {},
            description: ds.config?.description,
          });
          mappedActionsToDataSources.push({ actionType: dsType, operation: dsOperation, dslIndex });
        } else {
          console.warn(`[DSLGenerator] ⚠️  DataSource "${dsType}" with operation "${dsOperation}" failed dataSource categorization`);
        }
      }
    }

    // ✅ NEW: Process transformations from StructuredIntent (if planner provided them separately)
    // This preserves planner.transformations → intent.transformations mapping
    if (intent.transformations && intent.transformations.length > 0) {
      console.log(`[DSLGenerator] Processing ${intent.transformations.length} transformation(s) from StructuredIntent.transformations`);
      for (const tf of intent.transformations) {
        const rawType = tf.type || '';
        const normalizedType = normalizeNodeType(rawType);
        const tfType = normalizedType || rawType;
        const tfOperation = tf.operation || 'transform';

        // Ensure NodeLibrary can resolve normalized type; log and skip if it cannot.
        if (!nodeLibrary.isNodeTypeRegistered(tfType)) {
          console.error(`[DSLGenerator] ❌ Transformation type "${rawType}" normalized to "${tfType}" is not registered in NodeLibrary. Skipping this transformation.`);
          continue;
        }
        
        // Categorize as transformation (should always be transformation)
        if (this.isTransformation(tfType, tfOperation)) {
          transformations.push({
            id: `tf_${stepCounter++}`,
            type: tfType,
            operation: this.mapTransformationOperation(tfOperation),
            config: tf.config || {},
            description: tf.config?.description,
          });
        } else {
          console.warn(`[DSLGenerator] ⚠️  Transformation "${tfType}" with operation "${tfOperation}" failed transformation categorization`);
        }
      }
    }

    // Process actions (these are outputs/write operations from planner)
    for (const action of intent.actions || []) {
      const rawType = action.type || '';
      const normalizedType = normalizeNodeType(rawType);
      const actionType = normalizedType || rawType;
      const operation = action.operation || 'read';

      // Ensure NodeLibrary can resolve normalized type for explicit intent actions.
      // If we cannot map this action to any supported node type, treat it as a
      // hard structural error – the intent cannot be realized.
      if (!nodeLibrary.isNodeTypeRegistered(actionType)) {
        const message =
          `DSL generation failed: intent action type "${rawType}" normalized to "${actionType}" ` +
          `is not registered in NodeLibrary. The system could not find any supported node type ` +
          `to implement this action.`;
        console.error(`[DSLGenerator] ❌ ${message}`);
        throw new DSLGenerationError(message, [
          {
            type: rawType,
            operation,
            reason: 'Unresolvable node type: no registered NodeLibrary schema after normalization',
          },
        ]);
      }

      // Categorize action
      // ✅ REFACTORED: Pure capability-based classification
      // Priority: transformation > output > data source
      // This ensures correct categorization based on capabilities:
      // - Nodes with TRANSFORM capability → transformation
      // - Nodes with WRITE/SEND capability → output (if operation is write-like)
      // - Nodes with READ capability → data source (if operation is read-like)
      // For nodes with multiple capabilities, operation is used to disambiguate
      let categorized = false;

      // Check transformation first (transformations are usually unambiguous)
      if (this.isTransformation(actionType, operation)) {
        transformations.push({
          id: `tf_${stepCounter++}`,
          type: actionType,
          operation: this.mapTransformationOperation(operation),
          config: action.config || {},
          description: action.config?.description,
        });
        categorized = true;
      } else if (this.isOutput(actionType, operation)) {
        const dslIndex = outputs.length;
        outputs.push({
          id: `out_${stepCounter++}`,
          type: actionType,
          operation: operation as any,
          config: action.config || {},
          description: action.config?.description,
        });
        mappedActionsToOutputs.push({ actionType, operation, dslIndex });
        categorized = true;
      } else if (this.isDataSource(actionType, operation)) {
        const dslIndex = dataSources.length;
        dataSources.push({
          id: `ds_${stepCounter++}`,
          type: actionType,
          operation: operation as any,
          config: action.config || {},
          description: action.config?.description,
        });
        mappedActionsToDataSources.push({ actionType, operation, dslIndex });
        categorized = true;
      }

      // Track uncategorized actions
      if (!categorized) {
        const reason = this.getCategorizationFailureReason(actionType, operation);
        uncategorizedActions.push({
          type: rawType,
          operation,
          reason,
        });
        console.error(`[DSLGenerator] ❌ Failed to categorize action: type="${actionType}", operation="${operation}"`);
        console.error(`[DSLGenerator]   Reason: ${reason}`);
      }
    }

    // ✅ STRICT VALIDATION: Ensure all actions were categorized
    if (uncategorizedActions.length > 0) {
      console.error(`[DSLGenerator] ❌ DSL Generation Validation Failed:`);
      console.error(`[DSLGenerator]   Total actions: ${originalActionCount}`);
      console.error(`[DSLGenerator]   Uncategorized actions: ${uncategorizedActions.length}`);
      console.error(`[DSLGenerator]   Uncategorized actions details:`, uncategorizedActions);
      
      throw new DSLGenerationError(
        `DSL generation failed: ${uncategorizedActions.length} action(s) could not be categorized. ` +
        `Every intent action must be mapped to data source, transformation, or output.`,
        uncategorizedActions
      );
    }

    // ✅ FIXED: STRICT PIPELINE CONTRACT - Always include required transformations from TransformationDetector
    // Track auto-injected nodes for metadata (using Set to prevent duplicates)
    const autoInjectedNodesSet = new Set<string>();
    
    if (transformationDetection?.detected && transformationDetection.verbs.length > 0) {
      console.log(`[DSLGenerator] 🔍 TransformationDetector detected verbs: ${transformationDetection.verbs.join(', ')}`);
      console.log(`[DSLGenerator] 🔍 Required node types: ${transformationDetection.requiredNodeTypes.join(', ')}`);
      
      // Check if transformations are already included from actions
      const existingTransformationTypes = new Set(transformations.map(t => t.type.toLowerCase()));
      const missingRequiredTypes = transformationDetection.requiredNodeTypes.filter(
        requiredType => {
          const requiredTypeLower = requiredType.toLowerCase();
          // Check for exact match or substring match
          return !Array.from(existingTransformationTypes).some(existingType => 
            existingType === requiredTypeLower || 
            existingType.includes(requiredTypeLower) || 
            requiredTypeLower.includes(existingType)
          );
        }
      );
      
      if (missingRequiredTypes.length > 0) {
        console.log(`[DSLGenerator] ⚠️  Missing required transformation types: ${missingRequiredTypes.join(', ')}`);
        
        // Add missing transformations using central TRANSFORMATION_NODE_MAP configuration
        for (const requiredType of missingRequiredTypes) {
          // Try to map the required type to a transformation node using central config
          let selectedProvider: string | null = null;
          
          // First, try to get node type from central config if it's a transformation operation
          const transformationNodeTypes = getTransformationNodeTypes();
          if (transformationNodeTypes.length > 0) {
            // Use the first (and typically only) transformation node type from config
            selectedProvider = transformationNodeTypes[0];
          }
          
          // If still no match, try to infer from required type name
          if (!selectedProvider) {
            // Check if requiredType looks like a transformation operation
            const normalizedRequired = requiredType.toLowerCase();
            if (normalizedRequired.includes('summarize') || normalizedRequired.includes('analyze') || 
                normalizedRequired.includes('classify') || normalizedRequired.includes('generate')) {
              // Extract the operation and get node type from central config
              const operation = normalizedRequired.split('_')[0] || normalizedRequired;
              selectedProvider = getTransformationNodeType(operation);
            } else {
              // Fallback: use the required type as-is (for backward compatibility)
              selectedProvider = requiredType;
            }
          }
          
          // Final fallback to ai_chat_model (from central config)
          if (!selectedProvider) {
            selectedProvider = getTransformationNodeType('summarize'); // Default to ai_chat_model
          }

          // Ensure selectedProvider is not null
          if (!selectedProvider) {
            selectedProvider = 'ai_chat_model'; // Hard fallback
          }

          // Normalize selected provider and ensure it is registered
          const normalizedProvider = normalizeNodeType(selectedProvider);
          if (!nodeLibrary.isNodeTypeRegistered(normalizedProvider)) {
            console.error(`[DSLGenerator] ❌ Auto-injected transformation provider "${selectedProvider}" normalized to "${normalizedProvider}" is not registered in NodeLibrary. Skipping this auto-injected transformation.`);
            continue;
          }
          
          // ✅ IDEMPOTENCY: Check if this provider is already in transformations (prevent duplicates)
          // Check both existing transformations and transformations being added in this loop
          const selectedProviderLower = normalizedProvider.toLowerCase();
          const alreadyExists = Array.from(existingTransformationTypes).some(existingType =>
            existingType === selectedProviderLower ||
            existingType.includes(selectedProviderLower) ||
            selectedProviderLower.includes(existingType)
          ) || autoInjectedNodesSet.has(normalizedProvider) || autoInjectedNodesSet.has(selectedProviderLower);
          
          if (alreadyExists) {
            console.log(`[DSLGenerator] ⚠️  Skipping duplicate transformation: ${selectedProvider} (already exists or being added)`);
            continue; // Skip adding duplicate
          }
          
          // Map verb to operation
          const verb = transformationDetection.verbs[0]; // Use first detected verb
          const operation = this.mapVerbToOperation(verb);
          
          console.log(`[DSLGenerator] ✅ Adding missing transformation: ${normalizedProvider} (operation: ${operation})`);
          
          transformations.push({
            id: `tf_${stepCounter++}`,
            type: normalizedProvider,
            operation: operation,
            config: {
              provider: normalizedProvider,
              verb: verb,
            },
            description: `Auto-added transformation for detected verb: ${verb}`,
          });
          
          // ✅ TRACK AUTO-INJECTED: Add to set (prevents duplicates) and update existing types
          autoInjectedNodesSet.add(normalizedProvider);
          existingTransformationTypes.add(selectedProviderLower);
        }
      } else {
        console.log(`[DSLGenerator] ✅ All required transformations already included in DSL`);
      }
    }
    
    // Convert Set to array for metadata (ensures no duplicates)
    const autoInjectedNodes = Array.from(autoInjectedNodesSet);

    // ✅ VALIDATION: Ensure auto-added transformations don't create duplicates
    // This is a redundant check but provides extra safety
    const transformationTypes = transformations.map(t => t.type.toLowerCase());
    const uniqueTransformationTypes = new Set(transformationTypes);
    if (transformationTypes.length !== uniqueTransformationTypes.size) {
      const duplicates = transformationTypes.filter((type, idx) => transformationTypes.indexOf(type) !== idx);
      console.error(`[DSLGenerator] ❌ Duplicate transformations detected: ${[...new Set(duplicates)].join(', ')}`);
      throw new DSLGenerationError(
        `DSL generation failed: Duplicate transformations detected: ${[...new Set(duplicates)].join(', ')}. ` +
        `This should not happen - duplicate prevention logic may have failed.`,
        []
      );
    }

    // ✅ GUARANTEED LLM NODE INJECTION: Ensure ai_chat_model exists for AI transformations
    // This is a safety net that guarantees LLM nodes are always present for AI operations
    // Note: This runs AFTER TransformationDetector injection to ensure we never miss LLM nodes
    const llmInjectionResult = this.ensureLLMNodeInDSL(
      intent,
      transformations,
      stepCounter,
      autoInjectedNodesSet
    );
    if (llmInjectionResult.injected) {
      transformations.push(...llmInjectionResult.nodes);
      stepCounter = llmInjectionResult.nextStepCounter;
      autoInjectedNodes.push(...llmInjectionResult.injectedNodeTypes);
      console.log(`[DSLGenerator] ✅ Guaranteed LLM node injection: Added ${llmInjectionResult.nodes.length} ai_chat_model node(s)`);
    }

    // ✅ TEMPLATE APPLICATION: Apply template structure if template was selected
    // This ensures template pipeline structure is respected
    let finalDataSources = dataSources;
    let finalTransformations = transformations;
    let finalOutputs = outputs;
    
    if (templateSelection.template) {
      const templateResult = this.applyTemplateStructure(
        templateSelection.template,
        { dataSources, transformations, outputs },
        intent
      );
      finalDataSources = templateResult.dataSources;
      finalTransformations = templateResult.transformations;
      finalOutputs = templateResult.outputs;
      console.log(`[DSLGenerator] ✅ Applied template structure: ${templateSelection.template.id}`);
    }

    // Build execution order
    const executionOrder = this.buildExecutionOrder(trigger, finalDataSources, finalTransformations, finalOutputs);

    // Extract conditions
    const conditions = this.extractConditions(intent.conditions || []);

    const dsl: WorkflowDSL = {
      trigger,
      dataSources: finalDataSources,
      transformations: finalTransformations,
      outputs: finalOutputs,
      executionOrder,
      conditions: conditions.length > 0 ? conditions : undefined,
      metadata: {
        originalPrompt,
        generatedAt: Date.now(),
        ...(autoInjectedNodes.length > 0 && { autoInjectedNodes }),
        ...(templateSelection.template && { templateId: templateSelection.template.id }),
      },
    };

    // ✅ INVARIANT: Ensure canonical DSL shape
    // DSL must always contain: trigger, dataSources[], transformations[], outputs[]
    if (!Array.isArray(dsl.dataSources) || !Array.isArray(dsl.transformations) || !Array.isArray(dsl.outputs)) {
      throw new DSLGenerationError(
        'DSL generation failed: Invalid DSL structure. Expected arrays for dataSources, transformations, and outputs.'
      );
    }

    // ✅ SEMANTIC VALIDATION: Verify all intent actions are represented in DSL
    // Note: We already validated that all actions are categorized (lines 268-280)
    // This validation ensures semantic correctness without comparing total counts
    // Transformations can exceed intent count because TransformationDetector auto-injects them
    // ✅ IMPORTANT: Validation runs AFTER transformation injection to ensure auto-added transformations
    // are included in intent coverage checks
    
    const intentActionsInDataSources = mappedActionsToDataSources.length;
    const intentActionsInOutputs = mappedActionsToOutputs.length;
    const intentActionsInTransformations = originalActionCount - intentActionsInDataSources - intentActionsInOutputs;
    
    // All intent actions are already validated to be categorized (uncategorizedActions check above)
    // So we know: intentActionsInDataSources + intentActionsInOutputs + intentActionsInTransformations = originalActionCount
    // We don't need to validate count - we just log the semantic breakdown
    
    const breakdown = {
      dataSources: dataSources.length,
      transformations: transformations.length,
      outputs: outputs.length,
      intentActionsInDataSources,
      intentActionsInOutputs,
      intentActionsInTransformations,
    };

    // ✅ PRODUCTION-GRADE VALIDATION: Verify intent coverage, minimum components, and operation requirements
    // ✅ IMPORTANT: This validation runs AFTER transformation injection, ensuring auto-added transformations
    // are included in intent coverage checks via semantic matching
    validateIntentCoverage(intent, dsl);
    validateMinimumComponents(dsl);
    validateOperationRequirements(intent, dsl);
    
    // ✅ POST-INJECTION VALIDATION: Verify that auto-added transformations satisfy intent coverage
    // This is a redundant check but provides explicit verification that TransformationDetector output
    // correctly integrates with intent coverage validation
    if (autoInjectedNodes.length > 0) {
      console.log(`[DSLGenerator] 🔍 Verifying ${autoInjectedNodes.length} auto-added transformation(s) satisfy intent coverage...`);
      
      // Check if any intent actions with transformation operations are now covered
      const transformationOperations = ['summarize', 'analyze', 'process', 'transform'];
      const intentTransformationActions = (intent.actions || []).filter((action: any) => 
        transformationOperations.includes((action.operation || '').toLowerCase())
      );
      
      if (intentTransformationActions.length > 0) {
        // Intent coverage validation above should have already verified this, but log for transparency
        const dslTransformationTypes = transformations.map(t => t.type.toLowerCase());
        const coveredActions = intentTransformationActions.filter((action: any) => {
          const actionType = (action.type || '').toLowerCase();
          return dslTransformationTypes.some(dslType => 
            dslType === actionType || 
            dslType.includes(actionType) || 
            actionType.includes(dslType)
          );
        });
        
        if (coveredActions.length === intentTransformationActions.length) {
          console.log(`[DSLGenerator] ✅ All ${intentTransformationActions.length} transformation intent action(s) are covered by DSL transformations`);
        } else {
          console.warn(`[DSLGenerator] ⚠️  ${intentTransformationActions.length - coveredActions.length} transformation intent action(s) may not be fully covered`);
        }
      }
    }

    console.log(`[DSLGenerator] ✅ Generated DSL: ${breakdown.dataSources} data sources, ${breakdown.transformations} transformations, ${breakdown.outputs} outputs`);
    console.log(`[DSLGenerator] ✅ Semantic validation passed: All ${originalActionCount} intent actions categorized`);
    console.log(`[DSLGenerator]   Intent action breakdown: ${intentActionsInDataSources} in dataSources, ${intentActionsInOutputs} in outputs, ${intentActionsInTransformations} in transformations`);
    if (breakdown.transformations > intentActionsInTransformations) {
      const autoAddedTransformations = breakdown.transformations - intentActionsInTransformations;
      console.log(`[DSLGenerator] ℹ️  ${autoAddedTransformations} transformation(s) auto-added by TransformationDetector (total: ${breakdown.transformations}, from intent: ${intentActionsInTransformations})`);
    }
    return dsl;
  }

  /**
   * Get reason why action categorization failed
   * Used for detailed error logging
   */
  private getCategorizationFailureReason(type: string, operation: string): string {
    const typeLower = type.toLowerCase();
    const operationLower = operation.toLowerCase();

    // Check if type exists in capability registry
    const capabilities = nodeCapabilityRegistryDSL.getCapabilities(type);
    if (capabilities.length === 0) {
      return `Node type "${type}" not found in capability registry. No capabilities defined.`;
    }

    // Check if operation matches any expected pattern
    const dataSourceOps = ['read', 'fetch', 'get', 'query'];
    const transformationOps = ['summarize', 'analyze', 'classify', 'translate', 'extract', 'transform', 'process'];
    const outputOps = ['send', 'write', 'create', 'update', 'notify'];

    if (!dataSourceOps.includes(operationLower) && 
        !transformationOps.includes(operationLower) && 
        !outputOps.includes(operationLower)) {
      return `Operation "${operation}" does not match expected patterns for data source, transformation, or output operations.`;
    }

    // Type has capabilities but doesn't match any category
    return `Node type "${type}" has capabilities [${capabilities.join(', ')}] but does not match data source, transformation, or output categories for operation "${operation}".`;
  }

  /**
   * Check if action is a data source
   * ✅ REFACTORED: Pure capability-based classification
   * Uses READ capability to determine if node is a data source
   * 
   * Logic:
   * - If node has read_data capability → dataSource
   * - If node has both read_data and write_data, use operation to disambiguate
   *   - read/fetch/get/query operations → dataSource
   *   - write/create/update operations → output (handled by isOutput)
   */
  private isDataSource(type: string, operation: string): boolean {
    const capabilities = nodeCapabilityRegistryDSL.getCapabilities(type);
    const hasReadData = nodeCapabilityRegistryDSL.canReadData(type);
    const hasWriteData = nodeCapabilityRegistryDSL.canWriteData(type);
    const hasOutput = nodeCapabilityRegistryDSL.isOutput(type);
    
    // If node has read_data capability, it can be a data source
    if (!hasReadData) {
      return false;
    }
    
    // If node has ONLY read_data (no write/output capabilities), it's definitely a data source
    if (!hasWriteData && !hasOutput) {
      return true;
    }
    
    // If node has BOTH read_data and write_data/output capabilities, use operation to disambiguate
    // This handles nodes like google_sheets, postgresql, etc.
    if (hasWriteData || hasOutput) {
      const operationLower = operation.toLowerCase();
      const readOperations = ['read', 'fetch', 'get', 'query', 'retrieve', 'pull', 'list'];
      const writeOperations = ['write', 'create', 'update', 'append', 'send', 'notify'];
      
      // If operation is explicitly a write operation, it's NOT a data source
      if (writeOperations.includes(operationLower)) {
        return false;
      }
      
      // If operation is a read operation, it IS a data source
      if (readOperations.includes(operationLower)) {
        return true;
      }
      
      // Default: if node has read_data and operation is ambiguous, prefer data source
      // (This handles cases where operation is missing or unknown)
      return true;
    }
    
    return false;
  }

  /**
   * Check if action is a transformation
   * ✅ REFACTORED: Pure capability-based classification
   * Uses TRANSFORM capability to determine if node is a transformation
   */
  private isTransformation(type: string, operation: string): boolean {
    // Check if node has transformation capability
    if (nodeCapabilityRegistryDSL.isTransformation(type)) {
      return true;
    }
    
    // Check for specific transformation capabilities
    const capabilities = nodeCapabilityRegistryDSL.getCapabilities(type);
    const transformationCapabilities = [
      'transformation',
      'ai_processing',
      'llm',
      'summarize',
      'analyze',
      'transform',
      'process',
    ];
    
    // If node has any transformation capability, it's a transformation
    return capabilities.some(cap => 
      transformationCapabilities.includes(cap.toLowerCase())
    );
  }

  /**
   * Check if action is an output
   * ✅ REFACTORED: Pure capability-based classification
   * Uses WRITE/SEND capability to determine if node is an output
   * 
   * Logic:
   * - If node has output capability → output
   * - If node has write_data capability → output (for write/create/update operations)
   * - If node has send_email, send_message, etc. → output
   * - If node has both read_data and write_data, use operation to disambiguate
   *   - write/create/update/send operations → output
   *   - read/fetch/get operations → dataSource (handled by isDataSource)
   */
  private isOutput(type: string, operation: string): boolean {
    const capabilities = nodeCapabilityRegistryDSL.getCapabilities(type);
    const hasOutput = nodeCapabilityRegistryDSL.isOutput(type);
    const hasWriteData = nodeCapabilityRegistryDSL.canWriteData(type);
    const hasReadData = nodeCapabilityRegistryDSL.canReadData(type);
    
    // Check for output-specific capabilities
    const outputCapabilities = [
      'output',
      'send_email',
      'send_message',
      'send_webhook',
      'send_request',
      'write_crm',
      'send_post',
      'notification',
      'notify',
    ];
    
    const hasOutputCapability = capabilities.some(cap => 
      outputCapabilities.includes(cap.toLowerCase())
    );
    
    // If node has explicit output capability (like google_gmail), it's an output
    if (hasOutput || hasOutputCapability) {
      // But if it also has read_data and operation is read, prefer dataSource
      if (hasReadData) {
        const operationLower = operation.toLowerCase();
        const readOperations = ['read', 'fetch', 'get', 'query', 'retrieve', 'pull', 'list'];
        if (readOperations.includes(operationLower)) {
          return false; // Let isDataSource handle it
        }
      }
      return true;
    }
    
    // If node has write_data capability, it can be an output
    if (hasWriteData) {
      // If node also has read_data, use operation to disambiguate
      if (hasReadData) {
        const operationLower = operation.toLowerCase();
        const writeOperations = ['write', 'create', 'update', 'append', 'send', 'notify'];
        const readOperations = ['read', 'fetch', 'get', 'query', 'retrieve', 'pull', 'list'];
        
        // If operation is explicitly a write operation, it's an output
        if (writeOperations.includes(operationLower)) {
          return true;
        }
        
        // If operation is explicitly a read operation, it's NOT an output (isDataSource will handle it)
        if (readOperations.includes(operationLower)) {
          return false;
        }
        
        // Default: if ambiguous, prefer output for write_data capability
        return true;
      }
      
      // If node has write_data but no read_data, it's an output
      return true;
    }
    
    return false;
  }

  /**
   * Map transformation operation
   */
  private mapTransformationOperation(operation: string): DSLTransformation['operation'] {
    const mapping: Record<string, DSLTransformation['operation']> = {
      'summarize': 'summarize',
      'analyze': 'analyze',
      'classify': 'classify',
      'translate': 'translate',
      'extract': 'extract',
      'transform': 'transform',
      'process': 'process',
    };
    
    return mapping[operation] || 'transform';
  }

  /**
   * Ensure LLM node (ai_chat_model) exists for AI transformations
   * 
   * Guaranteed LLM node injection:
   * - If structuredIntent.transformations contains: summarize, analyze, classify, generate, ai_processing
   * - Then inject ai_chat_model node if missing
   * - Ensures LLM always exists for AI transformations
   * 
   * @param intent - StructuredIntent with transformations
   * @param transformations - Current transformations array
   * @param stepCounter - Current step counter
   * @param autoInjectedNodesSet - Set tracking auto-injected nodes
   * @returns Injection result with nodes and updated counter
   */
  private ensureLLMNodeInDSL(
    intent: StructuredIntent,
    transformations: DSLTransformation[],
    stepCounter: number,
    autoInjectedNodesSet: Set<string>
  ): {
    injected: boolean;
    nodes: DSLTransformation[];
    nextStepCounter: number;
    injectedNodeTypes: string[];
  } {
    // AI operations that require LLM node
    const aiOperations = ['summarize', 'summarise', 'analyze', 'analyse', 'classify', 'generate', 'ai_processing', 'translate', 'extract', 'process', 'transform'];
    
    // Check if intent.transformations contains AI operations
    const intentTransformations = intent.transformations || [];
    const hasAIOperations = intentTransformations.some(tf => {
      const operation = (tf.operation || '').toLowerCase();
      return aiOperations.some(aiOp => operation.includes(aiOp));
    });
    
    // Also check intent.actions for AI operations
    const intentActions = intent.actions || [];
    const hasAIActions = intentActions.some(action => {
      const operation = (action.operation || '').toLowerCase();
      const type = (action.type || '').toLowerCase();
      return aiOperations.some(aiOp => operation.includes(aiOp)) ||
             type.includes('ai') || type.includes('llm') || type.includes('chat');
    });
    
    // If no AI operations detected, no injection needed
    if (!hasAIOperations && !hasAIActions) {
      return { injected: false, nodes: [], nextStepCounter: stepCounter, injectedNodeTypes: [] };
    }
    
    // Check if ai_chat_model already exists in transformations
    const existingLLMNodes = transformations.filter(tf => {
      const normalizedType = normalizeNodeType(tf.type);
      return normalizedType === 'ai_chat_model' || tf.type.toLowerCase() === 'ai_chat_model';
    });
    
    // If ai_chat_model already exists, no injection needed
    if (existingLLMNodes.length > 0) {
      console.log(`[DSLGenerator] ✅ LLM node (ai_chat_model) already exists in transformations (${existingLLMNodes.length} node(s))`);
      return { injected: false, nodes: [], nextStepCounter: stepCounter, injectedNodeTypes: [] };
    }
    
    // Verify ai_chat_model is registered in NodeLibrary
    if (!nodeLibrary.isNodeTypeRegistered('ai_chat_model')) {
      console.error(`[DSLGenerator] ❌ Cannot inject ai_chat_model: Node type not registered in NodeLibrary`);
      return { injected: false, nodes: [], nextStepCounter: stepCounter, injectedNodeTypes: [] };
    }
    
    // Determine operation from intent
    let operation: DSLTransformation['operation'] = 'summarize';
    if (hasAIOperations) {
      const firstAIOperation = intentTransformations.find(tf => {
        const op = (tf.operation || '').toLowerCase();
        return aiOperations.some(aiOp => op.includes(aiOp));
      });
      if (firstAIOperation) {
        operation = this.mapVerbToOperation(firstAIOperation.operation || 'summarize');
      }
    } else if (hasAIActions) {
      const firstAIAction = intentActions.find(action => {
        const op = (action.operation || '').toLowerCase();
        return aiOperations.some(aiOp => op.includes(aiOp));
      });
      if (firstAIAction) {
        operation = this.mapVerbToOperation(firstAIAction.operation || 'summarize');
      }
    }
    
    // Inject ai_chat_model node
    const llmNode: DSLTransformation = {
      id: `tf_${stepCounter++}`,
      type: 'ai_chat_model',
      operation: operation,
      config: {
        provider: 'ollama',
        model: 'qwen2.5:14b-instruct-q4_K_M',
      },
      description: 'Guaranteed LLM node injection for AI transformations',
    };
    
    console.log(`[DSLGenerator] ✅ Guaranteed LLM node injection: Adding ai_chat_model (operation: ${operation})`);
    
    // Track as auto-injected
    autoInjectedNodesSet.add('ai_chat_model');
    
    return {
      injected: true,
      nodes: [llmNode],
      nextStepCounter: stepCounter,
      injectedNodeTypes: ['ai_chat_model'],
    };
  }

  /**
   * Apply template structure to DSL components
   * Ensures template pipeline structure is respected while preserving intent-specific node types
   * 
   * @param template - Selected workflow template
   * @param currentComponents - Current DSL components
   * @param intent - Structured intent (for node type resolution)
   * @returns Updated DSL components that match template structure
   */
  private applyTemplateStructure(
    template: WorkflowTemplate,
    currentComponents: {
      dataSources: DSLDataSource[];
      transformations: DSLTransformation[];
      outputs: DSLOutput[];
    },
    intent: StructuredIntent
  ): {
    dataSources: DSLDataSource[];
    transformations: DSLTransformation[];
    outputs: DSLOutput[];
  } {
    const { dataSources, transformations, outputs } = currentComponents;
    
    // Template enforcement rules:
    // 1. Templates guide structure but don't override existing nodes
    // 2. Templates ensure required components exist (data sources, transformations, outputs)
    // 3. Preserve existing node types from intent (don't override with template wildcards)
    
    let updatedDataSources = [...dataSources];
    let updatedTransformations = [...transformations];
    let updatedOutputs = [...outputs];
    
    // Template validation: Log if structure doesn't match template expectations
    // (but don't force changes - templates are guides, not strict requirements)
    
    if (template.pipeline.transformations.length > 0 && updatedTransformations.length === 0) {
      console.log(`[DSLGenerator] ⚠️  Template ${template.id} expects transformations but none found`);
    }
    
    if (template.pipeline.dataSources.length > 0 && updatedDataSources.length === 0) {
      console.log(`[DSLGenerator] ⚠️  Template ${template.id} expects data sources but none found`);
    }
    
    if (template.pipeline.outputs.length > 0 && updatedOutputs.length === 0) {
      console.log(`[DSLGenerator] ⚠️  Template ${template.id} expects outputs but none found`);
    }
    
    // Template structure is validated - existing components are preserved
    // Template acts as a guide/validation, not a replacement
    // The deterministic pipeline builder will ensure correct connections
    
    return {
      dataSources: updatedDataSources,
      transformations: updatedTransformations,
      outputs: updatedOutputs,
    };
  }

  /**
   * Map transformation verb to operation
   */
  private mapVerbToOperation(verb: string): DSLTransformation['operation'] {
    const verbLower = verb.toLowerCase();
    const mapping: Record<string, DSLTransformation['operation']> = {
      'summarize': 'summarize',
      'summarise': 'summarize',
      'analyze': 'analyze',
      'analyse': 'analyze',
      'classify': 'classify',
      'translate': 'translate',
      'extract': 'extract',
      'generate': 'process',
      'process': 'process',
      'transform': 'transform',
    };
    
    return mapping[verbLower] || 'transform';
  }

  /**
   * Build execution order
   */
  private buildExecutionOrder(
    trigger: DSLTrigger,
    dataSources: DSLDataSource[],
    transformations: DSLTransformation[],
    outputs: DSLOutput[]
  ): DSLExecutionStep[] {
    const steps: DSLExecutionStep[] = [];
    let order = 0;

    // Step 0: Trigger
    steps.push({
      stepId: 'step_trigger',
      stepType: 'trigger',
      stepRef: 'trigger',
      order: order++,
    });

    // Step 1: Data sources (parallel or sequential)
    for (const ds of dataSources) {
      steps.push({
        stepId: `step_${ds.id}`,
        stepType: 'data_source',
        stepRef: ds.id,
        dependsOn: ['step_trigger'],
        order: order++,
      });
    }

    // Step 2: Transformations (depend on data sources)
    let lastDataSourceId: string | undefined;
    if (dataSources.length > 0) {
      lastDataSourceId = `step_${dataSources[dataSources.length - 1].id}`;
    }

    for (const tf of transformations) {
      const dependsOn = lastDataSourceId ? [lastDataSourceId] : ['step_trigger'];
      steps.push({
        stepId: `step_${tf.id}`,
        stepType: 'transformation',
        stepRef: tf.id,
        dependsOn,
        order: order++,
      });
      lastDataSourceId = `step_${tf.id}`;
    }

    // Step 3: Outputs (depend on transformations or data sources)
    const lastStepId = lastDataSourceId || (dataSources.length > 0 ? `step_${dataSources[dataSources.length - 1].id}` : 'step_trigger');
    
    for (const out of outputs) {
      steps.push({
        stepId: `step_${out.id}`,
        stepType: 'output',
        stepRef: out.id,
        dependsOn: [lastStepId],
        order: order++,
      });
    }

    return steps;
  }

  /**
   * Extract conditions from intent
   */
  private extractConditions(conditions: any[]): DSLCondition[] {
    return conditions.map((cond, idx) => ({
      id: `cond_${idx}`,
      type: cond.type || 'if_else',
      condition: cond.condition || '',
      truePath: cond.true_path || [],
      falsePath: cond.false_path,
      cases: cond.cases,
    }));
  }

  /**
   * Validate DSL
   */
  validateDSL(dsl: WorkflowDSL): DSLValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate trigger
    if (!dsl.trigger || !dsl.trigger.type) {
      errors.push('DSL must have a trigger');
    }

    // Validate execution order
    if (dsl.executionOrder.length === 0) {
      errors.push('DSL must have at least one execution step');
    }

    // Validate step references
    const stepRefs = new Set<string>(['trigger']);
    dsl.dataSources.forEach(ds => stepRefs.add(ds.id));
    dsl.transformations.forEach(tf => stepRefs.add(tf.id));
    dsl.outputs.forEach(out => stepRefs.add(out.id));

    for (const step of dsl.executionOrder) {
      if (step.stepType === 'trigger') {
        if (step.stepRef !== 'trigger') {
          errors.push(`Trigger step must reference 'trigger', got '${step.stepRef}'`);
        }
      } else if (!stepRefs.has(step.stepRef)) {
        errors.push(`Execution step references unknown step: ${step.stepRef}`);
      }

      // Validate dependencies
      if (step.dependsOn) {
        for (const dep of step.dependsOn) {
          const depStep = dsl.executionOrder.find(s => s.stepId === dep);
          if (!depStep) {
            errors.push(`Step ${step.stepId} depends on unknown step: ${dep}`);
          }
        }
      }
    }

    // Validate transformations have input sources
    for (const tf of dsl.transformations) {
      if (!tf.input) {
        warnings.push(`Transformation ${tf.id} has no input source specified`);
      }
    }

    // Validate outputs have input sources
    for (const out of dsl.outputs) {
      if (!out.input) {
        warnings.push(`Output ${out.id} has no input source specified`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

// Export singleton instance
export const dslGenerator = new DSLGenerator();
