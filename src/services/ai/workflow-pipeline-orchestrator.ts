/**
 * Workflow Pipeline Orchestrator
 * 
 * Orchestrates the strict pipeline:
 * 1. Prompt → Structured Intent
 * 2. Structured Intent → Workflow Structure
 * 3. Detect Required Credentials
 * 4. Inject Credentials into Workflow
 * 5. Policy Enforcement
 * 6. AI Validator (final safety layer)
 */

import { intentStructurer, StructuredIntent } from './intent-structurer';
import { workflowStructureBuilder, WorkflowStructure } from './workflow-structure-builder';
import { repairEngine } from './repair-engine';
import { intentCompletenessValidator } from './intent-completeness-validator';
import { intentAutoExpander, ExpandedIntent } from './intent-auto-expander';
import { intentConfidenceScorer, IntentConfidenceScore } from './intent-confidence-scorer';
import { credentialDetector, CredentialDetectionResult } from './credential-detector';
import { credentialInjector, CredentialInjectionResult } from './credential-injector';
import { workflowPolicyEnforcerV2 } from './workflow-policy-enforcer-v2';
import { aiWorkflowValidator } from './ai-workflow-validator';
import { workflowConfirmationManager, WorkflowState, WorkflowConfirmationRequest } from './workflow-confirmation-manager';
import { workflowExplanationService, WorkflowExplanation } from './workflow-explanation-service';
import { WorkflowNode, WorkflowEdge, Workflow, WorkflowGenerationStructure } from '../../core/types/ai-types';
import { nodeLibrary } from '../nodes/node-library';
import { validateAndFixEdgeHandles, getNodeHandleContract, resolveSourceHandleDynamically, resolveTargetHandleDynamically } from '../../core/utils/node-handle-registry';
import { resolveCompatibleHandles } from './schema-driven-connection-resolver';
import { enhancedEdgeCreationService } from './enhanced-edge-creation-service';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { randomUUID } from 'crypto';
import { nodeTypeNormalizationService } from './node-type-normalization-service';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { graphBranchingValidator } from '../../core/validation/graph-branching-validator';
import { semanticConnectionValidator } from '../../core/validation/semantic-connection-validator';
// ✅ ERROR PREVENTION: Import universal validators
import { edgeCreationValidator, universalHandleResolver, universalCategoryResolver } from '../../core/error-prevention';

// Configuration: Execution modes
export enum ExecutionMode {
  /**
   * SAFE_MODE (default): Always require user confirmation before workflow execution
   */
  SAFE_MODE = 'SAFE_MODE',
  
  /**
   * FAST_MODE: Note - Auto-confirmation disabled. All workflows require explicit user confirmation.
   */
  FAST_MODE = 'FAST_MODE',
}

/**
 * Get execution mode from environment variable
 * Default: SAFE_MODE
 */
function getExecutionMode(): ExecutionMode {
  const mode = process.env.WORKFLOW_EXECUTION_MODE?.toUpperCase();
  if (mode === 'FAST_MODE' || mode === 'FAST') {
    return ExecutionMode.FAST_MODE;
  }
  return ExecutionMode.SAFE_MODE; // Default
}

const EXECUTION_MODE = getExecutionMode();
// Note: AUTO_CONFIRM_EXPANDED_INTENT removed - confirmation always required

/**
 * Default trigger policy (shared with IntentStructurer fallbacks)
 * - Prefer explicit triggers mentioned by user
 * - Otherwise default to schedule for automation prompts
 */
function inferDefaultTrigger(userPrompt: string): 'schedule' | 'webhook' | 'form' | 'chat_trigger' | 'manual_trigger' {
  const p = (userPrompt || '').toLowerCase();
  if (p.includes('webhook') || p.includes('http request') || p.includes('api call')) return 'webhook';
  if (p.includes('form') || p.includes('submitted') || p.includes('submission')) return 'form';
  if (p.includes('chat') || p.includes('bot')) return 'chat_trigger';
  if (p.includes('manual') || p.includes('on demand') || p.includes('run now') || p.includes('click a button')) return 'manual_trigger';
  return 'schedule';
}

function inferDefaultScheduleConfig(userPrompt: string): { interval: string; cron: string; timezone: string } {
  const p = (userPrompt || '').toLowerCase();
  const interval =
    p.includes('hourly') ? 'hourly' :
    p.includes('weekly') ? 'weekly' :
    p.includes('monthly') ? 'monthly' :
    'daily';
  const cron =
    interval === 'hourly' ? '0 * * * *' :
    interval === 'weekly' ? '0 9 * * 1' :
    interval === 'monthly' ? '0 9 1 * *' :
    '0 9 * * *';
  return { interval, cron, timezone: 'UTC' };
}

export interface PipelineAnalysis {
  /**
   * Normalized, machine-readable representation of the user prompt
   */
  structuredPrompt: StructuredIntent;
  /**
   * ID of the matched sample workflow (if any)
   */
  matchedSampleId?: string;
  /**
   * Whether structure came from a sample or was built from scratch
   */
  origin: 'sample' | 'scratch';
  /**
   * High-level node list from the intermediate structure phase
   */
  nodes: WorkflowStructure['nodes'];
  /**
   * High-level connections from the intermediate structure phase
   */
  connections: WorkflowStructure['connections'];
  /**
   * Any actions from the structured prompt that are not yet represented as nodes
   */
  missingNodes: Array<{
    type: string;
    operation: string;
    reason: string;
  }>;
}

/**
 * Pipeline Context - stores intent processing state
 */
export interface PipelineContext {
  /**
   * Original user prompt
   */
  original_prompt: string;
  
  /**
   * Structured intent from intent structurer
   */
  structured_intent: StructuredIntent;
  
  /**
   * Expanded intent (if confidence < 0.9)
   */
  expanded_intent?: ExpandedIntent;
  
  /**
   * Confidence score (0-1)
   */
  confidence_score: number;
  
  /**
   * Whether user confirmation is required
   */
  requires_confirmation: boolean;
  
  /**
   * Detailed confidence score breakdown
   */
  confidence_breakdown?: IntentConfidenceScore;
  
  /**
   * Clarification questions (if confidence < 0.8)
   */
  clarification_questions?: string[];
  
  /**
   * Missing intent fields
   */
  missing_fields?: string[];
  
  /**
   * Inference reasoning (for vague prompts)
   */
  inference_reasoning?: string;
}

export interface PipelineResult {
  success: boolean;
  workflow?: Workflow;
  structuredIntent?: StructuredIntent;
  credentialDetection?: CredentialDetectionResult;
  /**
   * Analysis snapshot for UX (analysis page, debugging, etc.)
   */
  analysis?: PipelineAnalysis;
  /**
   * Pipeline context with intent processing state
   */
  pipelineContext?: PipelineContext;
  /**
   * Structured workflow explanation
   */
  workflowExplanation?: WorkflowExplanation;
  /**
   * Workflow state (state machine)
   */
  workflowState?: WorkflowState;
  /**
   * Workflow ID for confirmation tracking
   */
  workflowId?: string;
  /**
   * Confirmation request (if waiting for confirmation)
   */
  confirmationRequest?: WorkflowConfirmationRequest;
  /**
   * Whether pipeline is waiting for user confirmation
   */
  waitingForConfirmation?: boolean;
  errors: string[];
  warnings: string[];
  requiresCredentials?: boolean;
  expandedIntent?: ExpandedIntent;
  /**
   * Error explanation for UI (human-readable error message)
   */
  errorExplanation?: string;
  /**
   * Whether workflow can be regenerated (allows retry)
   */
  canRegenerate?: boolean;
  /**
   * Clarification required flag (legacy, kept for compatibility)
   */
  clarificationRequired?: boolean;
  /**
   * Clarification questions (if confidence < 0.8)
   */
  clarificationQuestions?: string[];
  /**
   * Confidence score for prompt understanding
   */
  confidenceScore?: IntentConfidenceScore;
}

export class WorkflowPipelineOrchestrator {
  // ✅ FIXED: Build phase guard to prevent re-entry during build
  private isBuilding = false;
  private buildPromise: Promise<PipelineResult> | null = null;
  
  /**
   * Format structured explanation for confirmation UI
   */
  private formatExplanationForConfirmation(explanation: WorkflowExplanation): string {
    const parts: string[] = [];

    // Goal
    parts.push(`## Workflow Goal\n${explanation.goal}\n`);

    // Trigger
    parts.push(`## Trigger\n${explanation.trigger.description}\n`);

    // Services Used
    if (explanation.services_used.length > 0) {
      parts.push(`## Services Used\n${explanation.services_used.join(', ')}\n`);
    }

    // Steps
    if (explanation.steps.length > 0) {
      parts.push(`## Workflow Steps\n`);
      explanation.steps.forEach((step, index) => {
        const assumptionMarker = step.is_ai_assumption ? ' ⚠️ (AI Assumption)' : '';
        parts.push(`${step.step_number}. **${step.description}**${assumptionMarker}`);
        
        if (step.tool_used) {
          parts.push(`   - Tool: ${step.tool_used}`);
        }
        
        if (step.tool_reasoning) {
          parts.push(`   - Reasoning: ${step.tool_reasoning}`);
        }
        
        if (step.input_sources.length > 0) {
          parts.push(`   - Input from: ${step.input_sources.join(', ')}`);
        }
        
        if (step.output_data.length > 0) {
          parts.push(`   - Output: ${step.output_data.join(', ')}`);
        }
        
        parts.push(''); // Empty line between steps
      });
    }

    // Data Flow
    parts.push(`## Data Flow\n${explanation.data_flow.description}\n`);

    // Assumptions
    if (explanation.assumptions.length > 0) {
      parts.push(`## AI Assumptions\n`);
      explanation.assumptions.forEach((assumption, index) => {
        const confirmationMarker = assumption.requires_confirmation ? ' ⚠️ (Requires Confirmation)' : '';
        parts.push(`${index + 1}. **${assumption.assumption}**${confirmationMarker}`);
        parts.push(`   - Reasoning: ${assumption.reasoning}`);
        parts.push('');
      });
    }

    return parts.join('\n');
  }

  /**
   * Generate workflow explanation for confirmation (legacy method - kept for compatibility)
   */
  private generateWorkflowExplanation(
    workflow: Workflow,
    structuredIntent: StructuredIntent,
    expandedIntent?: ExpandedIntent | null,
    confidenceScore?: IntentConfidenceScore
  ): string {
    const parts: string[] = [];

    // Add expanded intent if available
    if (expandedIntent?.expanded_intent) {
      parts.push(`**Expanded Intent**:\n${expandedIntent.expanded_intent}\n`);
    }

    // Add workflow summary
    parts.push(`**Workflow Summary**:`);
    parts.push(`- Trigger: ${structuredIntent.trigger || 'manual_trigger'}`);
    parts.push(`- Nodes: ${workflow.nodes?.length || 0}`);
    parts.push(`- Edges: ${workflow.edges?.length || 0}`);

    // Add confidence score if available
    if (confidenceScore) {
      parts.push(`\n**Confidence Score**: ${(confidenceScore.confidence_score * 100).toFixed(1)}%`);
      if (confidenceScore.analysis.recommendations.length > 0) {
        parts.push(`\n**Recommendations**:`);
        confidenceScore.analysis.recommendations.forEach(rec => {
          parts.push(`- ${rec}`);
        });
      }
    }

    // Add node list
    if (workflow.nodes && workflow.nodes.length > 0) {
      parts.push(`\n**Nodes**:`);
      workflow.nodes.forEach((node, index) => {
        const nodeType = unifiedNormalizeNodeType(node);
        const label = node.data?.label || nodeType;
        parts.push(`${index + 1}. ${label} (${nodeType})`);
      });
    }

    return parts.join('\n');
  }

  /**
   * Execute the complete pipeline (up to confirmation stage)
   * ✅ FIXED: Prevents re-entry during build phase - pipeline runs: understand → plan → build → done
   */
  async executePipeline(
    userPrompt: string,
    existingCredentials?: Record<string, any>,
    providedCredentials?: Record<string, Record<string, any>>,
    options?: {
      mode?: 'analyze' | 'build';
      onProgress?: (step: number, stepName: string, progress: number, details?: any) => void;
    }
  ): Promise<PipelineResult> {
    // ✅ FIXED: Prevent re-entry during build phase
    if (this.isBuilding && this.buildPromise) {
      console.warn(`[PipelineOrchestrator] ⚠️  Build already in progress, returning existing promise (preventing re-entry)`);
      return this.buildPromise;
    }
    
    // ✅ FIXED: Prevent concurrent execution
    if (this.isBuilding) {
      throw new Error('Pipeline is already building. Pipeline must run: understand → plan → build → done. Planner must run only once per request.');
    }
    
    this.isBuilding = true;
    const promptKey = userPrompt.substring(0, 200); // Use first 200 chars as key
    
    // Create promise and store it
    this.buildPromise = this.executePipelineInternal(userPrompt, existingCredentials, providedCredentials, options);
    
    try {
      const result = await this.buildPromise;
      return result;
    } finally {
      // Clean up after build completes
      this.isBuilding = false;
      this.buildPromise = null;
    }
  }
  
  /**
   * Execute pipeline (internal method)
   * ✅ FIXED: Separated from executePipeline to enable re-entry prevention
   */
  private async executePipelineInternal(
    userPrompt: string,
    existingCredentials?: Record<string, any>,
    providedCredentials?: Record<string, Record<string, any>>,
    options?: {
      mode?: 'analyze' | 'build';
      onProgress?: (step: number, stepName: string, progress: number, details?: any) => void;
    }
  ): Promise<PipelineResult> {
    console.log(`[PipelineOrchestrator] Starting pipeline for prompt: "${userPrompt}"`);

    const errors: string[] = [];
    const warnings: string[] = [];

    const mode: 'analyze' | 'build' = options?.mode || 'build';
    const onProgress = options?.onProgress;

    try {
      // STEP 0.5: Prompt Understanding (for vague prompts)
      console.log(`[PipelineOrchestrator] STEP 0.5: Understanding prompt (checking for vagueness)`);
      onProgress?.(0.5, 'Understanding Prompt', 61, { message: 'Analyzing prompt for understanding...' });
      
      let promptUnderstanding: any = null;
      try {
        const { understandPrompt } = await import('./prompt-understanding-service');
        promptUnderstanding = await understandPrompt(userPrompt);
        
        console.log(`[PipelineOrchestrator] ✅ Prompt understanding complete:`);
        console.log(`  - Confidence: ${(promptUnderstanding.confidence * 100).toFixed(1)}%`);
        console.log(`  - Missing fields: ${promptUnderstanding.missingFields.join(', ') || 'none'}`);
        console.log(`  - Requires clarification: ${promptUnderstanding.requiresClarification}`);
        
        // ✅ FIXED: Updated build gating logic
        // - confidence >= 0.6 → allow build (tolerate partial understanding)
        // - confidence < 0.5 → block build (require clarification)
        // - 0.5 <= confidence < 0.6 → allow build with warnings
        const confidence = promptUnderstanding.confidence;
        const BUILD_ALLOWED_THRESHOLD = 0.6;
        const BLOCK_BUILD_THRESHOLD = 0.5;
        
        if (confidence < BLOCK_BUILD_THRESHOLD) {
          // ✅ ROOT-LEVEL FIX: When confidence is low, use intentAutoExpander instead of blocking
          // Clarification stage is disabled, so we must proceed with expansion
          console.log(`[PipelineOrchestrator] ⚠️  Confidence too low (${(confidence * 100).toFixed(1)}% < 50%) - using intentAutoExpander as fallback (clarification disabled)`);
          
          const inferredIntent = promptUnderstanding.inferredIntent;
          
          // ✅ FIXED: Ensure trigger exists (default to manual_trigger)
          if (!inferredIntent.trigger) {
            inferredIntent.trigger = 'manual_trigger';
            console.log(`[PipelineOrchestrator] ✅ Defaulting to manual_trigger (trigger was missing)`);
          }
          
          // ✅ ROOT-LEVEL FIX: Use intentAutoExpander to expand the low-confidence intent
          // This allows workflow generation to proceed even with low confidence
          try {
            console.log(`[PipelineOrchestrator] 🔄 Attempting to expand low-confidence intent using intentAutoExpander...`);
            const expandedIntent = await intentAutoExpander.expandIntent(userPrompt, inferredIntent, confidence);
            
            if (expandedIntent && expandedIntent.assumed_actions && expandedIntent.assumed_actions.length > 0) {
              // Apply expanded actions to structured intent
              inferredIntent.actions = expandedIntent.assumed_actions.map(actionStr => {
                const [type, operation] = actionStr.split(':');
                return {
                  type: type,
                  operation: operation || 'read',
                  description: `${operation} using ${type}`,
                };
              });
              
              console.log(`[PipelineOrchestrator] ✅ Expanded intent successfully: ${inferredIntent.actions.length} actions added`);
              
              // Update trigger if expanded intent has one
              if (expandedIntent.assumed_trigger && !inferredIntent.trigger) {
                inferredIntent.trigger = expandedIntent.assumed_trigger;
              }
              
              // Continue with pipeline using expanded intent
              // Don't return early - let pipeline continue with expanded intent
              warnings.push(`Low confidence (${(confidence * 100).toFixed(1)}%) - used intent expansion to proceed`);
            } else {
              // Expansion failed or returned no actions - log warning but continue
              console.warn(`[PipelineOrchestrator] ⚠️  Intent expansion returned no actions, continuing with original intent`);
              warnings.push(`Low confidence (${(confidence * 100).toFixed(1)}%) and expansion failed - proceeding with minimal intent`);
            }
          } catch (expansionError) {
            // Expansion failed - log error but continue with original intent
            const errorMsg = expansionError instanceof Error ? expansionError.message : 'Unknown expansion error';
            console.error(`[PipelineOrchestrator] ❌ Intent expansion failed: ${errorMsg}`);
            warnings.push(`Low confidence (${(confidence * 100).toFixed(1)}%) and expansion failed - proceeding with minimal intent`);
          }
          
          // Store pipeline context
          const pipelineContext: PipelineContext = {
            original_prompt: userPrompt,
            structured_intent: inferredIntent,
            confidence_score: confidence,
            requires_confirmation: true,
            clarification_questions: promptUnderstanding.clarificationQuestions,
            missing_fields: promptUnderstanding.missingFields,
            inference_reasoning: promptUnderstanding.reasoning,
          };
          
          // ✅ ROOT-LEVEL FIX: Don't block - continue with pipeline using expanded/minimal intent
          // The pipeline will continue and attempt to build the workflow
          // This prevents "Unknown pipeline error" when clarification is disabled
        } else if (confidence >= BUILD_ALLOWED_THRESHOLD) {
          // High confidence (>= 60%) - allow build, use inferred intent directly
          console.log(`[PipelineOrchestrator] ✅ High confidence (${(confidence * 100).toFixed(1)}% >= 60%) - allowing build with inferred intent`);
        } else {
          // Medium confidence (50% - 60%) - allow build but with warnings
          console.log(`[PipelineOrchestrator] ⚠️  Medium confidence (${(confidence * 100).toFixed(1)}% in range 50-60%) - allowing build with warnings (tolerating partial understanding)`);
          warnings.push(`Medium confidence (${(confidence * 100).toFixed(1)}%) - workflow may need refinement`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during prompt understanding';
        console.warn(`[PipelineOrchestrator] ⚠️  Prompt understanding failed: ${errorMessage}`);
        // Continue with normal intent structuring
      }
      
      // STEP 1: Prompt → Structured Intent
      console.log(`[PipelineOrchestrator] STEP 1: Converting prompt to structured intent`);
      onProgress?.(1, 'Analyzing Intent', 62, { message: 'Converting prompt to structured intent...' });
      
      // ✅ NEW ARCHITECTURE (PRIMARY): SimpleIntent → Intent-Aware Planner → StructuredIntent
      // This is the PRIMARY path according to World-Class Architecture Upgrade Plan
      let structuredIntent: StructuredIntent | undefined = undefined;
      let plannerSpec: any = undefined;
      
      // ✅ PRIMARY PATH: Use SimpleIntent extraction + Intent-Aware Planner
      try {
        console.log(`[PipelineOrchestrator] ✅ Using NEW ARCHITECTURE: SimpleIntent → Intent-Aware Planner (PRIMARY)`);
        
        // ✅ PHASE 2 + PHASE 4: Extract SimpleIntent with guardrails and error recovery
        const { intentExtractor } = await import('./intent-extractor');
        const simpleIntentResult = await intentExtractor.extractIntent(userPrompt);
        
        // ✅ PHASE 4: Validate SimpleIntent with Output Validator
        const { outputValidator } = await import('./output-validator');
        const outputValidation = outputValidator.validateSimpleIntent(simpleIntentResult.intent);
        
        if (!outputValidation.valid) {
          console.warn(`[PipelineOrchestrator] ⚠️  SimpleIntent validation failed: ${outputValidation.errors.join(', ')}`);
        }
        
        // Step 2: Validate SimpleIntent (Phase 2)
        const { intentValidator } = await import('./intent-validator');
        const validation = intentValidator.validate(simpleIntentResult.intent);
        
        // Step 3: Repair SimpleIntent if needed (Phase 2)
        let finalSimpleIntent = simpleIntentResult.intent;
        if (!validation.valid) {
          const { intentRepairEngine } = await import('./intent-repair-engine');
          const repairResult = intentRepairEngine.repair(simpleIntentResult.intent, validation, userPrompt);
          finalSimpleIntent = repairResult.repairedIntent;
          console.log(`[PipelineOrchestrator] ✅ Repaired SimpleIntent: ${repairResult.repairs.length} repairs made`);
          
          // ✅ PHASE 4: Re-validate after repair
          const repairedValidation = outputValidator.validateSimpleIntent(finalSimpleIntent);
          if (!repairedValidation.valid) {
            console.warn(`[PipelineOrchestrator] ⚠️  Repaired SimpleIntent still has issues: ${repairedValidation.errors.join(', ')}`);
          }
        }
        
        // Step 4: Check for template match
        const { templateBasedGenerator } = await import('./template-based-generator');
        const templateMatch = templateBasedGenerator.matchTemplate(finalSimpleIntent);
        
        if (templateMatch.template && templateMatch.confidence >= 0.7) {
          // Use template
          console.log(`[PipelineOrchestrator] ✅ Template matched: ${templateMatch.template.name} (confidence: ${(templateMatch.confidence * 100).toFixed(1)}%)`);
          structuredIntent = templateBasedGenerator.generateFromTemplate(templateMatch.template, finalSimpleIntent);
        } else {
          // Step 5: Use Intent-Aware Planner to build StructuredIntent
          const { intentAwarePlanner } = await import('./intent-aware-planner');
          const planningResult = await intentAwarePlanner.planWorkflow(finalSimpleIntent, userPrompt);
          
          if (planningResult.errors.length === 0) {
            // ✅ PHASE 4: Validate StructuredIntent with Output Validator
            const structuredValidation = outputValidator.validateStructuredIntent(planningResult.structuredIntent);
            
            if (structuredValidation.valid) {
              structuredIntent = planningResult.structuredIntent;
              console.log(`[PipelineOrchestrator] ✅ Intent-Aware Planner generated StructuredIntent: ${planningResult.nodeRequirements.length} nodes, execution order: ${planningResult.executionOrder.length} steps`);
            } else {
              console.warn(`[PipelineOrchestrator] ⚠️  StructuredIntent validation failed: ${structuredValidation.errors.join(', ')}`);
              // Try error recovery
              const { errorRecovery } = await import('./error-recovery');
              const recoveryResult = await errorRecovery.recoverStructuredIntent(finalSimpleIntent, userPrompt);
              if (recoveryResult.success && recoveryResult.result) {
                structuredIntent = recoveryResult.result;
                console.log(`[PipelineOrchestrator] ✅ Recovered StructuredIntent using ${recoveryResult.strategy}`);
              }
            }
          } else {
            console.warn(`[PipelineOrchestrator] ⚠️  Intent-Aware Planner had errors: ${planningResult.errors.join(', ')}`);
            // ✅ PHASE 4: Try error recovery
            try {
              const { errorRecovery } = await import('./error-recovery');
              const recoveryResult = await errorRecovery.recoverStructuredIntent(finalSimpleIntent, userPrompt);
              if (recoveryResult.success && recoveryResult.result) {
                structuredIntent = recoveryResult.result;
                console.log(`[PipelineOrchestrator] ✅ Recovered StructuredIntent using ${recoveryResult.strategy}`);
              }
            } catch (error) {
              console.warn(`[PipelineOrchestrator] ⚠️  Error recovery failed:`, error);
            }
          }
        }
      } catch (error) {
        console.warn(`[PipelineOrchestrator] ⚠️  New architecture (SimpleIntent → Planner) failed:`, error);
        // Will fall through to fallback paths
      }
      
      // ✅ FALLBACK PATH 1: Check if planner output is available (Smart Planner)
      // This is a fallback if new architecture fails
      if (!structuredIntent) {
        try {
          const { planWorkflowSpecFromPrompt } = await import('./smart-planner-adapter');
          plannerSpec = await planWorkflowSpecFromPrompt(userPrompt);
          if (plannerSpec) {
            console.log(`[PipelineOrchestrator] ✅ Fallback: Using planner output - converting to StructuredIntent`);
            const { convertPlannerSpecToIntent } = await import('./planner-to-intent-converter');
            structuredIntent = convertPlannerSpecToIntent(plannerSpec);
            console.log(`[PipelineOrchestrator] ✅ Converted planner spec: ${structuredIntent.dataSources?.length || 0} dataSources, ${structuredIntent.actions.length} actions, ${structuredIntent.transformations?.length || 0} transformations`);
          }
        } catch (error) {
          console.warn(`[PipelineOrchestrator] ⚠️  Planner conversion failed (non-fatal):`, error);
        }
      }
      
      // ✅ FALLBACK PATH 2: Use inferred intent if confidence >= 50%
      // Only if new architecture didn't provide intent
      if (!structuredIntent) {
        if (promptUnderstanding && promptUnderstanding.confidence >= 0.5) {
          structuredIntent = promptUnderstanding.inferredIntent;
          console.log(`[PipelineOrchestrator] ✅ Using inferred intent from prompt understanding (confidence: ${(promptUnderstanding.confidence * 100).toFixed(1)}%)`);
        } else {
          // ✅ DEPRECATED: Old intentStructurer (LAST RESORT fallback only)
          // This will be removed in future versions - new architecture should handle all cases
          console.warn(`[PipelineOrchestrator] ⚠️  Using DEPRECATED intentStructurer as last resort fallback`);
          console.warn(`[PipelineOrchestrator] ⚠️  This method will be removed - new architecture should handle all cases`);
          structuredIntent = await intentStructurer.structureIntent(userPrompt);
        }
      }
      
      // ✅ FIXED: Ensure structuredIntent is defined (fallback to minimal intent if all methods failed)
      if (!structuredIntent) {
        console.warn(`[PipelineOrchestrator] ⚠️  All intent extraction methods failed, using minimal intent`);
        const defaultTrigger = inferDefaultTrigger(userPrompt);
        structuredIntent = {
          trigger: defaultTrigger,
          trigger_config: defaultTrigger === 'schedule' ? inferDefaultScheduleConfig(userPrompt) : undefined,
          actions: [],
          requires_credentials: [],
        };
      }
      
      // ✅ FIXED: Ensure trigger exists (default to manual_trigger automatically)
      if (!structuredIntent.trigger) {
        const defaultTrigger = inferDefaultTrigger(userPrompt);
        structuredIntent.trigger = defaultTrigger;
        structuredIntent.trigger_config = structuredIntent.trigger_config || (defaultTrigger === 'schedule' ? inferDefaultScheduleConfig(userPrompt) : undefined);
        console.log(`[PipelineOrchestrator] ✅ Defaulting to ${defaultTrigger} (trigger was missing)`);
        warnings.push(`Trigger not specified, defaulting to ${defaultTrigger}`);
      }

      // STEP 1.5: Validate Intent Completeness
      // Note: Incomplete intents will be handled by intent_auto_expander
      console.log(`[PipelineOrchestrator] STEP 1.5: Validating intent completeness`);
      onProgress?.(1.5, 'Validating Intent', 63, { message: 'Validating intent completeness...' });
      const completenessResult = intentCompletenessValidator.validateIntentCompleteness(structuredIntent, userPrompt);
      
      // Log validation result but don't block - intent_auto_expander will handle incomplete intents
      if (!completenessResult.complete) {
        console.log(`[PipelineOrchestrator] ⚠️  Intent validation: ${completenessResult.reason} - will be expanded by intent_auto_expander`);
        warnings.push(completenessResult.reason || 'Intent validation incomplete - will be expanded');
      }

      // ✅ PERFORMANCE FIX: Removed slow similarity checking (30+ min delay)
      // AI generates workflows from prompts - similarity score not needed
      // Sample workflows are used as few-shot examples only (fast, no matching)
      let similarityScore: number | undefined = undefined;

      // STEP 1.65: Compute Intent Confidence Score
      console.log(`[PipelineOrchestrator] STEP 1.65: Computing intent confidence score`);
      onProgress?.(1.65, 'Computing Confidence', 64.5, { message: 'Computing intent confidence score...' });
      const confidenceScore = await intentConfidenceScorer.computeConfidence(
        structuredIntent,
        userPrompt,
        similarityScore
      );

      // STEP 1.7: Intent Auto Expander - Confidence-based expansion logic
      // This replaces the legacy clarification stage
      console.log(`[PipelineOrchestrator] STEP 1.7: Expanding intent if needed (confidence: ${(confidenceScore.confidence_score * 100).toFixed(1)}%)`);
      onProgress?.(1.7, 'Expanding Intent', 65, { message: 'Expanding intent if needed...' });
      
      let expandedIntent: ExpandedIntent | null = null;
      let requiresConfirmation = false;

      // ✅ Confidence-based expansion rules:
      // - confidence >= 0.75 → do not expand (unless missing critical fields)
      // - 0.5–0.75 → optional expansion (expand if missing fields)
      // - < 0.5 → force expansion
      const confidence = confidenceScore.confidence_score;
      // ✅ FIXED: Don't check for missing trigger - manual_trigger is automatically injected as default
      // Trigger is never missing, so it should not be considered in expansion logic
      const hasMissingActions = !structuredIntent.actions || structuredIntent.actions.length === 0;
      const isIncomplete = !completenessResult.complete;
      
      // Determine expansion strategy based on confidence
      let expansionStrategy: 'none' | 'optional' | 'force';
      if (confidence >= 0.75) {
        expansionStrategy = 'none';
        console.log(`[PipelineOrchestrator] ✅ Confidence ${(confidence * 100).toFixed(1)}% >= 0.75, no expansion needed`);
      } else if (confidence >= 0.5) {
        expansionStrategy = 'optional';
        console.log(`[PipelineOrchestrator] ⚠️  Confidence ${(confidence * 100).toFixed(1)}% in range 0.5-0.75, optional expansion`);
      } else {
        expansionStrategy = 'force';
        console.log(`[PipelineOrchestrator] ❌ Confidence ${(confidence * 100).toFixed(1)}% < 0.5, forcing expansion`);
      }
      
      // Determine if expansion should occur
      let shouldExpand = false;
      let expansionReason = '';
      
      if (expansionStrategy === 'force') {
        // Force expansion for low confidence
        shouldExpand = true;
        expansionReason = `Low confidence (${(confidence * 100).toFixed(1)}% < 0.5)`;
      } else if (expansionStrategy === 'optional') {
        // Optional expansion: expand if missing critical fields
        // ✅ FIXED: Don't check for missing trigger - manual_trigger is automatically injected
        if (hasMissingActions || isIncomplete) {
          shouldExpand = true;
          const missingFields: string[] = [];
          if (hasMissingActions) missingFields.push('actions');
          if (isIncomplete) missingFields.push('completeness');
          expansionReason = `Optional expansion due to missing fields: ${missingFields.join(', ')}`;
        } else {
          shouldExpand = false;
          expansionReason = 'Confidence 0.5-0.75 but all fields present, skipping expansion';
        }
      } else {
        // No expansion for high confidence (unless critical fields missing)
        // ✅ FIXED: Don't check for missing trigger - manual_trigger is automatically injected
        if (hasMissingActions) {
          // Even with high confidence, expand if critical fields are missing
          shouldExpand = true;
          const missingFields: string[] = [];
          if (hasMissingActions) missingFields.push('actions');
          expansionReason = `High confidence but missing critical fields: ${missingFields.join(', ')}`;
        } else {
          shouldExpand = false;
          expansionReason = 'High confidence and all fields present, no expansion needed';
        }
      }
      
      if (shouldExpand) {
        console.log(`[PipelineOrchestrator] ⚠️  Triggering expansion: ${expansionReason}`);
        expandedIntent = await intentAutoExpander.expandIntent(userPrompt, structuredIntent, similarityScore);
        
        // ✅ CRITICAL: Apply expanded intent assumptions to structured intent
        // This ensures the workflow builder uses the expanded assumptions
        if (expandedIntent) {
          console.log(`[PipelineOrchestrator] ✅ Applying expanded intent assumptions to structured intent`);
          
          // Update trigger if missing
          if (!structuredIntent.trigger && expandedIntent.assumed_trigger) {
            structuredIntent.trigger = expandedIntent.assumed_trigger;
            console.log(`[PipelineOrchestrator]   Applied assumed trigger: ${expandedIntent.assumed_trigger}`);
          }
          
          // Update actions if missing or incomplete
          if ((!structuredIntent.actions || structuredIntent.actions.length === 0) && expandedIntent.assumed_actions) {
            structuredIntent.actions = expandedIntent.assumed_actions.map(actionStr => {
              const [type, operation] = actionStr.split(':');
              return {
                type: type,
                operation: operation || 'read',
                description: `${operation} using ${type}`,
              };
            });
            console.log(`[PipelineOrchestrator]   Applied ${structuredIntent.actions.length} assumed actions`);
          }
        }
        
        requiresConfirmation = true;
      } else {
        console.log(`[PipelineOrchestrator] ✅ ${expansionReason}`);
        // Always require confirmation - no auto-confirmation
        requiresConfirmation = true;
      }
      
      // ✅ CRITICAL: Always require confirmation for expanded intents
      // Auto-confirmation disabled - user must explicitly approve
      if (expandedIntent && expandedIntent.requires_confirmation) {
        console.log(`[PipelineOrchestrator] ⚠️  Intent requires confirmation (Confidence: ${(confidenceScore.confidence_score * 100).toFixed(1)}%)`);
        console.log(`[PipelineOrchestrator]   Expanded intent: ${expandedIntent.expanded_intent.substring(0, 100)}...`);
        // Store pipeline context before returning
        const pipelineContext: PipelineContext = {
          original_prompt: userPrompt,
          structured_intent: structuredIntent,
          expanded_intent: expandedIntent,
          confidence_score: confidenceScore.confidence_score,
          requires_confirmation: true,
          confidence_breakdown: confidenceScore,
        };
        return {
          success: false,
          structuredIntent,
          errors: [],
          warnings,
          expandedIntent,
          pipelineContext,
          requiresCredentials: false,
          clarificationRequired: false,
        };
      }

      // ✅ Store pipeline context
      const pipelineContext: PipelineContext = {
        original_prompt: userPrompt,
        structured_intent: structuredIntent,
        expanded_intent: expandedIntent || undefined,
        confidence_score: confidenceScore.confidence_score,
        requires_confirmation: requiresConfirmation,
        confidence_breakdown: confidenceScore,
      };

      // STEP 1.8: Normalize and validate node types in structured intent
      // CRITICAL: This must happen before workflow structure building
      console.log(`[PipelineOrchestrator] STEP 1.8: Normalizing and validating node types`);
      onProgress?.(1.8, 'Validating Node Types', 65.5, { message: 'Validating and normalizing node types...' });
      try {
        const normalizedIntent = nodeTypeNormalizationService.validateAndNormalizeIntent(structuredIntent);
        structuredIntent = normalizedIntent;
        console.log(`[PipelineOrchestrator] ✅ Node types validated and normalized`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during node type normalization';
        console.error(`[PipelineOrchestrator] ❌ Node type normalization failed: ${errorMessage}`);
        return {
          success: false,
          structuredIntent,
          errors: [errorMessage],
          warnings,
          requiresCredentials: false,
          clarificationRequired: false,
        };
      }

      // STEP 2: Production-Grade Workflow Building
      // ✅ PRODUCTION ARCHITECTURE: Use production-grade builder with all requirements enforced
      console.log(`[PipelineOrchestrator] STEP 2: Building workflow using production-grade builder`);
      onProgress?.(2, 'Building Workflow', 66, { message: 'Building production-grade workflow...' });
      
      let workflow: Workflow;
      let buildResult: any;
      try {
        const { buildProductionWorkflow } = await import('./production-workflow-builder');
        buildResult = await buildProductionWorkflow(structuredIntent, userPrompt, {
          maxRetries: 3,
          strictMode: true,
          allowRegeneration: true,
        });
        
        if (!buildResult.success || !buildResult.workflow) {
          const errorMessages = buildResult.errors.join(', ');
          const errorExplanation = `Production workflow build failed after ${buildResult.metadata.buildAttempts} attempts: ${errorMessages}. Please check your prompt and try again.`;
          
          console.error(`[PipelineOrchestrator] ❌ Production workflow build failed: ${errorMessages}`);
          console.error(`[PipelineOrchestrator] Build metadata: ${JSON.stringify(buildResult.metadata, null, 2)}`);
          
          // Generate workflow ID for error tracking
          const workflowId = `workflow_error_${randomUUID()}`;
          
          // Mark workflow as rejected due to build failure
          await workflowConfirmationManager.markRejected(workflowId, errorExplanation);
          
          return {
            success: false,
            structuredIntent,
            errors: buildResult.errors,
            errorExplanation,
            warnings: [...warnings, ...buildResult.warnings],
            requiresCredentials: false,
            clarificationRequired: false,
            canRegenerate: true,
            workflowState: WorkflowState.STATE_REJECTED,
            workflowId,
            pipelineContext,
          };
        }
        
        workflow = buildResult.workflow;
        warnings.push(...buildResult.warnings);
        console.log(`[PipelineOrchestrator] ✅ Production workflow built successfully:`);
        console.log(`  - Nodes: ${workflow.nodes.length}`);
        console.log(`  - Edges: ${workflow.edges.length}`);
        console.log(`  - Build attempts: ${buildResult.metadata.buildAttempts}`);
        console.log(`  - Validation attempts: ${buildResult.metadata.validationAttempts}`);
        console.log(`  - Build time: ${buildResult.metadata.buildTime}ms`);
      } catch (error) {
        // ✅ ERROR RECOVERY: Workflow structure building failed
        // Ensure structured error response (prevent server crash)
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        // Check if this is a DSLGenerationError (structured validation error)
        const isDSLValidationError = error instanceof Error && error.name === 'DSLGenerationError';
        
        // Build structured error explanation
        let errorExplanation: string;
        let errorDetails: string[] = [errorMessage];
        
        if (isDSLValidationError) {
          // DSL validation errors are already structured
          errorExplanation = `DSL validation failed: ${errorMessage}. This indicates a structural issue with the workflow intent. Please check your prompt and try again with more specific details.`;
          
          // Extract additional error details if available
          const dslError = error as any;
          if (dslError.uncategorizedActions?.length > 0) {
            errorDetails.push(`Uncategorized actions: ${dslError.uncategorizedActions.map((a: any) => `${a.type}(${a.operation})`).join(', ')}`);
          }
          if (dslError.missingIntentActions?.length > 0) {
            errorDetails.push(`Missing intent actions: ${dslError.missingIntentActions.map((a: any) => `${a.type}(${a.operation})`).join(', ')}`);
          }
          if (dslError.minimumComponentViolations?.length > 0) {
            errorDetails.push(`Minimum component violations: ${dslError.minimumComponentViolations.map((v: any) => `${v.component} (required: ${v.required}, actual: ${v.actual})`).join(', ')}`);
          }
        } else {
          errorExplanation = `Failed to build workflow structure: ${errorMessage}. This may be due to invalid node types, missing required information, or an internal error. You can try regenerating the workflow with a more specific prompt.`;
        }
        
        console.error(`[PipelineOrchestrator] ❌ Workflow structure building failed: ${errorMessage}`);
        if (errorStack) {
          console.error(`[PipelineOrchestrator] Error stack:`, errorStack);
        }
        
        // Generate workflow ID for error tracking
        const workflowId = `workflow_error_${randomUUID()}`;
        
        // Mark workflow as rejected due to build failure (non-blocking)
        try {
          await workflowConfirmationManager.markRejected(workflowId, errorExplanation);
        } catch (markError) {
          // Non-critical: Log but don't fail
          console.warn(`[PipelineOrchestrator] ⚠️  Could not mark workflow as rejected:`, markError);
        }
        
        // Return structured error response (prevents server crash)
        return {
          success: false,
          structuredIntent,
          errors: errorDetails,
          errorExplanation,
          warnings,
          requiresCredentials: false,
          clarificationRequired: false,
          canRegenerate: true, // Allow user to regenerate
          workflowState: WorkflowState.STATE_REJECTED,
          workflowId,
          pipelineContext,
        };
      }
      
      // STEP 2.1: Normalize and validate node types in workflow
      // CRITICAL: Validate workflow before proceeding
      console.log(`[PipelineOrchestrator] STEP 2.1: Normalizing and validating workflow node types`);
      onProgress?.(2.1, 'Validating Workflow', 68, { message: 'Validating workflow node types...' });
      try {
        const normalizedWorkflow = nodeTypeNormalizationService.validateAndNormalizeWorkflow(workflow);
        workflow = normalizedWorkflow;
        console.log(`[PipelineOrchestrator] ✅ Workflow node types validated and normalized`);
        
      } catch (error) {
        // ✅ ERROR RECOVERY: Workflow normalization failed
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during workflow normalization';
        const errorExplanation = `Failed to validate workflow: ${errorMessage}. Some node types may be invalid or incompatible. You can try regenerating the workflow.`;
        
        console.error(`[PipelineOrchestrator] ❌ Workflow normalization failed: ${errorMessage}`);
        
        // Generate workflow ID for error tracking
        const workflowId = `workflow_error_${randomUUID()}`;
        
        // Mark workflow as rejected due to validation failure
        await workflowConfirmationManager.markRejected(workflowId, errorExplanation);
        
        return {
          success: false,
          structuredIntent,
          errors: [errorMessage],
          errorExplanation,
          warnings,
          requiresCredentials: false,
          clarificationRequired: false,
          canRegenerate: true, // Allow user to regenerate
          workflowState: WorkflowState.STATE_REJECTED,
          workflowId,
          pipelineContext,
        };
      }
      
      // Prepare analysis snapshot from compilation
      const analysis: PipelineAnalysis = {
        structuredPrompt: structuredIntent,
        matchedSampleId: undefined, // Production builder doesn't use sample workflows
        origin: 'scratch', // Production builder builds from scratch
        nodes: workflow.nodes.map(n => ({
          id: n.id,
          type: n.data?.type || n.type,
          config: n.data?.config || {},
        })),
        connections: workflow.edges.map(e => ({
          source: e.source,
          target: e.target,
          sourceOutput: e.sourceHandle || 'output',
          targetInput: e.targetHandle || 'input',
        })),
        missingNodes: [], // Deterministic compiler ensures all operations are mapped
      };

      // If we're in analysis-only mode, stop here and return just the analysis
      if (mode === 'analyze') {
        return {
          success: true,
          structuredIntent,
          analysis,
          pipelineContext,
          errors,
          warnings,
          expandedIntent: expandedIntent || undefined,
        };
      }

      // STEP 3: Workflow is already compiled (skip old conversion step)
      console.log(`[PipelineOrchestrator] STEP 3: Workflow already compiled (skipping old conversion)`);
      onProgress?.(3, 'Workflow Ready', 75, { message: 'Workflow compiled and ready...' });
      
      
      // Workflow is already in correct format from deterministic compiler
      // No conversion needed
      
      // STEP 3.1: Normalize and validate node types in final workflow
      // CRITICAL: Ensure workflow builder never generates unknown node types
      console.log(`[PipelineOrchestrator] STEP 3.1: Validating final workflow node types`);
      onProgress?.(3.1, 'Validating Workflow', 76, { message: 'Validating final workflow node types...' });
      try {
        const normalizedWorkflow = nodeTypeNormalizationService.validateAndNormalizeWorkflow(workflow);
        // Replace workflow with normalized version
        Object.assign(workflow, normalizedWorkflow);
        console.log(`[PipelineOrchestrator] ✅ Final workflow node types validated and normalized`);
      } catch (error) {
        // ✅ ERROR RECOVERY: Final workflow normalization failed
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during workflow normalization';
        const errorExplanation = `Failed to validate final workflow: ${errorMessage}. Some node types may be invalid or incompatible. You can try regenerating the workflow with different node types.`;
        
        console.error(`[PipelineOrchestrator] ❌ Final workflow normalization failed: ${errorMessage}`);
        
        // Generate workflow ID for error tracking
        const workflowId = `workflow_error_${randomUUID()}`;
        
        // Mark workflow as rejected due to validation failure
        await workflowConfirmationManager.markRejected(workflowId, errorExplanation);
        
        return {
          success: false,
          structuredIntent,
          analysis,
          errors: [errorMessage],
          errorExplanation,
          warnings,
          requiresCredentials: false,
          clarificationRequired: false,
          canRegenerate: true, // Allow user to regenerate
          workflowState: WorkflowState.STATE_REJECTED,
          workflowId,
          pipelineContext,
        };
      }
      
      // STEP 3.2: Enforce Minimal Workflow Policy
      // ✅ CRITICAL: Apply minimal workflow policy after workflow generation
      // This ensures workflow contains only nodes required to satisfy user intent
      console.log(`[PipelineOrchestrator] STEP 3.2: Enforcing minimal workflow policy`);
      onProgress?.(3.2, 'Enforcing Policy', 77, { message: 'Enforcing minimal workflow policy...' });
      try {
        const { enforceMinimalWorkflowPolicy } = await import('./minimal-workflow-policy');
        const policyResult = enforceMinimalWorkflowPolicy(workflow, structuredIntent, userPrompt);
        
        if (policyResult.violations.length > 0) {
          console.log(`[PipelineOrchestrator] ⚠️  Minimal workflow policy violations: ${policyResult.violations.length}`);
          policyResult.violations.forEach(v => {
            console.log(`[PipelineOrchestrator]   - ${v.type}: ${v.reason} (${v.nodeId || 'N/A'})`);
            warnings.push(`Policy violation: ${v.reason}`);
          });
        }
        
        // Use minimal workflow (policy-enforced)
        workflow = policyResult.workflow;
        console.log(`[PipelineOrchestrator] ✅ Minimal workflow policy enforced: ${policyResult.statistics.originalNodeCount} → ${policyResult.statistics.minimalNodeCount} nodes`);
      } catch (error) {
        // ✅ ERROR RECOVERY: Policy enforcement failed (non-critical, continue with original workflow)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during policy enforcement';
        console.warn(`[PipelineOrchestrator] ⚠️  Minimal workflow policy enforcement failed: ${errorMessage}`);
        warnings.push(`Could not enforce minimal workflow policy: ${errorMessage}`);
        // Continue with original workflow
      }

      // STEP 3.3: Inject safety nodes (deterministic)
      // - Example: auto-insert Limit before AI nodes when reading from Sheets to prevent token overflow
      console.log(`[PipelineOrchestrator] STEP 3.3: Injecting safety nodes`);
      onProgress?.(3.3, 'Injecting Safety', 77, { message: 'Injecting safety nodes (limit, etc.)...' });
      try {
        const { injectSafetyNodes } = await import('./safety-node-injector');
        const safety = injectSafetyNodes(workflow, userPrompt);
        workflow = safety.workflow;
        if (safety.injectedNodeTypes.length > 0) {
          console.log(`[PipelineOrchestrator] ✅ Safety nodes injected: ${safety.injectedNodeTypes.join(', ')}`);
          warnings.push(...safety.warnings);
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during safety injection';
        console.warn(`[PipelineOrchestrator] ⚠️  Safety node injection failed: ${errorMessage}`);
        warnings.push(`Could not inject safety nodes: ${errorMessage}`);
      }

      // STEP 3.4: Inject error handling branch (deterministic)
      console.log(`[PipelineOrchestrator] STEP 3.4: Injecting error handling branch`);
      onProgress?.(3.4, 'Injecting Error Handling', 77, { message: 'Injecting error handling branch...' });
      try {
        const { injectErrorBranch } = await import('./error-branch-injector');
        const injected = injectErrorBranch(workflow);
        workflow = injected.workflow;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during error branch injection';
        console.warn(`[PipelineOrchestrator] ⚠️  Error branch injection failed: ${errorMessage}`);
        warnings.push(`Could not inject error handling branch: ${errorMessage}`);
      }

      // STEP 3.5: Hydrate nodes with structural properties from registry
      // ✅ CRITICAL FIX: Enrich nodes with output ports (especially IF-ELSE nodes with 'true' and 'false' plugs)
      console.log(`[PipelineOrchestrator] STEP 3.5: Hydrating nodes with registry properties`);
      onProgress?.(3.5, 'Hydrating Nodes', 78, { message: 'Enriching nodes with structural properties from registry...' });
      try {
        const { hydrateWorkflowFromRegistry } = await import('./registry-based-node-hydrator');
        const hydrationResult = hydrateWorkflowFromRegistry(workflow);
        workflow.nodes = hydrationResult.nodes;
        
        if (hydrationResult.hydratedCount > 0) {
          console.log(`[PipelineOrchestrator] ✅ Hydrated ${hydrationResult.hydratedCount} node(s) with registry properties`);
          
          // Log IF-ELSE nodes to verify they have two plugs
          const ifElseNodes = workflow.nodes.filter(n => {
            const nodeType = (n.data?.type || n.type || '').toLowerCase();
            return nodeType === 'if_else' || nodeType === 'if-else';
          });
          
          if (ifElseNodes.length > 0) {
            console.log(
              `[PipelineOrchestrator] ✅ Verified ${ifElseNodes.length} IF-ELSE node(s) have structural properties:`,
              ifElseNodes.map(n => ({
                id: n.id,
                outgoingPorts: (n.data as any)?.outgoingPorts || 'MISSING',
                isBranching: (n.data as any)?.isBranching || false,
              }))
            );
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during node hydration';
        console.warn(`[PipelineOrchestrator] ⚠️  Node hydration failed: ${errorMessage}`);
        warnings.push(`Could not hydrate nodes with registry properties: ${errorMessage}`);
        // Continue with workflow - hydration is non-critical
      }
      

      // STEP 3.6: Generate structured workflow explanation
      console.log(`[PipelineOrchestrator] STEP 3.6: Generating workflow explanation`);
      onProgress?.(3.6, 'Generating Explanation', 79, { message: 'Generating structured workflow explanation...' });
      
      let workflowExplanation: WorkflowExplanation;
      let explanation: string;
      try {
        workflowExplanation = workflowExplanationService.generateExplanation(
          structuredIntent,
          expandedIntent || null,
          workflow
        );
        
        // Generate human-readable explanation text from structured explanation
        explanation = this.formatExplanationForConfirmation(workflowExplanation);
      } catch (error) {
        // ✅ ERROR RECOVERY: Explanation generation failed (non-critical, continue with basic explanation)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during explanation generation';
        console.warn(`[PipelineOrchestrator] ⚠️  Explanation generation failed: ${errorMessage}`);
        warnings.push(`Could not generate detailed explanation: ${errorMessage}`);
        
        // Use basic explanation
        explanation = `Workflow with ${workflow.nodes?.length || 0} nodes and ${workflow.edges?.length || 0} connections.`;
        workflowExplanation = {
          goal: 'Workflow generated from user prompt',
          trigger: {
            type: structuredIntent.trigger || 'manual_trigger',
            description: `Trigger: ${structuredIntent.trigger || 'manual_trigger'}`,
          },
          services_used: structuredIntent.actions?.map(a => a.type) || [],
          steps: [],
          data_flow: {
            description: 'Data flows through workflow nodes',
            path: workflow.nodes?.map(n => n.id) || [],
          },
          assumptions: [],
        };
      }
    

      // Generate unique workflow ID for confirmation tracking
      const workflowId = `workflow_${randomUUID()}`;

      // STEP 4: Confirmation Stage (MANDATORY) - Pipeline ALWAYS pauses here for user confirmation
      // Auto-confirmation disabled - user must explicitly approve workflow
      console.log(`[PipelineOrchestrator] STEP 4: Confirmation Stage - Pipeline paused, waiting for user confirmation`);
      onProgress?.(4, 'Waiting for Confirmation', 80, { message: 'Workflow built, waiting for user confirmation...' });
      
      // ✅ CRITICAL: Always create confirmation request - no auto-confirmation
      // Create confirmation request
      const confirmationRequest = workflowConfirmationManager.createConfirmationRequest(
        workflowId,
        {
          nodes: workflow.nodes || [],
          edges: workflow.edges || [],
        },
        explanation,
        {
          confidenceScore: confidenceScore.confidence_score,
          expandedIntent: expandedIntent?.expanded_intent,
          pipelineContext,
          workflowExplanation,
        }
      );

      // Mark as waiting for confirmation
      await workflowConfirmationManager.markWaitingForConfirmation(workflowId);

      // ✅ CRITICAL: Pipeline MUST pause here and return confirmation request
      // Workflow builder does NOT execute - only builds structure
      // User must explicitly confirm before pipeline continues
      // ✅ LOOP-BACK: Only return if workflow is perfect (or has acceptable errors)
      return {
        success: errors.length === 0, // Only success if no errors
        workflow,
        structuredIntent,
        analysis,
        pipelineContext,
        workflowExplanation,
        workflowState: WorkflowState.STATE_WAITING_CONFIRMATION,
        workflowId,
        confirmationRequest,
        waitingForConfirmation: true,
        errors,
        warnings,
        expandedIntent: expandedIntent || undefined,
      };
    } catch (error) {
      // ✅ ERROR RECOVERY: Top-level pipeline error handler
      // This catches any unhandled errors in the pipeline
      // CRITICAL: Always return structured error (never throw, prevent server crash)
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // Check if this is a DSLGenerationError (structured validation error)
      const isDSLValidationError = error instanceof Error && error.name === 'DSLGenerationError';
      
      // Build structured error explanation
      let errorExplanation: string;
      let errorDetails: string[] = [`Pipeline execution failed: ${errorMessage}`];
      
      if (isDSLValidationError) {
        // DSL validation errors are already structured
        errorExplanation = `DSL validation failed: ${errorMessage}. This indicates a structural issue with the workflow intent. Please check your prompt and try again with more specific details.`;
        
        // Extract additional error details if available
        const dslError = error as any;
        if (dslError.uncategorizedActions?.length > 0) {
          errorDetails.push(`Uncategorized actions: ${dslError.uncategorizedActions.map((a: any) => `${a.type}(${a.operation})`).join(', ')}`);
        }
        if (dslError.missingIntentActions?.length > 0) {
          errorDetails.push(`Missing intent actions: ${dslError.missingIntentActions.map((a: any) => `${a.type}(${a.operation})`).join(', ')}`);
        }
        if (dslError.minimumComponentViolations?.length > 0) {
          errorDetails.push(`Minimum component violations: ${dslError.minimumComponentViolations.map((v: any) => `${v.component} (required: ${v.required}, actual: ${v.actual})`).join(', ')}`);
        }
      } else {
        errorExplanation = `Pipeline execution failed: ${errorMessage}. This may be due to an internal error, invalid input, or system issue. You can try regenerating the workflow.`;
      }
      
      console.error(`[PipelineOrchestrator] ❌ Pipeline failed with unhandled error:`, errorMessage);
      if (errorStack) {
        console.error(`[PipelineOrchestrator] Error stack:`, errorStack);
      }
      
      // Generate workflow ID for error tracking
      const workflowId = `workflow_error_${randomUUID()}`;
      
      // Mark workflow as rejected due to pipeline failure (non-blocking)
      try {
        await workflowConfirmationManager.markRejected(workflowId, errorExplanation);
      } catch (markError) {
        // Non-critical: Log but don't fail
        console.warn(`[PipelineOrchestrator] ⚠️  Could not mark workflow as rejected:`, markError);
      }
      
      // Return structured error response (prevents server crash)
      return {
        success: false,
        errors: errorDetails,
        errorExplanation,
        warnings,
        canRegenerate: true, // Allow user to regenerate
        workflowState: WorkflowState.STATE_REJECTED,
        workflowId,
      };
    }
  }

  /**
   * Continue pipeline after user confirmation
   * This method is called after user confirms the workflow
   */
  async continuePipelineAfterConfirmation(
    workflowId: string,
    confirmed: boolean,
    existingCredentials?: Record<string, any>,
    providedCredentials?: Record<string, Record<string, any>>,
    options?: {
      mode?: 'analyze' | 'build';
      onProgress?: (step: number, stepName: string, progress: number, details?: any) => void;
    }
  ): Promise<PipelineResult> {
    console.log(`[PipelineOrchestrator] Continuing pipeline after confirmation: ${workflowId}, confirmed: ${confirmed}`);

    const errors: string[] = [];
    const warnings: string[] = [];
    const onProgress = options?.onProgress;

    // Get confirmation request
    const confirmationRequest = workflowConfirmationManager.getConfirmationRequest(workflowId);
    if (!confirmationRequest) {
      return {
        success: false,
        errors: [`Workflow confirmation request not found: ${workflowId}`],
        warnings,
      };
    }

    // Submit confirmation response
    const confirmationResponse = workflowConfirmationManager.submitConfirmation(
      workflowId,
      confirmed,
      undefined // feedback
    );

    if (!confirmed) {
      // User rejected - return rejection state
      return {
        success: false,
        workflowState: WorkflowState.STATE_REJECTED,
        workflowId,
        errors: ['Workflow was rejected by user'],
        warnings,
      };
    }

    // User confirmed - continue with post-confirmation steps
    console.log(`[PipelineOrchestrator] ✅ Workflow confirmed, continuing with repair and normalization`);

    // Reconstruct workflow from confirmation request
    const workflow: Workflow = {
      nodes: confirmationRequest.workflow.nodes,
      edges: confirmationRequest.workflow.edges,
    };

    // STEP 5: Repair (after confirmation)
    console.log(`[PipelineOrchestrator] STEP 5: Running repair engine (post-confirmation)`);
    onProgress?.(5, 'Repairing Workflow', 85, { message: 'Applying repairs...' });
    
    // Convert workflow back to structure format for repair
    const workflowStructure: WorkflowStructure = {
      trigger: confirmationRequest.pipelineContext?.structured_intent?.trigger || 'manual_trigger',
      nodes: workflow.nodes.map(n => ({
        id: n.id,
        type: unifiedNormalizeNodeType(n),
        config: n.data?.config || {},
      })),
      connections: workflow.edges.map(e => ({
        source: e.source,
        target: e.target,
        sourceOutput: (e as any).sourceOutput || 'output',
        targetInput: (e as any).targetInput || 'input',
      })),
    };

    const repairResult = repairEngine.repairWorkflow(
      workflowStructure,
      confirmationRequest.pipelineContext?.structured_intent || {} as StructuredIntent,
      confirmationRequest.pipelineContext?.original_prompt || ''
    );

    if (repairResult.repairs.length > 0) {
      warnings.push(...repairResult.repairs.map(r => `Repair: ${r.description}`));
      console.log(`[PipelineOrchestrator] Applied ${repairResult.repairs.length} repair(s)`);
    }

    // Convert repaired structure back to workflow
    let finalWorkflow: Workflow;
    try {
      finalWorkflow = await this.convertStructureToWorkflow(repairResult.workflow, confirmationRequest.pipelineContext?.structured_intent || {} as StructuredIntent);
    } catch (error) {
      // ✅ ERROR RECOVERY: Workflow conversion failed after confirmation
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during workflow conversion';
      const errorExplanation = `Failed to convert repaired workflow to executable format: ${errorMessage}. The workflow may need to be regenerated.`;
      
      console.error(`[PipelineOrchestrator] ❌ Workflow conversion failed after confirmation: ${errorMessage}`);
      
      // Mark workflow as rejected
      await workflowConfirmationManager.markRejected(workflowId, errorExplanation);
      
      return {
        success: false,
        structuredIntent: confirmationRequest.pipelineContext?.structured_intent,
        errors: [errorMessage],
        errorExplanation,
        warnings,
        canRegenerate: true,
        workflowState: WorkflowState.STATE_REJECTED,
        workflowId,
      };
    }

    // STEP 5.5: Prune workflow graph (after repair)
    // ✅ CRITICAL: Apply graph pruning after workflow builder and repair phase
    console.log(`[PipelineOrchestrator] STEP 5.5: Pruning workflow graph`);
    onProgress?.(5.5, 'Pruning Graph', 87, { message: 'Pruning workflow graph to minimal DAG...' });
    try {
      const { pruneWorkflowGraph } = await import('./workflow-graph-pruner');
      const structuredIntent = confirmationRequest.pipelineContext?.structured_intent || {} as StructuredIntent;
      const originalPrompt = confirmationRequest.pipelineContext?.original_prompt || '';
      const pruningResult = pruneWorkflowGraph(finalWorkflow, structuredIntent, originalPrompt);
      
      if (pruningResult.violations.length > 0) {
        console.log(`[PipelineOrchestrator] ⚠️  Graph pruning violations: ${pruningResult.violations.length}`);
        pruningResult.violations.forEach(v => {
          console.log(`[PipelineOrchestrator]   - ${v.type}: ${v.reason} (${v.nodeId || 'N/A'})`);
          warnings.push(`Pruning: ${v.reason}`);
        });
      }
      
      // Use pruned workflow
      finalWorkflow = pruningResult.workflow;
      console.log(`[PipelineOrchestrator] ✅ Workflow graph pruned: ${pruningResult.statistics.originalNodeCount} → ${pruningResult.statistics.prunedNodeCount} nodes`);
    } catch (error) {
      // ✅ ERROR RECOVERY: Graph pruning failed (non-critical, continue with original workflow)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during graph pruning';
      console.warn(`[PipelineOrchestrator] ⚠️  Graph pruning failed: ${errorMessage}`);
      warnings.push(`Could not prune workflow graph: ${errorMessage}`);
      // Continue with original workflow
    }

    // STEP 6: Normalize (after confirmation and pruning)
    console.log(`[PipelineOrchestrator] STEP 6: Normalizing workflow (post-confirmation)`);
    onProgress?.(6, 'Normalizing Workflow', 90, { message: 'Normalizing workflow structure...' });
    
    // Normalize edge handles
    finalWorkflow.edges = finalWorkflow.edges.map(edge => {
      const sourceNode = finalWorkflow.nodes.find(n => n.id === edge.source);
      const targetNode = finalWorkflow.nodes.find(n => n.id === edge.target);
      
      if (!sourceNode || !targetNode) {
        return edge;
      }
      
      const sourceType = unifiedNormalizeNodeType(sourceNode);
      const targetType = unifiedNormalizeNodeType(targetNode);
      
      const { sourceHandle, targetHandle } = validateAndFixEdgeHandles(
        sourceType,
        targetType,
        edge.sourceHandle,
        edge.targetHandle
      );
      
      return {
        ...edge,
        sourceHandle,
        targetHandle,
      };
    });

    // STEP 7: Detect Required Credentials
    console.log(`[PipelineOrchestrator] STEP 7: Detecting required credentials`);
    onProgress?.(7, 'Detecting Credentials', 92, { message: 'Scanning nodes for required credentials...' });
    let credentialDetection: CredentialDetectionResult | undefined;
    try {
      credentialDetection = credentialDetector.detectCredentials(repairResult.workflow, existingCredentials);
    } catch (credError) {
      const msg = credError instanceof Error ? credError.message : String(credError);
      console.error('[PipelineOrchestrator] Credential detection failed (non-blocking):', msg);
      errors.push(`Credential detection failed: ${msg}`);
      credentialDetection = {
        required_credentials: [],
        missing_credentials: [],
        satisfied_credentials: [],
      };
    }

    if (credentialDetection.missing_credentials.length > 0) {
      return {
        success: true,
        workflow: finalWorkflow,
        structuredIntent: confirmationRequest.pipelineContext?.structured_intent,
        credentialDetection,
        pipelineContext: confirmationRequest.pipelineContext,
        workflowState: WorkflowState.STATE_CONFIRMED,
        workflowId,
        errors,
        warnings,
        requiresCredentials: true,
        expandedIntent: confirmationRequest.pipelineContext?.expanded_intent,
      };
    }

    // STEP 8: Inject Credentials (if provided)
    if (providedCredentials && Object.keys(providedCredentials).length > 0) {
      console.log(`[PipelineOrchestrator] STEP 8: Injecting credentials`);
      const injectionResult = credentialInjector.injectCredentials(
        finalWorkflow,
        providedCredentials,
        credentialDetection.required_credentials
      );

      if (!injectionResult.success) {
        errors.push(...injectionResult.errors);
        warnings.push(...injectionResult.warnings);
        return {
          success: false,
          workflow: injectionResult.workflow,
          structuredIntent: confirmationRequest.pipelineContext?.structured_intent,
          credentialDetection,
          pipelineContext: confirmationRequest.pipelineContext,
          workflowState: WorkflowState.STATE_CONFIRMED,
          workflowId,
          errors,
          warnings,
          requiresCredentials: true,
          expandedIntent: confirmationRequest.pipelineContext?.expanded_intent,
        };
      }

      finalWorkflow = injectionResult.workflow;
    }

    // STEP 9: Policy Enforcement
    console.log(`[PipelineOrchestrator] STEP 9: Enforcing policies`);
    const policyResult = workflowPolicyEnforcerV2.enforcePolicies(finalWorkflow);
    
    if (!policyResult.valid) {
      errors.push(...policyResult.errors);
    }
    warnings.push(...policyResult.warnings);
    
    finalWorkflow = policyResult.workflow;

    // STEP 10: AI Validator (final safety layer)
    console.log(`[PipelineOrchestrator] STEP 10: Running AI validator`);
    const validationStructure: WorkflowGenerationStructure = {
      trigger: confirmationRequest.pipelineContext?.structured_intent?.trigger || 'manual_trigger',
      steps: finalWorkflow.nodes
        .filter(n => {
          const type = unifiedNormalizeNodeType(n);
          return !['manual_trigger', 'schedule', 'webhook', 'form', 'chat_trigger'].includes(type);
        })
        .map(n => ({
          id: n.id,
          type: unifiedNormalizeNodeType(n),
          description: n.data?.label || n.id,
        })),
      outputs: [],
      connections: finalWorkflow.edges.map(e => ({
        source: e.source,
        target: e.target,
      })),
    };
    
    const validationResult = await aiWorkflowValidator.validateWorkflowStructure(
      confirmationRequest.pipelineContext?.original_prompt || '',
      validationStructure,
      finalWorkflow.nodes,
      finalWorkflow.edges
    );

    if (!validationResult.valid) {
      warnings.push(...validationResult.issues);
    }

    return {
      success: errors.length === 0,
      workflow: finalWorkflow,
      structuredIntent: confirmationRequest.pipelineContext?.structured_intent,
      credentialDetection,
      pipelineContext: confirmationRequest.pipelineContext,
      workflowState: WorkflowState.STATE_CONFIRMED,
      workflowId,
      errors,
      warnings,
      expandedIntent: confirmationRequest.pipelineContext?.expanded_intent,
    };
  }

  /**
   * Convert WorkflowStructure to Workflow format
   */
  private async convertStructureToWorkflow(
    structure: WorkflowStructure,
    intent: StructuredIntent
  ): Promise<Workflow> {
    const nodes: WorkflowNode[] = [];
    const edges: WorkflowEdge[] = [];

    // Create trigger node
    const triggerSchema = nodeLibrary.getSchema(structure.trigger);
    const triggerNode: WorkflowNode = {
      id: 'trigger',
      type: 'custom',
      position: { x: 0, y: 0 },
      data: {
        type: structure.trigger,
        label: this.getTriggerLabel(structure.trigger),
        category: triggerSchema?.category || 'triggers',
        config: structure.trigger_config || {},
      },
    };
    nodes.push(triggerNode);

    // Create action nodes
    structure.nodes.forEach((node, index) => {
      const schema = nodeLibrary.getSchema(node.type);
      const workflowNode: WorkflowNode = {
        id: node.id,
        type: 'custom',
        position: { x: 200 * (index + 1), y: 0 },
        data: {
          type: node.type,
          label: schema?.label || node.type,
          category: schema?.category || 'action',
          config: node.config || {},
        },
      };
      nodes.push(workflowNode);
    });

    // ✅ PRODUCTION-READY: Sort connections for deterministic edge creation
    // Sort by: trigger first, then by source node order, then by target node order
    const sortedConnections = [...structure.connections].sort((a, b) => {
      // Trigger connections first
      const aIsTrigger = a.source === 'trigger';
      const bIsTrigger = b.source === 'trigger';
      if (aIsTrigger && !bIsTrigger) return -1;
      if (!aIsTrigger && bIsTrigger) return 1;
      
      // Then by source node index
      const aSourceIndex = structure.nodes.findIndex(n => n.id === a.source);
      const bSourceIndex = structure.nodes.findIndex(n => n.id === b.source);
      if (aSourceIndex !== bSourceIndex) {
        return aSourceIndex - bSourceIndex;
      }
      
      // Then by target node index
      const aTargetIndex = structure.nodes.findIndex(n => n.id === a.target);
      const bTargetIndex = structure.nodes.findIndex(n => n.id === b.target);
      return aTargetIndex - bTargetIndex;
    });

    // Track skipped connections for orphan reconnection
    const skippedConnections: typeof structure.connections = [];
    const orphanedNodeIds = new Set<string>();

    // Create edges
    sortedConnections.forEach(conn => {
      const sourceNode = nodes.find(n => n.id === conn.source);
      const targetNode = nodes.find(n => n.id === conn.target);

      if (!sourceNode || !targetNode) {
        console.warn(`[PipelineOrchestrator] Skipping connection: nodes not found ${conn.source} → ${conn.target}`);
        return;
      }

      const sourceType = unifiedNormalizeNodeType(sourceNode);
      const targetType = unifiedNormalizeNodeType(targetNode);

      // ✅ ERROR PREVENTION #5: Use universal edge creation validator (prevents parallel branches)
      const validation = edgeCreationValidator.canCreateEdge(
        sourceNode,
        targetNode,
        edges,
        [], // No edges being created in this pass
        conn.sourceOutput,
        conn.targetInput,
        conn.type
      );
      
      if (!validation.allowed) {
        console.warn(
          `[PipelineOrchestrator] ⚠️  Skipping edge ${sourceType}(${sourceNode.id}) → ${targetType}(${targetNode.id}): ${validation.reason}`
        );
        skippedConnections.push(conn);
        orphanedNodeIds.add(conn.target);
        return; // Skip this edge to prevent parallel branches
      }
      
      // ✅ PRODUCTION-READY: Use semantic validator (LOGICAL validation)
      // Both structural AND semantic validation must pass
      const semanticValidation = semanticConnectionValidator.validateConnection(
        { nodes, edges },
        sourceNode.id,
        targetNode.id
      );
      
      if (!semanticValidation.valid) {
        console.warn(
          `[PipelineOrchestrator] ⚠️  Skipping edge ${sourceType}(${sourceNode.id}) → ${targetType}(${targetNode.id}): ${semanticValidation.reason}`
        );
        skippedConnections.push(conn);
        if (semanticValidation.shouldSkip) {
          orphanedNodeIds.add(conn.target);
        }
        return; // Skip this edge - doesn't make logical sense
      }

      // ✅ ERROR PREVENTION #1: Use universal handle resolver (prevents invalid handles)
      const sourceHandleResult = universalHandleResolver.resolveSourceHandle(
        sourceNode.data.type,
        conn.sourceOutput, // Explicit handle from structure (highest priority)
        conn.type // Connection type ('true', 'false', etc.)
      );
      
      const targetHandleResult = universalHandleResolver.resolveTargetHandle(
        targetNode.data.type,
        conn.targetInput // Explicit handle from structure (highest priority)
      );
      
      if (!sourceHandleResult.valid || !targetHandleResult.valid) {
        const error = `Cannot create edge ${conn.source} → ${conn.target}: Handle resolution failed - ${sourceHandleResult.reason || targetHandleResult.reason}`;
        console.error(`[PipelineOrchestrator] ❌ ${error}`);
        skippedConnections.push(conn);
        orphanedNodeIds.add(conn.target);
        return;
      }
      
      const sourceHandle = sourceHandleResult.handle;
      const targetHandle = targetHandleResult.handle;
      
      console.log(
        `[PipelineOrchestrator] Using handles: ${sourceType}(${sourceHandle}) → ${targetType}(${targetHandle})`
      );

      // ✅ FIX 2: Use Enhanced Edge Creation Service with fallbacks
      // DAG Rule: Use edge type from structure (true/false for IF, case_1/case_2 for SWITCH)
      const edgeType = conn.type || (targetType === 'ai_agent' ? 'ai-input' : 'default');
      
      const edgeResult = enhancedEdgeCreationService.createEdgeWithFallback(
        sourceNode,
        targetNode,
        sourceHandle,
        targetHandle,
        edges,
        nodes
      );
      
      if (edgeResult.success && edgeResult.edge) {
        // Set edge type if provided
        if (edgeType && edgeType !== 'main') {
          edgeResult.edge.type = edgeType as any;
        }
        edges.push(edgeResult.edge);
        if (edgeResult.usedFallback) {
          console.log(`[PipelineOrchestrator] ⚠️  Created edge using fallback: ${sourceType}(${sourceHandle}) → ${targetType}(${targetHandle})`);
        } else {
          console.log(`[PipelineOrchestrator] ✅ Created edge: ${sourceType}(${sourceHandle}) → ${targetType}(${targetHandle})`);
        }
      } else {
        console.warn(
          `[PipelineOrchestrator] ⚠️  Failed to create edge: ${sourceType} → ${targetType}: ${edgeResult.error}`
        );
        if (edgeResult.warnings && edgeResult.warnings.length > 0) {
          console.warn(`[PipelineOrchestrator]   Warnings: ${edgeResult.warnings.join(', ')}`);
        }
        skippedConnections.push(conn);
        orphanedNodeIds.add(conn.target);
      }
    });

    // ✅ PRODUCTION-READY: Reconnect orphaned nodes after edge skipping
    if (orphanedNodeIds.size > 0) {
      console.log(`[PipelineOrchestrator] 🔄 Reconnecting ${orphanedNodeIds.size} orphaned node(s)...`);
      
      // Build execution order for finding appropriate sources
      const executionOrder = this.getTopologicalOrder({ nodes, edges });
      
      for (const orphanedNodeId of orphanedNodeIds) {
        const orphanedNode = nodes.find(n => n.id === orphanedNodeId);
        if (!orphanedNode) continue;
        
        // Check if node already has incoming edge (may have been reconnected)
        const hasIncomingEdge = edges.some(e => e.target === orphanedNodeId);
        if (hasIncomingEdge) {
          console.log(`[PipelineOrchestrator] ✅ Node ${orphanedNodeId} already has incoming edge, skipping reconnection`);
          continue;
        }
        
        // ✅ ERROR PREVENTION #4: Use universal category resolver (prevents orphan nodes)
        const orphanedNodeType = unifiedNormalizeNodeType(orphanedNode);
        const orphanedCategory = universalCategoryResolver.getNodeCategory(orphanedNodeType);
        
        // Convert DSLCategory to expected format (dataSource -> data_source)
        const categoryMap: Record<string, 'data_source' | 'transformation' | 'output'> = {
          'dataSource': 'data_source',
          'transformation': 'transformation',
          'output': 'output',
        };
        const mappedCategory = categoryMap[orphanedCategory] || 'transformation';
        
        // Find appropriate source node
        const sourceNode = this.findAppropriateSourceNode(nodes, edges, executionOrder, mappedCategory, orphanedNodeType);
        
        if (sourceNode) {
          // ✅ PRODUCTION-READY: Validate semantic correctness before reconnecting
          const shouldReconnect = semanticConnectionValidator.shouldReconnectOrphan(
            { nodes, edges },
            orphanedNode,
            sourceNode
          );
          
          if (!shouldReconnect.shouldReconnect) {
            console.warn(
              `[PipelineOrchestrator] ⚠️  Skipping reconnection of orphaned node ${orphanedNodeId} (${orphanedNodeType}): ${shouldReconnect.reason}`
            );
            continue; // Don't reconnect - doesn't make logical sense
          }
          
          // ✅ FIX 2: Create reconnection edge using enhanced edge creation service
          const reconnectResult = enhancedEdgeCreationService.createEdgeWithFallback(
            sourceNode,
            orphanedNode,
            undefined,
            undefined,
            edges,
            nodes
          );
          
          if (reconnectResult.success && reconnectResult.edge) {
            edges.push(reconnectResult.edge);
            const sourceType = unifiedNormalizeNodeType(sourceNode);
            if (reconnectResult.usedFallback) {
              console.log(`[PipelineOrchestrator] ⚠️  Reconnected orphan using fallback: ${sourceType} → ${orphanedNodeType}`);
            } else {
              console.log(`[PipelineOrchestrator] ✅ Reconnected orphaned node: ${sourceType} → ${orphanedNodeType}`);
            }
          } else {
            console.warn(`[PipelineOrchestrator] ⚠️  Could not reconnect orphaned node ${orphanedNodeId}: ${reconnectResult.error || 'No compatible handles'}`);
            if (reconnectResult.warnings && reconnectResult.warnings.length > 0) {
              console.warn(`[PipelineOrchestrator]   Warnings: ${reconnectResult.warnings.join(', ')}`);
            }
          }
        } else {
          console.warn(`[PipelineOrchestrator] ⚠️  Could not find appropriate source for orphaned node ${orphanedNodeId} (${orphanedNodeType})`);
        }
      }
    }

    // ✅ PRODUCTION-READY: Validate connected graph (all nodes reachable from trigger)
    const connectivityValidation = this.validateGraphConnectivity(nodes, edges);
    if (!connectivityValidation.valid) {
      console.warn(`[PipelineOrchestrator] ⚠️  Graph connectivity issues: ${connectivityValidation.errors.join(', ')}`);
      // Note: We don't throw here - let validation pipeline handle it
      // But we log warnings for debugging
    }

    return {
      nodes,
      edges,
    };
  }

  /**
   * ✅ PRODUCTION-READY: Validate graph connectivity
   * Ensures all nodes are reachable from trigger (no orphan subgraphs)
   */
  private validateGraphConnectivity(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const nodeIds = new Set(nodes.map(n => n.id));
    const visited = new Set<string>();
    
    // Find trigger node
    const triggerNode = nodes.find(n => {
      const t = unifiedNormalizeNodeType(n);
      const def = unifiedNodeRegistry.get(t);
      return def?.category === 'trigger';
    });
    
    if (!triggerNode) {
      errors.push('No trigger node found in workflow');
      return { valid: false, errors };
    }
    
    // BFS from trigger to find all reachable nodes
    const queue: string[] = [triggerNode.id];
    visited.add(triggerNode.id);
    
    while (queue.length > 0) {
      const currentNodeId = queue.shift()!;
      const outgoingEdges = edges.filter(e => e.source === currentNodeId);
      
      for (const edge of outgoingEdges) {
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    
    // Check for unreachable nodes
    const unreachableNodes = nodes.filter(n => !visited.has(n.id));
    if (unreachableNodes.length > 0) {
      const unreachableTypes = unreachableNodes.map(n => unifiedNormalizeNodeType(n));
      errors.push(
        `Found ${unreachableNodes.length} unreachable node(s) from trigger: ${unreachableTypes.join(', ')}. ` +
        `All nodes must be reachable from trigger node.`
      );
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * ✅ PRODUCTION-READY: Get node category for orphan reconnection
   * Uses universal category resolver logic
   */
  /**
   * @deprecated Use universalCategoryResolver.getNodeCategory() instead
   * This method is kept for backward compatibility but delegates to universal resolver
   * 
   * ✅ ERROR PREVENTION #4: Prevents orphan nodes by using universal category resolver
   */
  private getNodeCategoryForReconnection(nodeType: string): 'data_source' | 'transformation' | 'output' {
    // ✅ ERROR PREVENTION #4: Delegate to universal category resolver (no hardcoded mappings)
    const category = universalCategoryResolver.getNodeCategory(nodeType);
    return category as 'data_source' | 'transformation' | 'output';
  }

  /**
   * ✅ PRODUCTION-READY: Find appropriate source node for orphan reconnection
   */
  private findAppropriateSourceNode(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    executionOrder: string[],
    orphanCategory: 'data_source' | 'transformation' | 'output',
    orphanNodeType: string
  ): WorkflowNode | null {
    // Define valid source categories
    const validSourceCategories: Array<'data_source' | 'transformation' | 'output'> = 
      orphanCategory === 'data_source' ? [] :
      orphanCategory === 'transformation' ? ['data_source', 'transformation'] :
      ['transformation', 'data_source'];
    
    // Traverse in reverse order (from end of chain)
    for (let i = executionOrder.length - 1; i >= 0; i--) {
      const nodeId = executionOrder[i];
      const node = nodes.find(n => n.id === nodeId);
      if (!node) continue;
      
      const nodeType = unifiedNormalizeNodeType(node);
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      const nodeCategory = this.getNodeCategoryForReconnection(nodeType);
      
      // Check if this node is a valid source
      if (validSourceCategories.includes(nodeCategory)) {
        // Also check if it's not already at max outgoing edges (unless branching)
        const outgoingCount = edges.filter(e => e.source === nodeId).length;
        const allowsBranching = graphBranchingValidator.nodeAllowsBranching(nodeType);
        
        if (outgoingCount === 0 || allowsBranching) {
          return node;
        }
      }
      
      // Special case: trigger for data_source
      if (nodeDef.category === 'trigger' && orphanCategory === 'data_source') {
        return node;
      }
    }
    
    // Fallback: return trigger if available
    const triggerNode = nodes.find(n => {
      const t = unifiedNormalizeNodeType(n);
      const def = unifiedNodeRegistry.get(t);
      return def?.category === 'trigger';
    });
    
    return triggerNode || null;
  }

  /**
   * ✅ PRODUCTION-READY: Get topological order for execution order calculation
   */
  private getTopologicalOrder(workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }): string[] {
    const nodeIds = new Set(workflow.nodes.map(n => n.id));
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();
    
    // Initialize in-degree
    workflow.nodes.forEach(node => {
      inDegree.set(node.id, 0);
      adjacencyList.set(node.id, []);
    });
    
    // Build adjacency list and calculate in-degrees
    workflow.edges.forEach(edge => {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
        const current = adjacencyList.get(edge.source) || [];
        current.push(edge.target);
        adjacencyList.set(edge.source, current);
        
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
      }
    });
    
    // Topological sort
    const queue: string[] = [];
    const result: string[] = [];
    
    // Find nodes with in-degree 0 (triggers)
    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) {
        queue.push(nodeId);
      }
    });
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);
      
      const neighbors = adjacencyList.get(current) || [];
      neighbors.forEach(neighbor => {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      });
    }
    
    return result;
  }

  /**
   * Get trigger label
   */
  private getTriggerLabel(trigger: string): string {
    const labels: Record<string, string> = {
      'manual_trigger': 'Manual Trigger',
      'schedule': 'Schedule Trigger',
      'webhook': 'Webhook',
      'form': 'Form',
      'chat_trigger': 'Chat Trigger',
    };
    return labels[trigger] || trigger;
  }
}

export const workflowPipelineOrchestrator = new WorkflowPipelineOrchestrator();
