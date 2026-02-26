/**
 * Workflow Lifecycle Manager
 * 
 * Orchestrates the complete workflow lifecycle:
 * 1. Generate workflow graph (DAG only)
 * 2. Discover required credentials (AFTER graph creation)
 * 3. Return graph + credentials to frontend
 * 4. Inject credentials into nodes (via attach-credentials endpoint)
 * 5. Validate workflow is ready for execution
 * 
 * This ensures:
 * - No credentials asked before generation
 * - Credential discovery only runs AFTER graph creation
 * - Strict connector isolation
 * - Deterministic workflow planning
 */

import { Workflow, WorkflowNode } from '../core/types/ai-types';
import { agenticWorkflowBuilder } from './ai/workflow-builder';
import { credentialDiscoveryPhase, CredentialDiscoveryResult } from './ai/credential-discovery-phase';
import { workflowValidator, ValidationResult } from './ai/workflow-validator';
import { connectorRegistry } from './connectors/connector-registry';
import { nodeLibrary } from './nodes/node-library';
import { normalizeNodeType } from '../core/utils/node-type-normalizer';
import { resolveNodeType } from '../core/utils/node-type-resolver-util';
import { NodeResolver } from './ai/node-resolver';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { planWorkflowSpecFromPrompt } from './ai/smart-planner-adapter';
import type { WorkflowSpec } from '../planner/types';
import { workflowPipelineOrchestrator } from './ai/workflow-pipeline-orchestrator';
import { credentialDetector } from './ai/credential-detector';
import { credentialInjector } from './ai/credential-injector';

export interface WorkflowGenerationResult {
  workflow: Workflow;
  requiredCredentials: CredentialDiscoveryResult;
  requiredInputs: {
    inputs: Array<{
      nodeId: string;
      nodeType: string;
      nodeLabel: string;
      fieldName: string;
      fieldType: string;
      description: string;
      required: boolean;
      defaultValue?: any;
      examples?: any[];
    }>;
  };
  validation: ValidationResult;
  documentation?: string;
  suggestions?: any[];
  estimatedComplexity?: string;
  /**
   * Optional analysis snapshot from the new deterministic pipeline (if used)
   */
  analysis?: import('./ai/workflow-pipeline-orchestrator').PipelineAnalysis;
}

export interface CredentialInjectionResult {
  workflow: Workflow;
  validation: ValidationResult;
  success: boolean;
  errors?: string[];
}

/**
 * Workflow Lifecycle Manager
 * 
 * Manages the complete workflow lifecycle from generation to execution readiness.
 */
export class WorkflowLifecycleManager {
  /**
   * Generate workflow using new deterministic pipeline architecture
   */
  private async generateWorkflowWithNewPipeline(
    userPrompt: string,
    constraints?: any,
    onProgress?: (step: number, stepName: string, progress: number, details?: any) => void
  ): Promise<{
    workflow: Workflow;
    documentation: string;
    suggestions: any[];
    estimatedComplexity: string;
    systemPrompt?: string;
    requirements?: any;
    requiredCredentials?: string[];
    confidenceScore?: any;
    analysis?: import('./ai/workflow-pipeline-orchestrator').PipelineAnalysis;
  }> {
    console.log('[WorkflowLifecycle] Executing new deterministic pipeline...');

    // Get existing credentials from vault if available
    let existingCredentials: Record<string, any> | undefined;
    try {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        // TODO: Load existing credentials from vault
        existingCredentials = {};
      }
    } catch (error) {
      console.warn('[WorkflowLifecycle] Could not load existing credentials:', error);
    }

    // Execute pipeline with progress callback
    const pipelineResult = await workflowPipelineOrchestrator.executePipeline(
      userPrompt,
      existingCredentials,
      constraints?.providedCredentials,
      {
        mode: 'build',
        onProgress,
      }
    );

    // Handle clarification required (legacy - clarification stage removed)
    // Note: Clarification stage has been removed, vague prompts are handled by intent_auto_expander
    if (pipelineResult.clarificationRequired) {
      // This should not happen anymore, but handle gracefully if it does
      console.warn('[WorkflowLifecycleManager] Clarification required flag set, but clarification stage is disabled');
    }

    // Handle credentials required
    if (pipelineResult.requiresCredentials && !pipelineResult.workflow) {
      throw new Error(`Credentials required: ${pipelineResult.credentialDetection?.missing_credentials.map(c => c.provider).join(', ')}`);
    }

    if (!pipelineResult.success || !pipelineResult.workflow) {
      const reason = (pipelineResult.errors && pipelineResult.errors.length > 0)
        ? pipelineResult.errors.join(', ')
        : 'Unknown pipeline error';
      // ✅ Preserve pipeline result (including expandedIntent) for fallback detection
      const error: any = new Error(`Pipeline failed: ${reason}`);
      error.pipelineResult = pipelineResult; // Attach pipeline result to error for fallback detection
      throw error;
    }

    // Convert credential detection to required credentials format
    const requiredCredentials = pipelineResult.credentialDetection?.required_credentials.map(c => c.provider) || [];

    return {
      workflow: pipelineResult.workflow,
      documentation: `Workflow generated using deterministic pipeline architecture`,
      suggestions: pipelineResult.warnings.map(w => ({ type: 'warning', message: w })),
      estimatedComplexity: 'medium',
      requiredCredentials,
      confidenceScore: {
        score: pipelineResult.success ? 0.9 : 0.5,
        factors: [],
      },
      analysis: pipelineResult.analysis,
    };
  }

  /**
   * Generate workflow graph and discover credentials
   * 
   * This is the FIRST phase - generates the workflow DAG only.
   * Credential discovery runs AFTER graph creation.
   * 
   * @param userPrompt - User's workflow description
   * @param constraints - Optional constraints (current workflow, execution history, etc.)
   * @param onProgress - Optional progress callback for streaming updates
   * @returns Workflow graph + required credentials
   */
  async generateWorkflowGraph(
    userPrompt: string,
    constraints?: any,
    onProgress?: (step: number, stepName: string, progress: number, details?: any) => void
  ): Promise<WorkflowGenerationResult> {
    console.log('[WorkflowLifecycle] Step 1: Generating workflow graph...');

    // Optional STEP 0: Planner-driven spec (Smart Planner)
    let plannerSpec: WorkflowSpec | undefined;
    try {
      plannerSpec = await planWorkflowSpecFromPrompt(userPrompt);
      if (plannerSpec) {
        console.log('[WorkflowLifecycle] Smart Planner spec detected - using planner-driven node hints.');
      }
    } catch (error) {
      console.error('[WorkflowLifecycle] Smart Planner failed (non-fatal):', error);
    }

    // STEP 0: Resolve required nodes from prompt using NodeResolver (legacy) OR planner hints
    console.log('[WorkflowLifecycle] Step 0: Resolving required nodes from prompt...');
    const nodeResolver = new NodeResolver(nodeLibrary);

    let resolution: {
      success: boolean;
      nodeIds: string[];
      errors: any[];
      warnings: string[];
    };

    if (plannerSpec) {
      // Derive required node types from planner spec (trigger + data_sources + actions + storage + transformations)
      const nodeIds = new Set<string>();

      // Trigger mapping
      if (plannerSpec.trigger === 'manual') {
        nodeIds.add('manual_trigger');
      } else if (plannerSpec.trigger === 'schedule') {
        nodeIds.add('schedule');
      } else if (plannerSpec.trigger === 'webhook') {
        nodeIds.add('webhook');
      } else if (plannerSpec.trigger === 'event') {
        // Keep generic trigger; specific event triggers can be added later
        nodeIds.add('manual_trigger');
      }

      // Data sources / storage / actions: provider name before dot
      plannerSpec.data_sources.forEach((s) => nodeIds.add(s.split('.')[0]));
      plannerSpec.storage.forEach((s) => nodeIds.add(s.split('.')[0]));
      plannerSpec.actions.forEach((a) => nodeIds.add(a.split('.')[0]));

      // Transformations: map planner transformation names (capabilities) to concrete node types
      // ✅ IMPORTANT: Only include loop if user explicitly requests iteration (planner may over-suggest)
      const promptLower = userPrompt.toLowerCase();
      const promptRequestsLoop =
        promptLower.includes('for each') ||
        promptLower.includes('foreach') ||
        promptLower.includes('iterate') ||
        promptLower.includes('loop') ||
        promptLower.includes('each row') ||
        promptLower.includes('per row');

      plannerSpec.transformations.forEach((t) => {
        const tf = String(t || '').toLowerCase().trim();

        if (!tf) return;

        if (tf === 'loop') {
          if (promptRequestsLoop) nodeIds.add('loop');
          return;
        }

        // Map summarization capability to deterministic LLM transformer node
        if (tf === 'summarize' || tf === 'summarise' || tf === 'summary' || tf === 'summarization') {
          nodeIds.add('ai_chat_model'); // Canonical transformer for summarize in this repo
          return;
        }

        // If planner outputs a real node type, keep it
        if (nodeLibrary.getSchema(tf)) {
          nodeIds.add(tf);
        }
      });

      // CRITICAL: mentioned_only services must NOT become nodes (e.g., google_gmail in Gmail-in-Sheets)
      // ✅ CRITICAL FIX: Resolve mentioned_only types to canonical types for proper matching
      const { resolveNodeType } = require('../core/utils/node-type-resolver-util');
      plannerSpec.mentioned_only.forEach((m) => {
        const rawType = m.split('.')[0];
        // Resolve to canonical type (handles aliases)
        const canonicalType = resolveNodeType(rawType, false);
        
        // Check both raw type and canonical type
        if (nodeIds.has(rawType)) {
          console.log(`[WorkflowLifecycle] Removing mentioned_only node from required set: ${rawType} (canonical: ${canonicalType})`);
          nodeIds.delete(rawType);
        }
        if (nodeIds.has(canonicalType)) {
          console.log(`[WorkflowLifecycle] Removing mentioned_only node from required set: ${canonicalType}`);
          nodeIds.delete(canonicalType);
        }
      });

      const plannerNodeIds = Array.from(nodeIds);
      console.log(`[WorkflowLifecycle] Planner-driven required node(s): ${plannerNodeIds.join(', ')}`);

      resolution = {
        success: true,
        nodeIds: plannerNodeIds,
        errors: [],
        warnings: [],
      };
    } else {
      // Legacy NodeResolver behavior
      resolution = nodeResolver.resolvePrompt(userPrompt);

      if (!resolution.success && resolution.errors.length > 0) {
        console.error('[WorkflowLifecycle] Node resolution failed:', resolution.errors);
        // Continue anyway - workflow builder may still generate valid workflow
      } else {
        console.log(`[WorkflowLifecycle] Node resolution: ${resolution.nodeIds.length} required node(s): ${resolution.nodeIds.join(', ')}`);
      }
    }

    // STEP 1: Generate workflow graph (DAG only, no credentials)
    // ✅ CRITICAL: Check if new pipeline should be used
    const useNewPipeline = constraints?.useNewPipeline !== false; // Default to true for new pipeline
    
    // Use a flexible type here because new pipeline and legacy builder return slightly different shapes
    let generationResult: any;
    if (useNewPipeline) {
      console.log('[WorkflowLifecycle] Using new deterministic pipeline architecture');
      generationResult = await this.generateWorkflowWithNewPipeline(userPrompt, constraints, onProgress);
    } else {
      console.log('[WorkflowLifecycle] Using legacy workflow builder');
    // ✅ CRITICAL: Pass structured spec from constraints if available
    const structuredSpec = constraints?.structuredSpec;
    
      // ✅ CRITICAL FIX: Pass planner spec to constraints so workflow builder can use trigger preference
      const enhancedConstraints = {
        ...constraints,
        plannerSpec: plannerSpec, // Pass planner spec so workflow builder can respect trigger preference
      };
      
      generationResult = await agenticWorkflowBuilder.generateFromPrompt(
      userPrompt,
        enhancedConstraints
    );
    }

    let workflow = generationResult.workflow;
    
    console.log(`[WorkflowLifecycle] Graph generated: ${workflow.nodes.length} nodes, ${workflow.edges.length} edges`);

    // STEP 1.5a: If Smart Planner is active, drop any nodes that correspond to mentioned_only services
    // ✅ CRITICAL FIX: Don't remove nodes that are actually needed (have connections or are in resolved nodes)
    if (plannerSpec && plannerSpec.mentioned_only && plannerSpec.mentioned_only.length > 0) {
      // ✅ CRITICAL FIX: Resolve mentioned_only types to canonical types for proper matching
      // This handles aliases (e.g., "gmail" -> "google_gmail")
      const { resolveNodeType } = require('../core/utils/node-type-resolver-util');
      const mentionedOnlyTypes = new Set(
        plannerSpec.mentioned_only.map((m) => {
          const rawType = m.split('.')[0];
          // Resolve to canonical type (handles aliases)
          const canonicalType = resolveNodeType(rawType, false);
          return canonicalType;
        }),
      );

      console.log(`[WorkflowLifecycle] mentioned_only types (canonical): ${Array.from(mentionedOnlyTypes).join(', ')}`);

      // Build set of node IDs that are actually connected (have edges)
      const connectedNodeIds = new Set<string>();
      workflow.edges.forEach((edge: any) => {
        if (edge.source) connectedNodeIds.add(edge.source as string);
        if (edge.target) connectedNodeIds.add(edge.target as string);
      });

      const originalNodeCount = workflow.nodes.length;
      const filteredNodes = workflow.nodes.filter((node: any) => {
        const nodeType = normalizeNodeType(node);
        // ✅ CRITICAL FIX: Resolve node type to canonical form for comparison
        const canonicalNodeType = resolveNodeType(nodeType, false);
        
        if (mentionedOnlyTypes.has(canonicalNodeType)) {
          // ✅ CRITICAL: Don't remove if node is connected (has edges) - it's actually being used
          if (connectedNodeIds.has(node.id)) {
          console.log(
              `[WorkflowLifecycle] Keeping mentioned_only node ${nodeType} (canonical: ${canonicalNodeType}, nodeId=${node.id}) - node is connected and needed`,
            );
            return true; // Keep the node
          }
          
          // ✅ CRITICAL: Don't remove if node has config (user has configured it)
          const hasConfig = node.data?.config && Object.keys(node.data.config).length > 0;
          if (hasConfig) {
            console.log(
              `[WorkflowLifecycle] Keeping mentioned_only node ${nodeType} (canonical: ${canonicalNodeType}, nodeId=${node.id}) - node has configuration`,
            );
            return true; // Keep the node
          }
          
          console.log(
            `[WorkflowLifecycle] Removing node for mentioned_only service: ${nodeType} (canonical: ${canonicalNodeType}, nodeId=${node.id}) - not connected and no config`,
          );
          return false;
        }
        return true;
      });

      if (filteredNodes.length !== originalNodeCount) {
        const removedCount = originalNodeCount - filteredNodes.length;
        // Remove any edges that referenced removed nodes
        const remainingIds = new Set(filteredNodes.map((n: any) => n.id));
        const filteredEdges = workflow.edges.filter(
          (edge: any) =>
            remainingIds.has(edge.source as string) && remainingIds.has(edge.target as string),
        );

        console.log(
          `[WorkflowLifecycle] Planner filter removed ${removedCount} mentioned_only node(s); edges now: ${filteredEdges.length}`,
        );

        workflow = {
          ...workflow,
          nodes: filteredNodes,
          edges: filteredEdges,
        };
      }
    }

    // STEP 1.5b: Ensure all resolved nodes are in the workflow
    // This fixes cases where the workflow builder's node filter removed required nodes
    if (resolution.success && resolution.nodeIds.length > 0) {
      // Normalize existing node types to canonical forms for comparison
      const existingNodeTypes = workflow.nodes.map((node: any) => {
        const normalized = normalizeNodeType(node);
        // Also resolve aliases to canonical form (e.g., "gmail" → "google_gmail")
        return resolveNodeType(normalized);
      });
      
      for (const nodeType of resolution.nodeIds) {
        // Resolve nodeType to canonical form (handles aliases like "gmail" → "google_gmail")
        const resolvedNodeType = resolveNodeType(nodeType);
        
        // Check if this canonical type already exists in the workflow
        if (!existingNodeTypes.includes(resolvedNodeType)) {
          console.log(`[WorkflowLifecycle] Adding missing resolved node: ${nodeType} (canonical: ${resolvedNodeType})`);
          // Use resolved canonical type for schema lookup
          const schema = nodeLibrary.getSchema(resolvedNodeType);
          if (schema) {
            const { randomUUID } = require('crypto');
            const newNode: WorkflowNode = {
              id: randomUUID(),
              type: 'custom',
              position: { x: 0, y: 0 },
              data: {
                type: resolvedNodeType, // Use canonical type, not alias
                label: schema.label,
                category: schema.category,
                config: {},
              },
            };
            workflow = {
              ...workflow,
              nodes: [...workflow.nodes, newNode],
            };
            // Add to existingNodeTypes to prevent duplicates in same loop
            existingNodeTypes.push(resolvedNodeType);
          }
        } else {
          console.log(`[WorkflowLifecycle] Skipping duplicate node: ${nodeType} (canonical: ${resolvedNodeType}) - already exists in workflow`);
        }
      }
    }

    // STEP 2: Deduplicate nodes by canonical type BEFORE normalization
    // This prevents duplicate nodes like "gmail" and "google_gmail" from existing simultaneously
    console.log('[WorkflowLifecycle] Step 2: Deduplicating nodes by canonical type...');
    workflow = this.deduplicateNodesByCanonicalType(workflow);
    
    // STEP 2.1: Normalize all node types to canonical forms (replace aliases)
    console.log('[WorkflowLifecycle] Step 2.1: Normalizing all node types to canonical forms...');
    workflow = this.normalizeAllNodeTypesToCanonical(workflow);
    
    // STEP 2.5: Validate workflow structure
    console.log('[WorkflowLifecycle] Step 2.5: Validating workflow structure...');
    const validation = await workflowValidator.validateAndFix(workflow);
    let finalWorkflow = validation.fixedWorkflow || workflow;
    
    // STEP 2.6: Ensure final workflow also has canonical types (after validation fixes)
    finalWorkflow = this.normalizeAllNodeTypesToCanonical(finalWorkflow);
    
    // STEP 2.5: Final Gmail integrity check
    // NOTE: When Smart Planner is active, we trust planner roles (mentioned_only vs data_source)
    // and SKIP legacy Gmail integrity enforcement to avoid over-creating gmail nodes.
    if (!plannerSpec) {
      try {
        const finalNodeTypes = finalWorkflow.nodes.map((node: any) => 
          normalizeNodeType(node)
        );
        nodeResolver.assertGmailIntegrity(userPrompt, finalNodeTypes);
        console.log('[WorkflowLifecycle] ✅ Gmail integrity check passed');
      } catch (error: any) {
        console.error('[WorkflowLifecycle] Gmail integrity check failed:', error.message);
        // Don't fail - just log the error. The workflow may still be valid.
      }
    } else {
      console.log('[WorkflowLifecycle] Skipping legacy Gmail integrity check (Smart Planner active).');
    }

    // STEP 3: Discover credentials (ONLY AFTER graph creation)
    // ✅ CRITICAL: Pass userId to check vault during discovery
    console.log('[WorkflowLifecycle] Step 3: Discovering required credentials...');
    
    // Get userId for vault lookup
    let userId: string | undefined;
    try {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id;
    } catch (error) {
      console.warn('[WorkflowLifecycle] Could not get userId for vault lookup:', error);
    }
    
    const credentialDiscovery = await credentialDiscoveryPhase.discoverCredentials(finalWorkflow, userId);

    console.log(`[WorkflowLifecycle] Credential discovery complete: ${credentialDiscovery.requiredCredentials.length} credential(s) required`);
    console.log(`[WorkflowLifecycle] Satisfied: ${credentialDiscovery.satisfiedCredentials?.length || 0}, Missing: ${credentialDiscovery.missingCredentials?.length || 0}`);
    credentialDiscovery.requiredCredentials.forEach(cred => {
      const status = cred.satisfied ? '✅ SATISFIED' : '❌ MISSING';
      console.log(`  - ${cred.displayName} (${cred.provider}/${cred.type}) ${status} for nodes: ${cred.nodeIds.join(', ')}`);
    });

    // ✅ UX FIX: If OAuth credentials are already connected (satisfied in vault),
    // inject a non-secret credential reference into node config so the UI can
    // display that the node is "connected" without asking for secrets.
    // (Actual tokens remain in `google_oauth_tokens` and are resolved at execution time.)
    finalWorkflow = this.autoInjectSatisfiedCredentialRefs(finalWorkflow, credentialDiscovery);

    // ✅ CRITICAL FIX: Ensure all nodes referenced by credentials exist in workflow
    // This fixes the issue where nodes are removed but credentials are still discovered for them
    const existingNodeIds = new Set(finalWorkflow.nodes.map((n: any) => n.id));
    const missingNodeIds = new Set<string>();
    
    credentialDiscovery.requiredCredentials.forEach(cred => {
      cred.nodeIds.forEach(nodeId => {
        if (!existingNodeIds.has(nodeId)) {
          missingNodeIds.add(nodeId);
        }
      });
    });

    if (missingNodeIds.size > 0) {
      console.warn(`[WorkflowLifecycle] ⚠️  Credentials discovered for ${missingNodeIds.size} missing node(s). These nodes may have been incorrectly removed.`);
      console.warn(`[WorkflowLifecycle] Missing node IDs: ${Array.from(missingNodeIds).join(', ')}`);
      
      // Try to re-add missing nodes based on credential node types
      const nodeTypesToAdd = new Set<string>();
      credentialDiscovery.requiredCredentials.forEach(cred => {
        cred.nodeTypes.forEach(nodeType => {
          // Check if any node of this type exists
          const hasNodeType = finalWorkflow.nodes.some((n: any) => normalizeNodeType(n) === nodeType);
          if (!hasNodeType) {
            nodeTypesToAdd.add(nodeType);
          }
        });
      });

      // REMOVED: Synthetic node generation logic
      // Node types must exist in NodeLibrary - no synthetic nodes allowed
      if (nodeTypesToAdd.size > 0) {
        console.warn(`[WorkflowLifecycle] ⚠️  Credentials discovered for ${nodeTypesToAdd.size} missing node type(s) but synthetic node generation is disabled`);
        console.warn(`[WorkflowLifecycle] Missing node types: ${Array.from(nodeTypesToAdd).join(', ')}`);
        console.warn(`[WorkflowLifecycle] These node types must be present in the workflow before credentials can be attached`);
      }
    }

    // STEP 4: Discover node inputs (AFTER graph generation)
    console.log('[WorkflowLifecycle] Step 4: Discovering required node inputs...');
    const nodeInputs = this.discoverNodeInputs(finalWorkflow);

    return {
      workflow: finalWorkflow,
      requiredCredentials: credentialDiscovery,
      requiredInputs: nodeInputs,
      validation,
      documentation: generationResult.documentation,
      suggestions: generationResult.suggestions,
      estimatedComplexity: generationResult.estimatedComplexity,
      analysis: generationResult.analysis,
    };
  }

  /**
   * Normalize all node types in workflow to canonical forms (replace aliases)
   * This ensures all nodes use canonical types (e.g., "google_gmail" instead of "gmail")
   * 
   * @param workflow - Workflow to normalize
   * @returns Workflow with all node types normalized to canonical forms
   */
  /**
   * Deduplicate nodes by canonical type
   * Removes duplicate nodes that resolve to the same canonical type (e.g., "gmail" and "google_gmail")
   * Keeps the first occurrence and removes subsequent duplicates
   */
  private deduplicateNodesByCanonicalType(workflow: Workflow): Workflow {
    const seenCanonicalTypes = new Map<string, string>(); // canonicalType -> nodeId (first occurrence)
    const nodesToKeep: WorkflowNode[] = [];
    const nodesToRemove: string[] = [];
    let duplicateCount = 0;

    for (const node of workflow.nodes) {
      const nodeType = normalizeNodeType(node);
      if (!nodeType || nodeType === 'custom') {
        // Keep nodes without valid types (they'll be handled elsewhere)
        nodesToKeep.push(node);
        continue;
      }

      // Resolve to canonical type (handles aliases like "gmail" → "google_gmail")
      const canonicalType = resolveNodeType(nodeType);
      
      if (seenCanonicalTypes.has(canonicalType)) {
        // Duplicate found - mark for removal
        const firstNodeId = seenCanonicalTypes.get(canonicalType)!;
        nodesToRemove.push(node.id);
        duplicateCount++;
        console.log(
          `[WorkflowLifecycle] 🚫 Removing duplicate node: ${node.id} (type: "${nodeType}" → canonical: "${canonicalType}") ` +
          `- keeping first occurrence: ${firstNodeId}`
        );
      } else {
        // First occurrence of this canonical type - keep it
        seenCanonicalTypes.set(canonicalType, node.id);
        nodesToKeep.push(node);
      }
    }

    if (duplicateCount > 0) {
      console.log(`[WorkflowLifecycle] ✅ Deduplicated ${duplicateCount} duplicate node(s) by canonical type`);
      
      // Remove edges connected to duplicate nodes
      const nodesToRemoveSet = new Set(nodesToRemove);
      const filteredEdges = workflow.edges.filter(
        (edge: any) => !nodesToRemoveSet.has(edge.source) && !nodesToRemoveSet.has(edge.target)
      );

      return {
        ...workflow,
        nodes: nodesToKeep,
        edges: filteredEdges,
      };
    }

    return workflow;
  }

  private normalizeAllNodeTypesToCanonical(workflow: Workflow): Workflow {
    let normalizedCount = 0;
    
    const normalizedNodes = workflow.nodes.map((node: any) => {
      const originalType = normalizeNodeType(node);
      if (!originalType || originalType === 'custom') {
        return node; // Skip nodes without valid types
      }
      
      // ✅ CRITICAL: Force canonicalization even when alias schemas are registered.
      // `resolveNodeType()` resolves aliases like "gmail" → "google_gmail" using the
      // NodeTypeResolver which has the alias mapping. This ensures all aliases are
      // collapsed to canonical types for downstream connector logic and APIs.
      const canonicalFromLibrary = nodeLibrary.getCanonicalType(originalType);
      const canonicalFromResolver = resolveNodeType(originalType);
      // Use resolver result if it's different (resolved an alias), otherwise use library result
      const canonicalType = (canonicalFromResolver !== originalType) 
        ? canonicalFromResolver 
        : (canonicalFromLibrary || originalType);
      
      // Only update if type changed (was an alias)
      if (canonicalType !== originalType) {
        normalizedCount++;
        console.log(`[WorkflowLifecycle] Normalizing node ${node.id}: "${originalType}" → "${canonicalType}"`);
        
        // Update node with canonical type
        if (node.data) {
          node.data.type = canonicalType;
        } else {
          node.data = { type: canonicalType };
        }
        
        // Ensure type is set to 'custom' for frontend compatibility
        node.type = 'custom';
      } else {
        // Already canonical, but ensure data.type is set correctly
        if (node.data) {
          if (!node.data.type || node.data.type !== canonicalType) {
            node.data.type = canonicalType;
          }
        } else {
          node.data = { type: canonicalType };
        }
        node.type = 'custom';
      }
      
      return node;
    });
    
    if (normalizedCount > 0) {
      console.log(`[WorkflowLifecycle] ✅ Normalized ${normalizedCount} node type(s) to canonical forms`);
    } else {
      console.log(`[WorkflowLifecycle] ✅ All ${normalizedNodes.length} node type(s) already in canonical form`);
    }
    
    return {
      ...workflow,
      nodes: normalizedNodes,
    };
  }

  /**
   * Auto-inject non-secret credential references for satisfied credentials.
   *
   * This improves UX: node properties show `credentialId` for OAuth-connected services,
   * but no secrets are stored in node config.
   */
  private autoInjectSatisfiedCredentialRefs(
    workflow: Workflow,
    credentialDiscovery: any
  ): Workflow {
    const satisfied = credentialDiscovery?.satisfiedCredentials || [];
    if (!Array.isArray(satisfied) || satisfied.length === 0) {
      return workflow;
    }

    // Map: nodeId -> array of satisfied creds that reference it
    const credsByNodeId = new Map<string, any[]>();
    for (const cred of satisfied) {
      const nodeIds: string[] = Array.isArray(cred.nodeIds) ? cred.nodeIds : [];
      for (const nodeId of nodeIds) {
        if (!credsByNodeId.has(nodeId)) credsByNodeId.set(nodeId, []);
        credsByNodeId.get(nodeId)!.push(cred);
      }
    }

    const updatedNodes = workflow.nodes.map((node: any) => {
      const nodeId = node.id;
      const nodeType = normalizeNodeType(node);
      const credsForNode = credsByNodeId.get(nodeId) || [];
      if (credsForNode.length === 0) return node;

      const config = { ...(node.data?.config || {}) };

      for (const cred of credsForNode) {
        // Only auto-inject credentialId for OAuth connectors (google, etc.)
        if (cred.type === 'oauth' && cred.provider) {
          // Use provider vaultKey as stable reference; attach-inputs will also generate
          // scoped credentialIds later if needed.
          if (!config.credentialId) {
            config.credentialId = cred.vaultKey || cred.provider;
          }
        }
      }

      return {
        ...node,
        data: {
          ...(node.data || {}),
          config,
        },
      };
    });

    return { ...workflow, nodes: updatedNodes };
  }

  /**
   * Discover required node inputs from workflow graph
   * 
   * This discovers runtime configuration fields (templates, channels, recipients, etc.)
   * that are NOT credentials. These are separate from credentials.
   * 
   * @param workflow - Complete workflow graph
   * @returns Discovered node inputs
   */
  discoverNodeInputs(workflow: Workflow): {
    inputs: Array<{
      nodeId: string;
      nodeType: string;
      nodeLabel: string;
      fieldName: string;
      fieldType: string;
      description: string;
      required: boolean;
      defaultValue?: any;
      examples?: any[];
    }>;
  } {
    console.log('[WorkflowLifecycle] config_scan_started', {
      nodeCount: workflow.nodes?.length || 0,
    });

    const inputs: Array<{
      nodeId: string;
      nodeType: string;
      nodeLabel: string;
      fieldName: string;
      fieldType: string;
      description: string;
      required: boolean;
      defaultValue?: any;
      examples?: any[];
    }> = [];

    const perNodeMissingFields: Array<{
      nodeId: string;
      nodeType: string;
      missingFields: string[];
    }> = [];

    const isExpressionValue = (value: any): boolean => {
      if (typeof value !== 'string') return false;
      const trimmed = value.trim();
      return trimmed.startsWith('{{') && trimmed.endsWith('}}');
    };

    for (const node of workflow.nodes) {
      const nodeType = normalizeNodeType(node);
      const schema = nodeLibrary.getSchema(nodeType);
      
      if (!schema) {
        continue;
      }

      const nodeLabel = node.data?.label || schema.label;
      const existingConfig = node.data?.config || {};
      const nodeMissingFields: string[] = [];

      // Check required fields from schema
      const requiredFields = schema.configSchema?.required || [];
      for (const fieldName of requiredFields) {
        const existingValue = existingConfig[fieldName];

        // ✅ CRITICAL: For array fields (like if_else conditions), check if array is empty or has empty expressions
        if (fieldName === 'conditions' && nodeType === 'if_else') {
          if (Array.isArray(existingValue) && existingValue.length > 0) {
            // Check if all conditions have valid expressions
            const hasValidCondition = existingValue.some((cond: any) => {
              if (typeof cond === 'object' && cond !== null) {
                // Check for expression field (new format)
                if (cond.expression && typeof cond.expression === 'string' && cond.expression.trim() !== '') {
                  return true;
                }
                // Check for field/operator/value format (new format)
                if (cond.field && cond.operator && cond.value !== undefined && cond.value !== null && cond.value !== '') {
                  return true;
                }
                // Check for legacy format
                if (cond.leftValue || cond.operation || cond.rightValue) {
                  return true;
                }
              }
              return false;
            });
            if (hasValidCondition) {
              console.log(`[DiscoverNodeInputs] ✅ Skipping conditions for if_else node - has valid condition(s)`);
              continue; // Has valid conditions, skip
            }
          }
          // If conditions is missing, empty array, or has no valid expressions, we need to ask for it
        }

        // Skip if field already has concrete value
        // SPECIAL CASE: For google_sheets, treat expression values like {{output}} as NOT satisfied
        if (
          existingValue !== undefined &&
          existingValue !== null &&
          existingValue !== '' &&
          !(nodeType === 'google_sheets' && isExpressionValue(existingValue)) &&
          !(fieldName === 'conditions' && nodeType === 'if_else') // Don't skip conditions for if_else (handled above)
        ) {
          continue;
        }

        // ✅ CRITICAL: Conditional validation for Gmail node
        // messageId is only required when operation === 'get', not for 'send'
        if (nodeType === 'google_gmail' && fieldName === 'messageId') {
          const operation = existingConfig.operation || 'send';
          if (operation !== 'get') {
            console.log(`[DiscoverNodeInputs] Skipping messageId for Gmail node - operation is '${operation}', not 'get'`);
            continue; // Skip messageId for non-get operations
          }
        }

        // ✅ CRITICAL: Skip ALL credential fields (handled separately in credentials section)
        const fieldInfo = schema.configSchema?.optional?.[fieldName];
        const isCredentialField = this.isCredentialField(fieldName, nodeType);
        
        if (isCredentialField) {
          console.log(`[DiscoverNodeInputs] ✅ Skipping credential field "${fieldName}" for ${nodeType} - handled in credentials section`);
          continue; // Credentials handled separately in credentials section
        }

        nodeMissingFields.push(fieldName);

        // ✅ CRITICAL: For if_else conditions field, use array type and provide better description
        let fieldType = fieldInfo?.type || 'string';
        let description = fieldInfo?.description || fieldName;
        let examples = fieldInfo?.examples;
        
        if (nodeType === 'if_else' && fieldName === 'conditions') {
          fieldType = 'array';
          description = 'Conditions to evaluate. Each condition should have: field (string), operator (equals|not_equals|greater_than|less_than|greater_than_or_equal|less_than_or_equal|contains|not_contains), value (string|number|boolean). Example: [{ field: "orderTotal", operator: "greater_than", value: 100 }]';
          examples = [
            [{ field: 'orderTotal', operator: 'greater_than', value: 100 }],
            [{ field: '{{$json.age}}', operator: 'greater_than_or_equal', value: 18 }],
            [{ expression: '{{$json.orderTotal}} > 100' }], // Legacy expression format also supported
          ];
        }

        inputs.push({
          nodeId: node.id,
          nodeType,
          nodeLabel,
          fieldName,
          fieldType,
          description,
          required: true,
          defaultValue: fieldInfo?.default,
          examples,
        });
      }

      // Check optional fields that might need user input (templates, channels, etc.)
      const optionalFields = schema.configSchema?.optional || {};
      for (const [fieldName, fieldInfo] of Object.entries(optionalFields)) {
        const existingValue = existingConfig[fieldName];

        // ✅ UNIVERSAL: Conditional required fields (schema-driven)
        // If a field has `requiredIf: { field, equals }` and the condition is met,
        // treat it as required and prompt when missing.
        const requiredIf = (fieldInfo as any)?.requiredIf as { field: string; equals: any } | undefined;
        const isConditionallyRequired =
          !!requiredIf &&
          typeof requiredIf.field === 'string' &&
          (existingConfig as any)?.[requiredIf.field] === requiredIf.equals;

        // Skip if field already has concrete value
        // SPECIAL CASE: For google_sheets, treat expression values like {{output}} as NOT satisfied
        if (
          existingValue !== undefined &&
          existingValue !== null &&
          existingValue !== '' &&
          !(nodeType === 'google_sheets' && isExpressionValue(existingValue))
        ) {
          continue;
        }

        // ✅ CRITICAL: Skip ALL credential fields (handled separately in credentials section)
        if (this.isCredentialField(fieldName, nodeType)) {
          console.log(`[DiscoverNodeInputs] ✅ Skipping credential field "${fieldName}" for ${nodeType} - handled in credentials section`);
          continue; // Credentials handled separately in credentials section
        }

        // ✅ CRITICAL: Only include fields that are user-configurable inputs
        // For Gmail: to, subject, body, and from (optional) are configurable inputs
        // OAuth credentials handled separately, but 'from' can be overridden
        const fieldNameLower = fieldName.toLowerCase();
        const isUserConfigurable = 
          fieldNameLower.includes('template') ||
          fieldNameLower.includes('channel') ||
          fieldNameLower.includes('subject') ||
          fieldNameLower.includes('body') ||
          fieldNameLower.includes('message') ||
          fieldNameLower.includes('prompt') ||
          fieldNameLower.includes('recipient') || // recipientSource / recipientEmails
          (fieldNameLower === 'to' && nodeType === 'google_gmail') || // Gmail: 'to' is input
          (fieldNameLower === 'subject' && nodeType === 'google_gmail') || // Gmail: 'subject' is input
          (fieldNameLower === 'body' && nodeType === 'google_gmail') || // Gmail: 'body' is input
          (fieldNameLower === 'from' && nodeType === 'google_gmail') || // Gmail: 'from' is optional input (can override OAuth)
          (fieldNameLower.includes('to') && nodeType !== 'google_gmail') ||
          (fieldNameLower.includes('from') && nodeType !== 'google_gmail') || // Other nodes: 'from' is input
          // Google Sheets: spreadsheetId + sheetName + range should always be user-configurable
          (nodeType === 'google_sheets' && (
            fieldNameLower === 'spreadsheetid' ||
            fieldNameLower === 'spreadsheet_id' ||
            fieldNameLower === 'sheetname' ||
            fieldNameLower === 'sheet_name' ||
            fieldNameLower === 'range'
          )) ||
          // LinkedIn: mediaUrl should always be surfaced as a configurable input
          (nodeType === 'linkedin' && fieldNameLower === 'mediaurl');

        if ((isUserConfigurable || isConditionallyRequired) && !existingConfig[fieldName]) {
          if (!nodeMissingFields.includes(fieldName)) {
            nodeMissingFields.push(fieldName);
          }

          inputs.push({
            nodeId: node.id,
            nodeType,
            nodeLabel,
            fieldName,
            fieldType: (fieldInfo as any)?.type || 'string',
            description: (fieldInfo as any)?.description || fieldName,
            required: isConditionallyRequired,
            defaultValue: (fieldInfo as any)?.default,
            examples: (fieldInfo as any)?.examples,
          });
        }
      }

      if (nodeMissingFields.length > 0) {
        perNodeMissingFields.push({
          nodeId: node.id,
          nodeType,
          missingFields: nodeMissingFields,
        });
      }
    }

    console.log('[WorkflowLifecycle] nodes_detected', {
      nodeCount: workflow.nodes?.length || 0,
    });

    console.log('[WorkflowLifecycle] missing_fields_per_node', perNodeMissingFields);

    // ✅ ORGANIZATION: Group inputs by node type for better organization
    // This helps identify which nodes of the same type need the same fields
    const inputsByNodeType = new Map<string, typeof inputs>();
    for (const input of inputs) {
      if (!inputsByNodeType.has(input.nodeType)) {
        inputsByNodeType.set(input.nodeType, []);
      }
      inputsByNodeType.get(input.nodeType)!.push(input);
    }

    // Log organized summary
    console.log(`[WorkflowLifecycle] Discovered ${inputs.length} node input(s) required, organized by type:`);
    for (const [nodeType, typeInputs] of inputsByNodeType.entries()) {
      const nodeIds = [...new Set(typeInputs.map(i => i.nodeId))];
      const fieldNames = [...new Set(typeInputs.map(i => i.fieldName))];
      console.log(`  - ${nodeType}: ${typeInputs.length} input(s) across ${nodeIds.length} node(s) [${nodeIds.join(', ')}] - fields: ${fieldNames.join(', ')}`);
    }

    return { inputs };
  }

  /**
   * Check if a field is a credential field (not a node input)
   * 
   * OAuth-based connectors (google_gmail, slack, etc.) must NEVER expose credential fields.
   * They only use OAuth buttons, not form fields.
   */
  private isCredentialField(fieldName: string, nodeType: string): boolean {
    const fieldNameLower = fieldName.toLowerCase();
    
    // ✅ CRITICAL: Exclude configuration fields that are NOT credentials
    // These fields should be allowed as node inputs
    const isConfigurationField = 
      fieldNameLower === 'webhookurl' || fieldNameLower === 'webhook_url' || // Webhook URL is configuration, not credential
      fieldNameLower === 'callbackurl' || fieldNameLower === 'callback_url' || // OAuth callback URL is configuration
      fieldNameLower === 'redirecturl' || fieldNameLower === 'redirect_url' || // OAuth redirect URL is configuration
      fieldNameLower.includes('message') || // Message fields are not credentials
      fieldNameLower.includes('channel') || // Channel fields are not credentials
      fieldNameLower.includes('text') || // Text fields are not credentials
      fieldNameLower.includes('subject') || // Subject fields are not credentials
      fieldNameLower.includes('body') || // Body fields are not credentials
      fieldNameLower.includes('to') || // To fields are not credentials
      fieldNameLower.includes('from'); // From fields are not credentials
    
    if (isConfigurationField) {
      return false; // Configuration fields are NOT credentials, so they can be node inputs
    }
    
    // ✅ STRICT: Only detect ACTUAL credential fields
    // APIs, OAuths, Secrets, Passwords, Tokens, Keys
    const credentialPatterns = [
      'api_key', 'apikey', 'apiKey', 'api-key',
      'apitoken', 'api_token', 'api-token', 'apiToken',
      'apisecret', 'api_secret', 'api-secret', 'apiSecret',
      'token', 'access_token', 'refresh_token', 'accessToken', 'refreshToken',
      'secret', 'password', 'client_secret', 'clientSecret',
      'oauth', 'client_id', 'clientId',
      'credential', 'credentials', 'credentialId', 'credential_id',
      'bearer', 'authorization', 'auth_token', 'authToken',
      'private_key', 'privateKey', 'public_key', 'publicKey',
      'bottoken', 'bot_token',
      'secrettoken', 'secret_token',
    ];

    // ✅ STRICT: Check if field name matches any credential pattern
    if (credentialPatterns.some(pattern => fieldNameLower.includes(pattern))) {
      // Double-check: exclude webhook URLs and message tokens
      if (fieldNameLower.includes('webhook') && fieldNameLower.includes('url')) {
        return false; // webhookUrl is configuration
      }
      if (fieldNameLower.includes('message') && fieldNameLower.includes('token')) {
        return false; // messageToken is not a credential
      }
      return true;
    }
    
    // ✅ ADDITIONAL: Check for exact matches (case-insensitive)
    const exactMatches = [
      'apikey', 'api_key', 'apiKey',
      'apitoken', 'api_token', 'apiToken',
      'apisecret', 'api_secret', 'apiSecret',
      'accesstoken', 'access_token', 'accessToken',
      'refreshtoken', 'refresh_token', 'refreshToken',
      'credentialid', 'credential_id', 'credentialId',
      'bottoken', 'bot_token',
      'secrettoken', 'secret_token',
      // Note: webhookurl removed - it's configuration, not credential
    ];
    
    if (exactMatches.some(match => fieldNameLower === match || fieldNameLower.replace(/[_-]/g, '') === match.replace(/[_-]/g, ''))) {
      return true;
    }

    // ✅ CRITICAL: Check connector registry for OAuth connectors
    // OAuth connectors (google_gmail, slack) must NEVER show credential fields in inputs
    const connector = connectorRegistry.getConnectorByNodeType(nodeType);
    if (connector) {
      const credentialContract = connector.credentialContract;
      
      // If connector uses OAuth, ALL credential-related fields are excluded
      if (credentialContract.type === 'oauth') {
        // OAuth connectors never expose credential fields - they use OAuth buttons
        const vaultKey = credentialContract.vaultKey?.toLowerCase() || '';
        const provider = credentialContract.provider?.toLowerCase() || '';
        
        // Exclude any field that matches OAuth provider or vault key
        if (fieldNameLower.includes(vaultKey) || 
            fieldNameLower.includes(provider) ||
            vaultKey.includes(fieldNameLower) ||
            provider.includes(fieldNameLower)) {
          return true;
        }
        
        // Exclude OAuth-specific field names
        if (fieldNameLower.includes('google') && nodeType === 'google_gmail') {
          return true; // Google OAuth fields are never inputs
        }
      }
      
      // For non-OAuth connectors (SMTP), still check vault key
      const vaultKey = credentialContract.vaultKey?.toLowerCase() || '';
      if (vaultKey && (fieldNameLower.includes(vaultKey) || vaultKey.includes(fieldNameLower))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Inject credentials into workflow nodes
   * 
   * This is the SECOND phase - called after user provides credentials.
   * Uses connector registry to determine correct credential fields for each node.
   * 
   * @param workflow - Workflow graph (from generateWorkflowGraph)
   * @param credentials - User-provided credentials (vaultKey -> value or credentialId -> value)
   * @returns Workflow with credentials injected
   */
  async injectCredentials(
    workflow: Workflow,
    credentials: Record<string, string | object>
  ): Promise<CredentialInjectionResult> {
    console.log('[WorkflowLifecycle] Injecting credentials into workflow...');
    console.log(`[WorkflowLifecycle] Credentials provided: ${Object.keys(credentials).join(', ')}`);

    const extractCredentialValue = (value: string | object): string | null => {
      if (typeof value === 'string') {
        return value.trim() || null;
      }
      if (typeof value === 'object' && value !== null) {
        const obj = value as any;
        return obj.value || obj.answer || obj.text || null;
      }
      return null;
    };

    // Inject credentials into nodes using connector registry
    const updatedNodes = workflow.nodes.map((node: WorkflowNode) => {
      const nodeType = normalizeNodeType(node);
      const config = { ...(node.data?.config || {}) };
      let updated = false;

      // Get connector for this node type
      const connector = connectorRegistry.getConnectorByNodeType(nodeType);
      
      if (!connector) {
        // No connector found - try to match credentials by field name
        const schema = nodeLibrary.getSchema(nodeType);
        if (schema && schema.configSchema) {
          const requiredFields = schema.configSchema.required || [];
          const optionalFields = Object.keys(schema.configSchema.optional || {});
          const allFields = [...requiredFields, ...optionalFields]; // ✅ Check both required and optional
          
          Object.entries(credentials).forEach(([key, value]) => {
            const credValue = extractCredentialValue(value);
            if (!credValue) return;

            const keyLower = key.toLowerCase();
            
            // ✅ CRITICAL: Check allFields (required + optional) to find credential fields
            allFields.forEach((fieldName: string) => {
              const fieldLower = fieldName.toLowerCase();
              // Match if key contains field name or vice versa, or if field is a credential field
              if (keyLower.includes(fieldLower) || 
                  fieldLower.includes(keyLower.replace(/[^a-z0-9]/g, '')) ||
                  fieldLower.includes('apikey') ||
                  fieldLower.includes('api_key') ||
                  fieldLower.includes('apitoken') ||
                  fieldLower.includes('api_token') ||
                  (fieldLower.includes('key') && !fieldLower.includes('public') && !fieldLower.includes('private')) ||
                  (fieldLower.includes('token') && !fieldLower.includes('refresh'))) {
                config[fieldName] = credValue;
                updated = true;
                console.log(`[WorkflowLifecycle] Applied ${fieldName} to node ${node.id} (${nodeType}) via field matching`);
              }
            });
          });
        }
        return updated ? { ...node, data: { ...node.data, config } } : node;
      }

      // Use connector's credential contract to inject credentials
      const credentialContract = connector.credentialContract;
      const vaultKey = credentialContract.vaultKey;
      
      // Find matching credential value
      let credentialValue: string | null = null;
      
      // Try vaultKey first (e.g., "slack", "smtp", "discord")
      if (credentials[vaultKey]) {
        credentialValue = extractCredentialValue(credentials[vaultKey]);
      }
      
      // Try provider + type combination (e.g., "slack_webhook")
      if (!credentialValue) {
        const credentialId = `${credentialContract.provider}_${credentialContract.type}`;
        if (credentials[credentialId]) {
          credentialValue = extractCredentialValue(credentials[credentialId]);
        }
        // Also try uppercase version
        const credentialIdUpper = credentialId.toUpperCase();
        if (!credentialValue && credentials[credentialIdUpper]) {
          credentialValue = extractCredentialValue(credentials[credentialIdUpper]);
        }
      }
      
      // Try display name normalized (e.g., "Slack Webhook URL" -> "slack_webhook_url")
      if (!credentialValue) {
        const displayNameKey = credentialContract.displayName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        if (credentials[displayNameKey]) {
          credentialValue = extractCredentialValue(credentials[displayNameKey]);
        }
        // Also try uppercase version
        const displayNameKeyUpper = displayNameKey.toUpperCase();
        if (!credentialValue && credentials[displayNameKeyUpper]) {
          credentialValue = extractCredentialValue(credentials[displayNameKeyUpper]);
        }
      }
      
      // Try any key that contains provider or vaultKey (e.g., "my_slack_url")
      if (!credentialValue) {
        for (const [key, value] of Object.entries(credentials)) {
          const keyLower = key.toLowerCase();
          if (keyLower.includes(vaultKey.toLowerCase()) || 
              keyLower.includes(credentialContract.provider.toLowerCase())) {
            credentialValue = extractCredentialValue(value);
            if (credentialValue) break;
          }
        }
      }

      // Try explicit credential key formats (e.g., "SLACK_WEBHOOK_URL", "slack_webhook_url")
      if (!credentialValue && credentialContract.type === 'webhook') {
        const providerUpper = credentialContract.provider.toUpperCase();
        const explicitKeys = [
          `${providerUpper}_WEBHOOK_URL`,
          `${providerUpper}_WEBHOOK`,
          `${credentialContract.provider}_webhook_url`,
          `${credentialContract.provider}_webhook`,
        ];
        for (const explicitKey of explicitKeys) {
          if (credentials[explicitKey]) {
            credentialValue = extractCredentialValue(credentials[explicitKey]);
            if (credentialValue) break;
          }
          // Also try case-insensitive match
          const matchingKey = Object.keys(credentials).find(
            k => k.toLowerCase() === explicitKey.toLowerCase()
          );
          if (matchingKey) {
            credentialValue = extractCredentialValue(credentials[matchingKey]);
            if (credentialValue) break;
          }
        }
      }

      // Webhook-specific fallback: look for provider-specific webhook/url keys
      // This fixes cases where frontend sends "webhookUrl" or "slack_webhook_url"
      // without including the provider name, and ensures Slack URL is still injected.
      // IMPORTANT: Only match if key contains BOTH provider AND webhook/url to avoid conflicts
      if (!credentialValue && credentialContract.type === 'webhook') {
        const providerLower = credentialContract.provider.toLowerCase();
        for (const [key, value] of Object.entries(credentials)) {
          const keyLower = key.toLowerCase();
          // Must contain provider AND (webhook OR url)
          if (keyLower.includes(providerLower) && 
              (keyLower.includes('webhook') || keyLower.includes('url'))) {
            credentialValue = extractCredentialValue(value);
            if (credentialValue) break;
          }
        }
      }

      // ✅ CRITICAL: Check for explicit credentialId field from question answers
      // Questions use field: 'credentialId', so answers come as 'credentialId' or 'req_<nodeId>_credentialId'
      const credentialIdKey = Object.keys(credentials).find(key => 
        key.toLowerCase() === 'credentialid' ||
        key.toLowerCase().endsWith('_credentialid') ||
        key.toLowerCase() === `req_${node.id}_credentialid` ||
        key.toLowerCase() === `${node.id}_credentialid`
      );
      
      if (credentialIdKey) {
        const credentialIdValue = extractCredentialValue(credentials[credentialIdKey]);
        if (credentialIdValue) {
          config.credentialId = credentialIdValue;
          updated = true;
          console.log(`[WorkflowLifecycle] Applied credentialId = ${credentialIdValue} to node ${node.id} (${nodeType})`);
        }
      }

      if (credentialValue) {
        // Get node schema to find credential fields
        const schema = nodeLibrary.getSchema(nodeType);
        if (schema && schema.configSchema) {
          const requiredFields = schema.configSchema.required || [];
          const optionalFields = Object.keys(schema.configSchema.optional || {});
          const allFields = [...requiredFields, ...optionalFields];
          
          // ✅ PRIORITY 1: Use credentialFieldName from connector if specified (data-driven mapping)
          // This takes precedence - HubSpot uses credentialFieldName: 'apiKey'
          if (credentialContract.credentialFieldName && allFields.includes(credentialContract.credentialFieldName)) {
            config[credentialContract.credentialFieldName] = credentialValue;
            updated = true;
            console.log(`[WorkflowLifecycle] ✅ Applied ${credentialContract.credentialFieldName} to ${nodeType} node ${node.id} (data-driven from connector)`);
          }
          
          // ✅ PRIORITY 2: If credentialId field exists in schema, also set it (for reference)
          if (allFields.includes('credentialId') && !config.credentialId) {
            config.credentialId = credentialValue;
            updated = true;
            console.log(`[WorkflowLifecycle] Also applied credentialId to node ${node.id} (${nodeType})`);
          }
          
          // ✅ PRIORITY 3: For api_key type, also inject into apiKey/accessToken if not already set
          if (credentialContract.type === 'api_key' && !config.apiKey && !config.accessToken) {
            if (allFields.includes('apiKey') && !config.apiKey) {
              config.apiKey = credentialValue;
              updated = true;
              console.log(`[WorkflowLifecycle] ✅ Applied apiKey value to ${nodeType} node ${node.id}`);
            }
            if (allFields.includes('accessToken') && !config.accessToken) {
              config.accessToken = credentialValue;
              updated = true;
              console.log(`[WorkflowLifecycle] ✅ Applied accessToken value to ${nodeType} node ${node.id}`);
            }
          }
          
          // Map credential to node config fields based on connector type
          if (credentialContract.type === 'webhook' && credentialContract.provider === 'slack') {
            config.webhookUrl = credentialValue;
            updated = true;
          } else if (credentialContract.type === 'oauth') {
            // ✅ ENHANCED: OAuth credentials are stored in vault, not in node config
            // Store a reference to the vault key for OAuth providers
            // This works for: Google, Microsoft, Twitter, Instagram, YouTube, Facebook, GitHub, LinkedIn, Salesforce, Zoho
            if (allFields.includes('credentialRef')) {
              config.credentialRef = vaultKey;
              updated = true;
            } else if (allFields.includes('credentialId')) {
              // Some OAuth nodes use credentialId instead of credentialRef
              config.credentialId = vaultKey;
              updated = true;
            } else if (allFields.includes('accessToken')) {
              // For OAuth, accessToken can be stored if provided
              config.accessToken = credentialValue;
              updated = true;
            } else {
              // Fallback: store vault key reference
              config.credentialRef = vaultKey;
              updated = true;
            }
            console.log(`[WorkflowLifecycle] Applied OAuth credential reference (vaultKey: ${vaultKey}) to ${nodeType} node ${node.id}`);
          } else if (credentialContract.type === 'api_key' && credentialContract.provider === 'smtp') {
            // SMTP credentials - check for host, username, password
            // This is a simplified version - in production, you'd parse the credential object
            if (typeof credentials[vaultKey] === 'object') {
              const smtpCreds = credentials[vaultKey] as any;
              if (smtpCreds.host) config.host = smtpCreds.host;
              if (smtpCreds.username) config.username = smtpCreds.username;
              if (smtpCreds.password) config.password = smtpCreds.password;
              if (smtpCreds.port) config.port = smtpCreds.port;
              updated = true;
            } else {
              // Single value - try to match to common fields
              if (requiredFields.includes('host')) config.host = credentialValue;
              if (requiredFields.includes('username')) config.username = credentialValue;
              if (requiredFields.includes('password')) config.password = credentialValue;
              updated = true;
            }
          } else if (credentialContract.credentialFieldName && allFields.includes(credentialContract.credentialFieldName)) {
            // ✅ PERMANENT SOLUTION: Data-driven credential field mapping
            // Use credentialFieldName from connector if specified (replaces hardcoded if-else blocks)
            config[credentialContract.credentialFieldName] = credentialValue;
            updated = true;
            console.log(`[WorkflowLifecycle] ✅ Applied ${credentialContract.credentialFieldName} to ${nodeType} node ${node.id} (data-driven from connector)`);
          } else if (credentialContract.type === 'api_key') {
            // ✅ Generic api_key handler: Try common field names
            // First try apiKey (most common)
            if (allFields.includes('apiKey')) {
              config.apiKey = credentialValue;
              updated = true;
              console.log(`[WorkflowLifecycle] Applied apiKey to ${nodeType} node ${node.id}`);
            }
            // Then try apiToken (for Pipedrive-like services)
            else if (allFields.includes('apiToken')) {
              config.apiToken = credentialValue;
              updated = true;
              console.log(`[WorkflowLifecycle] Applied apiToken to ${nodeType} node ${node.id}`);
            }
            // Fallback: search for any field containing 'key' or 'token'
            else {
              for (const field of allFields) {
                const fieldLower = field.toLowerCase();
                if (fieldLower.includes('apikey') || 
                    fieldLower.includes('api_key') ||
                    fieldLower.includes('apitoken') ||
                    fieldLower.includes('api_token') ||
                    (fieldLower.includes('key') && !fieldLower.includes('public') && !fieldLower.includes('private')) ||
                    (fieldLower.includes('token') && !fieldLower.includes('refresh'))) {
                  config[field] = credentialValue;
                  updated = true;
                  console.log(`[WorkflowLifecycle] Applied ${field} to ${nodeType} node ${node.id}`);
                  break;
                }
              }
            }
          } else {
            // Generic credential injection - try to match to all fields (required + optional)
            // ✅ CRITICAL: Check allFields, not just requiredFields, to find credential fields in optional fields
            for (const field of allFields) {
              const fieldLower = field.toLowerCase();
              if (fieldLower.includes('credential') || 
                  fieldLower.includes('token') || 
                  fieldLower.includes('key') ||
                  fieldLower.includes('secret')) {
                config[field] = credentialValue;
                updated = true;
                console.log(`[WorkflowLifecycle] Applied ${field} to node ${node.id} (${nodeType})`);
                break;
              }
            }
          }
        }
      }

      // ✅ CRITICAL: Also check for non-credential config fields from credentials
      // Some fields like "from" (for Gmail) might be provided during credential collection
      // but should be stored in node config, not as credentials
      Object.entries(credentials).forEach(([key, value]) => {
        const credValue = extractCredentialValue(value);
        if (!credValue) return;

        const keyLower = key.toLowerCase();
        const schema = nodeLibrary.getSchema(nodeType);
        if (!schema?.configSchema) return;

        const allFields = [
          ...(schema.configSchema.required || []),
          ...Object.keys(schema.configSchema.optional || {})
        ];

        // Check if this key matches a config field (not a credential field)
        for (const fieldName of allFields) {
          const fieldLower = fieldName.toLowerCase();
          
          // Skip if this is a credential field
          if (this.isCredentialField(fieldName, nodeType)) {
            continue;
          }

          // ✅ ENHANCED: Better field name matching
          // Match exact field name
          const exactMatch = keyLower === fieldLower;
          // Match with node ID prefix: req_<nodeId>_<field> or <nodeId>_<field>
          const nodeIdMatch = keyLower === `req_${node.id}_${fieldLower}` ||
                              keyLower === `${node.id}_${fieldLower}` ||
                              keyLower.endsWith(`_${fieldLower}`) ||
                              keyLower.startsWith(`${fieldLower}_`);
          // Match partial (field name contained in key or vice versa)
          const partialMatch = (keyLower.includes(fieldLower) && fieldLower.length > 2) ||
                              (fieldLower.includes(keyLower.replace(/[^a-z0-9]/g, '')) && keyLower.length > 2);
          
          // ✅ SPECIAL CASE: For Gmail "from" field, be more permissive
          const isGmailFromField = nodeType === 'google_gmail' && fieldLower === 'from';
          const isFromKey = keyLower === 'from' || keyLower.endsWith('_from') || keyLower.includes('_from_');
          
          if (exactMatch || nodeIdMatch || partialMatch || (isGmailFromField && isFromKey)) {
            // Only set if not already set
            if (!config[fieldName] || config[fieldName] === '') {
              config[fieldName] = credValue;
              updated = true;
              console.log(`[WorkflowLifecycle] ✅ Applied config field ${fieldName} = ${credValue} to node ${node.id} (${nodeType}) from key: ${key}`);
            }
            break;
          }
        }
      });

      return updated ? { ...node, data: { ...node.data, config } } : node;
    });

    const workflowWithCredentials = {
      ...workflow,
      nodes: updatedNodes,
    };

    console.log(`[WorkflowLifecycle] Updated ${updatedNodes.filter((n, i) => n !== workflow.nodes[i]).length} node(s) with credentials`);

    // Validate workflow after credential injection
    console.log('[WorkflowLifecycle] Validating workflow after credential injection...');
    const validation = await workflowValidator.validateAndFix(workflowWithCredentials);

    // ✅ CRITICAL: Check credentials FIRST - this is the primary purpose of credential injection
    // Workflow structure validation errors are less critical and can be fixed later
    const credentialDiscovery = await credentialDiscoveryPhase.discoverCredentials(workflowWithCredentials);
    // ✅ CRITICAL: Only filter for credentials that are required AND not satisfied
    const missingCredentials = credentialDiscovery.requiredCredentials.filter(cred => cred.required && !cred.satisfied);
    
    const errors: string[] = [];
    
    // ✅ PRIMARY CHECK: Credential satisfaction (this is what we're here for)
    console.log(`[WorkflowLifecycle] Credential check: ${credentialDiscovery.requiredCredentials.length} required, ${missingCredentials.length} missing`);
    if (missingCredentials.length > 0) {
      const missingNames = missingCredentials.map(c => c.displayName).join(', ');
      console.log(`[WorkflowLifecycle] ❌ Missing credentials: ${missingNames}`);
      errors.push(`Missing required credentials: ${missingNames}`);
    } else {
      console.log('[WorkflowLifecycle] ✅ All required credentials are satisfied');
    }
    
    // ✅ SECONDARY CHECK: Workflow structure validation (warnings, not blockers for credential injection)
    if (!validation.valid) {
      console.log(`[WorkflowLifecycle] ⚠️ Workflow validation found ${validation.errors.length} error(s) (non-blocking for credential injection):`, validation.errors.map(e => e.message));
      // Only add critical workflow errors that would prevent saving
      // Don't block credential injection for minor structure issues
      validation.errors.forEach(err => {
        // Only include critical severity errors (high/medium are warnings for credential injection)
        // Also ignore common non-blocking warnings
        if (err.severity === 'critical' && 
            !err.message.includes('no outgoing connection') && 
            !err.message.includes('no output nodes') &&
            !err.message.includes('no incoming connection')) {
          errors.push(err.message);
        }
      });
    } else {
      console.log('[WorkflowLifecycle] ✅ Workflow validation passed');
    }

    // ✅ SUCCESS if credentials are satisfied (even if workflow has minor validation issues)
    // The workflow structure can be fixed in a separate step
    const success = missingCredentials.length === 0;
    console.log(`[WorkflowLifecycle] Credential injection result: ${success ? 'SUCCESS' : 'FAILED'} (missing credentials: ${missingCredentials.length}, workflow errors: ${errors.length - missingCredentials.length})`);
    
    if (!success) {
      console.log(`[WorkflowLifecycle] Errors:`, errors);
    }

    return {
      workflow: validation.fixedWorkflow || workflowWithCredentials,
      validation,
      success,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Validate workflow is ready for execution
   * 
   * Checks that:
   * - All required credentials are injected
   * - Workflow structure is valid
   * - No missing required fields
   * 
   * @param workflow - Workflow to validate
   * @param userId - Optional user ID for credential vault checks
   * @returns Validation result
   */
  async validateExecutionReady(
    workflow: Workflow,
    userId?: string
  ): Promise<{
    ready: boolean;
    errors: string[];
    missingCredentials: string[];
  }> {
    console.log('[WorkflowLifecycle] Validating workflow execution readiness...');

    const errors: string[] = [];
    const missingCredentialMessages: string[] = [];

    // Validate workflow structure
    const validation = await workflowValidator.validateAndFix(workflow);
    if (!validation.valid) {
      validation.errors.forEach(err => {
        errors.push(err.message);
      });
    }

    // ✅ CRITICAL: Check credentials with vault lookup
    const credentialDiscovery = await credentialDiscoveryPhase.discoverCredentials(workflow, userId);
    
    // ✅ CRITICAL: Only validate MISSING credentials - satisfied ones are already in vault
    const missingCredentials = credentialDiscovery.missingCredentials || [];
    
    // ✅ PRODUCTION: Strict validation - verify MISSING credentials are INJECTED into nodes
    // Satisfied credentials (already in vault) don't need injection
    for (const cred of missingCredentials) {
      if (cred.required && !cred.satisfied) {
        // Check if credential is present in ALL nodes that require it
        let allNodesHaveCredential = true;
        const missingNodeIds: string[] = [];
        
        for (const nodeId of cred.nodeIds) {
          const node = workflow.nodes.find(n => n.id === nodeId);
          if (!node) {
            missingNodeIds.push(nodeId);
            allNodesHaveCredential = false;
            continue;
          }
          
          const config = node.data?.config || {};
          const nodeType = normalizeNodeType(node);
          
          // Get connector for this node to determine expected credential fields
          const connector = connectorRegistry.getConnectorByNodeType(nodeType);
          let found = false;
          
          if (connector && connector.credentialContract.vaultKey === cred.vaultKey) {
            // Check for credential reference or actual credential value
            // For OAuth: check for credentialRef or access_token
            // For webhook: check for webhookUrl
            // For SMTP: check for host, username, password
            if (cred.type === 'oauth') {
              found = !!(config.credentialRef === cred.vaultKey || 
                       config.access_token || 
                       config.refresh_token);
            } else if (cred.type === 'webhook') {
              found = !!(config.webhookUrl || config.webhook_url);
            } else if (cred.type === 'api_key') {
              // SMTP or other API key types
              if (cred.provider === 'smtp') {
                found = !!(config.host && (config.username || config.password));
              } else {
                found = !!(config.apiKey || config.api_key || config.token);
              }
            } else {
              // Generic check for any credential-like field
              const vaultKeyLower = cred.vaultKey.toLowerCase();
              found = Object.keys(config).some(key => {
                const keyLower = key.toLowerCase();
                const value = config[key];
                return (keyLower.includes(vaultKeyLower) || 
                       keyLower.includes(cred.provider.toLowerCase())) &&
                       value && 
                       typeof value === 'string' && 
                       value.trim().length > 0 &&
                       !value.startsWith('{{ENV.');
              });
            }
          } else {
            // Fallback: check for any credential-like field
            const vaultKeyLower = cred.vaultKey.toLowerCase();
            found = Object.keys(config).some(key => {
              const keyLower = key.toLowerCase();
              const value = config[key];
              return (keyLower.includes(vaultKeyLower) || 
                     keyLower.includes(cred.provider.toLowerCase())) &&
                     value && 
                     typeof value === 'string' && 
                     value.trim().length > 0 &&
                     !value.startsWith('{{ENV.');
            });
          }
          
          if (!found) {
            missingNodeIds.push(nodeId);
            allNodesHaveCredential = false;
          }
        }
        
        if (!allNodesHaveCredential) {
          missingCredentialMessages.push(`${cred.displayName} (missing in nodes: ${missingNodeIds.join(', ')})`);
        }
      }
    }

    if (missingCredentialMessages.length > 0) {
      errors.push(`Missing required credentials: ${missingCredentialMessages.join(', ')}`);
    }

    return {
      ready: errors.length === 0,
      errors,
      missingCredentials: missingCredentialMessages, // Return string array, not CredentialRequirement[]
    };
  }
}

// Export singleton instance
export const workflowLifecycleManager = new WorkflowLifecycleManager();
