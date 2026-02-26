/**
 * If/Else Node Definition
 * 
 * Conforms to unified NodeDefinition contract.
 */

import { NodeDefinition, NodeInputSchema, NodeOutputSchema } from '../../core/types/node-definition';

export const ifElseNodeDefinition: NodeDefinition = {
  type: 'if_else',
  label: 'If/Else',
  category: 'logic',
  description: 'Conditional branching based on true/false condition',
  icon: 'GitBranch',

  inputSchema: {
    conditions: {
      type: 'array',
      description: 'Conditions to evaluate. Each condition must have an expression.',
      required: true,
      default: [{ expression: '' }],
      examples: [
        [{ expression: '{{input.age}} >= 18' }],
        [{ expression: '{{input.status}} === "active"' }],
      ],
      validation: (value) => {
        if (!Array.isArray(value)) {
          return 'Conditions must be an array';
        }
        if (value.length === 0) {
          return 'At least one condition is required';
        }
        for (const cond of value) {
          if (typeof cond !== 'object' || !cond.expression) {
            return 'Each condition must have an expression field';
          }
          if (typeof cond.expression !== 'string' || cond.expression.trim() === '') {
            return 'Condition expression cannot be empty';
          }
        }
        return true;
      },
    },
    combineOperation: {
      type: 'string',
      description: 'How to combine multiple conditions',
      required: false,
      default: 'AND',
      examples: ['AND', 'OR'],
      validation: (value) => {
        if (value && value !== 'AND' && value !== 'OR') {
          return 'combineOperation must be "AND" or "OR"';
        }
        return true;
      },
    },
  } as NodeInputSchema,

  outputSchema: {
    true: {
      type: 'object',
      description: 'Output when condition is true',
    },
    false: {
      type: 'object',
      description: 'Output when condition is false',
    },
  } as NodeOutputSchema,

  requiredInputs: ['conditions'],
  outgoingPorts: ['true', 'false'],
  incomingPorts: ['default'],
  isBranching: true,

  validateInputs: (inputs: Record<string, any>) => {
    const errors: string[] = [];

    // Validate conditions array
    if (!inputs.conditions) {
      errors.push('conditions field is required');
    } else if (!Array.isArray(inputs.conditions)) {
      errors.push('conditions must be an array');
    } else if (inputs.conditions.length === 0) {
      errors.push('At least one condition is required');
    } else {
      for (let i = 0; i < inputs.conditions.length; i++) {
        const cond = inputs.conditions[i];
        if (typeof cond !== 'object' || !cond.expression) {
          errors.push(`Condition ${i + 1} must have an expression field`);
        } else if (typeof cond.expression !== 'string' || cond.expression.trim() === '') {
          errors.push(`Condition ${i + 1} expression cannot be empty`);
        }
      }
    }

    // Validate combineOperation if provided
    if (inputs.combineOperation && inputs.combineOperation !== 'AND' && inputs.combineOperation !== 'OR') {
      errors.push('combineOperation must be "AND" or "OR"');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },

  defaultInputs: () => ({
    conditions: [{ expression: '' }],
    combineOperation: 'AND',
  }),

  migrations: [
    {
      version: 2,
      migrate: (oldInputs: Record<string, any>) => {
        // Migration from v1 (condition string) to v2 (conditions array)
        if (oldInputs.condition && !oldInputs.conditions) {
          const conditionStr = typeof oldInputs.condition === 'string' 
            ? oldInputs.condition 
            : String(oldInputs.condition);
          
          if (conditionStr.trim()) {
            return {
              ...oldInputs,
              conditions: [{ expression: conditionStr.trim() }],
              // Keep condition for backward compatibility during transition
              condition: conditionStr,
            };
          }
        }
        return oldInputs;
      },
    },
  ],
};
