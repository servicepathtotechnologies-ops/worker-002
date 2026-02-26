import { NodeDefinition } from '../../core/types/node-definition';

/**
 * Instagram Node Definition
 * 
 * Comprehensive integration with Instagram Graph API (v18.0+).
 * Supports multiple resources (User, Media, Comment, Hashtag, Story, Insights)
 * and operations (Get, List, Create, Update, Delete, Publish, etc.)
 * similar to n8n's Instagram node.
 * 
 * Uses facebook-nodejs-business-sdk for reliable API interaction with OAuth 2.0 support,
 * automatic pagination, error handling, and type safety.
 * 
 * Authentication: Requires Facebook OAuth token with Instagram permissions:
 * - instagram_basic
 * - instagram_content_publish
 * - pages_show_list
 * - business_management
 */
export const instagramNodeDefinition: NodeDefinition = {
  type: 'instagram',
  label: 'Instagram',
  category: 'social',
  description: 'Interact with Instagram Graph API to manage posts, comments, hashtags, stories, and insights',
  icon: 'Image',
  version: 1,

  inputSchema: {
    resource: {
      type: 'string',
      description: 'Resource type to operate on',
      required: true,
      default: 'user',
      examples: ['user', 'media', 'comment', 'hashtag', 'story', 'insights'],
      validation: (value) => {
        const validResources = ['user', 'media', 'comment', 'hashtag', 'story', 'insights'];
        if (!validResources.includes(value)) {
          return `Resource must be one of: ${validResources.join(', ')}`;
        }
        return true;
      },
    },
    operation: {
      type: 'string',
      description: 'Operation to perform',
      required: true,
      default: 'get',
      examples: [
        // User operations
        'get', 'getMedia', 'getInsights',
        // Media operations
        'get', 'list', 'create', 'publish', 'createAndPublish', 'update', 'delete', 'getInsights', 'getContainerStatus',
        // Comment operations
        'list', 'get', 'create', 'reply', 'delete', 'hide', 'unhide',
        // Hashtag operations
        'search', 'get', 'getRecentMedia', 'getTopMedia',
        // Story operations
        'get', 'list', 'getInsights',
        // Insights operations
        'get',
      ],
      validation: (value) => {
        // Operation validation is resource-dependent, so we'll validate in validateInputs
        return true;
      },
    },
    // Instagram Business Account ID (required for most operations)
    instagramBusinessAccountId: {
      type: 'string',
      description: 'Instagram Business Account ID (IG User ID). If not provided, will attempt to fetch automatically.',
      required: false,
      default: '',
    },
    // User operations
    fields: {
      type: 'string',
      description: 'Comma-separated list of fields to return (e.g., "id,username,account_type")',
      required: false,
      default: '',
    },
    // Media operations
    mediaId: {
      type: 'string',
      description: 'Media ID (required for get, update, delete, getInsights)',
      required: false,
      default: '',
    },
    media_type: {
      type: 'string',
      description: 'Media type: IMAGE, VIDEO, REELS, CAROUSEL_ALBUM',
      required: false,
      default: 'IMAGE',
      examples: ['IMAGE', 'VIDEO', 'REELS', 'CAROUSEL_ALBUM'],
    },
    media_url: {
      type: 'string',
      description: 'URL of the media to upload (for IMAGE, VIDEO, REELS)',
      required: false,
      default: '',
    },
    video_url: {
      type: 'string',
      description: 'URL of the video to upload (alternative to media_url for videos)',
      required: false,
      default: '',
    },
    caption: {
      type: 'string',
      description: 'Caption text for the media post',
      required: false,
      default: '',
    },
    location_id: {
      type: 'string',
      description: 'Location ID (optional, for geotagging)',
      required: false,
      default: '',
    },
    user_tags: {
      type: 'json',
      description: 'Array of user tags (e.g., [{"user_id": "123", "x": 0.5, "y": 0.5}])',
      required: false,
      default: null,
    },
    product_tags: {
      type: 'json',
      description: 'Array of product tags (for shopping posts)',
      required: false,
      default: null,
    },
    share_to_feed: {
      type: 'boolean',
      description: 'Share IGTV/Reels to feed (default: true)',
      required: false,
      default: true,
    },
    creation_id: {
      type: 'string',
      description: 'Creation ID from media container (required for publish operation)',
      required: false,
      default: '',
    },
    // Comment operations
    commentId: {
      type: 'string',
      description: 'Comment ID (required for get, reply, delete, hide/unhide)',
      required: false,
      default: '',
    },
    message: {
      type: 'string',
      description: 'Comment message text (required for create, reply)',
      required: false,
      default: '',
    },
    hide: {
      type: 'boolean',
      description: 'Hide or unhide comment (for hide/unhide operations)',
      required: false,
      default: true,
    },
    // Hashtag operations
    hashtagName: {
      type: 'string',
      description: 'Hashtag name without # (required for search)',
      required: false,
      default: '',
    },
    hashtagId: {
      type: 'string',
      description: 'Hashtag ID (required for get, getRecentMedia, getTopMedia)',
      required: false,
      default: '',
    },
    // Story operations
    storyId: {
      type: 'string',
      description: 'Story ID (required for get story, getInsights)',
      required: false,
      default: '',
    },
    // Insights operations
    metric: {
      type: 'string',
      description: 'Insight metric (e.g., impressions, reach, engagement, etc.)',
      required: false,
      default: '',
      examples: ['impressions', 'reach', 'profile_views', 'website_clicks', 'follower_count', 'email_contacts', 'phone_call_clicks', 'text_message_clicks', 'get_directions_clicks', 'engagement', 'saved', 'video_views', 'likes', 'comments', 'shares'],
    },
    period: {
      type: 'string',
      description: 'Time period: day, week, days_28, lifetime',
      required: false,
      default: 'day',
      examples: ['day', 'week', 'days_28', 'lifetime'],
    },
    since: {
      type: 'string',
      description: 'Start date (Unix timestamp or ISO 8601)',
      required: false,
      default: '',
    },
    until: {
      type: 'string',
      description: 'End date (Unix timestamp or ISO 8601)',
      required: false,
      default: '',
    },
    // Pagination
    limit: {
      type: 'number',
      description: 'Maximum number of results to return (1-100)',
      required: false,
      default: 25,
      validation: (value) => {
        if (value && (value < 1 || value > 100)) {
          return 'Limit must be between 1 and 100';
        }
        return true;
      },
    },
    after: {
      type: 'string',
      description: 'Cursor for pagination (after)',
      required: false,
      default: '',
    },
    before: {
      type: 'string',
      description: 'Cursor for pagination (before)',
      required: false,
      default: '',
    },
    returnAll: {
      type: 'boolean',
      description: 'Return all results (automatically paginate)',
      required: false,
      default: false,
    },
  },

  outputSchema: {
    default: {
      type: 'json',
      description: 'Instagram operation result (varies by operation)',
    },
  },

  requiredInputs: ['resource', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    // Required fields
    if (!inputs.resource) {
      errors.push('resource field is required');
    }
    if (!inputs.operation) {
      errors.push('operation field is required');
    }

    const resource = inputs.resource;
    const operation = inputs.operation;

    // Resource-specific validation
    if (resource === 'user') {
      if (operation === 'getMedia' || operation === 'getInsights') {
        if (!inputs.instagramBusinessAccountId || typeof inputs.instagramBusinessAccountId !== 'string' || inputs.instagramBusinessAccountId.trim() === '') {
          // This is a warning, not an error - we'll try to fetch it automatically
        }
      }
    } else if (resource === 'media') {
      if (['get', 'update', 'delete', 'getInsights', 'getContainerStatus'].includes(operation)) {
        if (!inputs.mediaId || typeof inputs.mediaId !== 'string' || inputs.mediaId.trim() === '') {
          errors.push('mediaId is required for this operation');
        }
      }
      if (['list', 'create', 'publish', 'createAndPublish'].includes(operation)) {
        if (!inputs.instagramBusinessAccountId || typeof inputs.instagramBusinessAccountId !== 'string' || inputs.instagramBusinessAccountId.trim() === '') {
          // Warning only - will try to fetch automatically
        }
      }
      if (['create', 'createAndPublish'].includes(operation)) {
        if (!inputs.media_type || !['IMAGE', 'VIDEO', 'REELS', 'CAROUSEL_ALBUM'].includes(inputs.media_type)) {
          errors.push('media_type must be one of: IMAGE, VIDEO, REELS, CAROUSEL_ALBUM');
        }
        const hasMediaUrl = inputs.media_url && typeof inputs.media_url === 'string' && inputs.media_url.trim() !== '';
        const hasVideoUrl = inputs.video_url && typeof inputs.video_url === 'string' && inputs.video_url.trim() !== '';
        if (!hasMediaUrl && !hasVideoUrl) {
          errors.push('Either media_url or video_url is required for create/createAndPublish operation');
        }
      }
      if (operation === 'publish') {
        if (!inputs.creation_id || typeof inputs.creation_id !== 'string' || inputs.creation_id.trim() === '') {
          errors.push('creation_id is required for publish operation');
        }
        if (!inputs.instagramBusinessAccountId || typeof inputs.instagramBusinessAccountId !== 'string' || inputs.instagramBusinessAccountId.trim() === '') {
          // Warning only
        }
      }
      if (operation === 'update') {
        if (!inputs.caption || typeof inputs.caption !== 'string' || inputs.caption.trim() === '') {
          errors.push('caption is required for update operation');
        }
      }
    } else if (resource === 'comment') {
      if (['get', 'reply', 'delete', 'hide', 'unhide'].includes(operation)) {
        if (!inputs.commentId || typeof inputs.commentId !== 'string' || inputs.commentId.trim() === '') {
          errors.push('commentId is required for this operation');
        }
      }
      if (['create', 'reply'].includes(operation)) {
        if (!inputs.message || typeof inputs.message !== 'string' || inputs.message.trim() === '') {
          errors.push('message is required for create/reply operation');
        }
      }
      if (['list', 'create'].includes(operation)) {
        if (!inputs.mediaId || typeof inputs.mediaId !== 'string' || inputs.mediaId.trim() === '') {
          errors.push('mediaId is required for list/create comment operation');
        }
      }
    } else if (resource === 'hashtag') {
      if (operation === 'search') {
        if (!inputs.hashtagName || typeof inputs.hashtagName !== 'string' || inputs.hashtagName.trim() === '') {
          errors.push('hashtagName is required for search operation');
        }
        if (!inputs.instagramBusinessAccountId || typeof inputs.instagramBusinessAccountId !== 'string' || inputs.instagramBusinessAccountId.trim() === '') {
          // Warning only
        }
      }
      if (['get', 'getRecentMedia', 'getTopMedia'].includes(operation)) {
        if (!inputs.hashtagId || typeof inputs.hashtagId !== 'string' || inputs.hashtagId.trim() === '') {
          errors.push('hashtagId is required for this operation');
        }
      }
      if (['getRecentMedia', 'getTopMedia'].includes(operation)) {
        if (!inputs.instagramBusinessAccountId || typeof inputs.instagramBusinessAccountId !== 'string' || inputs.instagramBusinessAccountId.trim() === '') {
          // Warning only
        }
      }
    } else if (resource === 'story') {
      if (['get', 'getInsights'].includes(operation)) {
        if (!inputs.storyId || typeof inputs.storyId !== 'string' || inputs.storyId.trim() === '') {
          errors.push('storyId is required for this operation');
        }
      }
      if (operation === 'list') {
        if (!inputs.instagramBusinessAccountId || typeof inputs.instagramBusinessAccountId !== 'string' || inputs.instagramBusinessAccountId.trim() === '') {
          // Warning only
        }
      }
    } else if (resource === 'insights') {
      if (!inputs.metric || typeof inputs.metric !== 'string' || inputs.metric.trim() === '') {
        errors.push('metric is required for insights operation');
      }
      // objectId can be instagramBusinessAccountId, mediaId, or storyId depending on context
    }

    // Validate limit
    if (inputs.limit && (typeof inputs.limit !== 'number' || inputs.limit < 1 || inputs.limit > 100)) {
      errors.push('limit must be a number between 1 and 100');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    resource: 'user',
    operation: 'get',
    instagramBusinessAccountId: '',
    fields: '',
    mediaId: '',
    media_type: 'IMAGE',
    media_url: '',
    video_url: '',
    caption: '',
    location_id: '',
    user_tags: null,
    product_tags: null,
    share_to_feed: true,
    creation_id: '',
    commentId: '',
    message: '',
    hide: true,
    hashtagName: '',
    hashtagId: '',
    storyId: '',
    metric: '',
    period: 'day',
    since: '',
    until: '',
    limit: 25,
    after: '',
    before: '',
    returnAll: false,
  }),
};
