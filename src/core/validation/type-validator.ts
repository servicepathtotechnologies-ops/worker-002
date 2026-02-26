// Type Validation Middleware
// Validates workflow structures and ensures type safety

import {
  WorkflowStructure,
  InputDefinition,
  OutputDefinition,
  WorkflowStep,
  WorkflowNode,
  WorkflowEdge,
} from '../types/ai-types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class TypeValidator {
  /**
   * Validate a workflow structure
   */
  static validateStructure(structure: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!structure) {
      errors.push('Structure is null or undefined');
      return { isValid: false, errors, warnings };
    }

    if (!structure.inputs || !Array.isArray(structure.inputs)) {
      errors.push('Structure must have an "inputs" array');
    }

    if (!structure.outputs || !Array.isArray(structure.outputs)) {
      errors.push('Structure must have an "outputs" array');
    }

    if (!structure.steps || !Array.isArray(structure.steps)) {
      warnings.push('Structure should have a "steps" array');
    }

    // Validate inputs
    if (structure.inputs && Array.isArray(structure.inputs)) {
      structure.inputs.forEach((input: any, index: number) => {
        if (!input || typeof input !== 'object') {
          errors.push(`Input ${index}: Must be an object`);
          return;
        }

        if (!input.name || typeof input.name !== 'string') {
          errors.push(`Input ${index}: Missing or invalid "name" (must be string)`);
        }

        if (!input.type) {
          errors.push(`Input ${index}: Missing "type"`);
        } else if (
          !['string', 'number', 'boolean', 'object', 'array', 'file'].includes(input.type)
        ) {
          errors.push(`Input ${index}: Invalid type "${input.type}"`);
        }

        if (!input.description || typeof input.description !== 'string') {
          warnings.push(`Input ${index}: Missing or invalid "description"`);
        }

        if (typeof input.required !== 'boolean') {
          warnings.push(`Input ${index}: "required" should be boolean (defaulting to true)`);
        }
      });
    }

    // Validate outputs
    if (structure.outputs && Array.isArray(structure.outputs)) {
      structure.outputs.forEach((output: any, index: number) => {
        if (!output || typeof output !== 'object') {
          errors.push(`Output ${index}: Must be an object`);
          return;
        }

        if (!output.description || typeof output.description !== 'string') {
          errors.push(`Output ${index}: Missing or invalid "description" (must be string)`);
        }

        if (!output.name || typeof output.name !== 'string') {
          warnings.push(`Output ${index}: Missing "name" (will be generated)`);
        }

        if (output.type) {
          if (
            !['string', 'number', 'boolean', 'object', 'array', 'file'].includes(output.type)
          ) {
            errors.push(`Output ${index}: Invalid type "${output.type}"`);
          }
        } else {
          warnings.push(`Output ${index}: Missing "type" (will be inferred)`);
        }

        if (typeof output.required !== 'boolean') {
          warnings.push(`Output ${index}: "required" should be boolean (defaulting to true)`);
        }
      });
    }

    // Validate steps
    if (structure.steps && Array.isArray(structure.steps)) {
      structure.steps.forEach((step: any, index: number) => {
        if (!step || typeof step !== 'object') {
          errors.push(`Step ${index}: Must be an object`);
          return;
        }

        if (!step.id || typeof step.id !== 'string') {
          errors.push(`Step ${index}: Missing or invalid "id"`);
        }

        if (!step.type || typeof step.type !== 'string') {
          errors.push(`Step ${index}: Missing or invalid "type"`);
        }

        if (!step.description || typeof step.description !== 'string') {
          warnings.push(`Step ${index}: Missing or invalid "description"`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate workflow nodes and edges
   */
  static validateWorkflow(workflow: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  }): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      errors.push('Workflow must have a "nodes" array');
      return { isValid: false, errors, warnings };
    }

    if (!workflow.edges || !Array.isArray(workflow.edges)) {
      warnings.push('Workflow should have an "edges" array');
    }

    // Validate nodes
    if (workflow.nodes.length === 0) {
      errors.push('Workflow must have at least one node');
    }

    const nodeIds = new Set<string>();
    workflow.nodes.forEach((node, index) => {
      if (!node.id || typeof node.id !== 'string') {
        errors.push(`Node ${index}: Missing or invalid "id"`);
      } else if (nodeIds.has(node.id)) {
        errors.push(`Node ${index}: Duplicate id "${node.id}"`);
      } else {
        nodeIds.add(node.id);
      }

      if (!node.type || typeof node.type !== 'string') {
        errors.push(`Node ${index}: Missing or invalid "type"`);
      }

      if (!node.data || typeof node.data !== 'object') {
        errors.push(`Node ${index}: Missing or invalid "data"`);
      } else {
        if (!node.data.label || typeof node.data.label !== 'string') {
          warnings.push(`Node ${index}: Missing or invalid "data.label"`);
        }
        if (!node.data.type || typeof node.data.type !== 'string') {
          warnings.push(`Node ${index}: Missing or invalid "data.type"`);
        }
      }
    });

    // Validate edges
    if (workflow.edges && Array.isArray(workflow.edges)) {
      workflow.edges.forEach((edge, index) => {
        if (!edge.id || typeof edge.id !== 'string') {
          errors.push(`Edge ${index}: Missing or invalid "id"`);
        }

        if (!edge.source || typeof edge.source !== 'string') {
          errors.push(`Edge ${index}: Missing or invalid "source"`);
        } else if (!nodeIds.has(edge.source)) {
          errors.push(`Edge ${index}: Source node "${edge.source}" does not exist`);
        }

        if (!edge.target || typeof edge.target !== 'string') {
          errors.push(`Edge ${index}: Missing or invalid "target"`);
        } else if (!nodeIds.has(edge.target)) {
          errors.push(`Edge ${index}: Target node "${edge.target}" does not exist`);
        }
      });
    }

    // Check for trigger node
    const hasTrigger = workflow.nodes.some(
      (n) => ['manual_trigger', 'webhook', 'schedule', 'interval', 'form'].includes(n.type)
    );
    if (!hasTrigger) {
      warnings.push('Workflow should have a trigger node');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate input definition
   */
  static validateInput(input: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!input || typeof input !== 'object') {
      errors.push('Input must be an object');
      return { isValid: false, errors, warnings };
    }

    if (!input.name || typeof input.name !== 'string') {
      errors.push('Input must have a "name" string property');
    }

    if (!input.type) {
      errors.push('Input must have a "type" property');
    } else if (!['string', 'number', 'boolean', 'object', 'array', 'file'].includes(input.type)) {
      errors.push(`Invalid input type: ${input.type}`);
    }

    if (!input.description || typeof input.description !== 'string') {
      warnings.push('Input should have a "description" string property');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate output definition
   */
  static validateOutput(output: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!output || typeof output !== 'object') {
      errors.push('Output must be an object');
      return { isValid: false, errors, warnings };
    }

    if (!output.description || typeof output.description !== 'string') {
      errors.push('Output must have a "description" string property');
    }

    if (!output.name || typeof output.name !== 'string') {
      warnings.push('Output should have a "name" string property');
    }

    if (output.type) {
      if (!['string', 'number', 'boolean', 'object', 'array', 'file'].includes(output.type)) {
        errors.push(`Invalid output type: ${output.type}`);
      }
    } else {
      warnings.push('Output should have a "type" property');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
