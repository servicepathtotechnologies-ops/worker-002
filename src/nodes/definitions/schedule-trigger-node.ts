import { NodeDefinition } from '../../core/types/node-definition';

export const scheduleTriggerNodeDefinition: NodeDefinition = {
  type: 'schedule',
  label: 'Schedule Trigger (Cron)',
  category: 'triggers',
  description: 'Trigger workflow on schedule',
  icon: 'Clock',
  version: 1,

  inputSchema: {
    time: {
      type: 'string',
      description: 'Time in 24-hour format (HH:MM)',
      required: true,
      default: '09:00',
      validation: (value) => {
        if (!value || typeof value !== 'string') {
          return 'Time is required';
        }
        const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(value)) {
          return 'Time must be in HH:MM format (e.g., 09:00, 14:30)';
        }
        return true;
      },
    },
    timezone: {
      type: 'string',
      description: 'Timezone for schedule',
      required: true,
      default: 'Asia/Kolkata',
      validation: (value) => {
        if (!value || typeof value !== 'string') {
          return 'Timezone is required';
        }
        // Basic validation - could be more strict
        return true;
      },
    },
  },

  outputSchema: {
    default: {
      type: 'object',
      description: 'Schedule trigger output',
    },
  },

  requiredInputs: ['time', 'timezone'],
  outgoingPorts: ['default'],
  incomingPorts: [],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];
    if (!inputs.time || typeof inputs.time !== 'string') {
      errors.push('time field is required');
    } else {
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(inputs.time)) {
        errors.push('time must be in HH:MM format (e.g., 09:00, 14:30)');
      }
    }
    if (!inputs.timezone || typeof inputs.timezone !== 'string') {
      errors.push('timezone field is required');
    }
    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    time: '09:00',
    timezone: 'Asia/Kolkata',
  }),
};
