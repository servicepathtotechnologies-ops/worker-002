import { NodeDefinition } from '../../core/types/node-definition';

/**
 * Lightricks LTX-2 Node Definition
 * 
 * Enables video generation using Lightricks LTX-2 open-source model.
 * Supports multiple generation modes:
 * - Text-to-Video: Generate from text prompts
 * - Image-to-Video: Animate images
 * - Audio-to-Video: Generate from audio
 * - Video-to-Video: Transform existing videos (retake)
 * - Image-Text-to-Video: Combine image and text
 * - Text-to-Audio: Generate audio from text
 * - Audio-to-Audio: Process/modify audio
 * 
 * The model runs locally via FastAPI service.
 */
export const lightricksNodeDefinition: NodeDefinition = {
  type: 'lightricks',
  label: 'Lightricks LTX-2',
  category: 'ai',
  description: 'Generate videos using Lightricks LTX-2 open-source AI model',
  icon: 'Video',
  version: 1,

  inputSchema: {
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
    mode: {
      type: 'string',
      description: 'Generation mode: text-to-video, image-to-video, audio-to-video, video-to-video (retake), image-text-to-video, text-to-audio, audio-to-audio',
      required: false,
      default: 'text-to-video',
      examples: [
        'text-to-video', 
        'image-to-video', 
        'audio-to-video',
        'video-to-video',
        'image-text-to-video',
        'text-to-audio',
        'audio-to-audio'
      ],
      validation: (value) => {
        if (value && typeof value !== 'string') {
          return 'Mode must be a string';
        }
        const validModes = [
          'text-to-video', 
          'image-to-video', 
          'audio-to-video',
          'video-to-video',
          'image-text-to-video',
          'text-to-audio',
          'audio-to-audio'
        ];
        if (value && !validModes.includes(value)) {
          return `Mode must be one of: ${validModes.join(', ')}`;
        }
        return true;
      },
    },
    image_url: {
      type: 'string',
      description: 'URL or path to input image (required for image-to-video mode)',
      required: false,
      default: '',
      validation: (value) => {
        if (value && typeof value !== 'string') {
          return 'Image URL must be a string';
        }
        return true;
      },
    },
    audio_url: {
      type: 'string',
      description: 'URL or path to input audio (required for audio-to-video, audio-to-audio modes)',
      required: false,
      default: '',
      validation: (value) => {
        if (value && typeof value !== 'string') {
          return 'Audio URL must be a string';
        }
        return true;
      },
    },
    video_url: {
      type: 'string',
      description: 'URL or path to input video (required for video-to-video/retake mode)',
      required: false,
      default: '',
      validation: (value) => {
        if (value && typeof value !== 'string') {
          return 'Video URL must be a string';
        }
        return true;
      },
    },
    duration: {
      type: 'number',
      description: 'Video duration in seconds',
      required: false,
      default: 5.0,
      validation: (value) => {
        if (value !== undefined && value !== null) {
          if (typeof value !== 'number') {
            return 'Duration must be a number';
          }
          if (value < 1 || value > 60) {
            return 'Duration must be between 1 and 60 seconds';
          }
        }
        return true;
      },
    },
    fps: {
      type: 'number',
      description: 'Frames per second',
      required: false,
      default: 25,
      validation: (value) => {
        if (value !== undefined && value !== null) {
          if (typeof value !== 'number') {
            return 'FPS must be a number';
          }
          if (value < 1 || value > 60) {
            return 'FPS must be between 1 and 60';
          }
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
    options: {
      type: 'object',
      description: 'Additional generation options (JSON object)',
      required: false,
      default: {},
      validation: (value) => {
        if (value && typeof value !== 'object') {
          return 'Options must be an object';
        }
        return true;
      },
    },
  },

  outputSchema: {
    default: {
      type: 'object',
      description: 'Lightricks generation result containing video_path, video_url, success, and metadata',
    },
  },

  requiredInputs: ['prompt'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    // Required fields
    if (!inputs.prompt || typeof inputs.prompt !== 'string' || inputs.prompt.trim() === '') {
      errors.push('prompt field is required');
    }

    // Validate mode
    if (inputs.mode) {
      const validModes = [
        'text-to-video', 
        'image-to-video', 
        'audio-to-video',
        'video-to-video',
        'image-text-to-video',
        'text-to-audio',
        'audio-to-audio'
      ];
      if (!validModes.includes(inputs.mode)) {
        errors.push(`mode must be one of: ${validModes.join(', ')}`);
      }
    }

    // Mode-specific requirements
    if (inputs.mode === 'image-to-video' || inputs.mode === 'image-text-to-video') {
      if (!inputs.image_url || typeof inputs.image_url !== 'string' || inputs.image_url.trim() === '') {
        errors.push(`image_url is required for ${inputs.mode} mode`);
      }
    }

    if (inputs.mode === 'audio-to-video' || inputs.mode === 'audio-to-audio') {
      if (!inputs.audio_url || typeof inputs.audio_url !== 'string' || inputs.audio_url.trim() === '') {
        errors.push(`audio_url is required for ${inputs.mode} mode`);
      }
    }

    if (inputs.mode === 'video-to-video') {
      if (!inputs.video_url || typeof inputs.video_url !== 'string' || inputs.video_url.trim() === '') {
        errors.push('video_url is required for video-to-video mode');
      }
    }

    // Validate duration
    if (inputs.duration !== undefined && inputs.duration !== null) {
      if (typeof inputs.duration !== 'number') {
        errors.push('duration must be a number');
      } else if (inputs.duration < 1 || inputs.duration > 60) {
        errors.push('duration must be between 1 and 60 seconds');
      }
    }

    // Validate fps
    if (inputs.fps !== undefined && inputs.fps !== null) {
      if (typeof inputs.fps !== 'number') {
        errors.push('fps must be a number');
      } else if (inputs.fps < 1 || inputs.fps > 60) {
        errors.push('fps must be between 1 and 60');
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
    prompt: '',
    mode: 'text-to-video',
    image_url: '',
    audio_url: '',
    video_url: '',
    duration: 5.0,
    fps: 25,
    resolution: '1080p',
    options: {},
  }),
};
