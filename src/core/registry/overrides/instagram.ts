/**
 * ✅ INSTAGRAM NODE - Registry Override
 *
 * Instagram Graph API integration.
 * Delegates execution to the social dispatcher with provider: 'instagram'.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeSocialNode } from '../../../services/social/social-dispatcher';

export function overrideInstagram(
  def: UnifiedNodeDefinition,
  _schema: NodeSchema,
): UnifiedNodeDefinition {
  return {
    ...def,
    type: 'instagram',
    label: 'Instagram',
    category: 'communication',
    description: 'Publish content, send DMs, moderate comments via Instagram Graph API',
    icon: '📸',
    version: '1.0.0',
    isBranching: false,
    incomingPorts: ['default'],
    outgoingPorts: ['default'],
    credentialSchema: {
      requirements: [
        {
          provider: 'facebook',
          category: 'oauth',
          required: true,
          description: 'Facebook OAuth token with Instagram permissions',
          scopes: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_messages', 'pages_show_list'],
        },
      ],
    },
    inputSchema: {
      resource: { type: 'string', description: 'Instagram resource', required: true, default: 'message', examples: ['message', 'media', 'comment', 'user', 'insights', 'hashtag'] },
      operation: { type: 'string', description: 'Instagram operation', required: true, default: 'sendText', examples: ['sendText', 'sendMedia', 'sendTemplate', 'createAndPublish', 'get', 'list', 'hide', 'unhide', 'delete', 'reply', 'replyDM', 'getMedia', 'search', 'getRecentMedia'] },
      instagramBusinessAccountId: { type: 'string', description: 'Instagram Business Account ID (auto-resolved if absent)', required: false },
      recipientId: { type: 'string', description: 'Recipient user ID for DMs', required: false },
      text: { type: 'string', description: 'Message text', required: false },
      attachmentType: { type: 'string', description: 'Attachment type for DMs', required: false, examples: ['image', 'audio', 'video'] },
      attachmentUrl: { type: 'string', description: 'Attachment URL for DMs', required: false },
      media_type: { type: 'string', description: 'Media type for publishing', required: false, examples: ['IMAGE', 'VIDEO', 'REELS', 'CAROUSEL_ALBUM'] },
      media_url: { type: 'string', description: 'Media URL for publishing', required: false },
      caption: { type: 'string', description: 'Media caption', required: false },
      location_id: { type: 'string', description: 'Location ID for media', required: false },
      user_tags: { type: 'array', description: 'User tags for media', required: false },
      product_tags: { type: 'array', description: 'Product tags for media', required: false },
      carouselItems: { type: 'array', description: 'Array of media URLs for carousel', required: false },
      mediaId: { type: 'string', description: 'Media ID', required: false },
      commentId: { type: 'string', description: 'Comment ID', required: false },
      replyText: { type: 'string', description: 'Reply text for comments', required: false },
      metric: { type: 'string', description: 'Insights metric name', required: false },
      period: { type: 'string', description: 'Insights period', required: false, default: 'day', examples: ['day', 'week', 'days_28', 'lifetime'] },
      since: { type: 'string', description: 'Insights start date (ISO 8601)', required: false },
      until: { type: 'string', description: 'Insights end date (ISO 8601)', required: false },
      hashtagName: { type: 'string', description: 'Hashtag name to search', required: false },
      hashtagId: { type: 'string', description: 'Hashtag ID for recent media', required: false },
      limit: { type: 'number', description: 'Pagination limit', required: false, default: 20 },
      after: { type: 'string', description: 'Pagination cursor', required: false },
      returnAll: { type: 'boolean', description: 'Return all results (ignores limit)', required: false, default: false },
    },
    outputSchema: {
      default: {
        name: 'default',
        description: 'Instagram operation result',
        schema: {
          type: 'object',
          properties: {
            mediaId: { type: 'string' },
            data: { type: 'object' },
            error: { type: 'object' },
          },
        },
      },
    },
    requiredInputs: ['resource', 'operation'],
    defaultConfig: () => ({
      resource: 'message',
      operation: 'sendText',
      returnAll: false,
      limit: 20,
      period: 'day',
    }),
    validateConfig: (config) => {
      const errors: string[] = [];
      if (!config.resource) errors.push('resource is required');
      if (!config.operation) errors.push('operation is required');
      return { valid: errors.length === 0, errors };
    },
    execute: async (context) => {
      try {
        const { supabase, userId, currentUserId, config } = context;
        const result = await executeSocialNode(supabase, { provider: 'instagram', operation: config.operation ?? 'sendText', ...config }, userId, currentUserId);
        return {
          success: result.success,
          output: result.data,
          error: result.error ? { code: 'INSTAGRAM_ERROR', message: result.error } : undefined,
        };
      } catch (err: any) {
        return {
          success: false,
          error: { code: 'INSTAGRAM_ERROR', message: err?.message ?? String(err) },
        };
      }
    },
  };
}
