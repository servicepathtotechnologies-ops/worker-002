import { NodeDefinition } from '../../core/types/node-definition';

/**
 * Twitter/X Node Definition
 * 
 * Comprehensive integration with Twitter API v2.
 * Supports multiple resources (Tweet, User, Timeline, Search, List, Media, Direct Message, Space)
 * and operations (Create, Get, Update, Delete, Like, Retweet, Follow, etc.)
 * similar to n8n's Twitter node.
 * 
 * Uses twitter-api-v2 SDK for reliable API interaction with OAuth 2.0 support,
 * automatic pagination, error handling, and type safety.
 */
export const twitterNodeDefinition: NodeDefinition = {
  type: 'twitter',
  label: 'Twitter/X',
  category: 'social',
  description: 'Interact with Twitter/X API v2 to post tweets, manage users, search, and more',
  icon: 'MessageSquare',
  version: 1,

  inputSchema: {
    resource: {
      type: 'string',
      description: 'Resource type to operate on',
      required: true,
      default: 'tweet',
      examples: ['tweet', 'user', 'timeline', 'search', 'list', 'media', 'directMessage', 'space'],
      validation: (value) => {
        const validResources = ['tweet', 'user', 'timeline', 'search', 'list', 'media', 'directMessage', 'space'];
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
      default: 'create',
      examples: [
        // Tweet operations
        'create', 'delete', 'get', 'lookup', 'like', 'unlike', 'retweet', 'unretweet', 
        'quoteTweet', 'reply', 'hideReply', 'bookmark', 'removeBookmark', 'getBookmarks',
        // User operations
        'get', 'lookup', 'getMe', 'follow', 'unfollow', 'getFollowers', 'getFollowing',
        'block', 'unblock', 'mute', 'unmute',
        // Timeline operations
        'userTimeline', 'homeTimeline', 'mentions',
        // Search operations
        'recent', 'all', 'tweetCounts',
        // List operations
        'create', 'get', 'update', 'delete', 'addMember', 'removeMember', 'getMembers', 'getTweets',
        // Media operations
        'upload', 'get', 'metadata',
        // Direct Message operations
        'send', 'get', 'delete',
        // Space operations
        'get', 'list', 'search', 'getParticipants'
      ],
      validation: (value) => {
        // Operation validation is resource-dependent, so we'll validate in validateInputs
        return true;
      },
    },
    // Tweet operations
    tweetId: {
      type: 'string',
      description: 'Tweet ID (required for get, delete, like, retweet, etc.)',
      required: false,
      default: '',
    },
    tweetIds: {
      type: 'json',
      description: 'Array of Tweet IDs (for lookup, max 100)',
      required: false,
      default: null,
    },
    text: {
      type: 'string',
      description: 'Tweet text content (required for create, reply, quoteTweet)',
      required: false,
      default: '',
    },
    mediaIds: {
      type: 'json',
      description: 'Array of media IDs to attach to tweet',
      required: false,
      default: null,
    },
    quoteTweetId: {
      type: 'string',
      description: 'Tweet ID to quote (for quoteTweet operation)',
      required: false,
      default: '',
    },
    replySettings: {
      type: 'string',
      description: 'Reply settings: mentionedUsers, following, or everyone',
      required: false,
      default: 'everyone',
      examples: ['mentionedUsers', 'following', 'everyone'],
    },
    hidden: {
      type: 'boolean',
      description: 'Hide/unhide reply (for hideReply operation)',
      required: false,
      default: false,
    },
    // User operations
    userId: {
      type: 'string',
      description: 'User ID (required for get user, follow, etc.)',
      required: false,
      default: '',
    },
    username: {
      type: 'string',
      description: 'Username (without @, alternative to userId)',
      required: false,
      default: '',
    },
    userIds: {
      type: 'json',
      description: 'Array of User IDs (for lookup, max 100)',
      required: false,
      default: null,
    },
    usernames: {
      type: 'json',
      description: 'Array of usernames (for lookup, max 100)',
      required: false,
      default: null,
    },
    targetUserId: {
      type: 'string',
      description: 'Target User ID (for follow, unfollow, block, mute)',
      required: false,
      default: '',
    },
    // Timeline operations
    maxResults: {
      type: 'number',
      description: 'Maximum number of results to return (1-100)',
      required: false,
      default: 10,
      validation: (value) => {
        if (value && (value < 1 || value > 100)) {
          return 'Max results must be between 1 and 100';
        }
        return true;
      },
    },
    paginationToken: {
      type: 'string',
      description: 'Pagination token for next page',
      required: false,
      default: '',
    },
    exclude: {
      type: 'json',
      description: 'Exclude retweets, replies, etc. (array: retweets, replies)',
      required: false,
      default: null,
    },
    // Search operations
    query: {
      type: 'string',
      description: 'Search query (required for search operations)',
      required: false,
      default: '',
    },
    startTime: {
      type: 'string',
      description: 'Start time (ISO 8601 format, e.g., 2024-01-01T00:00:00Z)',
      required: false,
      default: '',
    },
    endTime: {
      type: 'string',
      description: 'End time (ISO 8601 format)',
      required: false,
      default: '',
    },
    sortOrder: {
      type: 'string',
      description: 'Sort order: recency or relevancy',
      required: false,
      default: 'relevancy',
      examples: ['recency', 'relevancy'],
    },
    granularity: {
      type: 'string',
      description: 'Granularity for tweet counts: minute, hour, or day',
      required: false,
      default: 'hour',
      examples: ['minute', 'hour', 'day'],
    },
    // List operations
    listId: {
      type: 'string',
      description: 'List ID (required for list operations)',
      required: false,
      default: '',
    },
    name: {
      type: 'string',
      description: 'List name (required for create list)',
      required: false,
      default: '',
    },
    description: {
      type: 'string',
      description: 'List description',
      required: false,
      default: '',
    },
    private: {
      type: 'boolean',
      description: 'Whether list is private',
      required: false,
      default: false,
    },
    // Media operations
    mediaData: {
      type: 'string',
      description: 'Media data (base64 encoded or public URL)',
      required: false,
      default: '',
    },
    mediaType: {
      type: 'string',
      description: 'Media type: image/jpeg, image/png, video/mp4, image/gif',
      required: false,
      default: 'image/jpeg',
      examples: ['image/jpeg', 'image/png', 'video/mp4', 'image/gif'],
    },
    mediaCategory: {
      type: 'string',
      description: 'Media category: tweet_image, tweet_video, tweet_gif, dm_image, dm_video',
      required: false,
      default: 'tweet_image',
      examples: ['tweet_image', 'tweet_video', 'tweet_gif', 'dm_image', 'dm_video'],
    },
    mediaId: {
      type: 'string',
      description: 'Media ID (for get media, metadata)',
      required: false,
      default: '',
    },
    altText: {
      type: 'string',
      description: 'Alt text for media (for metadata operation)',
      required: false,
      default: '',
    },
    // Direct Message operations
    recipientId: {
      type: 'string',
      description: 'Recipient User ID (required for send DM)',
      required: false,
      default: '',
    },
    dmEventId: {
      type: 'string',
      description: 'DM Event ID (for delete DM)',
      required: false,
      default: '',
    },
    eventTypes: {
      type: 'json',
      description: 'DM event types to filter (array: MessageCreate, etc.)',
      required: false,
      default: null,
    },
    // Space operations
    spaceId: {
      type: 'string',
      description: 'Space ID (required for get space)',
      required: false,
      default: '',
    },
    state: {
      type: 'string',
      description: 'Space state: live, scheduled, or ended',
      required: false,
      default: 'live',
      examples: ['live', 'scheduled', 'ended'],
    },
    // Field expansions
    expansions: {
      type: 'json',
      description: 'Expansions to include (array of strings)',
      required: false,
      default: null,
    },
    tweetFields: {
      type: 'json',
      description: 'Tweet fields to include (array: created_at, public_metrics, etc.)',
      required: false,
      default: null,
    },
    userFields: {
      type: 'json',
      description: 'User fields to include (array: username, description, etc.)',
      required: false,
      default: null,
    },
    mediaFields: {
      type: 'json',
      description: 'Media fields to include',
      required: false,
      default: null,
    },
    listFields: {
      type: 'json',
      description: 'List fields to include',
      required: false,
      default: null,
    },
    spaceFields: {
      type: 'json',
      description: 'Space fields to include',
      required: false,
      default: null,
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
      description: 'Twitter operation result (varies by operation)',
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
    if (resource === 'tweet') {
      if (['get', 'delete', 'like', 'unlike', 'retweet', 'unretweet', 'hideReply', 'bookmark', 'removeBookmark'].includes(operation)) {
        if (!inputs.tweetId || typeof inputs.tweetId !== 'string' || inputs.tweetId.trim() === '') {
          errors.push('tweetId is required for this operation');
        }
      }
      if (operation === 'lookup') {
        if (!inputs.tweetIds || !Array.isArray(inputs.tweetIds) || inputs.tweetIds.length === 0) {
          errors.push('tweetIds (array) is required for lookup operation');
        }
      }
      if (['create', 'reply'].includes(operation)) {
        if (!inputs.text || typeof inputs.text !== 'string' || inputs.text.trim() === '') {
          errors.push('text is required for create/reply operation');
        }
      }
      if (operation === 'quoteTweet') {
        if (!inputs.text || typeof inputs.text !== 'string' || inputs.text.trim() === '') {
          errors.push('text is required for quoteTweet operation');
        }
        if (!inputs.quoteTweetId || typeof inputs.quoteTweetId !== 'string' || inputs.quoteTweetId.trim() === '') {
          errors.push('quoteTweetId is required for quoteTweet operation');
        }
      }
      if (operation === 'reply') {
        if (!inputs.tweetId || typeof inputs.tweetId !== 'string' || inputs.tweetId.trim() === '') {
          errors.push('tweetId is required for reply operation');
        }
      }
    } else if (resource === 'user') {
      if (operation === 'get') {
        const hasUserId = inputs.userId && typeof inputs.userId === 'string' && inputs.userId.trim() !== '';
        const hasUsername = inputs.username && typeof inputs.username === 'string' && inputs.username.trim() !== '';
        if (!hasUserId && !hasUsername) {
          errors.push('Either userId or username is required for get user operation');
        }
      }
      if (operation === 'lookup') {
        const hasUserIds = inputs.userIds && Array.isArray(inputs.userIds) && inputs.userIds.length > 0;
        const hasUsernames = inputs.usernames && Array.isArray(inputs.usernames) && inputs.usernames.length > 0;
        if (!hasUserIds && !hasUsernames) {
          errors.push('Either userIds or usernames (array) is required for lookup operation');
        }
      }
      if (['follow', 'unfollow', 'block', 'unblock', 'mute', 'unmute'].includes(operation)) {
        if (!inputs.targetUserId || typeof inputs.targetUserId !== 'string' || inputs.targetUserId.trim() === '') {
          errors.push('targetUserId is required for this operation');
        }
      }
      if (['getFollowers', 'getFollowing'].includes(operation)) {
        if (!inputs.userId || typeof inputs.userId !== 'string' || inputs.userId.trim() === '') {
          errors.push('userId is required for this operation');
        }
      }
    } else if (resource === 'timeline') {
      if (['userTimeline', 'mentions'].includes(operation)) {
        if (!inputs.userId || typeof inputs.userId !== 'string' || inputs.userId.trim() === '') {
          errors.push('userId is required for this operation');
        }
      }
    } else if (resource === 'search') {
      if (!inputs.query || typeof inputs.query !== 'string' || inputs.query.trim() === '') {
        errors.push('query is required for search operations');
      }
    } else if (resource === 'list') {
      if (operation === 'create') {
        if (!inputs.name || typeof inputs.name !== 'string' || inputs.name.trim() === '') {
          errors.push('name is required for create list operation');
        }
      }
      if (['get', 'update', 'delete', 'addMember', 'removeMember', 'getMembers', 'getTweets'].includes(operation)) {
        if (!inputs.listId || typeof inputs.listId !== 'string' || inputs.listId.trim() === '') {
          errors.push('listId is required for this operation');
        }
      }
      if (['addMember', 'removeMember'].includes(operation)) {
        if (!inputs.userId || typeof inputs.userId !== 'string' || inputs.userId.trim() === '') {
          errors.push('userId is required for addMember/removeMember operation');
        }
      }
    } else if (resource === 'media') {
      if (operation === 'upload') {
        if (!inputs.mediaData || typeof inputs.mediaData !== 'string' || inputs.mediaData.trim() === '') {
          errors.push('mediaData is required for upload operation');
        }
      }
      if (['get', 'metadata'].includes(operation)) {
        if (!inputs.mediaId || typeof inputs.mediaId !== 'string' || inputs.mediaId.trim() === '') {
          errors.push('mediaId is required for this operation');
        }
      }
      if (operation === 'metadata') {
        if (!inputs.altText || typeof inputs.altText !== 'string' || inputs.altText.trim() === '') {
          errors.push('altText is required for metadata operation');
        }
      }
    } else if (resource === 'directMessage') {
      if (operation === 'send') {
        if (!inputs.recipientId || typeof inputs.recipientId !== 'string' || inputs.recipientId.trim() === '') {
          errors.push('recipientId is required for send DM operation');
        }
        if (!inputs.text || typeof inputs.text !== 'string' || inputs.text.trim() === '') {
          errors.push('text is required for send DM operation');
        }
      }
      if (operation === 'delete') {
        if (!inputs.dmEventId || typeof inputs.dmEventId !== 'string' || inputs.dmEventId.trim() === '') {
          errors.push('dmEventId is required for delete DM operation');
        }
      }
    } else if (resource === 'space') {
      if (['get', 'getParticipants'].includes(operation)) {
        if (!inputs.spaceId || typeof inputs.spaceId !== 'string' || inputs.spaceId.trim() === '') {
          errors.push('spaceId is required for this operation');
        }
      }
      if (operation === 'list') {
        if (!inputs.userIds || !Array.isArray(inputs.userIds) || inputs.userIds.length === 0) {
          errors.push('userIds (array) is required for list spaces operation');
        }
      }
      if (operation === 'search') {
        if (!inputs.query || typeof inputs.query !== 'string' || inputs.query.trim() === '') {
          errors.push('query is required for search spaces operation');
        }
      }
    }

    // Validate maxResults
    if (inputs.maxResults && (typeof inputs.maxResults !== 'number' || inputs.maxResults < 1 || inputs.maxResults > 100)) {
      errors.push('maxResults must be a number between 1 and 100');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    resource: 'tweet',
    operation: 'create',
    tweetId: '',
    tweetIds: null,
    text: '',
    mediaIds: null,
    quoteTweetId: '',
    replySettings: 'everyone',
    hidden: false,
    userId: '',
    username: '',
    userIds: null,
    usernames: null,
    targetUserId: '',
    maxResults: 10,
    paginationToken: '',
    exclude: null,
    query: '',
    startTime: '',
    endTime: '',
    sortOrder: 'relevancy',
    granularity: 'hour',
    listId: '',
    name: '',
    description: '',
    private: false,
    mediaData: '',
    mediaType: 'image/jpeg',
    mediaCategory: 'tweet_image',
    mediaId: '',
    altText: '',
    recipientId: '',
    dmEventId: '',
    eventTypes: null,
    spaceId: '',
    state: 'live',
    expansions: null,
    tweetFields: null,
    userFields: null,
    mediaFields: null,
    listFields: null,
    spaceFields: null,
    returnAll: false,
  }),
};
