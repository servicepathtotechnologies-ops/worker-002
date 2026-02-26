import { NodeDefinition } from '../../core/types/node-definition';

/**
 * Google Veo Node Definition
 * 
 * Enables text-to-video generation using Google Veo API.
 * Supports asynchronous video generation with polling for completion status.
 * 
 * Workflow: Start generation job → Poll for status → Download video URL
 */
export const googleVeoNodeDefinition: NodeDefinition = {
  type: 'google_veo',
  label: 'Google Veo',
  category: 'ai',
  description: 'Generate videos from text prompts using Google Veo AI',
  icon: 'Video',
  version: 1,

  inputSchema: {
    apiKey: {
      type: 'string',
      description: 'API key (Fal.run or Google Veo)',
      required: true,
      default: '',
      validation: (value) => {
        if (!value || typeof value !== 'string' || value.trim() === '') {
          return 'API key is required';
        }
        return true;
      },
    },
    useFalRun: {
      type: 'boolean',
      description: 'Use Fal.run API (recommended - more reliable)',
      required: false,
      default: true,
    },
    prompt: {
      type: 'string',
      description: 'Text prompt for video generation (can reference previous node outputs like {{input.response_text}})',
      required: true,
      default: '',
      validation: (value) => {
        if (!value || typeof value !== 'string' || value.trim() === '') {
          return 'Prompt is required';
        }
        if (value.length > 5000) {
          return 'Prompt must be less than 5000 characters';
        }
        return true;
      },
    },
    duration: {
      type: 'number',
      description: 'Video duration in seconds',
      required: false,
      default: 8,
      validation: (value) => {
        if (value !== undefined && value !== null) {
          if (typeof value !== 'number') {
            return 'Duration must be a number';
          }
          // Veo3 maximum is 8 seconds, but allow up to 300 for future compatibility
          if (value < 5 || value > 300) {
            return 'Duration must be between 5 and 300 seconds';
          }
          // Warn if exceeding Veo3 limit (but don't fail validation)
          if (value > 8) {
            console.warn('⚠️ Veo3 maximum duration is 8 seconds. Longer durations will be capped at 8 seconds.');
          }
        }
        return true;
      },
    },
    style: {
      type: 'string',
      description: 'Video style/preset',
      required: false,
      default: 'realistic',
      examples: ['realistic', 'educational_diagram', 'animated', 'cinematic', 'documentary'],
      validation: (value) => {
        if (value && typeof value !== 'string') {
          return 'Style must be a string';
        }
        return true;
      },
    },
    resolution: {
      type: 'string',
      description: 'Video resolution',
      required: false,
      default: '1080p',
      examples: ['720p', '1080p', '4k'],
      validation: (value) => {
        if (value && typeof value !== 'string') {
          return 'Resolution must be a string';
        }
        const validResolutions = ['720p', '1080p', '4k'];
        if (value && !validResolutions.includes(value.toLowerCase())) {
          return `Resolution must be one of: ${validResolutions.join(', ')}`;
        }
        return true;
      },
    },
    pollInterval: {
      type: 'number',
      description: 'Seconds between status checks',
      required: false,
      default: 5,
      validation: (value) => {
        if (value !== undefined && value !== null) {
          if (typeof value !== 'number') {
            return 'Poll interval must be a number';
          }
          if (value < 1 || value > 60) {
            return 'Poll interval must be between 1 and 60 seconds';
          }
        }
        return true;
      },
    },
    timeout: {
      type: 'number',
      description: 'Maximum wait time in seconds',
      required: false,
      default: 300,
      validation: (value) => {
        if (value !== undefined && value !== null) {
          if (typeof value !== 'number') {
            return 'Timeout must be a number';
          }
          if (value < 30 || value > 1800) {
            return 'Timeout must be between 30 and 1800 seconds';
          }
        }
        return true;
      },
    },
  },

  outputSchema: {
    default: {
      type: 'object',
      description: 'Google Veo generation result containing videoUrl, jobId, status, duration, and resolution',
    },
  },

  requiredInputs: ['apiKey', 'prompt'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    // Required fields
    if (!inputs.apiKey || typeof inputs.apiKey !== 'string' || inputs.apiKey.trim() === '') {
      errors.push('apiKey field is required');
    }
    if (!inputs.prompt || typeof inputs.prompt !== 'string' || inputs.prompt.trim() === '') {
      errors.push('prompt field is required');
    }

    // Validate duration
    if (inputs.duration !== undefined && inputs.duration !== null) {
      if (typeof inputs.duration !== 'number') {
        errors.push('duration must be a number');
      } else if (inputs.duration < 5 || inputs.duration > 300) {
        errors.push('duration must be between 5 and 300 seconds');
      } else if (inputs.duration > 8) {
        // Warn but don't error - will be capped at runtime
        console.warn('⚠️ Veo3 maximum duration is 8 seconds. Duration will be capped at 8 seconds.');
      }
    }

    // Validate pollInterval
    if (inputs.pollInterval !== undefined && inputs.pollInterval !== null) {
      if (typeof inputs.pollInterval !== 'number') {
        errors.push('pollInterval must be a number');
      } else if (inputs.pollInterval < 1 || inputs.pollInterval > 60) {
        errors.push('pollInterval must be between 1 and 60 seconds');
      }
    }

    // Validate timeout
    if (inputs.timeout !== undefined && inputs.timeout !== null) {
      if (typeof inputs.timeout !== 'number') {
        errors.push('timeout must be a number');
      } else if (inputs.timeout < 30 || inputs.timeout > 1800) {
        errors.push('timeout must be between 30 and 1800 seconds');
      }
    }

    // Validate resolution
    if (inputs.resolution) {
      const validResolutions = ['720p', '1080p', '4k'];
      if (!validResolutions.includes(inputs.resolution.toLowerCase())) {
        errors.push(`resolution must be one of: ${validResolutions.join(', ')}`);
      }
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    apiKey: '',
    useFalRun: true,
    prompt: '',
    duration: 8, // Veo3 maximum is 8 seconds
    style: 'realistic',
    resolution: '1080p',
    pollInterval: 5,
    timeout: 300,
  }),
};
