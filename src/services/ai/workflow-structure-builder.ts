/**
 * Workflow Structure Builder
 * 
 * Builds workflow structure from structured intent using sample workflows.
 * This is STEP 2 of the pipeline: Structured Intent → Workflow Structure
 * 
 * Rules:
 * - Load sample workflow templates
 * - Compare structured intent with templates
 * - Add missing required nodes
 * - Enforce policies (no self-loops, trigger must have outgoing edge, etc.)
 * 
 * CRITICAL: Edges are created ONLY from intent plan
 * - Parse user intent into ordered steps
 * - Generate node sequence from intent.actions order
 * - Connect sequentially only (A → B → C)
 * - NO heuristic edge creation
 * - NO auto-connection based on node types
 * 
 * GLOBAL RULE: Output nodes cannot connect to data source nodes
 * - Output nodes: gmail, slack, notification, webhook_response
 * - Data source nodes: database, sheets, storage
 * - Block output → data edges by default (unless explicitly requested)
 */

import { StructuredIntent } from './intent-structurer';
import { workflowTrainingService } from './workflow-training-service';
import { nodeLibrary } from '../nodes/node-library';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { ollamaOrchestrator } from './ollama-orchestrator';
import type { WorkflowGenerationStructure, WorkflowStepDefinition } from '../../core/types/ai-types';
import { getEmbeddingGenerator } from '../../memory/utils/embeddings';
import { dagValidator } from '../../core/validation/dag-validator';

export interface WorkflowStructure {
  trigger: string;
  trigger_config?: Record<string, any>;
  nodes: Array<{
    id: string;
    type: string;
    config?: Record<string, any>;
  }>;
  connections: Array<{
    source: string;
    target: string;
    sourceOutput: string;
    targetInput: string;
    type?: string; // DAG Rule: "true", "false", "case_1", "case_2", etc. for IF/SWITCH edges
  }>;
  /**
   * Optional metadata used for analysis/UX (does NOT affect graph building)
   */
  meta?: {
    origin: 'sample' | 'scratch';
    matchedSampleId?: string;
  };
}

export class WorkflowStructureBuilder {
  // ✅ OPTIMIZATION: Cache for similarity results (key: workflowId + userPrompt hash)
  private similarityCache: Map<string, { score: number; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 3600000; // 1 hour in milliseconds
  
  // ✅ OPTIMIZATION: Cache for workflow embeddings (key: workflowId)
  private workflowEmbeddingsCache: Map<string, number[]> = new Map();
  
  // ✅ OPTIMIZATION: Max LLM calls per request
  private readonly MAX_LLM_CALLS = 5;
  
  // ✅ OPTIMIZATION: Top candidates to send to LLM after embedding pre-filter
  private readonly TOP_CANDIDATES_FOR_LLM = 5;

  /**
   * Validate that all node types in intent exist in NodeLibrary
   * CRITICAL: No synthetic node generation allowed
   */
  private validateNodeTypesInIntent(intent: StructuredIntent): string[] {
    const invalidTypes: string[] = [];

    // Validate trigger type
    if (intent.trigger) {
      const { resolveNodeType } = require('../../core/utils/node-type-resolver-util');
      try {
        const resolvedTrigger = resolveNodeType(intent.trigger);
        const triggerSchema = nodeLibrary.getSchema(resolvedTrigger);
        if (!triggerSchema) {
          invalidTypes.push(intent.trigger);
          console.error(`[WorkflowStructureBuilder] ❌ Invalid trigger type: "${intent.trigger}" not found in NodeLibrary`);
        }
      } catch (error) {
        invalidTypes.push(intent.trigger);
        console.error(`[WorkflowStructureBuilder] ❌ Failed to resolve trigger type: "${intent.trigger}"`, error);
      }
    }

    // Validate all action node types
    if (intent.actions && intent.actions.length > 0) {
      const { resolveNodeType } = require('../../core/utils/node-type-resolver-util');
      for (const action of intent.actions) {
        try {
          const resolvedType = resolveNodeType(action.type);
          const schema = nodeLibrary.getSchema(resolvedType);
          if (!schema) {
            invalidTypes.push(action.type);
            console.error(`[WorkflowStructureBuilder] ❌ Invalid node type: "${action.type}" (resolved: "${resolvedType}") not found in NodeLibrary`);
          } else {
            console.log(`[WorkflowStructureBuilder] ✅ Node type validated: "${action.type}" → "${resolvedType}"`);
          }
        } catch (error) {
          invalidTypes.push(action.type);
          console.error(`[WorkflowStructureBuilder] ❌ Failed to resolve node type: "${action.type}"`, error);
        }
      }
    }

    return invalidTypes;
  }

  /**
   * Check if node type is an output node (should not connect to data sources)
   */
  private isOutputNodeType(nodeType: string): boolean {
    const outputNodeTypes = [
      'google_gmail', 'gmail', 'email',
      'slack_message', 'slack', 'slack_webhook',
      'discord', 'discord_webhook',
      'telegram',
      'microsoft_teams',
      'whatsapp_cloud',
      'twilio',
      'webhook_response', 'respond_to_webhook',
      'notification',
      'log_output', // Also consider log as output
    ];
    return outputNodeTypes.some(type => nodeType.includes(type) || type === nodeType);
  }

  /**
   * Check if node type is a data source node (should not receive connections from output nodes)
   */
  private isDataSourceNodeType(nodeType: string): boolean {
    const dataSourceNodeTypes = [
      'google_sheets', 'sheets',
      'database_read', 'database_write', 'database',
      'supabase', 'postgresql', 'mysql', 'mongodb', 'redis',
      'aws_s3', 's3',
      'dropbox', 'onedrive',
      'storage',
      'airtable',
      'notion',
    ];
    return dataSourceNodeTypes.some(type => nodeType.includes(type) || type === nodeType);
  }

  /**
   * Validate that connection is not output → data source (global rule)
   * Returns true if connection is valid, false if it should be blocked
   */
  private validateOutputToDataSourceConnection(
    sourceNodeType: string,
    targetNodeType: string
  ): { valid: boolean; reason?: string } {
    const isOutput = this.isOutputNodeType(sourceNodeType);
    const isDataSource = this.isDataSourceNodeType(targetNodeType);

    if (isOutput && isDataSource) {
      return {
        valid: false,
        reason: `Output node (${sourceNodeType}) cannot connect to data source node (${targetNodeType}) unless explicitly requested`,
      };
    }

    return { valid: true };
  }

  /**
   * Get similarity score for best matching workflow (without building structure)
   * Used by IntentAutoExpander to check if expansion is needed
   */
  async getBestSimilarityScore(intent: StructuredIntent, userPrompt?: string): Promise<number | null> {
    const allWorkflows = workflowTrainingService.getAllWorkflows();
    if (allWorkflows.length === 0) {
      return null;
    }

    // Group workflows by priority
    const workflowsByPriority = new Map<number, any[]>();
    allWorkflows.forEach(w => {
      const priority = (w as any)._priority || 5;
      if (!workflowsByPriority.has(priority)) {
        workflowsByPriority.set(priority, []);
      }
      workflowsByPriority.get(priority)!.push(w);
    });

    const priorities = [1, 2, 3, 4].filter(p => workflowsByPriority.has(p));
    const SIMILARITY_THRESHOLD = 0.75;
    const scoredWorkflows: Array<{ score: number; baseScore: number; priority: number }> = [];

    for (const priority of priorities) {
      const workflows = workflowsByPriority.get(priority)!;
      const priorityScores = await Promise.all(
        workflows.map(async (workflow) => {
          const baseScore = await this.calculateSimilarity(workflow, intent, userPrompt);
          const priorityBoost = priority === 1 ? 0.10 : 
                               priority === 2 ? 0.05 :
                               priority === 3 ? 0.02 : 0;
          const finalScore = Math.min(1.0, baseScore + priorityBoost);
          return { score: finalScore, baseScore, priority };
        })
      );
      scoredWorkflows.push(...priorityScores);
    }

    if (scoredWorkflows.length === 0) {
      return null;
    }

    scoredWorkflows.sort((a, b) => {
      if (Math.abs(a.score - b.score) < 0.01) {
        return a.priority - b.priority;
      }
      return b.score - a.score;
    });

    return scoredWorkflows[0]?.score || null;
  }

  /**
   * Build workflow structure from structured intent
   */
  async buildStructure(intent: StructuredIntent, userPrompt?: string): Promise<WorkflowStructure> {
    console.log(`[WorkflowStructureBuilder] Building structure from intent:`, JSON.stringify(intent, null, 2));

    // Step 0: Map intent to capabilities and get allowed nodes
    // ✅ CRITICAL: Workflow builder must only use nodes from allowed capability list
    console.log(`[WorkflowStructureBuilder] STEP 0: Mapping intent to capabilities`);
    const { mapIntentToCapabilities } = await import('./intent-capability-mapper');
    const capabilityMapping = mapIntentToCapabilities(intent);
    const allowedNodeTypes = new Set(capabilityMapping.allowedNodes);
    console.log(`[WorkflowStructureBuilder] ✅ Allowed nodes from capabilities: ${capabilityMapping.allowedNodes.join(', ')}`);
    console.log(`[WorkflowStructureBuilder] ✅ Capability statistics:`, capabilityMapping.statistics);

    // Step 0.1: Validate all node types exist in NodeLibrary (no synthetic nodes allowed)
    const invalidNodeTypes = this.validateNodeTypesInIntent(intent);
    if (invalidNodeTypes.length > 0) {
      const errorMessage = `Invalid node types detected: ${invalidNodeTypes.join(', ')}. These node types are not available in the node library.`;
      console.error(`[WorkflowStructureBuilder] ❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }
    
    // Step 0.2: Validate intent actions are in allowed node list
    const disallowedActions = intent.actions?.filter(action => {
      const normalized = unifiedNormalizeNodeTypeString(action.type);
      return !allowedNodeTypes.has(normalized);
    }) || [];
    
    if (disallowedActions.length > 0) {
      console.warn(`[WorkflowStructureBuilder] ⚠️  Some actions not in allowed capability list: ${disallowedActions.map(a => a.type).join(', ')}`);
      // Filter out disallowed actions (they will be handled by capability mapper)
      intent.actions = intent.actions.filter(action => {
        const normalized = unifiedNormalizeNodeTypeString(action.type);
        return allowedNodeTypes.has(normalized);
      });
      console.log(`[WorkflowStructureBuilder] ✅ Filtered intent actions to allowed nodes only`);
    }

    // ✅ PERFORMANCE FIX: Removed slow sample workflow matching (30+ min delay)
    // AI generates good workflows from prompts - no need for expensive matching
    // Sample workflows are still used as few-shot examples in prompts (fast, no matching overhead)
    console.log(`[WorkflowStructureBuilder] Building workflow from user intent (AI-generated, no sample matching)`);
    let structure = this.buildFromScratch(intent);

    // Step 3: Add missing required nodes (only from allowed capability list)
    structure = this.addMissingNodes(structure, intent, allowedNodeTypes);

    // Step 4: Add conditional logic if needed
    if (intent.conditions && intent.conditions.length > 0) {
      structure = this.addConditionalLogic(structure, intent.conditions);
    }

    // Step 5: Enforce policies
    structure = this.enforcePolicies(structure);

    // Step 6: Build connections
    structure = this.buildConnections(structure);

    // Step 7: Validate acyclic graph and remove cycles
    structure = this.validateAcyclicGraph(structure);

    // Step 8: ✅ ROOT-LEVEL FIX - Validate DAG rules and enforce structure
    const dagValidation = dagValidator.validateAndFix(structure);
    if (!dagValidation.result.valid) {
      console.error(`[WorkflowStructureBuilder] ❌ DAG validation failed:`);
      dagValidation.result.errors.forEach(error => {
        console.error(`  - ${error}`);
      });
      
      // If critical errors, rebuild as linear chain (fallback)
      if (dagValidation.result.errors.some(e => 
        e.includes('Trigger must have') || 
        e.includes('Burst flow') || 
        e.includes('Cycle detected')
      )) {
        console.warn(`[WorkflowStructureBuilder] ⚠️  Critical DAG errors detected, rebuilding as linear chain`);
        structure = this.rebuildAsLinearChain(intent, structure);
        // Re-validate after rebuild
        const revalidation = dagValidator.validateAndFix(structure);
        if (!revalidation.result.valid) {
          console.error(`[WorkflowStructureBuilder] ❌ DAG validation still failing after rebuild`);
          revalidation.result.errors.forEach(error => {
            console.error(`  - ${error}`);
          });
        }
        // Ensure trigger and connection fields are always set (validator may return optional fields)
        const validatedStructure = revalidation.structure;
        return {
          ...validatedStructure,
          trigger: validatedStructure.trigger || structure.trigger || 'manual_trigger',
          connections: validatedStructure.connections.map(conn => ({
            ...conn,
            sourceOutput: conn.sourceOutput || 'output',
            targetInput: conn.targetInput || 'input',
          })),
        };
      }
    }
    
    if (dagValidation.result.warnings.length > 0) {
      dagValidation.result.warnings.forEach(warning => {
        console.warn(`[WorkflowStructureBuilder] ⚠️  ${warning}`);
      });
    }

    // Ensure trigger and connection fields are always set (validator may return optional fields)
    const validatedStructure = dagValidation.structure;
    // Preserve original connection fields if available, otherwise use defaults
    const originalConnectionsMap = new Map(
      structure.connections.map(conn => [`${conn.source}→${conn.target}`, conn])
    );
    
    return {
      ...validatedStructure,
      trigger: validatedStructure.trigger || structure.trigger || 'manual_trigger',
      connections: validatedStructure.connections.map(conn => {
        const originalConn = originalConnectionsMap.get(`${conn.source}→${conn.target}`);
        return {
          ...conn,
          sourceOutput: conn.sourceOutput || originalConn?.sourceOutput || 'output',
          targetInput: conn.targetInput || originalConn?.targetInput || 'input',
        };
      }),
    };
  }

  /**
   * Find matching sample workflow
   * ✅ OPTIMIZED: Uses embedding-based pre-filtering, limits LLM calls to top 5 candidates
   */
  private async findMatchingSampleWorkflow(intent: StructuredIntent, userPrompt?: string): Promise<any | null> {
    const allWorkflows = workflowTrainingService.getAllWorkflows();
    console.log(`[WorkflowStructureBuilder] Checking ${allWorkflows.length} sample workflows for matching (optimized with embeddings)...`);
    
    // Log priority breakdown
    const priority1Count = allWorkflows.filter(w => (w as any)._priority === 1).length;
    const priority2Count = allWorkflows.filter(w => (w as any)._priority === 2).length;
    const priority3Count = allWorkflows.filter(w => (w as any)._priority === 3).length;
    const priority4Count = allWorkflows.filter(w => (w as any)._priority === 4).length;
    console.log(`[WorkflowStructureBuilder]   Priority 1 (modern examples): ${priority1Count}`);
    console.log(`[WorkflowStructureBuilder]   Priority 2 (high-value training): ${priority2Count}`);
    console.log(`[WorkflowStructureBuilder]   Priority 3 (medium-value training): ${priority3Count}`);
    console.log(`[WorkflowStructureBuilder]   Priority 4 (standard training): ${priority4Count}`);
    
    const SIMILARITY_THRESHOLD = 0.75; // 75% threshold as per spec
    
    // ✅ STEP 1: Pre-filter using embeddings cosine similarity (if user prompt provided)
    let preFilteredWorkflows = allWorkflows;
    if (userPrompt && userPrompt.trim().length > 0) {
      try {
        preFilteredWorkflows = await this.preFilterWithEmbeddings(allWorkflows, userPrompt);
        console.log(`[WorkflowStructureBuilder] ✅ Pre-filtered ${allWorkflows.length} → ${preFilteredWorkflows.length} workflows using embeddings`);
      } catch (error) {
        console.warn(`[WorkflowStructureBuilder] ⚠️  Embedding pre-filter failed, using all workflows:`, error);
        // Fallback to all workflows if embedding fails
      }
    }
    
    // Group workflows by priority
    const workflowsByPriority = new Map<number, any[]>();
    preFilteredWorkflows.forEach(w => {
      const priority = (w as any)._priority || 5;
      if (!workflowsByPriority.has(priority)) {
        workflowsByPriority.set(priority, []);
      }
      workflowsByPriority.get(priority)!.push(w);
    });
    
    // Process each priority group (1 → 2 → 3 → 4)
    const priorities = [1, 2, 3, 4].filter(p => workflowsByPriority.has(p));
    const scoredWorkflows: Array<{
      workflow: any;
      score: number;
      baseScore: number;
      priority: number;
      source: string;
    }> = [];
    
    // ✅ Track LLM calls to ensure we don't exceed MAX_LLM_CALLS
    let llmCallCount = 0;
    
    for (const priority of priorities) {
      const workflows = workflowsByPriority.get(priority)!;
      console.log(`[WorkflowStructureBuilder] Processing Priority ${priority} workflows (${workflows.length} workflows, ${llmCallCount}/${this.MAX_LLM_CALLS} LLM calls used)...`);
      
      // ✅ STEP 2: Calculate structural similarity first (no LLM calls)
      const structuralScores = await Promise.all(
        workflows.map(async (workflow) => {
          const structuralScore = await this.calculateStructuralSimilarity(workflow, intent);
          return { workflow, structuralScore, priority };
        })
      );
      
      // ✅ STEP 3: Sort by structural similarity and take top candidates for LLM
      structuralScores.sort((a, b) => b.structuralScore - a.structuralScore);
      
      // Only send top candidates to LLM (max 5)
      const topCandidates = structuralScores.slice(0, this.TOP_CANDIDATES_FOR_LLM);
      const remainingCandidates = structuralScores.slice(this.TOP_CANDIDATES_FOR_LLM);
      
      // Process top candidates with LLM (if we haven't exceeded limit)
      const topScores = await Promise.all(
        topCandidates.map(async ({ workflow, structuralScore, priority }) => {
          const source = (workflow as any)._source || 'unknown';
          
          // Check if we can make LLM call
          if (llmCallCount < this.MAX_LLM_CALLS && userPrompt && userPrompt.trim().length > 0) {
            llmCallCount++;
            const aiScore = await this.calculateAISimilarityCached(workflow, userPrompt);
            const baseScore = (structuralScore * 0.6) + (aiScore * 0.4);
            
            // Apply priority boost
            const priorityBoost = priority === 1 ? 0.10 : 
                                 priority === 2 ? 0.05 :
                                 priority === 3 ? 0.02 : 0;
            const finalScore = Math.min(1.0, baseScore + priorityBoost);
            
            return { 
              workflow, 
              score: finalScore,
              baseScore,
              priority,
              source
            };
          } else {
            // Use structural similarity only (no LLM call)
            const priorityBoost = priority === 1 ? 0.10 : 
                                 priority === 2 ? 0.05 :
                                 priority === 3 ? 0.02 : 0;
            const finalScore = Math.min(1.0, structuralScore + priorityBoost);
            
            return { 
              workflow, 
              score: finalScore,
              baseScore: structuralScore,
              priority,
              source
            };
          }
        })
      );
      
      // Process remaining candidates with structural similarity only (no LLM)
      const remainingScores = remainingCandidates.map(({ workflow, structuralScore, priority }) => {
        const source = (workflow as any)._source || 'unknown';
        const priorityBoost = priority === 1 ? 0.10 : 
                             priority === 2 ? 0.05 :
                             priority === 3 ? 0.02 : 0;
        const finalScore = Math.min(1.0, structuralScore + priorityBoost);
        
        return { 
          workflow, 
          score: finalScore,
          baseScore: structuralScore,
          priority,
          source
        };
      });
      
      scoredWorkflows.push(...topScores, ...remainingScores);
      
      // ✅ EARLY EXIT: Check if we found a match above threshold
      const currentBest = [...scoredWorkflows].sort((a, b) => {
        if (Math.abs(a.score - b.score) < 0.01) {
          return a.priority - b.priority;
        }
        return b.score - a.score;
      })[0];
      
      if (currentBest && currentBest.score >= SIMILARITY_THRESHOLD) {
        const boostInfo = currentBest.score > currentBest.baseScore
          ? ` (base: ${(currentBest.baseScore * 100).toFixed(1)}% + priority boost: ${((currentBest.score - currentBest.baseScore) * 100).toFixed(1)}%)`
          : '';
        const priorityLabel = currentBest.priority === 1 ? 'modern' :
                             currentBest.priority === 2 ? 'high-value' :
                             currentBest.priority === 3 ? 'medium-value' : 'standard';
        console.log(`✅ [WorkflowStructureBuilder] Early exit: Found match above threshold in Priority ${priority}`);
        console.log(`[WorkflowStructureBuilder] Best match: ${currentBest.workflow.id || 'unknown'} (score: ${(currentBest.score * 100).toFixed(1)}%${boostInfo}, priority: ${currentBest.priority} [${priorityLabel}], source: ${currentBest.source})`);
        console.log(`[WorkflowStructureBuilder] LLM calls used: ${llmCallCount}/${this.MAX_LLM_CALLS}`);
        if (currentBest.workflow.goal) {
          console.log(`[WorkflowStructureBuilder]   Goal: "${currentBest.workflow.goal}"`);
        }
        return currentBest.workflow;
      }
    }

    // Sort all results and return best match
    scoredWorkflows.sort((a, b) => {
      if (Math.abs(a.score - b.score) < 0.01) {
        return a.priority - b.priority;
      }
      return b.score - a.score;
    });
    
    const bestMatch = scoredWorkflows[0];
    
    if (bestMatch) {
      const boostInfo = bestMatch.score > bestMatch.baseScore
        ? ` (base: ${(bestMatch.baseScore * 100).toFixed(1)}% + priority boost: ${((bestMatch.score - bestMatch.baseScore) * 100).toFixed(1)}%)`
        : '';
      const priorityLabel = bestMatch.priority === 1 ? 'modern' :
                           bestMatch.priority === 2 ? 'high-value' :
                           bestMatch.priority === 3 ? 'medium-value' : 'standard';
      console.log(`[WorkflowStructureBuilder] Best match: ${bestMatch.workflow.id || 'unknown'} (score: ${(bestMatch.score * 100).toFixed(1)}%${boostInfo}, priority: ${bestMatch.priority} [${priorityLabel}], source: ${bestMatch.source})`);
      console.log(`[WorkflowStructureBuilder] LLM calls used: ${llmCallCount}/${this.MAX_LLM_CALLS}`);
      if (bestMatch.workflow.goal) {
        console.log(`[WorkflowStructureBuilder]   Goal: "${bestMatch.workflow.goal}"`);
      }
    }
    
    if (bestMatch && bestMatch.score >= SIMILARITY_THRESHOLD) {
      return bestMatch.workflow;
    }

    return null;
  }

  /**
   * ✅ OPTIMIZATION: Pre-filter workflows using embeddings cosine similarity
   * Returns top candidates based on embedding similarity (fast, no LLM calls)
   */
  private async preFilterWithEmbeddings(workflows: any[], userPrompt: string): Promise<any[]> {
    const embeddingGenerator = getEmbeddingGenerator();
    
    if (!embeddingGenerator.isAvailable()) {
      console.log(`[WorkflowStructureBuilder] Embeddings not available, skipping pre-filter`);
      return workflows;
    }

    try {
      // Generate embedding for user prompt
      const promptEmbedding = await embeddingGenerator.generateEmbedding(userPrompt);
      
      // Calculate cosine similarity for each workflow
      const workflowScores: Array<{ workflow: any; similarity: number }> = [];
      
      for (const workflow of workflows) {
        const workflowDescription = this.extractWorkflowDescription(workflow);
        if (!workflowDescription || workflowDescription.trim().length === 0) {
          continue;
        }
        
        // Get or generate workflow embedding (cached)
        const workflowId = workflow.id || JSON.stringify(workflow);
        let workflowEmbedding = this.workflowEmbeddingsCache.get(workflowId);
        
        if (!workflowEmbedding) {
          workflowEmbedding = await embeddingGenerator.generateEmbedding(workflowDescription);
          this.workflowEmbeddingsCache.set(workflowId, workflowEmbedding);
        }
        
        // Calculate cosine similarity
        const similarity = embeddingGenerator.cosineSimilarity(promptEmbedding, workflowEmbedding);
        workflowScores.push({ workflow, similarity });
      }
      
      // Sort by similarity and return top candidates (keep more than TOP_CANDIDATES_FOR_LLM to account for priority)
      workflowScores.sort((a, b) => b.similarity - a.similarity);
      
      // Return top 20 candidates (will be further filtered by priority and structural similarity)
      const topCandidates = workflowScores.slice(0, 20).map(item => item.workflow);
      
      console.log(`[WorkflowStructureBuilder] Embedding pre-filter: top similarity = ${(workflowScores[0]?.similarity || 0) * 100}%`);
      
      return topCandidates;
    } catch (error) {
      console.warn(`[WorkflowStructureBuilder] Embedding pre-filter error:`, error);
      return workflows; // Fallback to all workflows
    }
  }

  /**
   * ✅ OPTIMIZATION: Calculate structural similarity only (no LLM calls)
   */
  private async calculateStructuralSimilarity(workflow: any, intent: StructuredIntent): Promise<number> {
    let structuralScore = 0;
    let maxStructuralScore = 0;

    // 1. Structural matching: Check trigger match
    maxStructuralScore += 1;
    const workflowTrigger = this.extractTriggerFromWorkflow(workflow);
    if (workflowTrigger === intent.trigger) {
      structuralScore += 1;
    }

    // 2. Structural matching: Check action types match
    maxStructuralScore += intent.actions.length;
    intent.actions.forEach(intentAction => {
      const workflowHasAction = this.workflowHasActionType(workflow, intentAction.type);
      if (workflowHasAction) {
        structuralScore += 1;
      }
    });

    return maxStructuralScore > 0 ? structuralScore / maxStructuralScore : 0;
  }

  /**
   * ✅ OPTIMIZATION: Calculate AI similarity with caching
   */
  private async calculateAISimilarityCached(workflow: any, userPrompt: string): Promise<number> {
    const workflowDescription = this.extractWorkflowDescription(workflow);
    if (!workflowDescription || workflowDescription.trim().length === 0) {
      return 0;
    }
    
    // Check cache
    const cacheKey = `${workflow.id || JSON.stringify(workflow)}_${this.hashString(userPrompt)}`;
    const cached = this.similarityCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      console.log(`[WorkflowStructureBuilder] ✅ Using cached similarity: ${(cached.score * 100).toFixed(1)}%`);
      return cached.score;
    }
    
    // Calculate similarity (LLM call)
    const similarity = await this.calculateAISimilarity(userPrompt, workflowDescription);
    
    // Cache result
    this.similarityCache.set(cacheKey, { score: similarity, timestamp: Date.now() });
    
    return similarity;
  }

  /**
   * Simple hash function for cache keys
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Quick keyword-based pre-filter to skip obviously unrelated workflows
   * Returns true if workflow might be relevant, false if clearly unrelated
   */
  private quickKeywordFilter(userPrompt: string, workflowDescription: string): boolean {
    if (!userPrompt || !workflowDescription) return true; // If missing data, check anyway
    
    const promptLower = userPrompt.toLowerCase();
    const descLower = workflowDescription.toLowerCase();
    
    // Extract key terms from user prompt
    const promptTerms = promptLower
      .split(/\s+/)
      .filter(term => term.length > 3) // Only meaningful words
      .filter(term => !['create', 'a', 'an', 'the', 'for', 'with', 'from', 'that', 'this'].includes(term));
    
    // Check if workflow description contains any key terms from prompt
    const hasRelevantTerm = promptTerms.some(term => descLower.includes(term));
    
    // Also check for domain-specific matches (e.g., "sales" -> "sales", "crm", "lead", "deal")
    const domainMatches: { [key: string]: string[] } = {
      'sales': ['sales', 'crm', 'lead', 'deal', 'opportunity', 'pipeline', 'revenue', 'customer', 'account'],
      'agent': ['agent', 'assistant', 'automation', 'workflow', 'bot', 'chatbot'],
      'support': ['support', 'ticket', 'customer', 'help', 'service'],
      'hr': ['hr', 'hiring', 'recruit', 'employee', 'candidate', 'interview'],
      'marketing': ['marketing', 'campaign', 'lead', 'email', 'newsletter']
    };
    
    // Check domain matches
    for (const [key, synonyms] of Object.entries(domainMatches)) {
      if (promptLower.includes(key)) {
        const hasDomainMatch = synonyms.some(synonym => descLower.includes(synonym));
        if (hasDomainMatch) return true;
      }
    }
    
    // If no keyword match found, skip AI call (likely unrelated)
    return hasRelevantTerm;
  }

  /**
   * Calculate similarity between workflow and intent
   * ✅ DEPRECATED: Use calculateStructuralSimilarity + calculateAISimilarityCached instead
   * Kept for backward compatibility
   */
  private async calculateSimilarity(workflow: any, intent: StructuredIntent, userPrompt?: string): Promise<number> {
    const structuralScore = await this.calculateStructuralSimilarity(workflow, intent);
    
    if (!userPrompt || userPrompt.trim().length === 0) {
      return structuralScore;
    }
    
    const aiScore = await this.calculateAISimilarityCached(workflow, userPrompt);
    return (structuralScore * 0.6) + (aiScore * 0.4);
  }

  /**
   * Extract workflow description from sample workflow
   */
  private extractWorkflowDescription(workflow: any): string {
    const parts: string[] = [];
    
    // Priority order: goal > use_case > userPrompt > category
    if (workflow.goal) parts.push(workflow.goal);
    if (workflow.use_case) parts.push(workflow.use_case);
    if (workflow.phase1?.step1?.userPrompt) parts.push(workflow.phase1.step1.userPrompt);
    if (workflow.category) parts.push(workflow.category);
    
    return parts.join('. ').trim();
  }

  /**
   * Use AI to calculate semantic similarity between user prompt and workflow description
   */
  private async calculateAISimilarity(userPrompt: string, workflowDescription: string): Promise<number> {
    try {
      const prompt = `# WORKFLOW MATCHING TASK

Compare these two workflow descriptions and rate their similarity on a scale of 0.0 to 1.0.

## USER PROMPT:
"${userPrompt}"

## SAMPLE WORKFLOW DESCRIPTION:
"${workflowDescription}"

## TASK:
Rate how similar these workflows are. Consider:
- Do they solve the same problem?
- Do they use similar triggers or actions?
- Do they have similar goals or use cases?

Return ONLY a JSON object with this exact structure:
{
  "similarity": 0.0-1.0,
  "reasoning": "brief explanation"
}

Return ONLY valid JSON, no markdown, no explanations.`;

      const response = await ollamaOrchestrator.processRequest('workflow-generation', {
        prompt,
        temperature: 0.1, // Low temperature for consistent scoring
        stream: false,
      });

      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        const similarity = typeof result.similarity === 'number' 
          ? Math.max(0, Math.min(1, result.similarity)) // Clamp to 0-1
          : 0;
        
        console.log(`[WorkflowStructureBuilder] AI similarity: ${(similarity * 100).toFixed(1)}% - "${workflowDescription.substring(0, 50)}..."`);
        return similarity;
      }
    } catch (error) {
      console.warn(`[WorkflowStructureBuilder] AI similarity calculation error:`, error);
    }

    return 0; // Fallback to 0 if AI matching fails
  }

  /**
   * Extract trigger from workflow
   */
  private extractTriggerFromWorkflow(workflow: any): string {
    // Check multiple possible locations
    return workflow?.trigger?.node ||
           workflow?.phase1?.step5?.structure?.trigger ||
           workflow?.phase1?.step5?.selectedNodes?.[0] ||
           'manual_trigger';
  }

  /**
   * Check if workflow has action type
   */
  private workflowHasActionType(workflow: any, actionType: string): boolean {
    const selectedNodes = workflow?.phase1?.step5?.selectedNodes || [];
    return selectedNodes.some((node: string) => 
      unifiedNormalizeNodeTypeString(node) === actionType
    );
  }

  /**
   * Build structure from sample workflow
   * CRITICAL: Use intent.actions order if available, otherwise use sample workflow order
   * Connections come from sample workflow OR intent plan, not heuristics
   */
  private buildFromSampleWorkflow(sampleWorkflow: any, intent: StructuredIntent): WorkflowStructure {
    const selectedNodes = sampleWorkflow?.phase1?.step5?.selectedNodes || [];
    const connections = sampleWorkflow?.phase1?.step5?.connections || [];
    
    // Extract trigger (override with intent trigger if different)
    const trigger = intent.trigger || this.extractTriggerFromWorkflow(sampleWorkflow);
    
    // Filter out trigger nodes from selectedNodes
    const actionNodes = selectedNodes.filter((nodeType: string) => 
      !['webhook', 'form', 'schedule', 'manual_trigger', 'chat_trigger'].includes(nodeType)
    );

    // Build nodes array - use intent.actions order if available, otherwise use sample order
    let nodes: WorkflowStructure['nodes'];
    if (intent.actions && intent.actions.length > 0) {
      // Use intent.actions order (intent plan takes precedence)
      console.log(`[WorkflowStructureBuilder] Using intent.actions order (${intent.actions.length} actions) instead of sample workflow order`);
      nodes = intent.actions.map((action, index) => ({
        id: `step${index + 1}`,
        type: action.type,
        config: action.config || {},
      }));
    } else {
      // Fallback to sample workflow order
      nodes = actionNodes.map((nodeType: string, index: number) => ({
        id: `step${index + 1}`,
        type: nodeType,
        config: {},
      }));
    }

    // Build connections array from sample workflow OR create from intent plan
    let structureConnections: WorkflowStructure['connections'];
    if (intent.actions && intent.actions.length > 0) {
      // Use intent plan to create sequential connections
      console.log(`[WorkflowStructureBuilder] Creating connections from intent plan (sequential)`);
      structureConnections = [];
      
      // Connect trigger to first node
      if (nodes.length > 0) {
        structureConnections.push({
          source: 'trigger',
          target: nodes[0].id,
          sourceOutput: 'output',
          targetInput: 'input',
        });
      }

      // Connect nodes sequentially based on intent.actions order
      // GLOBAL RULE: Block output → data source connections
      for (let i = 0; i < nodes.length - 1; i++) {
        const sourceNode = nodes[i];
        const targetNode = nodes[i + 1];
        
        // Validate output → data source connection
        const validation = this.validateOutputToDataSourceConnection(sourceNode.type, targetNode.type);
        if (!validation.valid) {
          console.warn(`[WorkflowStructureBuilder] ⚠️  Blocked connection: ${sourceNode.id} (${sourceNode.type}) → ${targetNode.id} (${targetNode.type})`);
          console.warn(`[WorkflowStructureBuilder]   Reason: ${validation.reason}`);
          // Skip this connection - do not create output → data source edge
          continue;
        }

        structureConnections.push({
          source: sourceNode.id,
          target: targetNode.id,
          sourceOutput: 'output',
          targetInput: 'input',
        });
      }
      
      console.log(`[WorkflowStructureBuilder] Created ${structureConnections.length} connection(s) from intent plan`);
    } else {
      // Fallback to sample workflow connections
      console.log(`[WorkflowStructureBuilder] Using connections from sample workflow`);
      structureConnections = this.parseConnections(connections, actionNodes);
    }

    return {
      trigger,
      trigger_config: intent.trigger_config,
      nodes,
      connections: structureConnections,
      meta: {
        origin: 'sample',
        matchedSampleId: sampleWorkflow?.id,
      },
    };
  }

  /**
   * Build structure from scratch
   * Dynamically generates workflow from structured intent using detected node types
   * Only falls back to manual_trigger + set_variable if intent parsing fails completely
   */
  private buildFromScratch(intent: StructuredIntent): WorkflowStructure {
    console.log(`[WorkflowStructureBuilder] Building from scratch with dynamic generation logic`);
    
    // ✅ CRITICAL: Only use manual_trigger + set_variable if intent parsing fails completely
    // Check if intent has no actions and no meaningful trigger
    if (!intent.actions || intent.actions.length === 0) {
      const hasValidTrigger = intent.trigger && intent.trigger !== 'manual_trigger';
      
      if (!hasValidTrigger) {
        console.warn(`[WorkflowStructureBuilder] ⚠️  Intent parsing failed completely - no actions and no valid trigger`);
        console.warn(`[WorkflowStructureBuilder] Using minimal fallback: manual_trigger + set_variable`);
        
        // Last resort: minimal fallback workflow
        return {
          trigger: 'manual_trigger',
          trigger_config: {},
          nodes: [
            {
              id: 'step1',
              type: 'set_variable',
              config: {},
            },
          ],
          connections: [
            {
              source: 'trigger',
              target: 'step1',
              sourceOutput: 'output',
              targetInput: 'input',
            },
          ],
          meta: {
            origin: 'scratch',
          },
        };
      }
    }

    // ✅ Step 1: Categorize nodes from intent.actions
    const categorizedNodes = this.categorizeNodes(intent.actions || []);
    console.log(`[WorkflowStructureBuilder] Categorized nodes:`);
    console.log(`  - Data sources: ${categorizedNodes.dataSources.map(n => n.type).join(', ')}`);
    console.log(`  - Processors: ${categorizedNodes.processors.map(n => n.type).join(', ')}`);
    console.log(`  - Outputs: ${categorizedNodes.outputs.map(n => n.type).join(', ')}`);
    console.log(`  - Other: ${categorizedNodes.other.map(n => n.type).join(', ')}`);

    // ✅ Step 2: Build node sequence in logical order: data source → processor → output
    const orderedNodes: Array<{ id: string; type: string; config?: Record<string, any> }> = [];
    
    // Add data sources first
    categorizedNodes.dataSources.forEach((action, index) => {
      orderedNodes.push({
        id: `step${orderedNodes.length + 1}`,
        type: action.type,
        config: action.config || {},
      });
    });
    
    // Add processors next
    categorizedNodes.processors.forEach((action) => {
      orderedNodes.push({
        id: `step${orderedNodes.length + 1}`,
        type: action.type,
        config: action.config || {},
      });
    });
    
    // Add outputs last
    categorizedNodes.outputs.forEach((action) => {
      orderedNodes.push({
        id: `step${orderedNodes.length + 1}`,
        type: action.type,
        config: action.config || {},
      });
    });
    
    // Add other nodes (maintain original order for uncategorized nodes)
    categorizedNodes.other.forEach((action) => {
      orderedNodes.push({
        id: `step${orderedNodes.length + 1}`,
        type: action.type,
        config: action.config || {},
      });
    });

    // ✅ Step 3: Build STRICT LINEAR connections (DAG Rule: Linear by default)
    // DAG Rule: If no conditions/branching requested → STRICTLY LINEAR
    const connections: WorkflowStructure['connections'] = [];

    // DAG Rule: Trigger must have exactly 1 outgoing edge
    if (orderedNodes.length > 0) {
      connections.push({
        source: 'trigger',
        target: orderedNodes[0].id,
        sourceOutput: 'output',
        targetInput: 'input',
      });
    } else {
      // If no nodes, workflow is invalid - but we'll let DAG validator catch this
      console.warn(`[WorkflowStructureBuilder] ⚠️  No nodes to connect from trigger`);
    }

    // DAG Rule: Connect nodes sequentially (linear chain)
    // Each node: in-degree = 1, out-degree = 1 (except terminal)
    for (let i = 0; i < orderedNodes.length - 1; i++) {
      const sourceNode = orderedNodes[i];
      const targetNode = orderedNodes[i + 1];
      
      // Validate output → data source connection (block reverse flow)
      const validation = this.validateOutputToDataSourceConnection(sourceNode.type, targetNode.type);
      if (!validation.valid) {
        console.warn(`[WorkflowStructureBuilder] ⚠️  Blocked connection: ${sourceNode.id} (${sourceNode.type}) → ${targetNode.id} (${targetNode.type})`);
        console.warn(`[WorkflowStructureBuilder]   Reason: ${validation.reason}`);
        // Skip this connection - will create gap (DAG validator will catch)
        continue;
      }

      // DAG Rule: Each normal node has exactly 1 output
      connections.push({
        source: sourceNode.id,
        target: targetNode.id,
        sourceOutput: 'output',
        targetInput: 'input',
      });
    }
    
    // DAG Rule: Last node should be terminal (log_output) or have out-degree = 0
    // If last node is not terminal, we'll add log_output (handled in addMissingNodes if needed)

    console.log(`[WorkflowStructureBuilder] ✅ Created ${connections.length} connection(s) with smart flow`);
    console.log(`[WorkflowStructureBuilder] Connection sequence: trigger → ${orderedNodes.map(n => `${n.id}(${n.type})`).join(' → ')}`);

    return {
      trigger: intent.trigger || 'manual_trigger',
      trigger_config: intent.trigger_config || {},
      nodes: orderedNodes,
      connections,
      meta: {
        origin: 'scratch',
      },
    };
  }

  /**
   * Categorize nodes into data sources, processors, outputs, and other
   * Enables smart connection logic: trigger → data source → processor → output
   */
  private categorizeNodes(actions: StructuredIntent['actions']): {
    dataSources: StructuredIntent['actions'];
    processors: StructuredIntent['actions'];
    outputs: StructuredIntent['actions'];
    other: StructuredIntent['actions'];
  } {
    const dataSources: StructuredIntent['actions'] = [];
    const processors: StructuredIntent['actions'] = [];
    const outputs: StructuredIntent['actions'] = [];
    const other: StructuredIntent['actions'] = [];

    // Data source node types
    const dataSourceTypes = new Set([
      'google_sheets',
      'google_sheets_read',
      'google_sheets_write',
      'database',
      'postgres',
      'mysql',
      'mongodb',
      'storage',
      's3',
      'google_drive',
      'dropbox',
      'airtable',
      'notion',
      'csv',
      'excel',
    ]);

    // Processor node types (AI, transformation, logic)
    // Note: ai_service is a capability, not a node type - it resolves to ollama/openai/etc.
    const processorTypes = new Set([
      'text_summarizer',
      'ollama',
      'openai_gpt',
      'anthropic_claude',
      'google_gemini',
      'transform',
      'set_variable',
      'if_else',
      'loop',
      'filter',
      'map',
      'reduce',
      'format',
      'parse',
    ]);

    // Output node types
    const outputTypes = new Set([
      'google_gmail',
      'gmail',
      'slack',
      'discord',
      'notification',
      'webhook_response',
      'http_request',
      'email',
      'sms',
      'telegram',
    ]);

    actions.forEach(action => {
      const normalizedType = unifiedNormalizeNodeTypeString(action.type);
      
      if (dataSourceTypes.has(normalizedType)) {
        dataSources.push(action);
      } else if (processorTypes.has(normalizedType)) {
        processors.push(action);
      } else if (outputTypes.has(normalizedType)) {
        outputs.push(action);
      } else {
        other.push(action);
      }
    });

    return { dataSources, processors, outputs, other };
  }

  /**
   * Parse connections from sample workflow format
   */
  private parseConnections(
    connections: string[],
    actionNodes: string[]
  ): WorkflowStructure['connections'] {
    const parsedConnections: WorkflowStructure['connections'] = [];

    for (const conn of connections) {
      const parts = conn.split('→').map(s => s.trim());
      if (parts.length === 2) {
        let source = parts[0].replace(/\s*\(.*?\)\s*/, '').trim();
        const target = parts[1].trim();

        // Check if source is trigger
        if (source === 'trigger' || ['webhook', 'form', 'schedule', 'manual_trigger'].includes(source)) {
          const targetIndex = actionNodes.indexOf(target);
          if (targetIndex >= 0) {
            parsedConnections.push({
              source: 'trigger',
              target: `step${targetIndex + 1}`,
              sourceOutput: 'output',
              targetInput: 'input',
            });
          }
        } else {
          // Both source and target are in actionNodes
          const sourceIndex = actionNodes.indexOf(source);
          const targetIndex = actionNodes.indexOf(target);
          
          if (sourceIndex >= 0 && targetIndex >= 0 && sourceIndex !== targetIndex) {
            // GLOBAL RULE: Validate output → data source connection
            const sourceNodeType = actionNodes[sourceIndex];
            const targetNodeType = actionNodes[targetIndex];
            
            const validation = this.validateOutputToDataSourceConnection(sourceNodeType, targetNodeType);
            if (!validation.valid) {
              console.warn(`[WorkflowStructureBuilder] ⚠️  Blocked connection from sample workflow: ${sourceNodeType} → ${targetNodeType}`);
              console.warn(`[WorkflowStructureBuilder]   Reason: ${validation.reason}`);
              // Skip this connection - do not create output → data source edge
              continue;
            }

            parsedConnections.push({
              source: `step${sourceIndex + 1}`,
              target: `step${targetIndex + 1}`,
              sourceOutput: 'output',
              targetInput: 'input',
            });
          }
        }
      }
    }

    return parsedConnections;
  }

  /**
   * Add missing required nodes
   */
  private addMissingNodes(
    structure: WorkflowStructure,
    intent: StructuredIntent,
    allowedNodeTypes?: Set<string>
  ): WorkflowStructure {
    const existingTypes = new Set(structure.nodes.map(n => n.type));
    const missingActions: StructuredIntent['actions'] = [];

    intent.actions.forEach(action => {
      const normalized = unifiedNormalizeNodeTypeString(action.type);
      
      // ✅ CRITICAL: Only add nodes that are in allowed capability list
      if (!existingTypes.has(action.type) && !existingTypes.has(normalized)) {
        // Check if node type is allowed (if allowedNodeTypes is provided)
        if (allowedNodeTypes) {
          if (allowedNodeTypes.has(normalized) || allowedNodeTypes.has(action.type)) {
            missingActions.push(action);
          } else {
            console.warn(`[WorkflowStructureBuilder] ⚠️  Skipping node "${action.type}" - not in allowed capability list`);
          }
        } else {
          // No constraint - add all missing actions
          missingActions.push(action);
        }
      }
    });

    if (missingActions.length > 0) {
      const newNodes = missingActions.map((action, index) => {
        const normalized = unifiedNormalizeNodeTypeString(action.type);
        return {
          id: `step${structure.nodes.length + index + 1}`,
          type: normalized, // Use normalized type
          config: action.config || {},
        };
      });

      structure.nodes.push(...newNodes);
      console.log(`[WorkflowStructureBuilder] ✅ Added ${newNodes.length} missing nodes from allowed capability list`);
    }

    return structure;
  }

  /**
   * Add conditional logic nodes
   * DAG Rule: IF node must have exactly 2 outputs (true/false)
   * DAG Rule: If branches reconverge → insert MERGE node
   */
  private addConditionalLogic(
    structure: WorkflowStructure,
    conditions: StructuredIntent['conditions']
  ): WorkflowStructure {
    if (!conditions || conditions.length === 0) {
      return structure;
    }

    conditions.forEach((condition, index) => {
      if (condition.type === 'if_else') {
        // DAG Rule: IF node must have exactly 2 outputs (true/false)
        const ifElseNode = {
          id: `if_else_${index}`,
          type: 'if_else',
          config: {
            condition: condition.condition,
          },
        };

        // Find nodes in true_path and false_path
        const truePathNodes = structure.nodes.filter(n => 
          condition.true_path?.includes(n.type)
        );
        const falsePathNodes = structure.nodes.filter(n => 
          condition.false_path?.includes(n.type)
        );

        // Find insertion point (before first conditional action)
        const firstConditionalActionIndex = structure.nodes.findIndex(n => 
          condition.true_path?.includes(n.type) || condition.false_path?.includes(n.type)
        );

        if (firstConditionalActionIndex >= 0) {
          structure.nodes.splice(firstConditionalActionIndex, 0, ifElseNode);
        } else {
          structure.nodes.push(ifElseNode);
        }

        // Remove existing connections to true/false path nodes (will be replaced)
        structure.connections = structure.connections.filter(conn => {
          const isTruePathTarget = truePathNodes.some(n => n.id === conn.target);
          const isFalsePathTarget = falsePathNodes.some(n => n.id === conn.target);
          return !(isTruePathTarget || isFalsePathTarget);
        });

        // DAG Rule: Connect IF node to true path (type: "true")
        if (truePathNodes.length > 0) {
          const firstTrueNode = truePathNodes[0];
          structure.connections.push({
            source: ifElseNode.id,
            target: firstTrueNode.id,
            sourceOutput: 'true',
            targetInput: 'input',
          });

          // Connect true path nodes sequentially
          for (let i = 0; i < truePathNodes.length - 1; i++) {
            structure.connections.push({
              source: truePathNodes[i].id,
              target: truePathNodes[i + 1].id,
              sourceOutput: 'output',
              targetInput: 'input',
            });
          }
        }

        // DAG Rule: Connect IF node to false path (type: "false")
        if (falsePathNodes.length > 0) {
          const firstFalseNode = falsePathNodes[0];
          structure.connections.push({
            source: ifElseNode.id,
            target: firstFalseNode.id,
            sourceOutput: 'false',
            targetInput: 'input',
          });

          // Connect false path nodes sequentially
          for (let i = 0; i < falsePathNodes.length - 1; i++) {
            structure.connections.push({
              source: falsePathNodes[i].id,
              target: falsePathNodes[i + 1].id,
              sourceOutput: 'output',
              targetInput: 'input',
            });
          }
        }

        // DAG Rule: If branches reconverge → insert MERGE node
        const truePathEnd = truePathNodes[truePathNodes.length - 1];
        const falsePathEnd = falsePathNodes[falsePathNodes.length - 1];
        
        // Check if both paths need to continue to the same next node
        const nodesAfterTrue = structure.connections.filter(c => c.source === truePathEnd?.id);
        const nodesAfterFalse = structure.connections.filter(c => c.source === falsePathEnd?.id);
        
        // If both paths have outputs, we need a MERGE
        if (truePathEnd && falsePathEnd && (nodesAfterTrue.length > 0 || nodesAfterFalse.length > 0)) {
          const mergeNode = {
            id: `merge_${index}`,
            type: 'merge',
            config: {},
          };
          
          structure.nodes.push(mergeNode);
          
          // Connect both paths to MERGE
          if (truePathEnd) {
            structure.connections.push({
              source: truePathEnd.id,
              target: mergeNode.id,
              sourceOutput: 'output',
              targetInput: 'input',
            });
          }
          
          if (falsePathEnd) {
            structure.connections.push({
              source: falsePathEnd.id,
              target: mergeNode.id,
              sourceOutput: 'output',
              targetInput: 'input',
            });
          }
        }
      }
    });

    return structure;
  }

  /**
   * Enforce policies
   * CRITICAL: Only enforce structural policies, NO heuristic edge creation
   */
  private enforcePolicies(structure: WorkflowStructure): WorkflowStructure {
    // Policy 1: No self-loops (structural safety only)
    const initialConnections = structure.connections.length;
    structure.connections = structure.connections.filter(c => c.source !== c.target);
    if (structure.connections.length < initialConnections) {
      console.warn(`[WorkflowStructureBuilder] ⚠️  Removed ${initialConnections - structure.connections.length} self-loop(s)`);
    }

    // Policy 2: GLOBAL RULE - Block output → data source connections
    const beforeOutputDataFilter = structure.connections.length;
    structure.connections = structure.connections.filter(conn => {
      // Find source and target node types
      const sourceNode = conn.source === 'trigger' 
        ? { type: structure.trigger }
        : structure.nodes.find(n => n.id === conn.source);
      const targetNode = structure.nodes.find(n => n.id === conn.target);

      if (!sourceNode || !targetNode) {
        return true; // Keep if nodes not found (will be handled elsewhere)
      }

      // Validate output → data source connection
      const validation = this.validateOutputToDataSourceConnection(sourceNode.type, targetNode.type);
      if (!validation.valid) {
        console.warn(`[WorkflowStructureBuilder] ⚠️  Removed output → data source connection: ${conn.source} (${sourceNode.type}) → ${conn.target} (${targetNode.type})`);
        console.warn(`[WorkflowStructureBuilder]   Reason: ${validation.reason}`);
        return false;
      }

      return true;
    });
    
    if (structure.connections.length < beforeOutputDataFilter) {
      console.warn(`[WorkflowStructureBuilder] ⚠️  Removed ${beforeOutputDataFilter - structure.connections.length} output → data source connection(s) (global rule)`);
    }

    // Policy 3: Trigger must have outgoing edge (only if nodes exist and no connections)
    // This is a minimal structural requirement, not heuristic edge creation
    const triggerHasOutgoing = structure.connections.some(c => c.source === 'trigger');
    if (!triggerHasOutgoing && structure.nodes.length > 0) {
      // Only add trigger connection if structure was built from scratch (intent-based)
      // For sample workflows, connections should already exist
      if (structure.meta?.origin === 'scratch') {
        structure.connections.push({
          source: 'trigger',
          target: structure.nodes[0].id,
          sourceOutput: 'output',
          targetInput: 'input',
        });
        console.log(`[WorkflowStructureBuilder] Added trigger connection (structural requirement only)`);
      } else {
        console.warn(`[WorkflowStructureBuilder] ⚠️  Sample workflow missing trigger connection - keeping as-is (no heuristic repair)`);
      }
    }

    // Policy 4: Validate connections exist (but do NOT create missing ones)
    // Missing connections indicate incomplete intent plan, not a structural issue to fix
    const expectedMinConnections = structure.nodes.length > 0 ? structure.nodes.length : 0;
    if (structure.connections.length < expectedMinConnections) {
      console.warn(`[WorkflowStructureBuilder] ⚠️  Workflow has ${structure.connections.length} connection(s) but ${structure.nodes.length} node(s)`);
      console.warn(`[WorkflowStructureBuilder]   Missing connections should be defined in intent plan, not created heuristically`);
    }

    // REMOVED: Policy 4 - buildLinearChain (heuristic edge creation)
    // Connections are ONLY created from intent plan, not from heuristics

    return structure;
  }

  /**
   * Build linear chain of connections
   * DEPRECATED: This method creates heuristic edges and should NOT be used
   * Connections should ONLY come from intent plan
   * 
   * This method is kept for backward compatibility but should not be called
   * in the normal flow. If you see this being called, it indicates a bug.
   */
  private buildLinearChain(nodes: WorkflowStructure['nodes']): WorkflowStructure['connections'] {
    console.error(`[WorkflowStructureBuilder] ❌ ERROR: buildLinearChain called - this creates heuristic edges!`);
    console.error(`[WorkflowStructureBuilder]   Connections should ONLY come from intent plan`);
    console.error(`[WorkflowStructureBuilder]   Returning empty connections array`);
    
    // Return empty array instead of creating heuristic connections
    return [];
  }

  /**
   * Build connections with proper field mapping
   * GLOBAL RULE: Also validates output → data source connections
   */
  private buildConnections(structure: WorkflowStructure): WorkflowStructure {
    // Validate all connections have valid field mappings
    structure.connections = structure.connections
      // Global self-loop guard at structure level
      .filter(conn => {
        if (conn.source === conn.target) {
          console.warn(`[WorkflowStructureBuilder] ⚠️ Prevented self-loop in structure: ${conn.source} → ${conn.target}`);
          return false;
        }
        return true;
      })
      // GLOBAL RULE: Block output → data source connections
      .filter(conn => {
        // Find source and target node types
        const sourceNode = conn.source === 'trigger' 
          ? { type: structure.trigger }
          : structure.nodes.find(n => n.id === conn.source);
        const targetNode = structure.nodes.find(n => n.id === conn.target);

        if (!sourceNode || !targetNode) {
          return true; // Keep if nodes not found (will be handled elsewhere)
        }

        // Validate output → data source connection
        const validation = this.validateOutputToDataSourceConnection(sourceNode.type, targetNode.type);
        if (!validation.valid) {
          console.warn(`[WorkflowStructureBuilder] ⚠️  Blocked output → data source connection: ${conn.source} (${sourceNode.type}) → ${conn.target} (${targetNode.type})`);
          console.warn(`[WorkflowStructureBuilder]   Reason: ${validation.reason}`);
          return false;
        }

        return true;
      })
      .map(conn => {
      // Get node types for field mapping
      const sourceNode = conn.source === 'trigger' 
        ? { type: structure.trigger }
        : structure.nodes.find(n => n.id === conn.source);
      const targetNode = structure.nodes.find(n => n.id === conn.target);

      if (!sourceNode || !targetNode) {
        return conn; // Keep original if nodes not found
      }

      // Map output to input fields based on node types
      const mapping = this.mapOutputToInput(sourceNode.type, targetNode.type);
      
      return {
        ...conn,
        sourceOutput: mapping.outputField,
        targetInput: mapping.inputField,
      };
    });

    return structure;
  }

  /**
   * Map output field to input field based on node types
   * Enhanced to handle all common node type combinations
   */
  private mapOutputToInput(sourceType: string, targetType: string): {
    outputField: string;
    inputField: string;
  } {
    // Default mapping
    let outputField = 'output';
    let inputField = 'input';

    // ============================================
    // TRIGGER NODES - Source Output Fields
    // ============================================
    if (sourceType === 'manual_trigger' || sourceType === 'workflow_trigger') {
      // Both output 'inputData'
      outputField = 'inputData';
    } else if (sourceType === 'chat_trigger') {
      // chat_trigger outputs 'message'
      outputField = 'message';
    } else if (['schedule', 'webhook', 'form', 'interval', 'error_trigger'].includes(sourceType)) {
      // These triggers use 'output' as the connection handle
      outputField = 'output';
    }

    // ============================================
    // AI NODES - Source Output Fields
    // ============================================
    if (sourceType === 'ai_agent') {
      // AI Agent outputs response_text (primary), response_json, response_markdown
      outputField = 'response_text';
    } else if (['openai_gpt', 'anthropic_claude', 'google_gemini', 'ollama', 'text_summarizer'].includes(sourceType)) {
      // AI text generation nodes output 'text' or 'response'
      outputField = 'text';
    } else if (sourceType === 'sentiment_analyzer') {
      // Sentiment analyzer outputs structured object
      outputField = 'sentiment';
    } else if (sourceType === 'text_formatter') {
      // Text formatter outputs 'formatted' text
      outputField = 'formatted';
    }

    // ============================================
    // HTTP/API NODES - Source Output Fields
    // ============================================
    if (['http_request', 'http_post'].includes(sourceType)) {
      // HTTP nodes output 'body' (primary), 'status', 'headers'
      outputField = 'body';
    } else if (sourceType === 'webhook') {
      // Webhook trigger outputs 'body'
      outputField = 'body';
    }

    // ============================================
    // DATA SOURCE NODES - Source Output Fields
    // ============================================
    if (['google_sheets', 'database_read', 'supabase'].includes(sourceType)) {
      // Array-returning nodes output 'rows' or 'data'
      outputField = 'rows';
    } else if (sourceType === 'database_write') {
      // Database write outputs 'result' or 'affectedRows'
      outputField = 'result';
    }

    // ============================================
    // LOGIC NODES - Source Output Fields
    // ============================================
    if (sourceType === 'if_else') {
      // High-level structure only; exact true/false handle is resolved later
      outputField = 'true';
    } else if (sourceType === 'switch') {
      // Switch outputs 'result' or 'case_result'
      outputField = 'result';
    } else if (['filter', 'loop', 'merge', 'sort', 'limit'].includes(sourceType)) {
      // Array processing nodes output 'data' or array fields
      outputField = 'data';
    } else if (sourceType === 'aggregate') {
      // Aggregate outputs structured object with 'groups', 'totals'
      outputField = 'groups';
    }

    // ============================================
    // TARGET NODE INPUT FIELDS
    // ============================================
    
    // AI Agent special input handling
    if (targetType === 'ai_agent') {
      // AI Agent has multiple input ports: userInput, chat_model, memory, tool
      // Default to userInput for most sources
      if (['chat_trigger', 'text_formatter', 'openai_gpt', 'anthropic_claude', 
           'google_gemini', 'ollama'].includes(sourceType)) {
        inputField = 'userInput';
      } else {
        inputField = 'userInput'; // Default for AI Agent
      }
    }
    
    // Communication/Output nodes expect 'text', 'message', or 'body'
    else if (['slack_message', 'discord', 'telegram', 'microsoft_teams', 
              'whatsapp_cloud', 'twilio'].includes(targetType)) {
      inputField = 'text';
    } else if (['email', 'google_gmail'].includes(targetType)) {
      inputField = 'body';
    }
    
    // CRM nodes expect 'data' as input
    else if (['hubspot', 'zoho_crm', 'pipedrive', 'salesforce', 'freshdesk', 
               'intercom', 'mailchimp', 'activecampaign'].includes(targetType)) {
      inputField = 'data';
    }
    
    // Database nodes expect 'data' or 'query'
    else if (['database_write', 'supabase', 'postgresql', 'mysql', 'mongodb'].includes(targetType)) {
      inputField = 'data';
    }
    
    // Google Sheets special case - doesn't need input from trigger
    else if (targetType === 'google_sheets') {
      // Google Sheets is configured via spreadsheetId, not input connection
      // But if there's a connection, use 'values' or 'data'
      inputField = 'values';
    }
    
    // Form to Google Sheets mapping
    else if (sourceType === 'form' && targetType === 'google_sheets') {
      outputField = 'formData';
      inputField = 'values';
    }
    
    // Log output expects 'text' or 'inputData'
    else if (targetType === 'log_output') {
      inputField = 'text';
    }

    return { outputField, inputField };
  }

  /**
   * Rebuild workflow as strict linear chain (fallback when DAG validation fails)
   * DAG Rule: Linear by default - no branching unless explicitly required
   */
  private rebuildAsLinearChain(
    intent: StructuredIntent,
    originalStructure: WorkflowStructure
  ): WorkflowStructure {
    console.log(`[WorkflowStructureBuilder] 🔄 Rebuilding as strict linear chain (DAG fallback)`);
    
    // Get all nodes in order (excluding IF/SWITCH/MERGE if they caused issues)
    const linearNodes = originalStructure.nodes
      .filter(n => !['if_else', 'switch', 'merge'].includes(n.type))
      .map((node, index) => ({
        id: `step${index + 1}`,
        type: node.type,
        config: node.config || {},
      }));

    // If no nodes, create minimal fallback
    if (linearNodes.length === 0) {
      return {
        trigger: intent.trigger || 'manual_trigger',
        trigger_config: intent.trigger_config || {},
        nodes: [
          {
            id: 'step1',
            type: 'log_output',
            config: {},
          },
        ],
        connections: [
          {
            source: 'trigger',
            target: 'step1',
            sourceOutput: 'output',
            targetInput: 'input',
          },
        ],
        meta: {
          origin: 'scratch',
        },
      };
    }

    // Build strict linear connections
    const connections: WorkflowStructure['connections'] = [];

    // DAG Rule: Trigger → first node (exactly 1 edge)
    connections.push({
      source: 'trigger',
      target: linearNodes[0].id,
      sourceOutput: 'output',
      targetInput: 'input',
    });

    // DAG Rule: Connect nodes sequentially (each node: in=1, out=1)
    for (let i = 0; i < linearNodes.length - 1; i++) {
      connections.push({
        source: linearNodes[i].id,
        target: linearNodes[i + 1].id,
        sourceOutput: 'output',
        targetInput: 'input',
      });
    }

    // Ensure last node is terminal (log_output)
    const lastNode = linearNodes[linearNodes.length - 1];
    const normalizedLastType = unifiedNormalizeNodeTypeString(lastNode.type);
    if (normalizedLastType !== 'log_output') {
      // Add log_output as terminal node
      const logNode = {
        id: `step${linearNodes.length + 1}`,
        type: 'log_output',
        config: {},
      };
      linearNodes.push(logNode);
      connections.push({
        source: lastNode.id,
        target: logNode.id,
        sourceOutput: 'output',
        targetInput: 'input',
      });
    }

    console.log(`[WorkflowStructureBuilder] ✅ Rebuilt as linear chain: ${linearNodes.length} nodes, ${connections.length} edges`);

    return {
      trigger: intent.trigger || originalStructure.trigger || 'manual_trigger',
      trigger_config: intent.trigger_config || originalStructure.trigger_config || {},
      nodes: linearNodes,
      connections,
      meta: {
        origin: 'scratch',
      },
    };
  }

  /**
   * Validate that the workflow graph is acyclic (DAG)
   * Uses topological sort to detect cycles
   * Removes edges that create cycles
   */
  private validateAcyclicGraph(structure: WorkflowStructure): WorkflowStructure {
    const validation = this.detectCycles(structure.nodes, structure.connections);
    
    if (validation.hasCycle) {
      console.warn(`[WorkflowStructureBuilder] ⚠️  Cycle detected in workflow graph!`);
      console.warn(`[WorkflowStructureBuilder]   Cycle path: ${validation.cyclePath?.join(' → ')}`);
      console.warn(`[WorkflowStructureBuilder]   Removing ${validation.cycleEdges.length} edge(s) that create cycles`);
      
      // Remove edges that create cycles
      const validConnections = structure.connections.filter(conn => {
        const isCycleEdge = validation.cycleEdges.some(cycleEdge => 
          cycleEdge.source === conn.source && cycleEdge.target === conn.target
        );
        if (isCycleEdge) {
          console.warn(`[WorkflowStructureBuilder]   ❌ Removed cycle edge: ${conn.source} → ${conn.target}`);
          return false;
        }
        return true;
      });
      
      structure.connections = validConnections;
      
      // Re-validate after removal
      const revalidation = this.detectCycles(structure.nodes, structure.connections);
      if (revalidation.hasCycle) {
        console.error(`[WorkflowStructureBuilder] ❌ Still has cycles after removal! This should not happen.`);
      } else {
        console.log(`[WorkflowStructureBuilder] ✅ Graph is now acyclic (DAG)`);
      }
    } else {
      console.log(`[WorkflowStructureBuilder] ✅ Graph is acyclic (DAG)`);
    }
    
    return structure;
  }

  /**
   * Detect cycles in the workflow graph using topological sort
   * Returns cycle information if found
   */
  private detectCycles(
    nodes: WorkflowStructure['nodes'],
    connections: WorkflowStructure['connections']
  ): {
    hasCycle: boolean;
    cyclePath?: string[];
    cycleEdges: Array<{ source: string; target: string }>;
  } {
    // Build adjacency list (only forward edges, ignore trigger)
    const adjacencyList = new Map<string, string[]>();
    const nodeIds = new Set(nodes.map(n => n.id));
    nodeIds.add('trigger'); // Include trigger in graph
    
    // Initialize adjacency list
    nodeIds.forEach(id => adjacencyList.set(id, []));
    
    // Build graph (only forward edges - no upstream connections)
    const upstreamConnections: Array<{ source: string; target: string }> = [];
    connections.forEach(conn => {
      // Skip self-loops (already handled by enforcePolicies)
      if (conn.source === conn.target) {
        return;
      }
      
      // Check if this is an upstream connection (target comes before source in node order)
      const sourceIndex = conn.source === 'trigger' ? -1 : nodes.findIndex(n => n.id === conn.source);
      const targetIndex = nodes.findIndex(n => n.id === conn.target);
      
      // If target comes before source, this is an upstream connection
      if (sourceIndex >= 0 && targetIndex >= 0 && targetIndex < sourceIndex) {
        upstreamConnections.push({ source: conn.source, target: conn.target });
        console.warn(`[WorkflowStructureBuilder] ⚠️  Upstream connection detected: ${conn.source} → ${conn.target} (target is before source)`);
        // Don't add upstream connections to graph by default
        return;
      }
      
      // Add forward edge
      if (adjacencyList.has(conn.source) && adjacencyList.has(conn.target)) {
        adjacencyList.get(conn.source)!.push(conn.target);
      }
    });
    
    // If upstream connections were found, they might create cycles
    if (upstreamConnections.length > 0) {
      // Check if adding upstream connections creates cycles
      for (const upstreamConn of upstreamConnections) {
        // Temporarily add the upstream connection
        adjacencyList.get(upstreamConn.source)!.push(upstreamConn.target);
        
        // Check for cycle
        const cycleCheck = this.hasCycleDFS(adjacencyList, nodeIds);
        if (cycleCheck.hasCycle) {
          // Remove the upstream connection
          const neighbors = adjacencyList.get(upstreamConn.source)!;
          const index = neighbors.indexOf(upstreamConn.target);
          if (index >= 0) {
            neighbors.splice(index, 1);
          }
          
          return {
            hasCycle: true,
            cyclePath: cycleCheck.cyclePath,
            cycleEdges: [upstreamConn],
          };
        }
      }
    }
    
    // Check for cycles in the forward graph
    const cycleCheck = this.hasCycleDFS(adjacencyList, nodeIds);
    return {
      hasCycle: cycleCheck.hasCycle,
      cyclePath: cycleCheck.cyclePath,
      cycleEdges: cycleCheck.hasCycle ? upstreamConnections : [],
    };
  }

  /**
   * Use DFS to detect cycles in the graph
   */
  private hasCycleDFS(
    adjacencyList: Map<string, string[]>,
    nodeIds: Set<string>
  ): {
    hasCycle: boolean;
    cyclePath?: string[];
  } {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cyclePath: string[] = [];
    
    const dfs = (node: string, path: string[]): boolean => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);
      
      const neighbors = adjacencyList.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, [...path])) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          // Cycle detected
          const cycleStart = path.indexOf(neighbor);
          cyclePath.push(...path.slice(cycleStart), neighbor);
          return true;
        }
      }
      
      recursionStack.delete(node);
      return false;
    };
    
    // Check all nodes (in case graph is disconnected)
    for (const nodeId of nodeIds) {
      if (!visited.has(nodeId)) {
        if (dfs(nodeId, [])) {
          return {
            hasCycle: true,
            cyclePath: cyclePath.length > 0 ? cyclePath : undefined,
          };
        }
      }
    }
    
    return { hasCycle: false };
  }
}

export const workflowStructureBuilder = new WorkflowStructureBuilder();
