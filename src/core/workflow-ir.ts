/**
 * Workflow Intermediate Representation (IR)
 * 
 * Semantic representation of workflow before JSON graph generation.
 * 
 * Purpose:
 * - Easier validation
 * - Repair workflows
 * - Deterministic generation
 * - Clear separation between planning and graph building
 * 
 * Structure:
 * {
 *   trigger: {},
 *   steps: [],
 *   dataBindings: [],
 *   conditions: []
 * }
 */

import { WorkflowPlan, WorkflowStep, TriggerType } from '../services/workflow-planner';
import { OutputDefinition, InputOutputType } from './types/ai-types';

/**
 * Trigger definition in IR
 */
export interface IRTrigger {
  type: string; // Node type (e.g., 'manual_trigger', 'schedule', 'webhook')
  config?: Record<string, any>; // Trigger-specific configuration
  description?: string;
}

/**
 * Step definition in IR
 * Semantic step before node type mapping
 */
export interface IRStep {
  id: string;
  action: string; // Planner action (e.g., 'fetch_google_sheets_data')
  nodeType?: string; // Mapped node type (e.g., 'google_sheets') - optional, can be determined later
  description?: string;
  config?: Record<string, any>; // Step-specific configuration
  order: number; // Execution order
  dependencies?: string[]; // IDs of steps this depends on
}

/**
 * Data binding definition
 * Maps data flow between steps
 */
export interface IRDataBinding {
  source: string; // Source step ID or 'trigger'
  target: string; // Target step ID
  sourceField?: string; // Specific field from source (e.g., 'rows', 'data')
  targetField?: string; // Specific field for target (e.g., 'input', 'userInput')
  transform?: string; // Optional transformation expression
}

/**
 * Condition definition
 * Conditional logic in workflow
 */
export interface IRCondition {
  id: string;
  type: 'if_else' | 'switch';
  stepId: string; // Step that contains the condition
  condition: string; // Condition expression
  truePath?: string[]; // Step IDs for true path
  falsePath?: string[]; // Step IDs for false path (for if_else)
  cases?: Record<string, string[]>; // Cases for switch
}

/**
 * Workflow Intermediate Representation
 */
export interface WorkflowIR {
  trigger: IRTrigger;
  steps: IRStep[];
  dataBindings: IRDataBinding[];
  conditions: IRCondition[];
  metadata?: {
    source: 'planner' | 'example' | 'manual';
    confidence?: number;
    reasoning?: string;
    originalPrompt?: string;
  };
}

/**
 * Workflow IR Builder
 * Converts planner output to IR
 */
export class WorkflowIRBuilder {
  /**
   * Convert workflow plan to IR
   */
  static fromPlan(plan: WorkflowPlan, userPrompt?: string): WorkflowIR {
    console.log(`[WorkflowIR] Converting plan to IR`);
    
    // Map trigger
    const trigger = this.mapTrigger(plan.trigger_type);
    
    // Map steps
    const steps = plan.steps
      .filter(step => {
        // Skip trigger nodes (handled separately)
        // Support both new format (node_type) and legacy format (action)
        const stepType = step.node_type || step.action || '';
        return !stepType.includes('trigger') && 
               stepType !== 'schedule' && 
               stepType !== 'webhook' && 
               stepType !== 'form';
      })
      .map((step, index) => this.mapStep(step, index + 1));
    
    // Generate data bindings (sequential by default)
    const dataBindings = this.generateDataBindings(trigger, steps);
    
    // Extract conditions from steps
    const conditions = this.extractConditions(steps);
    
    return {
      trigger,
      steps,
      dataBindings,
      conditions,
      metadata: {
        source: 'planner',
        confidence: plan.confidence,
        reasoning: plan.reasoning,
        originalPrompt: userPrompt,
      },
    };
  }
  
  /**
   * Map trigger type to IR trigger
   */
  private static mapTrigger(triggerType: TriggerType): IRTrigger {
    const triggerMap: Record<TriggerType, string> = {
      'manual': 'manual_trigger',
      'schedule': 'schedule',
      'event': 'webhook',
    };
    
    return {
      type: triggerMap[triggerType] || 'manual_trigger',
      description: `${triggerType} trigger`,
    };
  }
  
  /**
   * Map planner step to IR step
   * Supports both new format (node_type) and legacy format (action)
   */
  private static mapStep(step: WorkflowStep, order: number): IRStep {
    // Use node_type if available (new format), otherwise fall back to action (legacy)
    const stepType = step.node_type || step.action || 'unknown';
    
    return {
      id: `step_${order}`,
      action: stepType, // Store as action for IR compatibility
      description: step.description,
      order: step.order || order,
      config: {},
    };
  }
  
  /**
   * Generate data bindings between steps
   * Sequential flow by default
   */
  private static generateDataBindings(
    trigger: IRTrigger,
    steps: IRStep[]
  ): IRDataBinding[] {
    const bindings: IRDataBinding[] = [];
    
    if (steps.length === 0) {
      return bindings;
    }
    
    // Connect trigger to first step
    bindings.push({
      source: 'trigger',
      target: steps[0].id,
      sourceField: 'output',
      targetField: 'input',
    });
    
    // Connect steps sequentially
    for (let i = 0; i < steps.length - 1; i++) {
      bindings.push({
        source: steps[i].id,
        target: steps[i + 1].id,
        sourceField: 'output',
        targetField: 'input',
      });
    }
    
    return bindings;
  }
  
  /**
   * Extract conditions from steps
   * Looks for condition_check actions or if_else node types
   */
  private static extractConditions(steps: IRStep[]): IRCondition[] {
    const conditions: IRCondition[] = [];
    
    steps.forEach((step, index) => {
      // Support both legacy action format and new node_type format
      const stepType = step.action || '';
      if (stepType === 'condition_check' || stepType === 'if_else') {
        conditions.push({
          id: `condition_${conditions.length + 1}`,
          type: 'if_else',
          stepId: step.id,
          condition: step.description || 'true', // Default condition
          truePath: index < steps.length - 1 ? [steps[index + 1].id] : [],
          falsePath: [],
        });
      }
    });
    
    return conditions;
  }
}

/**
 * Workflow IR Validator
 * Validates IR structure and semantics
 */
export class WorkflowIRValidator {
  /**
   * Validate IR structure
   */
  static validate(ir: WorkflowIR): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Validate trigger
    if (!ir.trigger || !ir.trigger.type) {
      errors.push('IR missing trigger');
    }
    
    // Validate steps
    if (!Array.isArray(ir.steps)) {
      errors.push('IR steps must be an array');
    } else {
      // Check for duplicate step IDs
      const stepIds = ir.steps.map(s => s.id);
      const duplicates = stepIds.filter((id, index) => stepIds.indexOf(id) !== index);
      if (duplicates.length > 0) {
        errors.push(`Duplicate step IDs: ${duplicates.join(', ')}`);
      }
      
      // Check step order
      const orders = ir.steps.map(s => s.order).sort((a, b) => a - b);
      for (let i = 0; i < orders.length; i++) {
        if (orders[i] !== i + 1) {
          warnings.push(`Step order may be incorrect: expected ${i + 1}, found ${orders[i]}`);
        }
      }
    }
    
    // Validate data bindings
    if (!Array.isArray(ir.dataBindings)) {
      errors.push('IR dataBindings must be an array');
    } else {
      // Check all bindings reference valid steps
      const stepIds = new Set(['trigger', ...ir.steps.map(s => s.id)]);
      ir.dataBindings.forEach((binding, index) => {
        if (!stepIds.has(binding.source)) {
          errors.push(`Data binding ${index}: source "${binding.source}" not found`);
        }
        if (!stepIds.has(binding.target)) {
          errors.push(`Data binding ${index}: target "${binding.target}" not found`);
        }
      });
    }
    
    // Validate conditions
    if (!Array.isArray(ir.conditions)) {
      errors.push('IR conditions must be an array');
    } else {
      const stepIds = new Set(ir.steps.map(s => s.id));
      ir.conditions.forEach((condition, index) => {
        if (!stepIds.has(condition.stepId)) {
          errors.push(`Condition ${index}: stepId "${condition.stepId}" not found`);
        }
      });
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

/**
 * Workflow IR Repairer
 * Automatically repairs common IR issues
 */
export class WorkflowIRRepairer {
  /**
   * Repair IR structure
   */
  static repair(ir: WorkflowIR): {
    repaired: WorkflowIR;
    fixes: string[];
  } {
    const fixes: string[] = [];
    let repaired = { ...ir };
    
    // Fix missing trigger (only if truly missing - don't add if already exists)
    if (!repaired.trigger || !repaired.trigger.type) {
      // Check if any step is actually a trigger action
      const hasTriggerStep = repaired.steps.some(step => {
        const stepType = step.action || step.nodeType || '';
        return stepType.includes('trigger') || 
               stepType === 'schedule' || 
               stepType === 'webhook' ||
               stepType === 'form';
      });
      
      if (!hasTriggerStep) {
        repaired.trigger = {
          type: 'manual_trigger',
          description: 'Manual trigger',
        };
        fixes.push('Added missing trigger (default: manual_trigger)');
      } else {
        // Extract trigger from step
        const triggerStep = repaired.steps.find(step => {
          const stepType = step.action || step.nodeType || '';
          return stepType.includes('trigger') || 
                 stepType === 'schedule' || 
                 stepType === 'webhook' ||
                 stepType === 'form';
        });
        if (triggerStep) {
          const stepType = triggerStep.action || triggerStep.nodeType || '';
          const triggerTypeMap: Record<string, string> = {
            'manual_trigger': 'manual_trigger',
            'schedule_trigger': 'schedule',
            'webhook_trigger': 'webhook',
            'schedule': 'schedule',
            'webhook': 'webhook',
            'form': 'form',
          };
          repaired.trigger = {
            type: triggerTypeMap[stepType] || stepType || 'manual_trigger',
            description: triggerStep.description || 'Trigger',
          };
          fixes.push(`Extracted trigger from step: ${stepType}`);
        }
      }
    }
    
    // Fix step IDs
    repaired.steps = repaired.steps.map((step, index) => {
      if (!step.id || step.id.trim() === '') {
        fixes.push(`Fixed missing step ID at index ${index}`);
        return { ...step, id: `step_${index + 1}` };
      }
      return step;
    });
    
    // Fix step orders
    repaired.steps = repaired.steps.map((step, index) => {
      if (!step.order || step.order !== index + 1) {
        fixes.push(`Fixed step order for ${step.id}: ${index + 1}`);
        return { ...step, order: index + 1 };
      }
      return step;
    });
    
    // Fix data bindings
    const stepIds = new Set(['trigger', ...repaired.steps.map(s => s.id)]);
    repaired.dataBindings = repaired.dataBindings.filter((binding, index) => {
      if (!stepIds.has(binding.source) || !stepIds.has(binding.target)) {
        fixes.push(`Removed invalid data binding ${index}`);
        return false;
      }
      return true;
    });
    
    // Regenerate missing data bindings
    if (repaired.dataBindings.length === 0 && repaired.steps.length > 0) {
      repaired.dataBindings = WorkflowIRBuilder['generateDataBindings'](
        repaired.trigger,
        repaired.steps
      );
      fixes.push('Regenerated missing data bindings');
    }
    
    // Fix conditions
    const validStepIds = new Set(repaired.steps.map(s => s.id));
    repaired.conditions = repaired.conditions.filter((condition, index) => {
      if (!validStepIds.has(condition.stepId)) {
        fixes.push(`Removed invalid condition ${index}`);
        return false;
      }
      return true;
    });
    
    return {
      repaired,
      fixes,
    };
  }
}

/**
 * Workflow IR Converter
 * Converts IR to WorkflowGenerationStructure
 */
export class WorkflowIRConverter {
  /**
   * Convert IR to WorkflowGenerationStructure
   * This is the bridge between IR and graph generation
   */
  static toStructure(ir: WorkflowIR): {
    trigger: string;
    steps: Array<{
      id: string;
      description: string;
      type: string;
    }>;
    outputs: Array<{
      name: string;
      description: string;
      type: string;
      required: boolean;
    }>;
    connections: Array<{
      source: string;
      target: string;
    }>;
  } {
    console.log(`[WorkflowIR] Converting IR to structure`);
    
    // Map trigger
    const trigger = ir.trigger.type;
    
    // Map steps (need node type mapping - will be done by step-to-node-mapper)
    const steps = ir.steps.map(step => {
      // Use nodeType if available, otherwise use action
      const nodeType = step.nodeType || step.action || 'unknown';
      return {
        id: step.id,
        description: step.description || nodeType,
        type: nodeType, // Will be mapped later
      };
    });
    
    // Map data bindings to connections
    const connections = ir.dataBindings.map(binding => ({
      source: binding.source === 'trigger' ? 'trigger' : binding.source,
      target: binding.target,
    }));
    
    // Generate outputs (from last step)
    const outputs: OutputDefinition[] = ir.steps.length > 0
      ? [{
          name: 'output_1',
          description: `Output from ${ir.steps[ir.steps.length - 1].action}`,
          type: 'object' as InputOutputType,
          required: false,
        }]
      : [];
    
    return {
      trigger,
      steps,
      outputs,
      connections,
    };
  }
}

// Types are already exported above as interfaces, no need to re-export
