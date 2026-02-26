import { NodeDefinition } from '../../core/types/node-definition';

export const manualTriggerNodeDefinition: NodeDefinition = {
  type: 'manual_trigger',
  label: 'Manual Trigger',
  category: 'triggers',
  description: 'Trigger workflow manually',
  icon: 'Play',
  version: 1,

  inputSchema: {}, // No inputs for trigger

  outputSchema: {
    default: {
      type: 'object',
      description: 'Trigger output with execution metadata',
    },
  },

  requiredInputs: [],
  outgoingPorts: ['default'],
  incomingPorts: [], // Triggers have no incoming
  isBranching: false,

  validateInputs: () => ({ valid: true, errors: [] }),
  defaultInputs: () => ({}),
};
