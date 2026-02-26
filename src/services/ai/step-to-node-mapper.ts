/**
 * Step to Node Mapper
 * 
 * Maps workflow planner actions to actual node types.
 * This bridges the gap between high-level planning and node implementation.
 */

import { WorkflowStep, WorkflowPlan, AllowedAction } from '../workflow-planner';
import { WorkflowStepDefinition } from '../../core/types/ai-types';
import { nodeLibrary } from '../nodes/node-library';
import { getTransformationNodeType } from './transformation-node-config';

/**
 * Maps planner action to node type(s)
 * Returns array because some actions may map to multiple nodes
 */
export function mapActionToNodeType(action: AllowedAction, context?: {
  userPrompt?: string;
  previousStep?: WorkflowStep;
}): string[] {
  const promptLower = (context?.userPrompt || '').toLowerCase();
  
  switch (action) {
    case 'fetch_google_sheets_data':
      return ['google_sheets'];
    
    case 'fetch_api_data':
      // Check if specific API is mentioned
      if (promptLower.includes('http') || promptLower.includes('api') || promptLower.includes('url')) {
        return ['http_request'];
      }
      return ['http_request'];
    
    case 'transform_data':
      // Use JavaScript for general transformation
      return ['javascript'];
    
    case 'summarize_data':
    case 'summarize':
    case 'summarise':
      // ✅ FIXED: Always map summarize to text_summarizer or ai_service
      console.log(`[StepToNodeMapper] ✅ Detected summarize action, mapping to text_summarizer`);
      if (promptLower.includes('ai agent') || promptLower.includes('chat')) {
        return ['ai_agent'];
      }
      // Try text_summarizer first
      const summarizerSchema = nodeLibrary.getSchema('text_summarizer');
      if (summarizerSchema) {
        return ['text_summarizer'];
      }
      // Fallback to AI service - use canonical transformation node
      return [getTransformationNodeType('summarize'), 'openai_gpt', 'ai_agent'];
    
    case 'analyze_data':
    case 'analyze':
    case 'analyse':
      // ✅ FIXED: Always map analyze to ai_agent
      console.log(`[StepToNodeMapper] ✅ Detected analyze action, mapping to ai_agent`);
      return ['ai_agent'];
    
    case 'process_text':
    case 'process_data':
    case 'ai_processing':
      // ✅ FIXED: Always map process text to ai_service
      console.log(`[StepToNodeMapper] ✅ Detected process text action, mapping to AI service`);
      const textSummarizerSchema = nodeLibrary.getSchema('text_summarizer');
      if (textSummarizerSchema) {
        return ['text_summarizer'];
      }
      // Fallback to canonical transformation node
      return [getTransformationNodeType('process'), 'openai_gpt', 'ai_agent'];
    
    case 'send_email':
      // Check if Gmail is mentioned
      if (promptLower.includes('gmail') || promptLower.includes('google mail')) {
        return ['google_gmail'];
      }
      return ['email'];
    
    case 'send_slack':
      return ['slack_message'];
    
    case 'store_database':
      // Check for specific database type
      if (promptLower.includes('postgres') || promptLower.includes('postgresql')) {
        return ['postgresql'];
      }
      if (promptLower.includes('mysql')) {
        return ['mysql'];
      }
      if (promptLower.includes('mongodb') || promptLower.includes('mongo')) {
        return ['mongodb'];
      }
      if (promptLower.includes('supabase')) {
        return ['supabase'];
      }
      // Default to database_write
      return ['database_write'];
    
    case 'condition_check':
      return ['if_else'];
    
    case 'schedule_trigger':
      return ['schedule'];
    
    case 'manual_trigger':
      return ['manual_trigger'];
    
    case 'webhook_trigger':
      return ['webhook'];
    
    default:
      console.warn(`[StepToNodeMapper] Unknown action: ${action}, defaulting to noop`);
      return ['noop'];
  }
}

/**
 * Maps planner trigger type to node trigger type
 * CRITICAL FIX: Handle string trigger types directly (e.g., 'webhook', 'form', etc.)
 */
export function mapTriggerType(triggerType: string): string {
  const triggerLower = triggerType.toLowerCase();
  
  // Direct mapping for common trigger types
  if (triggerLower === 'webhook' || triggerLower === 'webhook_trigger') {
    return 'webhook';
  }
  if (triggerLower === 'form' || triggerLower === 'form_trigger') {
    return 'form';
  }
  if (triggerLower === 'schedule' || triggerLower === 'schedule_trigger') {
    return 'schedule';
  }
  if (triggerLower === 'chat_trigger' || triggerLower === 'chat') {
    return 'chat_trigger';
  }
  if (triggerLower === 'manual' || triggerLower === 'manual_trigger') {
    return 'manual_trigger';
  }
  if (triggerLower === 'event') {
    return 'webhook'; // Events map to webhook
  }
  
  // Default to manual_trigger
  return 'manual_trigger';
}

/**
 * Convert workflow plan steps to WorkflowStepDefinition array
 */
export function mapPlanStepsToWorkflowSteps(
  plan: WorkflowPlan,
  userPrompt?: string
): WorkflowStepDefinition[] {
  const steps: WorkflowStepDefinition[] = [];
  
  console.log(`[StepToNodeMapper] Mapping ${plan.steps.length} planner steps to workflow steps`);
  
  plan.steps.forEach((plannerStep, index) => {
    // Get node type - support both new format (node_type) and legacy format (action)
    let nodeType: string;
    
    if (plannerStep.node_type) {
      // New format: direct node type from registry
      nodeType = plannerStep.node_type;
    } else if (plannerStep.action) {
      // Legacy format: map action to node type
      console.warn(`[StepToNodeMapper] Step ${index + 1} uses deprecated "action" format. Migrating...`);
      const nodeTypes = mapActionToNodeType(plannerStep.action as any, {
        userPrompt,
        previousStep: index > 0 ? plan.steps[index - 1] : undefined,
      });
      nodeType = nodeTypes[0];
    } else {
      console.error(`[StepToNodeMapper] Step ${index + 1} has neither "node_type" nor "action" field`);
      return;
    }
    
    // CRITICAL FIX: Check for specific integrations FIRST before AI detection
    // This prevents "airtable" from being matched by "ai" pattern
    const stepText = `${plannerStep.description || ''} ${nodeType} ${plannerStep.action || ''}`.toLowerCase();
    const promptLower = (userPrompt || '').toLowerCase();
    
    // Check for specific integration keywords BEFORE AI detection
    // CRITICAL: Check nodeType FIRST (most reliable), then check stepText
    const isIntegrationNode = nodeType === 'airtable' ||
                             nodeType === 'google_gmail' ||
                             nodeType === 'gmail' ||
                             nodeType === 'google_sheets' ||
                             nodeType === 'google_doc' ||
                             nodeType === 'hubspot' ||
                             nodeType === 'slack_message' ||
                             nodeType === 'notion' ||
                             nodeType === 'clickup' ||
                             nodeType === 'telegram' ||
                             nodeType === 'github' ||
                             stepText.includes('google sheets') ||
                             stepText.includes('spreadsheet') ||
                             stepText.includes('airtable') || 
                             stepText.includes('gmail') || 
                             stepText.includes('google mail') ||
                             stepText.includes('hubspot') ||
                             stepText.includes('slack') ||
                             stepText.includes('notion') ||
                             stepText.includes('clickup') ||
                             stepText.includes('add row') ||
                             stepText.includes('send email') ||
                             stepText.includes('create contact') ||
                             stepText.includes('via gmail');
    
    // Only check for transformation keywords if NOT an integration node
    if (!isIntegrationNode) {
      // Check for transformation keywords
      if (stepText.includes('summarize') || stepText.includes('summarise') || stepText.includes('summary') ||
          promptLower.includes('summarize') || promptLower.includes('summarise')) {
        console.log(`[StepToNodeMapper] ✅ Detected summarize keyword, ensuring transformation node is mapped`);
        const summarizerSchema = nodeLibrary.getSchema('text_summarizer');
        if (summarizerSchema) {
          nodeType = 'text_summarizer';
        } else {
          // Fallback to canonical transformation node
          const aiChatModelSchema = nodeLibrary.getSchema('ai_chat_model');
          nodeType = aiChatModelSchema ? 'ai_chat_model' : 'ai_agent';
        }
      } else if (stepText.includes('analyze') || stepText.includes('analyse') ||
                 promptLower.includes('analyze') || promptLower.includes('analyse')) {
        console.log(`[StepToNodeMapper] ✅ Detected analyze keyword, ensuring transformation node is mapped`);
        const aiAgentSchema = nodeLibrary.getSchema('ai_agent');
        const aiChatModelSchema = nodeLibrary.getSchema('ai_chat_model');
        nodeType = aiAgentSchema ? 'ai_agent' : (aiChatModelSchema ? 'ai_chat_model' : 'ai_service');
      } else if (stepText.includes('process text') || stepText.includes('process_text') ||
                 (stepText.includes('process') && stepText.includes('text'))) {
        console.log(`[StepToNodeMapper] ✅ Detected process text keyword, ensuring transformation node is mapped`);
        const summarizerSchema = nodeLibrary.getSchema('text_summarizer');
        if (summarizerSchema) {
          nodeType = 'text_summarizer';
        } else {
          // Fallback to canonical transformation node
          const aiChatModelSchema = nodeLibrary.getSchema('ai_chat_model');
          nodeType = aiChatModelSchema ? 'ai_chat_model' : 'ai_agent';
        }
      } else if ((stepText.includes(' ai ') || stepText.includes('ai agent') || stepText.includes('ai_agent')) && 
                 !stepText.includes('airtable') && !stepText.includes('gmail')) {
        // CRITICAL FIX: Only match "ai" as whole word, not as part of "airtable"
        console.log(`[StepToNodeMapper] ✅ Detected AI processing keyword, ensuring transformation node is mapped`);
        const aiAgentSchema = nodeLibrary.getSchema('ai_agent');
        if (aiAgentSchema) {
          nodeType = 'ai_agent';
        } else {
          // Fallback to canonical transformation node
          const aiChatModelSchema = nodeLibrary.getSchema('ai_chat_model');
          nodeType = aiChatModelSchema ? 'ai_chat_model' : 'openai_gpt';
        }
      }
    } else {
      console.log(`[StepToNodeMapper] ✅ Preserving integration node type: ${nodeType} (not overriding with AI)`);
    }
    
    // Skip trigger nodes - they're handled separately
    if (nodeType.includes('trigger') || nodeType === 'schedule' || nodeType === 'webhook' || nodeType === 'form') {
      console.log(`[StepToNodeMapper] Skipping trigger node: ${nodeType}`);
      return;
    }
    
    // Validate node type exists in library
    const schema = nodeLibrary.getSchema(nodeType);
    if (!schema) {
      console.error(`[StepToNodeMapper] Node type "${nodeType}" not found in library`);
      // ✅ FIXED: Don't skip - try to find a valid transformation node instead
      // This prevents transformations from being dropped
      if (stepText.includes('summarize') || stepText.includes('analyze') || stepText.includes('process')) {
        console.warn(`[StepToNodeMapper] ⚠️  Invalid node type "${nodeType}" but transformation detected, trying fallback`);
        const fallbackSchema = nodeLibrary.getSchema('ai_agent');
        if (fallbackSchema) {
          nodeType = 'ai_agent';
        } else {
          console.error(`[StepToNodeMapper] ❌ No valid transformation node found, skipping step`);
          return;
        }
      } else {
        // Skip invalid node types (non-transformation)
        return;
      }
    }
    
    console.log(`[StepToNodeMapper] Using node type: "${nodeType}"`);
    
    // Get schema again (might have changed after fallback)
    const finalSchema = nodeLibrary.getSchema(nodeType);
    
    steps.push({
      id: `step_${index + 1}`,
      description: plannerStep.description || finalSchema?.label || nodeType,
      type: nodeType,
    });
  });
  
  console.log(`[StepToNodeMapper] Successfully mapped ${steps.length} steps`);
  return steps;
}

/**
 * Convert workflow plan to WorkflowGenerationStructure
 */
export function convertPlanToStructure(
  plan: WorkflowPlan,
  userPrompt?: string
): {
  trigger: string;
  steps: WorkflowStepDefinition[];
  outputs: any[];
  connections: any[];
} {
  console.log(`[StepToNodeMapper] Converting plan to structure`);
  console.log(`[StepToNodeMapper] Plan:`, JSON.stringify(plan, null, 2));
  
  // Map trigger
  const trigger = mapTriggerType(plan.trigger_type);
  console.log(`[StepToNodeMapper] Mapped trigger_type "${plan.trigger_type}" → "${trigger}"`);
  
  // Map steps
  const steps = mapPlanStepsToWorkflowSteps(plan, userPrompt);
  
  // Build connections (linear chain: trigger → step1 → step2 → ...)
  const connections: any[] = [];
  if (steps.length > 0) {
    // Connect trigger to first step
    connections.push({
      source: 'trigger',
      target: steps[0].id,
    });
    
    // Connect steps sequentially
    for (let i = 0; i < steps.length - 1; i++) {
      connections.push({
        source: steps[i].id,
        target: steps[i + 1].id,
      });
    }
  }
  
  console.log(`[StepToNodeMapper] Generated ${connections.length} connections`);
  
  // Create outputs (from last step)
  const outputs: any[] = [];
  if (steps.length > 0) {
    const lastStep = steps[steps.length - 1];
    outputs.push({
      name: 'output_1',
      description: `Output from ${lastStep.type}`,
      type: 'object',
      required: false,
    });
  }
  
  return {
    trigger,
    steps,
    outputs,
    connections,
  };
}
