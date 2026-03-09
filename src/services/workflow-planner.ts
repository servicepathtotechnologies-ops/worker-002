/**
 * Workflow Planner Service
 * 
 * Converts natural language prompts into ordered workflow steps.
 * This is a PLANNING layer that determines WHAT actions to take,
 * not HOW to implement them (node generation happens later).
 * 
 * Input: "summarize google sheet and send email"
 * Output: {
 *   trigger_type: "manual",
 *   steps: [
 *     { action: "fetch_google_sheets_data" },
 *     { action: "summarize_data" },
 *     { action: "send_email" }
 *   ]
 * }
 */

import { ollamaOrchestrator } from './ai/ollama-orchestrator';
import { nodeLibrary } from './nodes/node-library';
import { resolveNodeType } from '../core/utils/node-type-resolver-util';
import { unifiedNodeTypeMatcher } from '../core/utils/unified-node-type-matcher';

/**
 * Get allowed node types from registry
 * These are canonical node types that exist in the node library
 */
function getAllowedNodeTypes(): string[] {
  const allNodeTypes = nodeLibrary.getRegisteredNodeTypes();
  
  // Filter out internal/system nodes that shouldn't be used directly
  const excludedTypes = [
    'function_item', // Internal node, not user-facing
    'memory', // Used by ai_agent, not standalone
    'tool', // Used by ai_agent, not standalone
    'chat_model', // Used by ai_agent, not standalone
  ];
  
  return allNodeTypes.filter(type => !excludedTypes.includes(type));
}

/**
 * Allowed node types - dynamically fetched from registry
 * These are canonical node types that exist in the node library
 */
export const ALLOWED_NODE_TYPES = getAllowedNodeTypes();

export type AllowedNodeType = typeof ALLOWED_NODE_TYPES[number];

/**
 * Trigger types for workflows
 */
export type TriggerType = 'manual' | 'schedule' | 'event';

/**
 * Workflow step definition
 * Uses canonical node types from registry
 * Supports both new format (node_type) and legacy format (action) for backward compatibility
 */
export interface WorkflowStep {
  node_type?: string; // Canonical node type from registry (e.g., 'google_sheets', 'ai_service') - NEW FORMAT
  action?: string; // Legacy format - deprecated, use node_type instead
  description?: string;
  order?: number;
}

/**
 * Legacy AllowedAction type for backward compatibility
 * @deprecated Use node types directly from registry instead
 */
export type AllowedAction = string;

/**
 * Workflow plan result
 */
export interface WorkflowPlan {
  trigger_type: TriggerType;
  steps: WorkflowStep[];
  confidence?: number;
  reasoning?: string;
}

/**
 * Workflow Planner Class
 * ✅ FIXED: Prevents recursion - planner runs only once per request
 */
export class WorkflowPlanner {
  private readonly maxRetries = 3;
  private readonly baseTemperature = 0.1;
  private readonly retryDelay = 1000; // ms
  
  // ✅ FIXED: Execution guard to prevent recursion
  private isPlanning = false;
  private planningPromises = new Map<string, Promise<WorkflowPlan>>();

  /**
   * Plan workflow steps from natural language prompt
   * ✅ FIXED: Prevents recursion - returns existing promise if already planning for same prompt
   * 
   * @param userPrompt - Natural language description of desired workflow
   * @returns Structured workflow plan with trigger type and ordered steps
   */
  async planWorkflow(
    userPrompt: string,
    constraints?: { mandatoryNodes?: string[]; suggestedNodes?: string[] }
  ): Promise<WorkflowPlan> {
    // ✅ FIXED: Prevent recursion - if already planning for this prompt, return existing promise
    const promptKey = userPrompt.substring(0, 200); // Use first 200 chars as key
    const existingPromise = this.planningPromises.get(promptKey);
    if (existingPromise) {
      console.log(`[WorkflowPlanner] ⚠️  Already planning for this prompt, returning existing promise (preventing recursion)`);
      return existingPromise;
    }
    
    // ✅ FIXED: Prevent concurrent execution
    if (this.isPlanning) {
      throw new Error('WorkflowPlanner is already executing. Planner must run only once per request. Pipeline: understand → plan → build → done');
    }
    
    this.isPlanning = true;
    console.log(`[WorkflowPlanner] Planning workflow for: "${userPrompt.substring(0, 100)}"`);
    if (constraints?.mandatoryNodes && constraints.mandatoryNodes.length > 0) {
      console.log(`[WorkflowPlanner] ✅ Mandatory nodes: ${constraints.mandatoryNodes.join(', ')}`);
    }
    
    // Create promise and store it
    const planningPromise = this.executePlanning(userPrompt, constraints);
    this.planningPromises.set(promptKey, planningPromise);
    
    try {
      const result = await planningPromise;
      return result;
    } finally {
      // Clean up after planning completes
      this.isPlanning = false;
      this.planningPromises.delete(promptKey);
    }
  }
  
  /**
   * Execute planning (internal method)
   * ✅ FIXED: Separated from planWorkflow to enable recursion prevention
   */
  private async executePlanning(
    userPrompt: string,
    constraints?: { mandatoryNodes?: string[]; suggestedNodes?: string[] }
  ): Promise<WorkflowPlan> {

    let lastError: Error | null = null;
    let rawResponse: string | null = null;

    // Retry logic with progressively stricter validation
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const isRetry = attempt > 1;
        const temperature = isRetry ? 0.05 : this.baseTemperature; // Even lower for retries
        const maxTokens = isRetry ? 800 : 1200; // Reduce tokens for retries

        console.log(`[WorkflowPlanner] Attempt ${attempt}/${this.maxRetries} (temperature: ${temperature}, max_tokens: ${maxTokens})`);

        // Build planning prompt (include mandatory nodes)
        const planningPrompt = this.buildPlanningPrompt(userPrompt, isRetry, constraints?.mandatoryNodes);

        // Call Ollama orchestrator
        const response = await ollamaOrchestrator.processRequest('workflow-generation', {
          prompt: planningPrompt,
          system: this.getSystemPrompt(isRetry),
        }, {
          temperature: temperature,
          max_tokens: maxTokens,
          cache: false, // Don't cache planning requests
        });

        // Extract content from response
        rawResponse = typeof response === 'string' 
          ? response 
          : (response?.content || (typeof response === 'object' && response !== null ? JSON.stringify(response) : String(response)));

        // Validate response exists
        if (!rawResponse || rawResponse.trim().length === 0) {
          throw new Error(`Empty response from LLM on attempt ${attempt}`);
        }

        // Log raw response for debugging (first 200 chars)
        console.log(`[WorkflowPlanner] Raw response (attempt ${attempt}):`, rawResponse.substring(0, 200));

        // Parse and validate JSON
        let plan = this.parsePlanningResponse(rawResponse, attempt);

        // Step 1: Resolve all node types using resolver (replace aliases with canonical types)
        plan = this.resolvePlanNodeTypes(plan);

        // Step 1.5: ✅ NEW: Enforce mandatory nodes (from keyword extraction)
        if (constraints?.mandatoryNodes && constraints.mandatoryNodes.length > 0) {
          plan = this.enforceMandatoryNodes(plan, constraints.mandatoryNodes);
        }

        // Step 2: Validate plan structure (after resolution)
        const validation = this.validatePlan(plan);
        if (!validation.valid) {
          console.warn(`[WorkflowPlanner] Plan validation failed (attempt ${attempt}):`, validation.errors);
          if (attempt < this.maxRetries) {
            lastError = new Error(`Validation failed: ${validation.errors.join(', ')}`);
            await this.delay(this.retryDelay * attempt);
            continue; // Retry
          }
          // Last attempt failed validation - use fallback
          return this.fallbackPlan(userPrompt);
        }
        
        // Step 3: Enforce minimal workflow - remove unnecessary nodes
        plan = this.enforceMinimalWorkflow(plan);
        
        // Step 5: Re-validate after minimal enforcement
        const revalidation = this.validatePlan(plan);
        if (!revalidation.valid) {
          console.warn(`[WorkflowPlanner] Re-validation failed after minimal enforcement:`, revalidation.errors);
          if (attempt < this.maxRetries) {
            lastError = new Error(`Re-validation failed: ${revalidation.errors.join(', ')}`);
            await this.delay(this.retryDelay * attempt);
            continue; // Retry
          }
          return this.fallbackPlan(userPrompt);
        }

        console.log(`[WorkflowPlanner] Workflow plan created successfully with ${plan.steps.length} steps`);
        return plan;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message.toLowerCase();
        const isJsonParseError = errorMessage.includes('json') || 
                                errorMessage.includes('unexpected token') ||
                                errorMessage.includes('parse');

        console.error(`[WorkflowPlanner] Attempt ${attempt} failed:`, lastError.message);
        if (rawResponse) {
          console.error(`[WorkflowPlanner] Raw response that failed:`, rawResponse.substring(0, 500));
        }

        if (attempt < this.maxRetries && isJsonParseError) {
          console.log(`[WorkflowPlanner] JSON parse error detected, retrying with stricter prompt...`);
          await this.delay(this.retryDelay * attempt);
          continue;
        }

        // Check if error is due to missing Ollama models
        const isModelUnavailable = errorMessage.includes('not found') || 
                                  errorMessage.includes('ollama models not available') ||
                                  (errorMessage.includes('404') && errorMessage.includes('model'));

        if (isModelUnavailable) {
          console.warn('[WorkflowPlanner] Ollama models not available, using rule-based fallback');
          return this.fallbackPlan(userPrompt);
        }

        // Last attempt or non-JSON error
        if (attempt === this.maxRetries) {
          console.error('[WorkflowPlanner] All attempts failed, using fallback');
          return this.fallbackPlan(userPrompt);
        }
      }
    }

    // Should never reach here, but just in case
    return this.fallbackPlan(userPrompt);
  }

  /**
   * Build planning prompt for AI
   * Uses canonical node types from registry
   * ✅ NEW: Includes mandatory nodes from keyword extraction
   */
  private buildPlanningPrompt(
    userPrompt: string, 
    isRetry: boolean = false,
    mandatoryNodes?: string[]
  ): string {
    const strictJsonDirective = isRetry 
      ? `🚨 CRITICAL: You MUST respond with ONLY valid JSON. NO explanations, NO prose, NO markdown, NO code blocks. Your response MUST start with { and end with }. If you include any text before or after the JSON, the system will fail.`
      : `CRITICAL: You MUST respond with ONLY valid JSON. Do NOT include any explanations, markdown formatting, code blocks, or text outside the JSON object. Your response must start with { and end with }.`;

    // Get available node types from registry
    const availableNodeTypes = getAllowedNodeTypes();
    const triggerNodes = availableNodeTypes.filter(type => 
      type.includes('trigger') || type === 'schedule' || type === 'webhook' || type === 'form'
    );
    const actionNodes = availableNodeTypes.filter(type => 
      !triggerNodes.includes(type)
    );

    // Group nodes by category for better readability
    const nodeTypesByCategory = this.groupNodesByCategory(availableNodeTypes);

    // ✅ NEW: Include mandatory nodes section if provided
    const mandatoryNodesSection = mandatoryNodes && mandatoryNodes.length > 0
      ? `\n🚨🚨🚨 CRITICAL - MANDATORY NODES (MUST BE INCLUDED):
The following node types were extracted from the user's prompt and MUST be included in the workflow plan:
${mandatoryNodes.map((node, idx) => `  ${idx + 1}. ${node}`).join('\n')}

ABSOLUTE REQUIREMENT: ALL mandatory nodes listed above MUST appear in the "steps" array of your response.
DO NOT omit any mandatory node, even if you think it's not needed.
If a mandatory node is missing, the workflow will be invalid.

`
      : '';

    return `You are a MINIMAL workflow planning engine.
Your task is to break down a user's request into the MINIMUM required workflow steps using ONLY the available node types from the registry.

${strictJsonDirective}

User Request: "${userPrompt}"
${mandatoryNodesSection}

🚨 CRITICAL: MINIMAL WORKFLOW RULES
1. Generate ONLY nodes required to satisfy the user's intent
2. NO duplicate triggers (workflow must have exactly ONE trigger)
3. NO loop nodes UNLESS required by data type mismatch (array → scalar)
4. NO unused nodes (every node must contribute to final output)
5. NO orphan nodes (all nodes must be connected)
6. NO "generate many then cleanup" - generate minimal workflow directly

Analyze the request and determine:
1. What type of trigger starts this workflow (use one of the trigger node types) - ONLY ONE TRIGGER
2. What node types need to be executed in order - MINIMUM REQUIRED ONLY
3. Use ONLY the node types listed below - DO NOT invent node names

Available Trigger Node Types:
${triggerNodes.map((type, idx) => `  ${idx + 1}. ${type}`).join('\n')}

Available Action Node Types (${actionNodes.length} total):
${this.formatNodeTypesForPrompt(nodeTypesByCategory)}

🚨 TRANSFORMATION DETECTION RULES:
- If user prompt contains: "summarize", "summarise", "summary" → MUST include "text_summarizer" or "ollama_llm" or "openai_gpt" or "ai_agent" node
- If user prompt contains: "analyze", "analyse", "analysis" → MUST include "ai_agent" or "ollama_llm" or "openai_gpt" node
- If user prompt contains: "process text", "process_text", "ai processing" → MUST include "text_summarizer" or "ai_agent" or "ollama_llm" node
- If user prompt contains: "classify", "translate", "extract", "generate" → MUST include appropriate AI/transformation node
- NEVER skip transformation steps - if transformation is mentioned, it MUST be included in the workflow

Return ONLY this JSON structure (no other text):
{
  "trigger_type": "manual_trigger | schedule | webhook | form",
  "steps": [
    { "node_type": "google_sheets", "description": "Fetch data from Google Sheets" },
    { "node_type": "text_summarizer", "description": "Summarize the data" },
    { "node_type": "google_gmail", "description": "Send email with summary" }
  ],
  "confidence": 0.95,
  "reasoning": "Brief explanation of the plan"
}

STRICT VALIDATION RULES:
- trigger_type must be one of: ${triggerNodes.join(', ')} - EXACTLY ONE TRIGGER
- Each step.node_type MUST be one of the available node types listed above
- DO NOT invent node names - use ONLY the types from the list
- Steps should be in execution order
- If trigger is mentioned (schedule, webhook, event), use appropriate trigger node type
- If no trigger is mentioned, default to "manual_trigger"
- DO NOT add loop nodes unless explicitly required (array output → scalar input)
- DO NOT add duplicate triggers
- DO NOT add nodes that don't contribute to final output
- confidence should be 0.0 to 1.0
- reasoning should briefly explain why these node types were chosen

LOOP NODE RULES:
- Only add loop node if: upstream node produces array AND downstream node requires scalar
- Example: google_sheets (array) → loop → text_summarizer (scalar) = REQUIRED
- Example: google_sheets (array) → text_summarizer (accepts array) = NO LOOP NEEDED
- DO NOT add loop "just in case" - only when data type mismatch exists

${isRetry ? '🚨 REMEMBER: JSON ONLY. NO MARKDOWN. NO CODE BLOCKS. NO EXPLANATIONS. Use ONLY the node types listed above. Generate MINIMAL workflow only.' : ''}

RESPOND WITH JSON ONLY - NO EXPLANATIONS, NO PROSE, NO MARKDOWN`;
  }

  /**
   * Group nodes by category for better prompt organization
   */
  private groupNodesByCategory(nodeTypes: string[]): Map<string, string[]> {
    const byCategory = new Map<string, string[]>();
    
    nodeTypes.forEach(nodeType => {
      const schema = nodeLibrary.getSchema(nodeType);
      const category = schema?.category || 'uncategorized';
      
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(nodeType);
    });
    
    return byCategory;
  }

  /**
   * Format node types for prompt (grouped by category)
   */
  private formatNodeTypesForPrompt(nodeTypesByCategory: Map<string, string[]>): string {
    const lines: string[] = [];
    
    nodeTypesByCategory.forEach((types, category) => {
      if (category === 'triggers') return; // Triggers are shown separately
      
      lines.push(`\n${category.toUpperCase()} (${types.length} nodes):`);
      // Show first 10 nodes per category to avoid overwhelming the prompt
      const displayTypes = types.slice(0, 10);
      displayTypes.forEach((type, idx) => {
        lines.push(`  - ${type}`);
      });
      if (types.length > 10) {
        lines.push(`  ... and ${types.length - 10} more`);
      }
    });
    
    return lines.join('\n');
  }

  /**
   * Get system prompt to enforce JSON output and prevent unknown node names
   */
  private getSystemPrompt(isRetry: boolean): string {
    const availableNodeTypes = getAllowedNodeTypes();
    const nodeTypesList = availableNodeTypes.slice(0, 50).join(', '); // Show first 50 for context
    
    if (isRetry) {
      return `You are a JSON-only response generator. You MUST respond with ONLY valid JSON. No explanations, no markdown, no code blocks, no prose. Your response must start with { and end with }.

🚨 CRITICAL: You MUST use ONLY these node types: ${nodeTypesList}...
DO NOT invent new node names. DO NOT use variations. Use ONLY the exact node types provided in the prompt.

🚨 MINIMAL WORKFLOW RULES:
- Generate ONLY nodes required to satisfy user intent
- NO duplicate triggers (workflow must have exactly ONE trigger in trigger_type, NOT in steps)
- NO loop nodes UNLESS required by data type mismatch (array → scalar)
- NO unused nodes (every node must contribute to final output)
- NO orphan nodes (all nodes must be connected in sequence)`;
    }
    return `You are a MINIMAL workflow planning engine. Break user requests into the MINIMUM required workflow steps using ONLY the node types from the registry.

🚨 CRITICAL RULES:
1. Use ONLY the node types provided in the prompt
2. DO NOT invent new node names
3. DO NOT use variations or aliases (e.g., don't use "gmail" - use "google_gmail")
4. Use exact node type names as listed in the prompt

🚨 MINIMAL WORKFLOW RULES:
- Generate ONLY nodes required to satisfy user intent
- NO duplicate triggers (workflow must have exactly ONE trigger in trigger_type, NOT in steps)
- NO loop nodes UNLESS required by data type mismatch (array → scalar)
- NO unused nodes (every node must contribute to final output)
- NO orphan nodes (all nodes must be connected in sequence)
- DO NOT add nodes "just in case" - only add what's explicitly needed

Available node types (first 50): ${nodeTypesList}...

Return JSON only with node_type fields matching the exact node types from the list provided in the prompt.`;
  }

  /**
   * Parse AI planning response
   * Robust JSON extraction with multiple fallback strategies
   */
  private parsePlanningResponse(response: string, attempt: number = 1): WorkflowPlan {
    try {
      let jsonStr = response.trim();

      // Strategy 1: Remove BOM if present
      if (jsonStr.charCodeAt(0) === 0xFEFF) {
        jsonStr = jsonStr.slice(1);
      }

      // Strategy 2: Extract from markdown code blocks
      if (jsonStr.includes('```json')) {
        const match = jsonStr.match(/```json\s*([\s\S]*?)\s*```/);
        if (match && match[1]) {
          jsonStr = match[1].trim();
        }
      } else if (jsonStr.includes('```')) {
        const match = jsonStr.match(/```\s*([\s\S]*?)\s*```/);
        if (match && match[1]) {
          jsonStr = match[1].trim();
        }
      }

      // Strategy 3: Remove prose prefixes
      // Find first { and last }
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }

      // Strategy 4: Remove trailing commas before closing braces/brackets
      jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

      // Parse JSON
      const parsed = JSON.parse(jsonStr);

      // Ensure it has the expected structure
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Response is not a JSON object');
      }

      return parsed as WorkflowPlan;

    } catch (error) {
      console.error(`[WorkflowPlanner] JSON parse error (attempt ${attempt}):`, error);
      console.error(`[WorkflowPlanner] Response that failed to parse:`, response.substring(0, 500));
      throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Resolve all node types in plan using resolver
   * Replaces aliases with canonical types and prevents unknown node names
   */
  private resolvePlanNodeTypes(plan: WorkflowPlan): WorkflowPlan {
    const resolvedPlan: WorkflowPlan = {
      ...plan,
      steps: plan.steps.map((step, index) => {
        // Resolve trigger type if it's a node type
        if (index === 0 && plan.trigger_type) {
          const resolvedTrigger = resolveNodeType(plan.trigger_type, false);
          if (resolvedTrigger !== plan.trigger_type) {
            console.log(`[WorkflowPlanner] Resolved trigger type "${plan.trigger_type}" → "${resolvedTrigger}"`);
            // Note: trigger_type is a string, not a node type, so we don't modify it here
            // But we log the resolution for debugging
          }
        }

        // Resolve step node_type
        if (step.node_type) {
          const originalType = step.node_type;
          // Only enable debug logging if DEBUG_NODE_LOOKUPS is set
          const debugLogging = process.env.DEBUG_NODE_LOOKUPS === 'true';
          const resolvedType = resolveNodeType(originalType, debugLogging);
          
          if (resolvedType !== originalType) {
            // Only log if debug is enabled or if it's a significant change
            if (debugLogging) {
              console.log(`[WorkflowPlanner] Resolved step ${index + 1} node type "${originalType}" → "${resolvedType}"`);
            }
            return {
              ...step,
              node_type: resolvedType, // Replace with canonical type
            };
          }
        }

        // Resolve legacy action format (if present)
        if (step.action && !step.node_type) {
          const debugLogging = process.env.DEBUG_NODE_LOOKUPS === 'true';
          const resolvedType = resolveNodeType(step.action, debugLogging);
          if (debugLogging) {
            console.log(`[WorkflowPlanner] Resolved step ${index + 1} action "${step.action}" → "${resolvedType}"`);
          }
          return {
            ...step,
            node_type: resolvedType, // Convert action to node_type
            action: undefined, // Remove deprecated action field
          };
        }

        return step;
      }),
    };

    return resolvedPlan;
  }

  /**
   * Validate workflow plan structure
   * Validates against actual node registry (after resolution)
   */
  private validatePlan(plan: WorkflowPlan): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const availableNodeTypes = getAllowedNodeTypes();
    const triggerNodes = availableNodeTypes.filter(type => 
      type.includes('trigger') || type === 'schedule' || type === 'webhook' || type === 'form'
    );

    // Validate trigger_type - must be a valid trigger node type
    if (!plan.trigger_type) {
      errors.push('Missing trigger_type');
    } else if (!triggerNodes.includes(plan.trigger_type)) {
      errors.push(`Invalid trigger_type: "${plan.trigger_type}". Must be one of: ${triggerNodes.join(', ')}`);
    } else {
      // Verify trigger node exists in registry
      const triggerSchema = nodeLibrary.getSchema(plan.trigger_type);
      if (!triggerSchema) {
        errors.push(`Trigger node type "${plan.trigger_type}" not found in node registry`);
      }
    }

    // Validate steps array
    if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
      errors.push('Steps must be a non-empty array');
    } else {
      // Validate each step (after resolution)
      plan.steps.forEach((step, index) => {
        // Check for old format (action) vs new format (node_type)
        if ('action' in step && step.action && !step.node_type) {
          // Action should have been converted to node_type in resolvePlanNodeTypes
          // If it still exists, resolve it now
          const resolvedType = resolveNodeType(step.action, false);
          if (resolvedType !== step.action) {
            console.warn(`[WorkflowPlanner] Step ${index + 1} still has "action" field, resolving: "${step.action}" → "${resolvedType}"`);
            step.node_type = resolvedType;
            delete step.action;
          } else {
            errors.push(`Step ${index + 1} uses deprecated "action" field "${step.action}" that could not be resolved. Use "node_type" instead.`);
            return;
          }
        }
        
        if (!step.node_type) {
          errors.push(`Step ${index + 1} is missing node_type`);
        } else {
          // Validate node type exists in registry (after resolution)
          const nodeSchema = nodeLibrary.getSchema(step.node_type);
          if (!nodeSchema) {
            // Try resolving again in case it wasn't resolved properly
            const reResolved = resolveNodeType(step.node_type, false);
            const reResolvedSchema = nodeLibrary.getSchema(reResolved);
            
            if (!reResolvedSchema) {
              errors.push(`Step ${index + 1} has invalid node_type: "${step.node_type}". Node type not found in registry even after resolution.`);
              errors.push(`  Attempted resolution: "${step.node_type}" → "${reResolved}"`);
              errors.push(`  Available node types: ${availableNodeTypes.slice(0, 10).join(', ')}...`);
              errors.push(`  ⚠️  This node type was generated but does not exist. Please use only node types from the allowed list.`);
            } else {
              // Update step with re-resolved type
              console.warn(`[WorkflowPlanner] Step ${index + 1} node_type "${step.node_type}" re-resolved to "${reResolved}"`);
              step.node_type = reResolved;
            }
          } else if (!availableNodeTypes.includes(step.node_type)) {
            // Check if resolved type is in allowed list
            const resolved = resolveNodeType(step.node_type, false);
            if (availableNodeTypes.includes(resolved)) {
              console.warn(`[WorkflowPlanner] Step ${index + 1} node_type "${step.node_type}" resolved to "${resolved}" which is allowed`);
              step.node_type = resolved;
            } else {
              errors.push(`Step ${index + 1} has node_type "${step.node_type}" which is excluded from planning (internal node)`);
            }
          }
        }
      });
    }

    // Validate confidence if present
    if (plan.confidence !== undefined) {
      if (typeof plan.confidence !== 'number' || plan.confidence < 0 || plan.confidence > 1) {
        errors.push(`Invalid confidence: ${plan.confidence}. Must be a number between 0 and 1`);
      }
    }

    // ✅ NEW: Validate minimal workflow rules
    // Check for duplicate triggers in steps
    const triggerNodesInSteps = plan.steps.filter(step => {
      const nodeType = step.node_type || step.action;
      return nodeType && (
        nodeType.includes('trigger') || 
        nodeType === 'schedule' || 
        nodeType === 'webhook' || 
        nodeType === 'form'
      );
    });
    
    if (triggerNodesInSteps.length > 0) {
      errors.push(`Duplicate triggers found in steps: ${triggerNodesInSteps.map(s => s.node_type || s.action).join(', ')}. Triggers should only be in trigger_type, not in steps.`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
  
  /**
   * Enforce minimal workflow - remove unnecessary nodes
   * 
   * Rules:
   * - No duplicate triggers
   * - No loop unless required by data type mismatch
   * - No unused nodes
   * - No orphan nodes
   */
  /**
   * ✅ NEW: Enforce mandatory nodes in workflow plan
   * Ensures all mandatory nodes (from keyword extraction) are included in the plan
   */
  /**
   * ✅ UNIVERSAL: Enforce mandatory nodes in workflow plan using semantic matching
   * Ensures all mandatory nodes (from keyword extraction) are included in the plan
   * Uses unifiedNodeTypeMatcher for semantic equivalence (e.g., ai_service ≡ ai_chat_model)
   */
  private enforceMandatoryNodes(plan: WorkflowPlan, mandatoryNodes: string[]): WorkflowPlan {
    console.log(`[WorkflowPlanner] 🔒 Enforcing ${mandatoryNodes.length} mandatory node(s): ${mandatoryNodes.join(', ')}`);
    
    // Collect existing node types from plan
    const existingNodeTypes: string[] = [];
    plan.steps.forEach(step => {
      const nodeType = step.node_type || step.action || '';
      if (nodeType) {
        existingNodeTypes.push(nodeType);
      }
    });
    
    const missingNodes: string[] = [];
    for (const mandatoryNode of mandatoryNodes) {
      // ✅ UNIVERSAL: Use semantic matching to check if requirement is satisfied
      const isSatisfied = unifiedNodeTypeMatcher.isRequirementSatisfied(
        mandatoryNode,
        existingNodeTypes,
        { strict: false } // Use semantic equivalence
      );
      
      if (!isSatisfied.matches) {
        missingNodes.push(mandatoryNode);
        console.log(`[WorkflowPlanner] ✅ Adding mandatory node: ${mandatoryNode} (not found in plan)`);
        
        // Add mandatory node to plan
        plan.steps.push({
          node_type: mandatoryNode,
          description: `Required node: ${mandatoryNode}`,
          order: plan.steps.length + 1,
        });
      } else {
        console.log(`[WorkflowPlanner] ✅ Mandatory node satisfied: ${mandatoryNode} (matched via: ${isSatisfied.reason})`);
      }
    }
    
    if (missingNodes.length > 0) {
      console.log(`[WorkflowPlanner] ✅ Added ${missingNodes.length} mandatory node(s) to plan`);
    }
    
    return plan;
  }

  private enforceMinimalWorkflow(plan: WorkflowPlan): WorkflowPlan {
    console.log('[WorkflowPlanner] Enforcing minimal workflow rules...');

    // Step 0: Normalize node types (fix aliases/typos like "gmail" → "google_gmail", "text_summarizzer" → "text_summarizer")
    const normalizedPlanSteps: WorkflowStep[] = plan.steps.map((step, idx) => {
      const rawType = (step.node_type || step.action || '').trim();
      if (!rawType) return step;

      const resolved = resolveNodeType(rawType);
      if (resolved && resolved !== rawType) {
        console.log(`[WorkflowPlanner] ✅ Normalized node type: "${rawType}" → "${resolved}" (step ${idx + 1})`);
      }

      // Prefer node_type; if only action exists, preserve it but also inject node_type for downstream mapping
      if (step.node_type) {
        return { ...step, node_type: resolved };
      }
      if (step.action && !step.node_type) {
        return { ...step, node_type: resolved };
      }
      return step;
    });
    
    // Step 1: Remove duplicate triggers from steps
    const triggerNodeTypes = ['manual_trigger', 'schedule', 'webhook', 'form', 'chat_trigger', 'interval'];
    const filteredSteps = normalizedPlanSteps.filter(step => {
      const nodeType = step.node_type || step.action || '';
      const isTrigger = triggerNodeTypes.some(triggerType => 
        nodeType.includes(triggerType) || nodeType === triggerType
      );
      
      if (isTrigger) {
        console.log(`[WorkflowPlanner] ⚠️  Removed duplicate trigger from steps: ${nodeType}`);
        return false; // Remove trigger from steps (it's already in trigger_type)
      }
      
      return true;
    });
    
    // Step 2: Remove unnecessary loop nodes (unless required by data type mismatch)
    // Note: We can't fully validate data type mismatch here without capability registry,
    // but we can remove loops that are clearly unnecessary
    const stepsWithoutUnnecessaryLoops = filteredSteps.filter((step, index) => {
      const nodeType = step.node_type || step.action || '';
      
      if (nodeType === 'loop' || nodeType.includes('loop')) {
        // Check if loop is between array producer and scalar consumer
        // This is a simplified check - full validation happens in deterministic compiler
        const prevStep = index > 0 ? filteredSteps[index - 1] : null;
        const nextStep = index < filteredSteps.length - 1 ? filteredSteps[index + 1] : null;
        
        // If no clear data flow pattern, remove loop (let deterministic compiler add it if needed)
        if (!prevStep || !nextStep) {
          console.log(`[WorkflowPlanner] ⚠️  Removed unnecessary loop node (no clear data flow pattern)`);
          return false;
        }
        
        // Keep loop for now - deterministic compiler will validate
        return true;
      }
      
      return true;
    });
    
    // Step 3: Remove duplicate nodes (keep first occurrence)
    const seenNodeTypes = new Set<string>();
    const deduplicatedSteps = stepsWithoutUnnecessaryLoops.filter(step => {
      const nodeType = step.node_type || step.action || '';
      
      if (seenNodeTypes.has(nodeType)) {
        console.log(`[WorkflowPlanner] ⚠️  Removed duplicate node: ${nodeType}`);
        return false;
      }
      
      seenNodeTypes.add(nodeType);
      return true;
    });
    
    // Step 4: Validate all nodes contribute to output
    // Remove nodes that don't contribute to final output (orphan nodes)
    const finalSteps = this.validateOutputContribution(deduplicatedSteps);
    
    console.log(`[WorkflowPlanner] ✅ Minimal workflow enforced: ${plan.steps.length} → ${finalSteps.length} steps`);
    
    return {
      ...plan,
      steps: finalSteps,
    };
  }
  
  /**
   * Validate that all nodes contribute to final output
   * Remove nodes that don't contribute to output
   */
  private validateOutputContribution(steps: WorkflowStep[]): WorkflowStep[] {
    if (steps.length === 0) {
      return steps;
    }
    
    // Output nodes are nodes that produce final results (email, notification, storage, etc.)
    const outputNodeTypes = [
      'google_gmail', 'email', 'slack_message', 'discord', 'telegram',
      'notification', 'webhook_response', 'respond_to_webhook',
      'database_write', 'aws_s3', 'dropbox', 'airtable', 'notion', 'clickup',
    ];
    
    // Find output nodes (nodes that are final destinations)
    const outputIndices = new Set<number>();
    steps.forEach((step, index) => {
      const nodeType = step.node_type || step.action || '';
      const descLower = (step.description || '').toLowerCase();

      // google_sheets can be read OR write; only treat it as output if it's a write-like action
      const isGoogleSheets = nodeType === 'google_sheets' || nodeType.includes('google_sheets');
      const isGoogleSheetsWrite =
        isGoogleSheets &&
        (/\b(write|save|store|append|add|update|create|insert)\b/i.test(descLower) ||
          index === steps.length - 1);

      // http_request is usually a data source, not an output; only treat as output if it's clearly a response action
      const isHttpRequest = nodeType === 'http_request' || nodeType.includes('http_request');
      const isHttpRequestOutput =
        isHttpRequest &&
        (/\brespond|response|return\b/i.test(descLower) || index === steps.length - 1);

      if (isGoogleSheetsWrite || isHttpRequestOutput) {
        outputIndices.add(index);
        return;
      }

      if (outputNodeTypes.some(outputType => nodeType.includes(outputType) || nodeType === outputType)) {
        outputIndices.add(index);
      }
    });
    
    // If no explicit output nodes, assume last node is output
    if (outputIndices.size === 0 && steps.length > 0) {
      outputIndices.add(steps.length - 1);
    }
    
    // Build dependency graph (simplified: sequential order)
    // Nodes that don't lead to any output are removed
    const contributingIndices = new Set<number>();
    
    // Start from output nodes and work backwards
    const queue = Array.from(outputIndices);
    outputIndices.forEach(idx => contributingIndices.add(idx));
    
    // In a sequential workflow, all nodes before an output contribute
    // Find the earliest output index
    const earliestOutput = Math.min(...Array.from(outputIndices));
    
    // All nodes from start to earliest output contribute
    for (let i = 0; i <= earliestOutput; i++) {
      contributingIndices.add(i);
    }
    
    // Filter to only contributing nodes
    const contributingSteps = steps.filter((step, index) => {
      if (!contributingIndices.has(index)) {
        console.log(`[WorkflowPlanner] ⚠️  Removed node that doesn't contribute to output: ${step.node_type || step.action} (index ${index})`);
        return false;
      }
      return true;
    });
    
    return contributingSteps;
  }

  /**
   * Fail-safe fallback plan
   * Uses rule-based heuristics with registry node types
   */
  private fallbackPlan(userPrompt: string): WorkflowPlan {
    console.warn('[WorkflowPlanner] Using fallback rule-based planning');

    const promptLower = userPrompt.toLowerCase();
    const steps: WorkflowStep[] = [];
    const availableNodeTypes = getAllowedNodeTypes();
    const triggerNodes = availableNodeTypes.filter(type => 
      type.includes('trigger') || type === 'schedule' || type === 'webhook' || type === 'form'
    );

    // Detect trigger type - use actual node types
    let triggerType: string = 'manual_trigger';
    if (promptLower.includes('schedule') || promptLower.includes('daily') || promptLower.includes('weekly') || promptLower.includes('hourly')) {
      triggerType = triggerNodes.find(t => t === 'schedule') || 'manual_trigger';
    } else if (promptLower.includes('webhook') || promptLower.includes('event') || promptLower.includes('receive')) {
      triggerType = triggerNodes.find(t => t === 'webhook') || 'manual_trigger';
    } else if (promptLower.includes('form') || promptLower.includes('submit')) {
      triggerType = triggerNodes.find(t => t === 'form') || 'manual_trigger';
    }

    // Detect node types based on keywords - use actual registry node types
    if (promptLower.includes('google sheet') || promptLower.includes('sheets') || promptLower.includes('spreadsheet')) {
      const nodeType = availableNodeTypes.find(t => t === 'google_sheets');
      if (nodeType) steps.push({ node_type: nodeType, order: steps.length + 1 });
    }

    if (promptLower.includes('api') || promptLower.includes('fetch') || promptLower.includes('get data') || promptLower.includes('http')) {
      const nodeType = availableNodeTypes.find(t => t === 'http_request');
      if (nodeType) steps.push({ node_type: nodeType, order: steps.length + 1 });
    }

    if (promptLower.includes('summarize') || promptLower.includes('summary') || promptLower.includes('ai') || promptLower.includes('llm')) {
      const nodeType = availableNodeTypes.find(t => t === 'ai_service' || t === 'text_summarizer');
      if (nodeType) steps.push({ node_type: nodeType, order: steps.length + 1 });
    }

    if (promptLower.includes('transform') || promptLower.includes('convert') || promptLower.includes('format') || promptLower.includes('javascript')) {
      const nodeType = availableNodeTypes.find(t => t === 'javascript' || t === 'text_formatter');
      if (nodeType) steps.push({ node_type: nodeType, order: steps.length + 1 });
    }

    if (promptLower.includes('email') || promptLower.includes('send email') || promptLower.includes('mail') || promptLower.includes('gmail')) {
      const nodeType = availableNodeTypes.find(t => t === 'google_gmail' || t === 'email');
      if (nodeType) steps.push({ node_type: nodeType, order: steps.length + 1 });
    }

    if (promptLower.includes('slack') || promptLower.includes('send slack')) {
      const nodeType = availableNodeTypes.find(t => t === 'slack_message' || t === 'slack_webhook');
      if (nodeType) steps.push({ node_type: nodeType, order: steps.length + 1 });
    }

    if (promptLower.includes('database') || promptLower.includes('store') || promptLower.includes('save') || promptLower.includes('db')) {
      const nodeType = availableNodeTypes.find(t => t === 'database_write' || t === 'supabase');
      if (nodeType) steps.push({ node_type: nodeType, order: steps.length + 1 });
    }

    if (promptLower.includes('if') || promptLower.includes('condition') || promptLower.includes('check')) {
      const nodeType = availableNodeTypes.find(t => t === 'if_else');
      if (nodeType) steps.push({ node_type: nodeType, order: steps.length + 1 });
    }

    // If no steps detected, add a generic fetch and transform
    if (steps.length === 0) {
      const httpNode = availableNodeTypes.find(t => t === 'http_request');
      const jsNode = availableNodeTypes.find(t => t === 'javascript');
      if (httpNode) steps.push({ node_type: httpNode, order: 1 });
      if (jsNode) steps.push({ node_type: jsNode, order: 2 });
    }

    return {
      trigger_type: triggerType as any, // Type assertion needed for backward compatibility
      steps: steps.sort((a, b) => (a.order || 0) - (b.order || 0)),
      confidence: 0.5,
      reasoning: 'Fallback rule-based plan generated due to AI unavailability',
    };
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const workflowPlanner = new WorkflowPlanner();
