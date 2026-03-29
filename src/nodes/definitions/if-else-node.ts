/**
 * If/Else Node Definition
 * 
 * Conforms to unified NodeDefinition contract.
 */

import { NodeDefinition, NodeInputSchema, NodeOutputSchema } from '../../core/types/node-definition';
import { normalizeIfElseConfig, validateCanonicalIfElseConditions } from '../../core/utils/if-else-conditions';

export const ifElseNodeDefinition: NodeDefinition = {
  type: 'if_else',
  label: 'If/Else',
  category: 'logic',
  description: 'Conditional branching based on true/false condition',
  icon: 'GitBranch',

  inputSchema: {
    conditions: {
      type: 'array',
      description: 'Conditions to evaluate. Each condition must include field, operator, and value.',
      required: true,
      default: [{ field: '$json.value', operator: 'equals', value: '' }],
      examples: [
        [{ field: '$json.age', operator: 'greater_than_or_equal', value: 18 }],
        [{ field: '$json.status', operator: 'equals', value: 'active' }],
      ],
      validation: (value) => {
        const errors = validateCanonicalIfElseConditions(value);
        return errors.length > 0 ? errors[0] : true;
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
      errors.push(...validateCanonicalIfElseConditions(inputs.conditions));
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
    conditions: [{ field: '$json.value', operator: 'equals', value: '' }],
    combineOperation: 'AND',
  }),

  migrations: [
    {
      version: 2,
      migrate: (oldInputs: Record<string, any>) => {
        return normalizeIfElseConfig(oldInputs);
      },
    },
  ],
};
